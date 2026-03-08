"""Cases router — CRUD operations for diagnostic cases."""
import logging
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status

from middleware.auth_middleware import get_current_user, require_role
from models.case import CaseFileResponse, CaseResponse, CaseUpdate, CaseWithFiles, PaginatedCases
from models.user import UserProfile
from services.case_service import case_service
from services.supabase_service import supabase_service

logger = logging.getLogger(__name__)
router = APIRouter()

# ─── New workflow endpoints (defined before parametric routes) ─


@router.get("/stats")
async def get_case_stats(
    current_user: UserProfile = Depends(get_current_user),
) -> dict:
    """Return aggregate case statistics for the current user."""
    try:
        return await case_service.get_case_stats(user=current_user)
    except Exception as exc:
        logger.error("get_case_stats error: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch case statistics.",
        ) from exc


@router.get("/flagged", response_model=List[CaseResponse])
async def get_flagged_cases(
    current_user: UserProfile = Depends(require_role("admin", "specialist")),
) -> List[CaseResponse]:
    """Return all flagged cases (admin + specialist only)."""
    try:
        return await case_service.get_flagged_cases(user=current_user)
    except Exception as exc:
        logger.error("get_flagged_cases error: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch flagged cases.",
        ) from exc


@router.get("/queue", response_model=List[CaseResponse])
async def get_specialist_queue(
    current_user: UserProfile = Depends(require_role("specialist")),
) -> List[CaseResponse]:
    """Return the specialist's assigned cases ordered by priority then date."""
    try:
        return await case_service.get_specialist_queue(user=current_user)
    except Exception as exc:
        logger.error("get_specialist_queue error: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch specialist queue.",
        ) from exc


@router.get("", response_model=PaginatedCases)
async def list_cases(
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=20, ge=1, le=100),
    status_filter: Optional[str] = Query(default=None, alias="status"),
    priority_filter: Optional[str] = Query(default=None, alias="priority"),
    search: Optional[str] = Query(default=None),
    current_user: UserProfile = Depends(get_current_user),
) -> PaginatedCases:
    """List cases accessible to the current user (filtered by role).

    - Clinics see only their own cases.
    - Specialists see only cases assigned to them.
    - Admins see all cases.
    """
    try:
        filters = {}
        if status_filter:
            filters["status"] = status_filter
        if priority_filter:
            filters["priority"] = priority_filter
        if search:
            filters["search"] = search
        return await case_service.get_cases_for_user(
            user=current_user,
            filters=filters,
            page=page,
            per_page=per_page,
        )
    except Exception as exc:
        logger.error("list_cases error: %s", exc)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to fetch cases") from exc


@router.get("/{case_id}", response_model=CaseWithFiles)
async def get_case(
    case_id: UUID,
    current_user: UserProfile = Depends(get_current_user),
) -> CaseWithFiles:
    """Retrieve a single case by ID, including its file attachments."""
    try:
        case = await supabase_service.get_case(
            case_id=str(case_id), user_id=current_user.id, role=current_user.role
        )
        if not case:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found.")

        files = await supabase_service.list_case_files(case_id=str(case_id))
        return CaseWithFiles(**case.model_dump(), files=files)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("get_case error: %s", exc)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to fetch case") from exc


@router.put("/{case_id}", response_model=CaseResponse)
async def update_case(
    case_id: UUID,
    payload: CaseUpdate,
    current_user: UserProfile = Depends(get_current_user),
) -> CaseResponse:
    """Update case metadata. Allowed for clinic owners and admins."""
    if current_user.role not in ("clinic", "admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only clinic users and admins can update cases.",
        )
    try:
        updated = await supabase_service.update_case(
            case_id=str(case_id),
            user_id=current_user.id,
            role=current_user.role,
            payload=payload,
        )
        if not updated:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found.")
        return updated
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("update_case error: %s", exc)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to update case") from exc


@router.delete("/{case_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_case(
    case_id: UUID,
    current_user: UserProfile = Depends(get_current_user),
) -> None:
    """Soft-delete a case by setting status to 'deleted'. Allowed for clinic owners and admins."""
    if current_user.role not in ("clinic", "admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only clinic users and admins can delete cases.",
        )
    # Verify access before deleting
    case = await supabase_service.get_case(
        case_id=str(case_id), user_id=current_user.id, role=current_user.role
    )
    if not case:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found.")
    try:
        await supabase_service.delete_case(case_id=str(case_id))
    except Exception as exc:
        logger.error("delete_case error: %s", exc)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to delete case") from exc


@router.get("/{case_id}/files", response_model=List[CaseFileResponse])
async def list_case_files(
    case_id: UUID,
    current_user: UserProfile = Depends(get_current_user),
) -> list:
    """Return all file attachments for a case."""
    case = await supabase_service.get_case(
        case_id=str(case_id), user_id=current_user.id, role=current_user.role
    )
    if not case:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found.")
    try:
        return await supabase_service.list_case_files(case_id=str(case_id))
    except Exception as exc:
        logger.error("list_case_files error: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to list files"
        ) from exc



@router.get("/{case_id}/files/{file_id}/download")
async def download_case_file(
    case_id: UUID,
    file_id: UUID,
    current_user: UserProfile = Depends(get_current_user),
) -> dict:
    """Return a signed download URL (expires in 1 hour) for a specific file."""
    case = await supabase_service.get_case(
        case_id=str(case_id), user_id=current_user.id, role=current_user.role
    )
    if not case:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found.")

    file_record = await supabase_service.get_case_file(
        file_id=str(file_id), case_id=str(case_id)
    )
    if not file_record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found.")

    try:
        signed_url = await supabase_service.get_signed_url(
            storage_path=file_record.storage_path, expires_in=3600
        )
        return {"signed_url": signed_url, "expires_in": 3600}
    except Exception as exc:
        logger.error("Failed to create signed URL for file %s: %s", file_id, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate download URL.",
        ) from exc


@router.get("/{case_id}/timeline")
async def get_case_timeline(
    case_id: UUID,
    current_user: UserProfile = Depends(get_current_user),
) -> list:
    """Return chronological audit-log timeline for a case."""
    # Verify case access
    case = await supabase_service.get_case(
        case_id=str(case_id), user_id=current_user.id, role=current_user.role
    )
    if not case:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found.")
    try:
        return await case_service.get_case_timeline(case_id=case_id)
    except Exception as exc:
        logger.error("get_case_timeline error: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch case timeline.",
        ) from exc


@router.put("/{case_id}/status", response_model=CaseResponse)
async def update_case_status(
    case_id: UUID,
    payload: dict,
    current_user: UserProfile = Depends(get_current_user),
) -> CaseResponse:
    """Update case status with transition validation.

    Body: {"status": "<new_status>"}
    Allowed roles: admin, specialist (for review actions), clinic (for initial uploads).
    """
    new_status: Optional[str] = payload.get("status") if isinstance(payload, dict) else None
    if not new_status:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Request body must include 'status' field.",
        )
    try:
        return await case_service.update_case_status(
            case_id=case_id,
            new_status=new_status,
            updated_by=UUID(current_user.id),
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("update_case_status error: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update case status.",
        ) from exc


@router.put("/{case_id}/assign", response_model=CaseResponse)
async def assign_specialist_to_case(
    case_id: UUID,
    payload: dict,
    current_user: UserProfile = Depends(require_role("admin")),
) -> CaseResponse:
    """Assign a specialist to a case (admin only).

    Body: {"specialist_id": "<uuid>"}
    """
    specialist_id_str: Optional[str] = payload.get("specialist_id") if isinstance(payload, dict) else None
    if not specialist_id_str:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Request body must include 'specialist_id' field.",
        )
    try:
        specialist_id = UUID(specialist_id_str)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="'specialist_id' must be a valid UUID.",
        )
    try:
        return await case_service.assign_specialist(
            case_id=case_id,
            specialist_id=specialist_id,
            assigned_by=UUID(current_user.id),
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("assign_specialist error: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to assign specialist.",
        ) from exc

