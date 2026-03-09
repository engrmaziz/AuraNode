"""OCR service — text extraction from diagnostic images using pytesseract."""
import asyncio
import gc
import io
import logging
import statistics
import time
from typing import Optional
from uuid import UUID

import httpx
from PIL import Image, ImageFilter, ImageOps

logger = logging.getLogger(__name__)

try:
    import pytesseract

    _TESSERACT_AVAILABLE = True
except ImportError:
    _TESSERACT_AVAILABLE = False
    logger.warning("pytesseract is not installed — OCR will return empty results")

try:
    from pdf2image import convert_from_bytes

    _PDF2IMAGE_AVAILABLE = True
except ImportError:
    _PDF2IMAGE_AVAILABLE = False
    logger.warning("pdf2image is not installed — PDF processing will be limited")

try:
    import pdfplumber

    _PDFPLUMBER_AVAILABLE = True
except ImportError:
    _PDFPLUMBER_AVAILABLE = False
    logger.warning("pdfplumber is not installed — direct PDF text extraction unavailable")

try:
    import PyPDF2

    _PYPDF2_AVAILABLE = True
except ImportError:
    _PYPDF2_AVAILABLE = False
    logger.warning("PyPDF2 is not installed — PyPDF2 PDF text extraction unavailable")

# ─── Constants ──────────────────────────────────────────────
_OCR_TIMEOUT_SECONDS = 60
_MAX_RETRIES = 3
_RETRY_BACKOFF_SECONDS = 5
_MIN_IMAGE_DIM = 300  # minimum pixels (approx 300 DPI equivalent)
_MIN_CONFIDENCE = 0.3  # below this threshold OCR result is considered unreliable
TESSERACT_CONFIG = "--psm 3 --oem 3"
MODEL_VERSION = "ocr-v1.0.0"


def _extract_storage_path(file_url: str) -> str:
    """Extract the storage path from a Supabase public URL.

    e.g. https://.../storage/v1/object/public/diagnostic-uploads/clinic/case/file/name.jpg
    → clinic/case/file/name.jpg
    """
    marker = "/object/public/diagnostic-uploads/"
    if marker in file_url:
        path = file_url.split(marker)[-1]
        # Strip any query string
        path = path.split("?")[0]
        return path
    # Already a plain path — return as-is
    return file_url


class OCRService:
    """Complete OCR processing service for diagnostic images and PDFs."""

    async def _get_signed_url(self, file_url: str) -> str:
        """Convert a public storage URL into a short-lived signed URL."""
        from services.supabase_service import supabase_service  # noqa: PLC0415

        storage_path = _extract_storage_path(file_url)
        signed_url = await supabase_service.get_signed_url(storage_path=storage_path)
        return signed_url

    async def process_image_from_url(
        self, file_url: str, case_id: UUID, file_id: UUID
    ) -> dict:
        """Download image from URL, preprocess it, and run OCR.

        Returns:
            extracted_text: str
            confidence_score: float (0.0 to 1.0)
            word_count: int
            processing_time_ms: int
        """
        start = time.monotonic()

        signed_url = await self._get_signed_url(file_url)

        async with httpx.AsyncClient(timeout=_OCR_TIMEOUT_SECONDS) as client:
            resp = await client.get(signed_url)
            resp.raise_for_status()
            image_bytes = resp.content

        image = Image.open(io.BytesIO(image_bytes))
        image = self._preprocess_image(image)

        loop = asyncio.get_event_loop()
        data = await loop.run_in_executor(
            None,
            lambda: pytesseract.image_to_data(
                image,
                config=TESSERACT_CONFIG,
                output_type=pytesseract.Output.DICT,
            ),
        )

        confidence_score = self._calculate_confidence(data)
        words = [
            word
            for word, conf in zip(data["text"], data["conf"])
            if word.strip() and int(conf) > 30
        ]
        extracted_text = " ".join(words)
        processing_time_ms = int((time.monotonic() - start) * 1000)

        del image
        gc.collect()

        return {
            "extracted_text": extracted_text,
            "confidence_score": confidence_score,
            "word_count": len(words),
            "processing_time_ms": processing_time_ms,
        }

    async def process_pdf_from_url(
        self, file_url: str, case_id: UUID, file_id: UUID
    ) -> dict:
        """Download PDF from URL and extract text using a multi-method approach.

        Tries direct text extraction (pdfplumber, PyPDF2) before falling back to
        OCR (pdf2image + tesseract) for scanned/image PDFs.

        Returns:
            extracted_text: str (pages combined)
            confidence_score: float (0.0 to 1.0)
            word_count: int
            processing_time_ms: int
        """
        start = time.monotonic()

        signed_url = await self._get_signed_url(file_url)

        async with httpx.AsyncClient(timeout=_OCR_TIMEOUT_SECONDS) as client:
            resp = await client.get(signed_url)
            resp.raise_for_status()
            pdf_bytes = resp.content

        extracted_text, confidence_score = await self._extract_text_from_pdf_bytes(pdf_bytes)
        logger.info("PDF text extraction: %d chars for case=%s", len(extracted_text), case_id)

        word_count = len(extracted_text.split()) if extracted_text else 0
        processing_time_ms = int((time.monotonic() - start) * 1000)

        return {
            "extracted_text": extracted_text,
            "confidence_score": confidence_score,
            "word_count": word_count,
            "processing_time_ms": processing_time_ms,
        }

    async def _extract_text_from_pdf_bytes(self, pdf_bytes: bytes) -> tuple[str, float]:
        """Try multiple PDF extraction methods in order of preference.

        Method 1: pdfplumber  — best for text-based PDFs, no poppler needed.
        Method 2: PyPDF2      — fallback for simple text PDFs.
        Method 3: pdf2image + tesseract OCR — for scanned/image PDFs, needs poppler.

        Returns (extracted_text, confidence_score) where confidence reflects the
        reliability of the extraction method used.
        Returns ("", 0.0) if all methods fail.
        """
        # Method 1: pdfplumber (highest reliability — direct text layer extraction)
        if _PDFPLUMBER_AVAILABLE:
            try:
                import pdfplumber  # noqa: PLC0415

                with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
                    pages_text = []
                    for page in pdf.pages:
                        text = page.extract_text()
                        if text:
                            pages_text.append(text)
                    if pages_text:
                        extracted_text = "\n".join(pages_text)
                        logger.info(
                            "pdfplumber extracted %d chars from PDF", len(extracted_text)
                        )
                        return extracted_text, 0.95
            except Exception as exc:
                logger.warning("pdfplumber failed: %s", exc)

        # Method 2: PyPDF2 (good reliability — direct text layer extraction)
        if _PYPDF2_AVAILABLE:
            try:
                import PyPDF2  # noqa: PLC0415

                reader = PyPDF2.PdfReader(io.BytesIO(pdf_bytes))
                pages_text = []
                for page in reader.pages:
                    text = page.extract_text()
                    if text:
                        pages_text.append(text)
                if pages_text:
                    extracted_text = "\n".join(pages_text)
                    logger.info(
                        "PyPDF2 extracted %d chars from PDF", len(extracted_text)
                    )
                    return extracted_text, 0.85
            except Exception as exc:
                logger.warning("PyPDF2 failed: %s", exc)

        # Method 3: pdf2image + tesseract OCR (needs poppler — lower reliability due to OCR)
        if _PDF2IMAGE_AVAILABLE and _TESSERACT_AVAILABLE:
            try:
                loop = asyncio.get_event_loop()
                images = await loop.run_in_executor(
                    None, lambda: convert_from_bytes(pdf_bytes, dpi=200)
                )
                pages_text = []
                for img in images:
                    text = await loop.run_in_executor(
                        None,
                        lambda i=img: pytesseract.image_to_string(i, config=TESSERACT_CONFIG),
                    )
                    if text:
                        pages_text.append(text)
                    del img
                    gc.collect()
                if pages_text:
                    extracted_text = "\n".join(pages_text)
                    logger.info(
                        "pdf2image+tesseract extracted %d chars from PDF",
                        len(extracted_text),
                    )
                    return extracted_text, 0.70
            except Exception as exc:
                logger.warning("pdf2image+tesseract failed: %s", exc)

        logger.error("All PDF extraction methods failed")
        return "", 0.0

    async def process_async(
        self,
        case_id: UUID,
        file_id: UUID,
        file_url: str,
        file_type: str,
    ) -> None:
        """Background task entry point for OCR processing.

        Dispatches to process_image_from_url or process_pdf_from_url based on
        file_type. Updates analysis_results and case status in the database.
        Handles all exceptions gracefully.
        """
        # Import here to avoid circular imports at module load time
        from services.supabase_service import supabase_service  # noqa: PLC0415

        logger.info(
            "OCR starting: case=%s file=%s type=%s", case_id, file_id, file_type
        )

        analysis_id: Optional[str] = None

        try:
            # Create a pending analysis record
            pending = await supabase_service.create_pending_analysis(case_id=str(case_id))
            analysis_id = pending.id

            # ── Retry loop ───────────────────────────────────────
            last_error: Optional[Exception] = None
            result: Optional[dict] = None

            for attempt in range(1, _MAX_RETRIES + 1):
                try:
                    if file_type == "application/pdf":
                        result = await asyncio.wait_for(
                            self.process_pdf_from_url(file_url, case_id, file_id),
                            timeout=_OCR_TIMEOUT_SECONDS,
                        )
                    else:
                        result = await asyncio.wait_for(
                            self.process_image_from_url(file_url, case_id, file_id),
                            timeout=_OCR_TIMEOUT_SECONDS,
                        )
                    break  # success — exit retry loop
                except asyncio.TimeoutError:
                    last_error = asyncio.TimeoutError(
                        f"OCR timed out after {_OCR_TIMEOUT_SECONDS}s"
                    )
                    logger.warning(
                        "OCR attempt %d/%d timed out for case=%s",
                        attempt,
                        _MAX_RETRIES,
                        case_id,
                    )
                except Exception as exc:
                    last_error = exc
                    logger.warning(
                        "OCR attempt %d/%d failed for case=%s: %s",
                        attempt,
                        _MAX_RETRIES,
                        case_id,
                        exc,
                    )

                if attempt < _MAX_RETRIES:
                    await asyncio.sleep(_RETRY_BACKOFF_SECONDS)

            if result is None:
                raise last_error or RuntimeError("OCR failed after all retries")

            # ── Persist result based on confidence ───────────────
            confidence = result["confidence_score"]

            if confidence < _MIN_CONFIDENCE:
                await supabase_service.update_analysis_result(
                    analysis_id=analysis_id,
                    extracted_text=result.get("extracted_text", ""),
                    confidence_score=confidence,
                    risk_score=0.0,
                    flagged_status=False,
                    ai_findings={"error": "OCR confidence too low for reliable analysis"},
                    processing_time_ms=result.get("processing_time_ms", 0),
                    file_id=str(file_id),
                    model_version=MODEL_VERSION,
                )
                await supabase_service.update_case_status(
                    case_id=str(case_id), new_status="processing_failed"
                )
                logger.warning(
                    "OCR low confidence %.2f for case=%s — marked as processing_failed",
                    confidence,
                    case_id,
                )
            else:
                word_count = result.get("word_count", 0)

                # When no text was extracted (pure image/scan), signal image content
                # so the AI analysis service knows to run image analysis.
                if word_count == 0:
                    ai_findings_init: Optional[dict] = {
                        "has_image_content": True,
                        "original_file_url": file_url,
                    }
                    logger.info(
                        "OCR extracted no text for case=%s — marking has_image_content=True",
                        case_id,
                    )
                else:
                    ai_findings_init = None

                await supabase_service.update_analysis_result(
                    analysis_id=analysis_id,
                    extracted_text=result["extracted_text"],
                    confidence_score=confidence,
                    risk_score=0.0,
                    flagged_status=False,
                    ai_findings=ai_findings_init,
                    processing_time_ms=result["processing_time_ms"],
                    file_id=str(file_id),
                    model_version=MODEL_VERSION,
                )
                # Status will be updated to completed/flagged by AI analysis
                await supabase_service.update_case_status(
                    case_id=str(case_id), new_status="processing"
                )
                logger.info(
                    "OCR complete: case=%s confidence=%.2f words=%d [%dms] — triggering AI analysis",
                    case_id,
                    confidence,
                    word_count,
                    result.get("processing_time_ms", 0),
                )

                # Trigger AI analysis as a background task
                from services.ai_analysis_service import ai_analysis_service  # noqa: PLC0415

                def _on_ai_done(task: "asyncio.Task[None]") -> None:
                    if task.cancelled():
                        logger.warning("AI analysis task cancelled for case=%s", case_id)
                    elif task.exception():
                        logger.error(
                            "AI analysis task raised an unhandled exception for case=%s: %s",
                            case_id,
                            task.exception(),
                        )

                ai_task = asyncio.create_task(ai_analysis_service.analyze_case(case_id))
                ai_task.add_done_callback(_on_ai_done)

            # Audit log
            await supabase_service.log_audit(
                user_id=None,
                action="ocr_completed",
                resource_type="case_file",
                resource_id=str(file_id),
                metadata={
                    "case_id": str(case_id),
                    "confidence_score": confidence,
                    "word_count": result.get("word_count", 0),
                    "processing_time_ms": result.get("processing_time_ms", 0),
                },
            )

        except Exception as exc:
            logger.error(
                "OCR pipeline failed for case=%s: %s", case_id, exc, exc_info=True
            )

            if analysis_id:
                try:
                    await supabase_service.update_analysis_result(
                        analysis_id=analysis_id,
                        extracted_text="",
                        confidence_score=0.0,
                        risk_score=0.0,
                        flagged_status=False,
                        ai_findings={"error": str(exc)},
                        processing_time_ms=0,
                        file_id=str(file_id),
                        model_version=MODEL_VERSION,
                    )
                except Exception as update_exc:
                    logger.error("Failed to store OCR error in analysis: %s", update_exc)

            try:
                from services.supabase_service import supabase_service  # noqa: PLC0415

                await supabase_service.update_case_status(
                    case_id=str(case_id), new_status="processing_failed"
                )
            except Exception:
                pass

    def _preprocess_image(self, image: Image.Image) -> Image.Image:
        """Apply preprocessing to improve OCR accuracy.

        Steps:
          1. Convert to grayscale
          2. Resize if below 300 DPI equivalent
          3. Auto-contrast (normalise histogram)
          4. Binary threshold (Otsu approximation via median)
          5. Mild sharpening for denoising
        """
        if image.mode != "L":
            image = image.convert("L")

        # Resize if too small
        width, height = image.size
        if width < _MIN_IMAGE_DIM or height < _MIN_IMAGE_DIM:
            scale = max(_MIN_IMAGE_DIM / width, _MIN_IMAGE_DIM / height)
            new_size = (int(width * scale), int(height * scale))
            image = image.resize(new_size, Image.LANCZOS)

        # Normalise contrast
        image = ImageOps.autocontrast(image)

        # Otsu-like binary threshold (median pixel as threshold)
        pixels = list(image.getdata())
        threshold = statistics.median(pixels)
        image = image.point(lambda p: 255 if p > threshold else 0, "L")

        # Light sharpening
        image = image.filter(ImageFilter.SHARPEN)

        return image

    def _calculate_confidence(self, tesseract_data: dict) -> float:
        """Calculate mean confidence from Tesseract word data.

        Only words with confidence > 30 are included to filter noise.
        Returns a value in [0.0, 1.0].
        """
        valid_confs = [
            int(c) for c in tesseract_data.get("conf", []) if int(c) > 30
        ]
        if not valid_confs:
            return 0.0
        return round(sum(valid_confs) / len(valid_confs) / 100.0, 4)

    # ── Backward-compatible helpers ──────────────────────────────

    async def extract_text(self, image_bytes: bytes):
        """Extract text from raw image bytes (used by existing analysis pipeline)."""
        if not _TESSERACT_AVAILABLE:
            logger.warning("Tesseract not available — returning empty extraction")
            return "", 0.0

        try:
            image = Image.open(io.BytesIO(image_bytes))
            if image.mode not in ("RGB", "L"):
                image = image.convert("RGB")

            data = pytesseract.image_to_data(
                image,
                config=TESSERACT_CONFIG,
                output_type=pytesseract.Output.DICT,
            )

            words = [
                word
                for word, conf in zip(data["text"], data["conf"])
                if word.strip() and int(conf) > 0
            ]
            extracted_text = " ".join(words)
            valid_confs = [int(c) for c in data["conf"] if int(c) > 0]
            avg_confidence = (
                (sum(valid_confs) / len(valid_confs) / 100.0) if valid_confs else 0.0
            )
            logger.info(
                "OCR extracted %d words with avg confidence %.2f",
                len(words),
                avg_confidence,
            )
            return extracted_text, round(avg_confidence, 4)
        except Exception as exc:
            logger.error("OCR extraction failed: %s", exc, exc_info=True)
            return "", 0.0

    async def extract_text_with_layout(self, image_bytes: bytes) -> dict:
        """Extract text with positional bounding-box information."""
        if not _TESSERACT_AVAILABLE:
            return {"text": "", "confidence": 0.0, "blocks": []}

        try:
            image = Image.open(io.BytesIO(image_bytes))
            if image.mode not in ("RGB", "L"):
                image = image.convert("RGB")

            data = pytesseract.image_to_data(
                image,
                config=TESSERACT_CONFIG,
                output_type=pytesseract.Output.DICT,
            )

            blocks = []
            for i in range(len(data["text"])):
                word = data["text"][i]
                conf = int(data["conf"][i])
                if word.strip() and conf > 0:
                    blocks.append(
                        {
                            "text": word,
                            "confidence": round(conf / 100.0, 4),
                            "bbox": {
                                "left": data["left"][i],
                                "top": data["top"][i],
                                "width": data["width"][i],
                                "height": data["height"][i],
                            },
                        }
                    )

            full_text = " ".join(b["text"] for b in blocks)
            avg_conf = (
                sum(b["confidence"] for b in blocks) / len(blocks) if blocks else 0.0
            )
            return {"text": full_text, "confidence": round(avg_conf, 4), "blocks": blocks}
        except Exception as exc:
            logger.error("OCR layout extraction failed: %s", exc)
            return {"text": "", "confidence": 0.0, "blocks": []}


ocr_service = OCRService()
