"""Review Pydantic models."""
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, Field


ReviewDecision = Literal["approved", "rejected", "needs_more_info"]


class ReviewCreate(BaseModel):
    """Payload for POST /reviews/."""

    case_id: UUID
    notes: str = Field(..., min_length=10, max_length=5000)
    decision: ReviewDecision
    risk_assessment: Optional[str] = Field(default=None, max_length=2000)
    recommendations: Optional[str] = Field(default=None, max_length=2000)


class ReviewUpdate(BaseModel):
    """Payload for PUT /reviews/{review_id}."""

    notes: Optional[str] = Field(default=None, min_length=10, max_length=5000)
    decision: Optional[ReviewDecision] = None
    risk_assessment: Optional[str] = Field(default=None, max_length=2000)
    recommendations: Optional[str] = Field(default=None, max_length=2000)


class ReviewResponse(BaseModel):
    """Review resource returned by API."""

    id: str
    case_id: str
    specialist_id: str
    specialist_name: Optional[str] = None
    notes: Optional[str] = None
    decision: Optional[ReviewDecision] = None
    risk_assessment: Optional[str] = None
    recommendations: Optional[str] = None
    reviewed_at: str

    model_config = {"from_attributes": True}


class ReviewSummary(BaseModel):
    """Aggregated review statistics."""

    total_reviews: int
    approved: int
    rejected: int
    needs_more_info: int
    average_review_time_hours: float
