"""Reviews router — specialist review submission and retrieval."""
import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from middleware.auth_middleware import get_current_user
from models.review import ReviewCreate, ReviewResponse
from models.user import UserProfile
from services.supabase_service import supabase_service

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/{case_id}", response_model=ReviewResponse, status_code=status.HTTP_201_CREATED)
async def submit_review(
    case_id: UUID,
    payload: ReviewCreate,
    current_user: UserProfile = Depends(get_current_user),
) -> ReviewResponse:
    """Submit a specialist review for a flagged case."""
    if current_user.role not in ("specialist", "admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only specialists can submit reviews.",
        )

    case = await supabase_service.get_case(
        case_id=str(case_id), user_id=current_user.id, role=current_user.role
    )
    if not case:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found.")

    if case.status not in ("flagged", "under_review"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Case must be in 'flagged' or 'under_review' status to review. Current: {case.status}",
        )

    try:
        # Update case status to under_review when review starts
        await supabase_service.update_case_status(case_id=str(case_id), new_status="under_review")

        review = await supabase_service.create_review(
            case_id=str(case_id),
            specialist_id=current_user.id,
            payload=payload,
        )

        # If decision is final, mark case as completed
        if payload.decision in ("approved", "rejected"):
            await supabase_service.update_case_status(case_id=str(case_id), new_status="completed")

        return review
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("submit_review error for case %s: %s", case_id, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to submit review.",
        ) from exc


@router.get("/{case_id}", response_model=list[ReviewResponse])
async def get_reviews(
    case_id: UUID,
    current_user: UserProfile = Depends(get_current_user),
) -> list[ReviewResponse]:
    """Get all reviews for a case."""
    case = await supabase_service.get_case(
        case_id=str(case_id), user_id=current_user.id, role=current_user.role
    )
    if not case:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found.")

    try:
        return await supabase_service.list_reviews(case_id=str(case_id))
    except Exception as exc:
        logger.error("get_reviews error: %s", exc)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to fetch reviews") from exc
