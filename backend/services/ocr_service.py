"""OCR service — text extraction from diagnostic images using pytesseract."""
import io
import logging
from typing import Tuple

from PIL import Image

logger = logging.getLogger(__name__)

try:
    import pytesseract
    _TESSERACT_AVAILABLE = True
except ImportError:
    _TESSERACT_AVAILABLE = False
    logger.warning("pytesseract is not installed — OCR will return empty results")


class OCRService:
    """Extracts text from diagnostic image bytes using Tesseract."""

    # Tesseract config for medical documents:
    # --psm 3 = fully automatic page segmentation (default)
    # --oem 3 = use both Legacy and LSTM engines
    TESSERACT_CONFIG = "--psm 3 --oem 3"

    async def extract_text(self, image_bytes: bytes) -> Tuple[str, float]:
        """Extract text from image bytes.

        Returns:
            (extracted_text, confidence_score) where confidence is 0.0–1.0
        """
        if not _TESSERACT_AVAILABLE:
            logger.warning("Tesseract not available — returning empty extraction")
            return "", 0.0

        try:
            image = Image.open(io.BytesIO(image_bytes))
            # Convert to RGB if necessary (handles TIFF, grayscale, CMYK, etc.)
            if image.mode not in ("RGB", "L"):
                image = image.convert("RGB")

            # Get detailed OCR data including confidence scores
            data = pytesseract.image_to_data(
                image,
                config=self.TESSERACT_CONFIG,
                output_type=pytesseract.Output.DICT,
            )

            # Extract text (filter empty/whitespace)
            words = [
                word
                for word, conf in zip(data["text"], data["conf"])
                if word.strip() and int(conf) > 0
            ]
            extracted_text = " ".join(words)

            # Compute average confidence (0–100 → 0.0–1.0)
            valid_confs = [int(c) for c in data["conf"] if int(c) > 0]
            avg_confidence = (sum(valid_confs) / len(valid_confs) / 100.0) if valid_confs else 0.0

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
        """Extract text with positional layout information (bounding boxes)."""
        if not _TESSERACT_AVAILABLE:
            return {"text": "", "confidence": 0.0, "blocks": []}

        try:
            image = Image.open(io.BytesIO(image_bytes))
            if image.mode not in ("RGB", "L"):
                image = image.convert("RGB")

            data = pytesseract.image_to_data(
                image,
                config=self.TESSERACT_CONFIG,
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
            avg_conf = sum(b["confidence"] for b in blocks) / len(blocks) if blocks else 0.0

            return {
                "text": full_text,
                "confidence": round(avg_conf, 4),
                "blocks": blocks,
            }
        except Exception as exc:
            logger.error("OCR layout extraction failed: %s", exc)
            return {"text": "", "confidence": 0.0, "blocks": []}

    async def process_async(self, case_id: str, file_ids: list) -> None:
        """Background OCR processing trigger for a case.

        This method is called as a background task after file upload.
        Actual processing is handled by the AI analysis pipeline.
        """
        logger.info(
            "OCR background task queued for case %s with %d file(s)",
            case_id,
            len(file_ids),
        )


ocr_service = OCRService()
