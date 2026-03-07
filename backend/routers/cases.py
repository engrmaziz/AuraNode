"""Cases router — CRUD operations for diagnostic cases."""
import logging
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status

from middleware.auth_middleware import get_current_user
from models.case import CaseCreate, CaseResponse, CaseUpdate
from models.user import UserProfile
from services.supabase_service import supabase_service

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("", response_model=List[CaseResponse])
async def list_cases(
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=20, ge=1, le=100),
    status_filter: Optional[str] = Query(default=None, alias="status"),
    current_user: UserProfile = Depends(get_current_user),
) -> List[CaseResponse]:
    """List cases accessible to the current user (filtered by role)."""
    try:
        return await supabase_service.list_cases(
            user_id=current_user.id,
            role=current_user.role,
            page=page,
            per_page=per_page,
            status_filter=status_filter,
        )
    except Exception as exc:
        logger.error("list_cases error: %s", exc)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to fetch cases") from exc


@router.post("", response_model=CaseResponse, status_code=status.HTTP_201_CREATED)
async def create_case(
    payload: CaseCreate,
    current_user: UserProfile = Depends(get_current_user),
) -> CaseResponse:
    """Create a new diagnostic case (clinic users only)."""
    if current_user.role not in ("clinic", "admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only clinic users can create cases.",
        )
    try:
        return await supabase_service.create_case(
            clinic_id=current_user.id,
            payload=payload,
        )
    except Exception as exc:
        logger.error("create_case error: %s", exc)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to create case") from exc


@router.get("/{case_id}", response_model=CaseResponse)
async def get_case(
    case_id: UUID,
    current_user: UserProfile = Depends(get_current_user),
) -> CaseResponse:
    """Retrieve a single case by ID."""
    try:
        case = await supabase_service.get_case(case_id=str(case_id), user_id=current_user.id, role=current_user.role)
        if not case:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found.")
        return case
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("get_case error: %s", exc)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to fetch case") from exc


@router.patch("/{case_id}", response_model=CaseResponse)
async def update_case(
    case_id: UUID,
    payload: CaseUpdate,
    current_user: UserProfile = Depends(get_current_user),
) -> CaseResponse:
    """Update case metadata (title, description, priority, assigned specialist)."""
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
    """Delete a case (admin only)."""
    if current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only admins can delete cases.")
    try:
        await supabase_service.delete_case(case_id=str(case_id))
    except Exception as exc:
        logger.error("delete_case error: %s", exc)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to delete case") from exc
