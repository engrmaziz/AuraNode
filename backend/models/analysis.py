"""Analysis result Pydantic models."""
from typing import Any, Dict, List, Optional

from pydantic import BaseModel


class AIFindings(BaseModel):
    """Structured AI findings from the Hugging Face model."""

    summary: str
    anomalies: List[str]
    recommendations: List[str]
    confidence_breakdown: Dict[str, float]
    raw_response: Optional[str] = None


class AnalysisResultResponse(BaseModel):
    """Analysis result resource returned by API."""

    id: str
    case_id: str
    file_id: Optional[str] = None
    extracted_text: Optional[str] = None
    confidence_score: Optional[float] = None
    risk_score: Optional[float] = None
    flagged_status: bool = False
    ai_findings: Optional[Dict[str, Any]] = None
    processing_time_ms: Optional[int] = None
    model_version: Optional[str] = None
    created_at: str

    model_config = {"from_attributes": True}
