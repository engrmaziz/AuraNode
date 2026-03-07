"""Report Pydantic models."""
from typing import Optional

from pydantic import BaseModel


class ReportResponse(BaseModel):
    """Report resource returned by API."""

    id: str
    case_id: str
    report_url: str
    storage_path: str
    generated_by: Optional[str] = None
    generated_at: str

    model_config = {"from_attributes": True}
