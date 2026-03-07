"""Review Pydantic models."""
from typing import Literal, Optional

from pydantic import BaseModel, Field


ReviewDecision = Literal["approved", "rejected", "needs_more_info"]


class ReviewCreate(BaseModel):
    """Payload for POST /reviews/{case_id}."""

    notes: str = Field(..., min_length=10, max_length=5000)
    decision: ReviewDecision
    risk_assessment: Optional[str] = Field(default=None, max_length=2000)
    recommendations: Optional[str] = Field(default=None, max_length=2000)


class ReviewResponse(BaseModel):
    """Review resource returned by API."""

    id: str
    case_id: str
    specialist_id: str
    notes: Optional[str] = None
    decision: Optional[ReviewDecision] = None
    risk_assessment: Optional[str] = None
    recommendations: Optional[str] = None
    reviewed_at: str

    model_config = {"from_attributes": True}
