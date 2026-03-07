"""Analysis result Pydantic models."""
from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID

from pydantic import BaseModel


class AIFindings(BaseModel):
    """Structured AI findings from the Hugging Face model."""

    summary: str
    anomalies: List[str]
    recommendations: List[str]
    confidence_breakdown: Dict[str, float]
    raw_response: Optional[str] = None


class AnalysisResultCreate(BaseModel):
    """Input schema for creating an analysis result."""

    case_id: UUID
    file_id: UUID
    extracted_text: str
    confidence_score: float
    risk_score: Optional[float] = None
    flagged_status: bool = False
    ai_findings: Optional[Dict[str, Any]] = None
    processing_time_ms: int
    model_version: str = "ocr-v1.0.0"


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


class OCRStatus(BaseModel):
    """Current OCR processing status for a case."""

    case_id: UUID
    status: str  # queued | processing | completed | failed
    progress: int  # 0–100
    message: str
