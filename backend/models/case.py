"""Case Pydantic models."""
from typing import List, Literal, Optional

from pydantic import BaseModel, Field


CaseStatus = Literal["uploaded", "processing", "flagged", "under_review", "completed", "deleted"]
CasePriority = Literal["low", "normal", "high", "critical"]


class CaseCreate(BaseModel):
    """Payload for POST /cases."""

    title: str = Field(..., min_length=1, max_length=300)
    description: Optional[str] = Field(default=None, max_length=2000)
    patient_reference: Optional[str] = Field(default=None, max_length=100)
    priority: CasePriority = "normal"


class CaseUpdate(BaseModel):
    """Payload for PUT /cases/{case_id}."""

    title: Optional[str] = Field(default=None, min_length=1, max_length=300)
    description: Optional[str] = Field(default=None, max_length=2000)
    patient_reference: Optional[str] = Field(default=None, max_length=100)
    status: Optional[CaseStatus] = None
    priority: Optional[CasePriority] = None
    assigned_specialist_id: Optional[str] = None


class CaseResponse(BaseModel):
    """Full case resource returned by API."""

    id: str
    clinic_id: str
    title: str
    description: Optional[str] = None
    patient_reference: Optional[str] = None
    status: CaseStatus
    priority: CasePriority
    assigned_specialist_id: Optional[str] = None
    created_at: str
    updated_at: str

    model_config = {"from_attributes": True}


class CaseFileResponse(BaseModel):
    """File attachment record."""

    id: str
    case_id: str
    file_url: str
    file_name: str
    file_size: int
    file_type: str
    storage_path: str
    uploaded_at: str

    model_config = {"from_attributes": True}


class CaseWithFiles(CaseResponse):
    """Case resource including its file attachments."""

    files: List[CaseFileResponse] = []


class PaginatedCases(BaseModel):
    """Paginated list of cases."""

    cases: List[CaseResponse]
    total: int
    page: int
    per_page: int
    has_next: bool
