"""AI analysis service — Vision AI and text analysis via Hugging Face Inference API."""
import asyncio
import logging
import re
import time
from typing import Any, Dict, List, Optional, Tuple
from uuid import UUID

import httpx

from config.settings import settings

logger = logging.getLogger(__name__)

# ─── Constants ───────────────────────────────────────────────────────────────

# Zero-shot classification labels for text analysis
TEXT_CLASSIFICATION_LABELS = [
    "normal findings",
    "abnormal findings",
    "critical findings",
    "requires urgent attention",
]

# Kept for fallback keyword matching
ABNORMALITY_LABELS = TEXT_CLASSIFICATION_LABELS  # alias for backward compatibility

# Keywords that boost risk score when found in extracted text
CRITICAL_KEYWORDS: List[str] = [
    "critical",
    "severe",
    "emergency",
    "urgent",
    "abnormal",
    "elevated",
    "decreased",
    "irregular",
]

# HuggingFace model identifiers
_HF_TEXT_MODEL = "facebook/bart-large-mnli"
_HF_IMAGE_MODEL = "Lsh/chest-xray-pneumonia-classification"

_HF_BASE_URL = "https://api-inference.huggingface.co/models"

# Keyword subsets used in fallback classification
_CRITICAL_SEVERITY_KEYWORDS: List[str] = ["critical", "severe", "emergency", "urgent"]
_ABNORMAL_VALUE_KEYWORDS: List[str] = ["abnormal", "elevated", "decreased", "irregular"]
_NORMAL_INDICATOR_KEYWORDS: List[str] = ["normal", "within range", "unremarkable", "no evidence"]

_REQUEST_TIMEOUT = 30
_MAX_RETRIES = 2  # 2 retries as required (try up to 2 times after initial attempt)
_HF_503_WAIT_SECONDS = 20
_TEXT_TRUNCATE_CHARS = 512

# Disclaimer appended to all AI findings
_AI_DISCLAIMER = (
    "AI-assisted preliminary analysis. Not a medical diagnosis. "
    "Requires specialist review."
)

# Minimum word count to use text analysis instead of image analysis
_MIN_TEXT_ANALYSIS_WORD_COUNT = 20

MODEL_VERSION = "ai-v3.0.0"


class AIAnalysisService:
    """AI analysis engine supporting text (zero-shot) and image (vision) analysis."""

    def __init__(self) -> None:
        self._hf_api_key = settings.huggingface_api_key
        self._headers = {"Authorization": f"Bearer {self._hf_api_key}"}

    # ─── Public API ──────────────────────────────────────────────────────────

    async def analyze_case(self, case_id: UUID) -> None:
        """Orchestrate end-to-end AI analysis for a case after OCR completes.

        Decision logic:
        - Fetch the existing analysis result (created by OCR pipeline).
        - If extracted_text has more than 20 words → run text analysis.
        - Else → download first case file and run image analysis.
        - Persist findings and update case status.
        """
        from services.supabase_service import supabase_service  # noqa: PLC0415

        logger.info("AI analysis starting: case=%s", case_id)

        try:
            # Fetch existing analysis record created by OCR
            analysis_record = await supabase_service.get_analysis_result(
                case_id=str(case_id)
            )
            if not analysis_record:
                logger.error("No analysis record found for case=%s — aborting", case_id)
                return

            analysis_id: str = analysis_record.id
            extracted_text: str = analysis_record.extracted_text or ""
            word_count = len(extracted_text.split()) if extracted_text.strip() else 0

            logger.info(
                "AI analysis: case=%s analysis_id=%s word_count=%d",
                case_id,
                analysis_id,
                word_count,
            )

            if word_count > _MIN_TEXT_ANALYSIS_WORD_COUNT:
                # ── Text path ────────────────────────────────────────────────
                logger.info("case=%s: using text analysis (%d words)", case_id, word_count)
                findings = await self._analyze_text(extracted_text, case_id)
            else:
                # ── Image path ───────────────────────────────────────────────
                logger.info(
                    "case=%s: word_count=%d ≤ %d → attempting image analysis",
                    case_id,
                    word_count,
                    _MIN_TEXT_ANALYSIS_WORD_COUNT,
                )
                image_bytes: Optional[bytes] = None

                # Try to get image bytes from the first case file
                try:
                    case_files = await supabase_service.list_case_files(
                        case_id=str(case_id)
                    )
                    if case_files:
                        first_file = case_files[0]
                        file_url: str = first_file.file_url or ""
                        if file_url:
                            # Extract storage path from public URL
                            storage_path = _extract_storage_path(file_url)
                            signed_url = await supabase_service.get_signed_url(
                                storage_path=storage_path
                            )
                            async with httpx.AsyncClient(timeout=_REQUEST_TIMEOUT) as client:
                                resp = await client.get(signed_url)
                                resp.raise_for_status()
                                image_bytes = resp.content
                            logger.info(
                                "case=%s: downloaded %d bytes from %s",
                                case_id,
                                len(image_bytes),
                                file_url,
                            )
                        else:
                            logger.warning("case=%s: first file has no URL", case_id)
                    else:
                        logger.warning("case=%s: no case files found for image analysis", case_id)
                except Exception as exc:
                    logger.warning(
                        "case=%s: failed to download file for image analysis: %s",
                        case_id,
                        exc,
                    )

                if image_bytes:
                    findings = await self._analyze_image(image_bytes, case_id)
                else:
                    logger.warning(
                        "case=%s: no image bytes available — marking requires_manual_review",
                        case_id,
                    )
                    findings = _manual_review_findings()

            # Attach disclaimer
            findings["disclaimer"] = _AI_DISCLAIMER

            risk_score: float = findings["risk_score"]
            flagged_status: bool = findings["flagged_status"]

            await supabase_service.update_analysis_result(
                analysis_id=analysis_id,
                risk_score=risk_score,
                flagged_status=flagged_status,
                ai_findings=findings,
                model_version=MODEL_VERSION,
            )

            new_status = "flagged" if flagged_status else "completed"
            await supabase_service.update_case_status(
                case_id=str(case_id), new_status=new_status
            )

            logger.info(
                "AI analysis complete: case=%s risk=%.3f flagged=%s status=%s",
                case_id,
                risk_score,
                flagged_status,
                new_status,
            )

            await supabase_service.log_audit(
                user_id=None,
                action="ai_analysis_completed",
                resource_type="case",
                resource_id=str(case_id),
                metadata={
                    "risk_score": risk_score,
                    "flagged_status": flagged_status,
                    "analysis_type": findings.get("analysis_type", "unknown"),
                    "model_version": MODEL_VERSION,
                },
            )

        except Exception as exc:
            logger.error(
                "AI analysis pipeline failed for case=%s: %s", case_id, exc, exc_info=True
            )

    # ─── Text Analysis ───────────────────────────────────────────────────────

    async def _analyze_text(self, extracted_text: str, case_id: UUID) -> Dict[str, Any]:
        """Run zero-shot classification on extracted text.

        Uses facebook/bart-large-mnli.
        Falls back to keyword analysis if HuggingFace is unavailable after retries.
        """
        start_ms = int(time.monotonic() * 1000)
        truncated = extracted_text[:_TEXT_TRUNCATE_CHARS]
        payload = {
            "inputs": truncated,
            "parameters": {
                "candidate_labels": TEXT_CLASSIFICATION_LABELS,
                "multi_label": False,
            },
        }

        try:
            raw = await self._call_hf_text_api(_HF_TEXT_MODEL, payload)
            labels: List[str] = raw.get("labels", [])
            scores: List[float] = raw.get("scores", [])
            label_scores = dict(zip(labels, scores))
            top_label = labels[0] if labels else "inconclusive"
            top_score = scores[0] if scores else 0.0

            # risk_score derived from confidence of top label
            label_risk_weights: Dict[str, float] = {
                "critical findings": 1.0,
                "requires urgent attention": 0.9,
                "abnormal findings": 0.65,
                "normal findings": 0.1,
            }
            risk_score = round(
                min(
                    sum(
                        label_scores.get(lbl, 0.0) * w
                        for lbl, w in label_risk_weights.items()
                    ),
                    1.0,
                ),
                4,
            )

            flagged = top_label in ("critical findings", "requires urgent attention") and top_score > 0.6

            processing_time_ms = int(time.monotonic() * 1000) - start_ms
            summary = (
                f"Text analysis: {top_label} (confidence {top_score:.1%}). "
                f"Risk score: {risk_score:.2f}."
            )

            logger.info(
                "Text analysis: case=%s top_label=%s top_score=%.3f risk=%.3f flagged=%s",
                case_id,
                top_label,
                top_score,
                risk_score,
                flagged,
            )

            return {
                "analysis_type": "text",
                "risk_score": risk_score,
                "flagged_status": flagged,
                "detected_category": top_label,
                "category_confidence": round(top_score, 4),
                "confidence_breakdown": {k: round(v, 4) for k, v in label_scores.items()},
                "analysis_summary": summary,
                "summary": summary,
                "model_version": MODEL_VERSION,
                "processing_time_ms": processing_time_ms,
                "anomalies": [summary] if flagged else [],
                "recommendations": _build_recommendations(risk_score, flagged),
            }

        except Exception as exc:
            logger.warning(
                "HuggingFace text API failed for case=%s after retries: %s — using keyword fallback",
                case_id,
                exc,
            )
            return self._keyword_fallback_analysis(extracted_text)

    # ─── Image Analysis ──────────────────────────────────────────────────────

    async def _analyze_image(self, image_bytes: bytes, case_id: UUID) -> Dict[str, Any]:
        """Run image classification on raw image bytes.

        Uses nickmuchi/vit-finetuned-chest-xray-pneumonia.
        Falls back to requires_manual_review on persistent API failure.
        """
        start_ms = int(time.monotonic() * 1000)

        try:
            raw = await self._call_hf_image_api(_HF_IMAGE_MODEL, image_bytes)

            if not isinstance(raw, list) or not raw:
                raise ValueError(f"Unexpected image classification response: {raw!r}")

            # raw = [{"label": "PNEUMONIA", "score": 0.87}, {"label": "NORMAL", "score": 0.13}]
            top_item: Dict[str, Any] = raw[0]
            top_label: str = str(top_item.get("label", "UNKNOWN")).upper()
            top_score: float = float(top_item.get("score", 0.0))

            if top_label == "NORMAL":
                risk_score = 0.1
            else:
                risk_score = round(top_score, 4)

            flagged = top_label == "PNEUMONIA" or (top_label != "NORMAL" and top_score > 0.6)

            processing_time_ms = int(time.monotonic() * 1000) - start_ms
            summary = (
                f"Image analysis: {top_label} detected (score {top_score:.1%}). "
                f"Risk score: {risk_score:.2f}."
            )

            all_predictions = [
                {"label": str(item.get("label", "")), "score": round(float(item.get("score", 0.0)), 4)}
                for item in raw
            ]

            logger.info(
                "Image analysis: case=%s top_label=%s score=%.3f risk=%.3f flagged=%s",
                case_id,
                top_label,
                top_score,
                risk_score,
                flagged,
            )

            return {
                "analysis_type": "image",
                "risk_score": risk_score,
                "flagged_status": flagged,
                "detected_category": top_label.lower(),
                "category_confidence": round(top_score, 4),
                "predictions": all_predictions,
                "analysis_summary": summary,
                "summary": summary,
                "model_version": MODEL_VERSION,
                "processing_time_ms": processing_time_ms,
                "anomalies": [summary] if flagged else [],
                "recommendations": _build_recommendations(risk_score, flagged),
            }

        except Exception as exc:
            logger.warning(
                "HuggingFace image API failed for case=%s after retries: %s — marking requires_manual_review",
                case_id,
                exc,
            )
            return _manual_review_findings()

    # ─── HuggingFace API Helpers ─────────────────────────────────────────────

    async def _call_hf_text_api(self, model: str, payload: Dict[str, Any]) -> Any:
        """POST JSON payload to HuggingFace Inference API with retry logic.

        Handles 503 (model loading) by waiting 20 s and retrying up to _MAX_RETRIES times.
        """
        url = f"{_HF_BASE_URL}/{model}"

        for attempt in range(1, _MAX_RETRIES + 2):  # attempts: 1, 2, 3
            try:
                async with httpx.AsyncClient(timeout=_REQUEST_TIMEOUT) as client:
                    response = await client.post(url, headers=self._headers, json=payload)

                if response.status_code == 503:
                    logger.warning(
                        "HF model loading (503) for %s — attempt %d/%d, waiting %ds",
                        model,
                        attempt,
                        _MAX_RETRIES + 1,
                        _HF_503_WAIT_SECONDS,
                    )
                    if attempt <= _MAX_RETRIES:
                        await asyncio.sleep(_HF_503_WAIT_SECONDS)
                    continue

                if response.status_code == 400:
                    inputs = payload.get("inputs", "")
                    if isinstance(inputs, str) and len(inputs) > _TEXT_TRUNCATE_CHARS:
                        logger.warning(
                            "HF 400 — truncating input from %d to %d chars for retry",
                            len(inputs),
                            _TEXT_TRUNCATE_CHARS,
                        )
                        payload = {**payload, "inputs": inputs[:_TEXT_TRUNCATE_CHARS]}
                        continue
                    response.raise_for_status()

                response.raise_for_status()
                data = response.json()
                if not data:
                    raise ValueError("Empty response from HuggingFace API")
                return data

            except httpx.TimeoutException:
                logger.warning(
                    "HF API timeout on attempt %d/%d for model %s",
                    attempt,
                    _MAX_RETRIES + 1,
                    model,
                )
                if attempt > _MAX_RETRIES:
                    raise

        raise RuntimeError(
            f"HuggingFace text API call failed after {_MAX_RETRIES + 1} attempts for model {model}"
        )

    async def _call_hf_image_api(self, model: str, image_bytes: bytes) -> Any:
        """POST raw image bytes to HuggingFace Inference API for image classification.

        Handles 503 (model loading) by waiting 20 s and retrying up to _MAX_RETRIES times.
        """
        url = f"{_HF_BASE_URL}/{model}"

        for attempt in range(1, _MAX_RETRIES + 2):  # attempts: 1, 2, 3
            try:
                async with httpx.AsyncClient(timeout=_REQUEST_TIMEOUT) as client:
                    response = await client.post(
                        url,
                        headers={**self._headers, "Content-Type": "application/octet-stream"},
                        content=image_bytes,
                    )

                if response.status_code == 503:
                    logger.warning(
                        "HF model loading (503) for %s — attempt %d/%d, waiting %ds",
                        model,
                        attempt,
                        _MAX_RETRIES + 1,
                        _HF_503_WAIT_SECONDS,
                    )
                    if attempt <= _MAX_RETRIES:
                        await asyncio.sleep(_HF_503_WAIT_SECONDS)
                    continue

                response.raise_for_status()
                data = response.json()
                if not isinstance(data, list):
                    raise ValueError(f"Expected list from image model, got: {type(data)}")
                return data

            except httpx.TimeoutException:
                logger.warning(
                    "HF image API timeout on attempt %d/%d for model %s",
                    attempt,
                    _MAX_RETRIES + 1,
                    model,
                )
                if attempt > _MAX_RETRIES:
                    raise

        raise RuntimeError(
            f"HuggingFace image API call failed after {_MAX_RETRIES + 1} attempts for model {model}"
        )

    # ─── Fallback Analysis ───────────────────────────────────────────────────

    def _keyword_fallback_analysis(self, text: str) -> Dict[str, Any]:
        """Pure keyword-based analysis used when HuggingFace text API is unavailable."""
        start_ms = int(time.monotonic() * 1000)
        classification = self._keyword_zero_shot_fallback(text)
        entities = self._keyword_ner_fallback(text)
        risk_score = self._calculate_keyword_risk_score(classification, entities, text)
        detected_category = classification.get("top_label", "inconclusive")
        category_confidence = classification.get("top_score", 0.0)
        critical_keywords_found = self._find_critical_keywords(text, entities)
        flagged_status = self._determine_flagged(
            risk_score, detected_category, category_confidence, critical_keywords_found
        )
        summary = (
            f"Fallback keyword analysis: {detected_category}. "
            f"Risk score: {risk_score:.2f}. "
            f"Critical keywords: {', '.join(critical_keywords_found) or 'none'}."
        )
        processing_time_ms = int(time.monotonic() * 1000) - start_ms
        return {
            "analysis_type": "text_fallback",
            "risk_score": risk_score,
            "flagged_status": flagged_status,
            "detected_category": detected_category,
            "category_confidence": round(category_confidence, 4),
            "extracted_entities": entities,
            "critical_keywords_found": critical_keywords_found,
            "analysis_summary": summary,
            "model_version": f"{MODEL_VERSION}-keyword-fallback",
            "processing_time_ms": processing_time_ms,
            "summary": summary,
            "anomalies": [summary] if flagged_status else [],
            "recommendations": _build_recommendations(risk_score, flagged_status),
            "confidence_breakdown": classification.get("label_scores", {}),
        }

    def _keyword_zero_shot_fallback(self, text: str) -> Dict[str, Any]:
        """Keyword-based category detection used as fallback."""
        text_lower = text.lower()
        critical_count = sum(1 for kw in _CRITICAL_SEVERITY_KEYWORDS if kw in text_lower)
        abnormal_count = sum(1 for kw in _ABNORMAL_VALUE_KEYWORDS if kw in text_lower)
        normal_count = sum(1 for kw in _NORMAL_INDICATOR_KEYWORDS if kw in text_lower)

        if critical_count >= 3:
            top_label, top_score = "requires urgent attention", min(0.5 + critical_count * 0.1, 0.95)
        elif critical_count >= 2:
            top_label, top_score = "critical findings", min(0.5 + critical_count * 0.1, 0.9)
        elif critical_count >= 1 or abnormal_count >= 2:
            top_label, top_score = "abnormal findings", min(0.5 + abnormal_count * 0.05, 0.8)
        elif normal_count >= 1:
            top_label, top_score = "normal findings", min(0.5 + normal_count * 0.1, 0.85)
        else:
            top_label, top_score = "inconclusive", 0.4

        label_scores = {lbl: 0.05 for lbl in TEXT_CLASSIFICATION_LABELS}
        label_scores[top_label] = top_score
        return {
            "top_label": top_label,
            "top_score": top_score,
            "label_scores": {k: round(v, 4) for k, v in label_scores.items()},
        }

    @staticmethod
    def _keyword_ner_fallback(text: str) -> List[Dict[str, Any]]:
        """Extract medical terms using a simple keyword dictionary."""
        medical_terms = [
            "heart rate", "blood pressure", "spo2", "oxygen saturation",
            "temperature", "pulse", "respiration", "ecg", "ekg",
            "arrhythmia", "tachycardia", "bradycardia", "hypertension",
            "hypotension", "fever", "hypoxia", "ischemia", "infarction",
            "stenosis", "fibrillation", "edema", "pneumonia", "fracture",
        ]
        text_lower = text.lower()
        return [
            {"entity": term, "label": "MEDICAL_TERM", "confidence": 0.75}
            for term in medical_terms
            if term in text_lower
        ]

    def _calculate_keyword_risk_score(
        self,
        classification: Dict[str, Any],
        entities: List[Dict[str, Any]],
        text: str,
    ) -> float:
        label_scores: Dict[str, float] = classification.get("label_scores", {})
        top_label: str = classification.get("top_label", "inconclusive")
        top_score: float = classification.get("top_score", 0.0)

        label_weights: Dict[str, float] = {
            "critical findings": 1.0,
            "requires urgent attention": 0.9,
            "abnormal findings": 0.65,
            "inconclusive": 0.35,
            "normal findings": 0.05,
        }

        base_score = sum(
            label_scores.get(lbl, 0.0) * weight
            for lbl, weight in label_weights.items()
        )
        if not label_scores:
            base_score = label_weights.get(top_label, 0.35) * top_score

        text_lower = text.lower()
        entity_texts = " ".join(e.get("entity", "") for e in entities).lower()
        combined_text = f"{text_lower} {entity_texts}"
        keyword_hits = sum(1 for kw in CRITICAL_KEYWORDS if kw in combined_text)
        keyword_boost = min(keyword_hits * 0.05, 0.25)

        return round(min(max(base_score + keyword_boost, 0.0), 1.0), 4)

    def _determine_flagged(
        self,
        risk_score: float,
        detected_category: str,
        category_confidence: float,
        critical_keywords_found: List[str],
    ) -> bool:
        if risk_score > 0.7:
            return True
        if detected_category in ("critical findings", "requires urgent attention") and category_confidence > 0.6:
            return True
        if len(critical_keywords_found) >= 2:
            return True
        return False

    def _find_critical_keywords(
        self, text: str, entities: List[Dict[str, Any]]
    ) -> List[str]:
        text_lower = text.lower()
        entity_text = " ".join(e.get("entity", "") for e in entities).lower()
        combined = f"{text_lower} {entity_text}"
        return [kw for kw in CRITICAL_KEYWORDS if kw in combined]

    # ─── Legacy compatibility ─────────────────────────────────────────────────

    async def analyze_extracted_text(
        self, extracted_text: str, case_id: UUID
    ) -> Dict[str, Any]:
        """Backward-compatible entry point for text analysis."""
        return await self._analyze_text(extracted_text, case_id)

    async def analyze(
        self, extracted_text: str
    ) -> Tuple[float, bool, Dict]:
        """Legacy entry point.

        Returns:
            (risk_score, flagged_status, ai_findings_dict)
        """
        import uuid  # noqa: PLC0415

        findings = await self._analyze_text(extracted_text, uuid.uuid4())
        return (findings["risk_score"], findings["flagged_status"], findings)


# ─── Module-level helpers ─────────────────────────────────────────────────────

def _manual_review_findings() -> Dict[str, Any]:
    """Return a placeholder findings dict indicating manual review is required."""
    return {
        "analysis_type": "image_fallback",
        "risk_score": 0.5,
        "flagged_status": False,
        "detected_category": "requires_manual_review",
        "category_confidence": 0.0,
        "analysis_summary": (
            "Automated image analysis could not be completed. "
            "Manual review by a specialist is required."
        ),
        "summary": "Requires manual review — automated image analysis unavailable.",
        "model_version": f"{MODEL_VERSION}-manual",
        "processing_time_ms": 0,
        "anomalies": [],
        "recommendations": ["Manual specialist review required."],
    }


def _build_recommendations(risk_score: float, flagged: bool) -> List[str]:
    if flagged or risk_score > 0.7:
        return ["Immediate specialist review required.", "Escalate within 2 hours."]
    if risk_score > 0.4:
        return ["Schedule specialist review within 24 hours.", "Monitor closely."]
    return ["Continue standard monitoring.", "Routine follow-up as scheduled."]


def _extract_storage_path(file_url: str) -> str:
    """Extract the Supabase Storage path from a public URL.

    e.g. https://.../storage/v1/object/public/diagnostic-uploads/clinic/case/file.jpg
    → clinic/case/file.jpg

    If the expected URL marker is not found, returns the original value and logs a warning
    so callers can identify misconfigured file URLs.
    """
    marker = "/object/public/diagnostic-uploads/"
    if marker in file_url:
        path = file_url.split(marker)[-1]
        return path.split("?")[0]
    # URL does not contain the expected Supabase storage marker — treat as a raw path
    logger.warning(
        "_extract_storage_path: URL does not contain expected marker '%s'; "
        "returning URL as-is. URL: %.120s",
        marker,
        file_url,
    )
    return file_url


# ─── Singleton ───────────────────────────────────────────────────────────────

ai_analysis_service = AIAnalysisService()
