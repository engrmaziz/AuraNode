"""Reports router — PDF generation and retrieval."""
import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse

from middleware.auth_middleware import get_current_user
from models.report import ReportResponse
from models.user import UserProfile
from services.report_service import report_service
from services.supabase_service import supabase_service

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/{case_id}", response_model=ReportResponse, status_code=status.HTTP_201_CREATED)
async def generate_report(
    case_id: UUID,
    current_user: UserProfile = Depends(get_current_user),
) -> ReportResponse:
    """Generate a PDF report for a completed case."""
    case = await supabase_service.get_case(
        case_id=str(case_id), user_id=current_user.id, role=current_user.role
    )
    if not case:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found.")

    if case.status != "completed":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Reports can only be generated for completed cases. Current status: {case.status}",
        )

    try:
        analysis = await supabase_service.get_analysis_result(case_id=str(case_id))
        reviews = await supabase_service.list_reviews(case_id=str(case_id))

        report = await report_service.generate_pdf_report(
            case=case,
            analysis=analysis,
            reviews=reviews,
            generated_by=current_user.id,
        )
        return report
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("generate_report error for case %s: %s", case_id, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate report.",
        ) from exc


@router.get("/{case_id}", response_model=list[ReportResponse])
async def list_reports(
    case_id: UUID,
    current_user: UserProfile = Depends(get_current_user),
) -> list[ReportResponse]:
    """List all generated reports for a case."""
    case = await supabase_service.get_case(
        case_id=str(case_id), user_id=current_user.id, role=current_user.role
    )
    if not case:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found.")

    try:
        return await supabase_service.list_reports(case_id=str(case_id))
    except Exception as exc:
        logger.error("list_reports error: %s", exc)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to list reports") from exc


@router.get("/{case_id}/download/{report_id}")
async def download_report(
    case_id: UUID,
    report_id: UUID,
    current_user: UserProfile = Depends(get_current_user),
) -> StreamingResponse:
    """Download a report PDF as a file stream."""
    case = await supabase_service.get_case(
        case_id=str(case_id), user_id=current_user.id, role=current_user.role
    )
    if not case:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found.")

    try:
        pdf_bytes = await report_service.get_report_bytes(report_id=str(report_id))
        return StreamingResponse(
            iter([pdf_bytes]),
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="auranode-report-{case_id}.pdf"',
                "Content-Length": str(len(pdf_bytes)),
            },
        )
    except Exception as exc:
        logger.error("download_report error: %s", exc)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to download report") from exc
