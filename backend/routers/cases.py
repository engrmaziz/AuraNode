"""Cases router — CRUD operations for diagnostic cases."""
import logging
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status

from middleware.auth_middleware import get_current_user, require_role
from models.case import CaseFileResponse, CaseResponse, CaseUpdate, CaseWithFiles, PaginatedCases
from models.user import UserProfile
from services.supabase_service import supabase_service

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("", response_model=PaginatedCases)
async def list_cases(
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=20, ge=1, le=100),
    status_filter: Optional[str] = Query(default=None, alias="status"),
    search: Optional[str] = Query(default=None),
    current_user: UserProfile = Depends(get_current_user),
) -> PaginatedCases:
    """List cases accessible to the current user (filtered by role).

    - Clinics see only their own cases.
    - Specialists see only cases assigned to them.
    - Admins see all cases.
    """
    try:
        return await supabase_service.list_cases_paginated(
            user_id=current_user.id,
            role=current_user.role,
            page=page,
            per_page=per_page,
            status_filter=status_filter,
            search=search,
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

