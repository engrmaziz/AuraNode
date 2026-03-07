"""AI analysis service — risk scoring via Hugging Face Inference API."""
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

# Abnormality detection labels for zero-shot classification
ABNORMALITY_LABELS = [
    "normal findings",
    "abnormal findings",
    "critical findings",
    "inconclusive",
]

# Keywords that boost risk score when found in extracted text or NER entities
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

# Numeric anomaly patterns (values clearly outside typical ranges)
_NUMERIC_ANOMALY_PATTERNS = [
    r"\b(?:heart rate|hr|pulse)[:\s]+(\d+)",       # heart rate
    r"\b(?:blood pressure|bp)[:\s]+(\d+)[/\\](\d+)",  # blood pressure
    r"\b(?:spo2|oxygen saturation)[:\s]+(\d+)",    # SpO2
    r"\b(?:temperature|temp)[:\s]+(\d+\.?\d*)",    # temperature
]

# Typical normal ranges (min, max) for numeric anomaly detection
_NORMAL_RANGES: Dict[str, Tuple[float, float]] = {
    "heart rate": (40.0, 120.0),
    "systolic_bp": (70.0, 160.0),
    "diastolic_bp": (40.0, 100.0),
    "spo2": (90.0, 100.0),
    "temperature": (35.0, 40.0),
}

# HuggingFace model identifiers
_MODELS: Dict[str, str] = {
    "zero_shot": "facebook/bart-large-mnli",
    "ner": "dbmdz/bert-large-cased-finetuned-conll03-english",
}

_HF_BASE_URL = "https://api-inference.huggingface.co/models"

# Keyword subsets used in fallback classification
_CRITICAL_SEVERITY_KEYWORDS: List[str] = ["critical", "severe", "emergency", "urgent"]
_ABNORMAL_VALUE_KEYWORDS: List[str] = ["abnormal", "elevated", "decreased", "irregular"]
_NORMAL_INDICATOR_KEYWORDS: List[str] = ["normal", "within range", "unremarkable", "no evidence"]
_REQUEST_TIMEOUT = 30
_MAX_RETRIES = 3
_TEXT_TRUNCATE_CHARS = 512

MODEL_VERSION = "ai-v2.0.0"


class AIAnalysisService:
    """Full AI analysis engine using Hugging Face Inference API."""

    def __init__(self) -> None:
        self._hf_api_key = settings.huggingface_api_key
        self._headers = {"Authorization": f"Bearer {self._hf_api_key}"}

    # ─── Public API ──────────────────────────────────────────────────────────

    async def analyze_extracted_text(
        self, extracted_text: str, case_id: UUID
    ) -> Dict[str, Any]:
        """Run complete AI analysis on OCR-extracted text.

        Steps:
        1. Abnormality detection via zero-shot classification
        2. Medical entity extraction via NER
        3. Risk scoring
        4. Flag determination

        Returns a structured dict with risk_score, flagged_status, detected_category,
        category_confidence, extracted_entities, critical_keywords_found,
        analysis_summary, model_version, and processing_time_ms.
        """
        start_ms = int(time.monotonic() * 1000)

        if not extracted_text or len(extracted_text.strip()) < 10:
            logger.warning(
                "Insufficient text for AI analysis (case=%s) — using fallback", case_id
            )
            return self._keyword_fallback_analysis(extracted_text or "")

        try:
            # Run zero-shot and NER concurrently for speed
            classification, entities = await asyncio.gather(
                self._zero_shot_classify(extracted_text),
                self._extract_medical_entities(extracted_text),
                return_exceptions=True,
            )

            # Handle partial failures gracefully
            if isinstance(classification, Exception):
                logger.warning(
                    "Zero-shot classification failed for case=%s: %s — using fallback",
                    case_id,
                    classification,
                )
                classification = self._keyword_zero_shot_fallback(extracted_text)

            if isinstance(entities, Exception):
                logger.warning(
                    "NER failed for case=%s: %s — using keyword fallback",
                    case_id,
                    entities,
                )
                entities = self._keyword_ner_fallback(extracted_text)

            risk_score = self._calculate_risk_score(classification, entities, extracted_text)
            detected_category: str = classification.get("top_label", "inconclusive")
            category_confidence: float = classification.get("top_score", 0.0)
            critical_keywords_found = self._find_critical_keywords(extracted_text, entities)

            flagged_status = self._determine_flagged(
                risk_score, detected_category, category_confidence, critical_keywords_found
            )

            processing_time_ms = int(time.monotonic() * 1000) - start_ms

            summary = self._build_summary(
                detected_category, risk_score, critical_keywords_found, entities
            )

            result: Dict[str, Any] = {
                "risk_score": risk_score,
                "flagged_status": flagged_status,
                "detected_category": detected_category,
                "category_confidence": round(category_confidence, 4),
                "extracted_entities": entities,
                "critical_keywords_found": critical_keywords_found,
                "analysis_summary": summary,
                "model_version": MODEL_VERSION,
                "processing_time_ms": processing_time_ms,
                # Legacy fields kept for backward compatibility
                "summary": summary,
                "anomalies": [summary] if flagged_status else [],
                "recommendations": self._build_recommendations(risk_score, flagged_status),
                "confidence_breakdown": classification.get("label_scores", {}),
            }

            logger.info(
                "AI analysis complete: case=%s risk=%.3f flagged=%s category=%s [%dms]",
                case_id,
                risk_score,
                flagged_status,
                detected_category,
                processing_time_ms,
            )
            return result

        except Exception as exc:
            logger.error(
                "AI analysis failed for case=%s: %s", case_id, exc, exc_info=True
            )
            return self._keyword_fallback_analysis(extracted_text)

    async def analyze_case(self, case_id: UUID) -> None:
        """Called by processing queue after OCR completes.

        Fetches OCR result, runs AI analysis, updates the database, and
        assigns a specialist if the case is flagged.
        """
        # Import here to avoid circular imports
        from services.supabase_service import supabase_service  # noqa: PLC0415

        logger.info("AI analysis starting: case=%s", case_id)

        try:
            analysis_record = await supabase_service.get_analysis_result(
                case_id=str(case_id)
            )
            if not analysis_record:
                logger.error("No analysis record found for case=%s", case_id)
                return

            extracted_text = analysis_record.extracted_text or ""
            findings = await self.analyze_extracted_text(extracted_text, case_id)

            risk_score: float = findings["risk_score"]
            flagged_status: bool = findings["flagged_status"]

            await supabase_service.update_case_analysis(
                case_id=str(case_id),
                risk_score=risk_score,
                flagged_status=flagged_status,
                ai_findings=findings,
            )

            if flagged_status:
                specialist_id = await supabase_service.get_available_specialist()
                if specialist_id:
                    await supabase_service.assign_specialist(
                        case_id=str(case_id), specialist_id=str(specialist_id)
                    )
                    await supabase_service.update_case_status(
                        case_id=str(case_id), new_status="flagged"
                    )
                    logger.info(
                        "Case %s flagged and assigned to specialist %s",
                        case_id,
                        specialist_id,
                    )
                else:
                    # No specialist available — still flag the case
                    await supabase_service.update_case_status(
                        case_id=str(case_id), new_status="flagged"
                    )
                    logger.warning(
                        "Case %s flagged but no specialist available for assignment",
                        case_id,
                    )
            else:
                await supabase_service.update_case_status(
                    case_id=str(case_id), new_status="completed"
                )

            await supabase_service.log_audit(
                user_id=None,
                action="ai_analysis_completed",
                resource_type="case",
                resource_id=str(case_id),
                metadata={
                    "risk_score": risk_score,
                    "flagged_status": flagged_status,
                    "detected_category": findings.get("detected_category"),
                    "model_version": MODEL_VERSION,
                },
            )

        except Exception as exc:
            logger.error(
                "AI analysis pipeline failed for case=%s: %s", case_id, exc, exc_info=True
            )

    # ─── HuggingFace API ─────────────────────────────────────────────────────

    async def _call_huggingface_api(
        self, model: str, payload: Dict[str, Any]
    ) -> Any:
        """Make an HTTP request to the HuggingFace Inference API with retry logic.

        Retry behaviour:
        - 503 (model loading): wait 20 s, retry up to 3 times
        - 429 (rate limit): wait 60 s, retry up to 2 times
        - 400 / text too long: truncate input to 512 characters and retry once
        """
        url = f"{_HF_BASE_URL}/{model}"
        rate_limit_retries = 0

        for attempt in range(1, _MAX_RETRIES + 1):
            try:
                async with httpx.AsyncClient(timeout=_REQUEST_TIMEOUT) as client:
                    response = await client.post(
                        url, headers=self._headers, json=payload
                    )

                if response.status_code == 503:
                    logger.warning(
                        "HF model loading (503) — attempt %d/%d, waiting 20s",
                        attempt,
                        _MAX_RETRIES,
                    )
                    if attempt < _MAX_RETRIES:
                        await asyncio.sleep(20)
                    continue

                if response.status_code == 429:
                    rate_limit_retries += 1
                    if rate_limit_retries <= 2:
                        logger.warning("HF rate limit (429) — waiting 60s")
                        await asyncio.sleep(60)
                        continue
                    raise httpx.HTTPStatusError(
                        "Rate limit exceeded after retries",
                        request=response.request,
                        response=response,
                    )

                if response.status_code == 400:
                    # Try truncating the input and retry once
                    inputs = payload.get("inputs", "")
                    if isinstance(inputs, str) and len(inputs) > _TEXT_TRUNCATE_CHARS:
                        logger.warning(
                            "HF 400 — truncating input from %d to %d chars",
                            len(inputs),
                            _TEXT_TRUNCATE_CHARS,
                        )
                        payload = {**payload, "inputs": inputs[:_TEXT_TRUNCATE_CHARS]}
                        continue
                    response.raise_for_status()

                response.raise_for_status()
                return response.json()

            except httpx.TimeoutException:
                logger.warning(
                    "HF API timeout on attempt %d/%d for model %s",
                    attempt,
                    _MAX_RETRIES,
                    model,
                )
                if attempt >= _MAX_RETRIES:
                    raise

        raise RuntimeError(f"HuggingFace API call failed after {_MAX_RETRIES} retries")

    # ─── Analysis Steps ──────────────────────────────────────────────────────

    async def _zero_shot_classify(self, text: str) -> Dict[str, Any]:
        """Run zero-shot classification; falls back to keyword scoring on failure."""
        truncated = text[:_TEXT_TRUNCATE_CHARS]
        payload = {
            "inputs": truncated,
            "parameters": {
                "candidate_labels": ABNORMALITY_LABELS,
                "multi_label": False,
            },
        }
        try:
            raw = await self._call_huggingface_api(_MODELS["zero_shot"], payload)
            labels: List[str] = raw.get("labels", [])
            scores: List[float] = raw.get("scores", [])
            label_scores = dict(zip(labels, scores))
            top_label = labels[0] if labels else "inconclusive"
            top_score = scores[0] if scores else 0.0
            return {
                "top_label": top_label,
                "top_score": top_score,
                "label_scores": {k: round(v, 4) for k, v in label_scores.items()},
            }
        except Exception as exc:
            logger.warning("Zero-shot API failed: %s — using keyword fallback", exc)
            return self._keyword_zero_shot_fallback(text)

    async def _extract_medical_entities(self, text: str) -> List[Dict[str, Any]]:
        """Run NER extraction; falls back to keyword matching on API failure."""
        truncated = text[:_TEXT_TRUNCATE_CHARS]
        try:
            raw = await self._call_huggingface_api(
                _MODELS["ner"], {"inputs": truncated}
            )
            if not isinstance(raw, list):
                return self._keyword_ner_fallback(text)
            entities = []
            for item in raw:
                if isinstance(item, dict) and item.get("word"):
                    entities.append(
                        {
                            "entity": item.get("word", ""),
                            "label": item.get("entity_group") or item.get("entity", ""),
                            "confidence": round(float(item.get("score", 0.0)), 4),
                        }
                    )
            return entities
        except Exception as exc:
            logger.warning("NER API failed: %s — using keyword fallback", exc)
            return self._keyword_ner_fallback(text)

    # ─── Scoring & Flagging ──────────────────────────────────────────────────

    def _calculate_risk_score(
        self,
        classification: Dict[str, Any],
        entities: List[Dict[str, Any]],
        text: str,
    ) -> float:
        """Deterministic risk scoring algorithm.

        Components:
        1. Base score from zero-shot confidence mapped to risk weight
        2. Boost for critical keyword matches
        3. Boost for numeric anomalies outside typical ranges
        Final score clamped to [0.0, 1.0].
        """
        label_scores: Dict[str, float] = classification.get("label_scores", {})
        top_label: str = classification.get("top_label", "inconclusive")
        top_score: float = classification.get("top_score", 0.0)

        # Base weight per label
        _LABEL_WEIGHTS: Dict[str, float] = {
            "critical findings": 1.0,
            "abnormal findings": 0.65,
            "inconclusive": 0.35,
            "normal findings": 0.05,
        }

        base_score = sum(
            label_scores.get(lbl, 0.0) * weight
            for lbl, weight in _LABEL_WEIGHTS.items()
        )
        if not label_scores:
            base_score = _LABEL_WEIGHTS.get(top_label, 0.35) * top_score

        # Boost for critical keywords in text or entity list
        text_lower = text.lower()
        entity_texts = " ".join(e.get("entity", "") for e in entities).lower()
        combined_text = f"{text_lower} {entity_texts}"
        keyword_hits = sum(
            1 for kw in CRITICAL_KEYWORDS if kw in combined_text
        )
        keyword_boost = min(keyword_hits * 0.05, 0.25)

        # Boost for numeric anomalies
        numeric_boost = self._detect_numeric_anomaly_boost(text)

        raw_score = base_score + keyword_boost + numeric_boost
        return round(min(max(raw_score, 0.0), 1.0), 4)

    def _detect_numeric_anomaly_boost(self, text: str) -> float:
        """Return a boost value [0.0, 0.2] based on numeric values outside normal ranges."""
        boost = 0.0
        text_lower = text.lower()

        hr_match = re.search(r"\b(?:heart rate|hr|pulse)[:\s]+(\d+)", text_lower)
        if hr_match:
            hr = float(hr_match.group(1))
            lo, hi = _NORMAL_RANGES["heart rate"]
            if not (lo <= hr <= hi):
                boost += 0.1

        bp_match = re.search(
            r"\b(?:blood pressure|bp)[:\s]+(\d+)[/\\](\d+)", text_lower
        )
        if bp_match:
            sys_bp, dia_bp = float(bp_match.group(1)), float(bp_match.group(2))
            s_lo, s_hi = _NORMAL_RANGES["systolic_bp"]
            d_lo, d_hi = _NORMAL_RANGES["diastolic_bp"]
            if not (s_lo <= sys_bp <= s_hi) or not (d_lo <= dia_bp <= d_hi):
                boost += 0.1

        spo2_match = re.search(
            r"\b(?:spo2|oxygen saturation)[:\s]+(\d+)", text_lower
        )
        if spo2_match:
            spo2 = float(spo2_match.group(1))
            lo, hi = _NORMAL_RANGES["spo2"]
            if not (lo <= spo2 <= hi):
                boost += 0.1

        return min(boost, 0.2)

    def _determine_flagged(
        self,
        risk_score: float,
        detected_category: str,
        category_confidence: float,
        critical_keywords_found: List[str],
    ) -> bool:
        """Determine whether a case should be flagged for specialist review.

        Flagged if any of:
        - risk_score > 0.7
        - detected_category is "critical findings" with confidence > 0.6
        - 2 or more critical keywords detected
        """
        if risk_score > 0.7:
            return True
        if detected_category == "critical findings" and category_confidence > 0.6:
            return True
        if len(critical_keywords_found) >= 2:
            return True
        return False

    def _find_critical_keywords(
        self, text: str, entities: List[Dict[str, Any]]
    ) -> List[str]:
        """Return list of critical keywords found in text or extracted entities."""
        text_lower = text.lower()
        entity_text = " ".join(e.get("entity", "") for e in entities).lower()
        combined = f"{text_lower} {entity_text}"
        return [kw for kw in CRITICAL_KEYWORDS if kw in combined]

    # ─── Fallback Analysis ───────────────────────────────────────────────────

    def _keyword_fallback_analysis(self, text: str) -> Dict[str, Any]:
        """Pure keyword-based analysis used when HuggingFace API is unavailable.

        Returns the same dict structure as analyze_extracted_text.
        """
        start_ms = int(time.monotonic() * 1000)
        classification = self._keyword_zero_shot_fallback(text)
        entities = self._keyword_ner_fallback(text)
        risk_score = self._calculate_risk_score(classification, entities, text)
        detected_category = classification.get("top_label", "inconclusive")
        category_confidence = classification.get("top_score", 0.0)
        critical_keywords_found = self._find_critical_keywords(text, entities)
        flagged_status = self._determine_flagged(
            risk_score, detected_category, category_confidence, critical_keywords_found
        )
        summary = self._build_summary(
            detected_category, risk_score, critical_keywords_found, entities
        )
        processing_time_ms = int(time.monotonic() * 1000) - start_ms
        return {
            "risk_score": risk_score,
            "flagged_status": flagged_status,
            "detected_category": detected_category,
            "category_confidence": round(category_confidence, 4),
            "extracted_entities": entities,
            "critical_keywords_found": critical_keywords_found,
            "analysis_summary": summary,
            "model_version": f"{MODEL_VERSION}-fallback",
            "processing_time_ms": processing_time_ms,
            # Legacy fields
            "summary": summary,
            "anomalies": [summary] if flagged_status else [],
            "recommendations": self._build_recommendations(risk_score, flagged_status),
            "confidence_breakdown": classification.get("label_scores", {}),
        }

    def _keyword_zero_shot_fallback(self, text: str) -> Dict[str, Any]:
        """Keyword-based category detection used as fallback."""
        text_lower = text.lower()
        critical_count = sum(1 for kw in _CRITICAL_SEVERITY_KEYWORDS if kw in text_lower)
        abnormal_count = sum(1 for kw in _ABNORMAL_VALUE_KEYWORDS if kw in text_lower)
        normal_count = sum(1 for kw in _NORMAL_INDICATOR_KEYWORDS if kw in text_lower)

        if critical_count >= 2:
            top_label, top_score = "critical findings", min(0.5 + critical_count * 0.1, 0.9)
        elif critical_count >= 1 or abnormal_count >= 2:
            top_label, top_score = "abnormal findings", min(0.5 + abnormal_count * 0.05, 0.8)
        elif normal_count >= 1:
            top_label, top_score = "normal findings", min(0.5 + normal_count * 0.1, 0.85)
        else:
            top_label, top_score = "inconclusive", 0.4

        label_scores = {lbl: 0.05 for lbl in ABNORMALITY_LABELS}
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
        entities = []
        for term in medical_terms:
            if term in text_lower:
                entities.append(
                    {"entity": term, "label": "MEDICAL_TERM", "confidence": 0.75}
                )
        return entities

    # ─── Helpers ─────────────────────────────────────────────────────────────

    @staticmethod
    def _build_summary(
        detected_category: str,
        risk_score: float,
        critical_keywords: List[str],
        entities: List[Dict[str, Any]],
    ) -> str:
        kw_str = ", ".join(critical_keywords) if critical_keywords else "none"
        return (
            f"Detected category: {detected_category}. "
            f"Risk score: {risk_score:.2f}. "
            f"Critical keywords: {kw_str}. "
            f"Entities found: {len(entities)}."
        )

    @staticmethod
    def _build_recommendations(risk_score: float, flagged: bool) -> List[str]:
        if flagged or risk_score > 0.7:
            return ["Immediate specialist review required.", "Escalate within 2 hours."]
        if risk_score > 0.4:
            return ["Schedule specialist review within 24 hours.", "Monitor closely."]
        return ["Continue standard monitoring.", "Routine follow-up as scheduled."]

    # ─── Legacy compatibility ─────────────────────────────────────────────────

    async def analyze(
        self, extracted_text: str
    ) -> Tuple[float, bool, Dict]:
        """Legacy entry point — calls analyze_extracted_text internally.

        Returns:
            (risk_score, flagged_status, ai_findings_dict)
        """
        import uuid  # noqa: PLC0415

        findings = await self.analyze_extracted_text(extracted_text, uuid.uuid4())
        return (
            findings["risk_score"],
            findings["flagged_status"],
            findings,
        )


ai_analysis_service = AIAnalysisService()
