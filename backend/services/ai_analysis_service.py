"""AI analysis service — risk scoring via Hugging Face Inference API."""
import logging
from typing import Dict, List, Tuple

import httpx

from config.settings import settings

logger = logging.getLogger(__name__)

# Risk threshold above which a case is flagged for specialist review
RISK_FLAG_THRESHOLD = 0.70

# Medical risk labels for zero-shot classification
MEDICAL_RISK_LABELS = [
    "high risk cardiac abnormality",
    "moderate risk finding",
    "normal finding",
    "critical emergency",
    "benign variation",
]

HF_API_URL = "https://api-inference.huggingface.co/models/"


class AIAnalysisService:
    """Runs AI risk scoring on extracted OCR text."""

    def __init__(self) -> None:
        self._headers = {"Authorization": f"Bearer {settings.huggingface_api_key}"}
        self._model = settings.huggingface_model

    async def analyze(
        self, extracted_text: str
    ) -> Tuple[float, bool, Dict]:
        """Run zero-shot classification on extracted text.

        Returns:
            (risk_score, flagged_status, ai_findings_dict)
        """
        if not extracted_text or len(extracted_text.strip()) < 10:
            logger.warning("Insufficient text for AI analysis — returning default low-risk result")
            return self._default_result()

        try:
            classification = await self._classify_text(extracted_text)
            risk_score = self._compute_risk_score(classification)
            flagged = risk_score >= RISK_FLAG_THRESHOLD
            findings = self._build_findings(extracted_text, classification, risk_score)

            logger.info(
                "AI analysis complete — risk_score=%.3f flagged=%s model=%s",
                risk_score,
                flagged,
                self._model,
            )
            return risk_score, flagged, findings

        except httpx.HTTPStatusError as exc:
            logger.error("HuggingFace API HTTP error: %s %s", exc.response.status_code, exc.response.text)
            return self._default_result()
        except Exception as exc:
            logger.error("AI analysis failed: %s", exc, exc_info=True)
            return self._default_result()

    async def _classify_text(self, text: str) -> Dict:
        """Call Hugging Face zero-shot classification endpoint."""
        # Truncate to 512 characters to avoid excessive API payload size.
        # Note: the BART model has a ~1024 token limit; 512 chars is a conservative
        # character-level limit that typically stays well within the token budget.
        truncated = text[:512] if len(text) > 512 else text

        payload = {
            "inputs": truncated,
            "parameters": {
                "candidate_labels": MEDICAL_RISK_LABELS,
                "multi_label": False,
            },
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{HF_API_URL}{self._model}",
                headers=self._headers,
                json=payload,
            )
            response.raise_for_status()
            return response.json()

    def _compute_risk_score(self, classification: Dict) -> float:
        """Compute a normalised risk score from classification labels."""
        if not classification or "labels" not in classification:
            return 0.1

        label_scores = dict(zip(classification["labels"], classification["scores"]))

        # Weight mapping: labels that indicate high risk get higher weight
        risk_weights = {
            "critical emergency": 1.0,
            "high risk cardiac abnormality": 0.85,
            "moderate risk finding": 0.55,
            "benign variation": 0.25,
            "normal finding": 0.10,
        }

        weighted_score = sum(
            label_scores.get(label, 0.0) * weight
            for label, weight in risk_weights.items()
        )
        return round(min(max(weighted_score, 0.0), 1.0), 4)

    def _build_findings(
        self, text: str, classification: Dict, risk_score: float
    ) -> Dict:
        """Build the structured ai_findings dictionary."""
        labels = classification.get("labels", [])
        scores = classification.get("scores", [])
        label_scores = dict(zip(labels, scores))

        anomalies: List[str] = []
        recommendations: List[str] = []

        top_label = labels[0] if labels else "unknown"

        if risk_score >= 0.80:
            anomalies.append("High-risk finding detected — immediate specialist review required.")
            recommendations.append("Escalate to senior cardiologist within 2 hours.")
        elif risk_score >= 0.60:
            anomalies.append("Moderate abnormality detected — specialist review recommended.")
            recommendations.append("Schedule specialist review within 24 hours.")
        elif risk_score >= 0.40:
            anomalies.append("Minor variation noted — routine follow-up suggested.")
            recommendations.append("Follow up with standard protocol.")
        else:
            anomalies.append("No significant abnormalities detected.")
            recommendations.append("Continue standard monitoring.")

        return {
            "summary": f"Top classification: {top_label} (risk score: {risk_score:.2f})",
            "anomalies": anomalies,
            "recommendations": recommendations,
            "confidence_breakdown": {k: round(v, 4) for k, v in label_scores.items()},
            "raw_response": str(classification),
        }

    @staticmethod
    def _default_result() -> Tuple[float, bool, Dict]:
        """Return safe defaults when analysis cannot be performed."""
        return (
            0.1,
            False,
            {
                "summary": "Analysis could not be performed — insufficient data.",
                "anomalies": [],
                "recommendations": ["Manual review recommended."],
                "confidence_breakdown": {},
                "raw_response": None,
            },
        )


ai_analysis_service = AIAnalysisService()
