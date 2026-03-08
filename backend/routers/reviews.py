"""Reviews router — specialist review submission and retrieval."""
import logging
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from middleware.auth_middleware import get_current_specialist, get_current_user
from models.review import ReviewCreate, ReviewResponse, ReviewSummary, ReviewUpdate
from models.user import UserProfile
from services.supabase_service import supabase_service

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/", response_model=ReviewResponse, status_code=status.HTTP_201_CREATED)
async def submit_review(
    payload: ReviewCreate,
    current_user: UserProfile = Depends(get_current_specialist),
) -> ReviewResponse:
    """Submit a specialist review for a case."""
    case = await supabase_service.get_case(
        case_id=str(payload.case_id), user_id=current_user.id, role=current_user.role
    )
    if not case:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found.")

    if case.status not in ("flagged", "under_review"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Case must be 'flagged' or 'under_review'. Current: {case.status}",
        )

    # Map decision to new case status
    decision_to_status = {
        "approved": "completed",
        "rejected": "flagged",
        "needs_more_info": "under_review",
    }
    new_case_status = decision_to_status[payload.decision]

    try:
        review = await supabase_service.create_review(
            case_id=str(payload.case_id),
            specialist_id=current_user.id,
            payload=payload,
        )

        await supabase_service.update_case_status(
            case_id=str(payload.case_id), new_status=new_case_status
        )

        await supabase_service.log_audit(
            user_id=current_user.id,
            action="review_submitted",
            resource_type="review",
            resource_id=review.id,
            metadata={"case_id": str(payload.case_id), "decision": payload.decision, "new_case_status": new_case_status},
        )

        return review
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("submit_review error: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to submit review.",
        ) from exc


@router.get("/my-queue")
async def get_my_queue(
    current_user: UserProfile = Depends(get_current_specialist),
) -> list:
    """Return cases assigned to specialist with status flagged or under_review."""
    try:
        return await supabase_service.get_specialist_queue(specialist_id=current_user.id)
    except Exception as exc:
        logger.error("get_my_queue error: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch queue.",
        ) from exc


@router.get("/stats", response_model=ReviewSummary)
async def get_stats(
    current_user: UserProfile = Depends(get_current_user),
) -> ReviewSummary:
    """Return review statistics. Specialist sees own; admin sees all."""
    if current_user.role not in ("specialist", "admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. Requires specialist or admin role.",
        )
    specialist_id = current_user.id if current_user.role == "specialist" else None
    try:
        return await supabase_service.get_review_stats(specialist_id=specialist_id)
    except Exception as exc:
        logger.error("get_stats error: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch stats.",
        ) from exc


@router.get("/case/{case_id}", response_model=list[ReviewResponse])
async def get_reviews_for_case(
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
        logger.error("get_reviews_for_case error: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch reviews.",
        ) from exc


@router.put("/{review_id}", response_model=ReviewResponse)
async def update_review(
    review_id: UUID,
    payload: ReviewUpdate,
    current_user: UserProfile = Depends(get_current_specialist),
) -> ReviewResponse:
    """Update a review. Only allowed within 24 hours of creation."""
    try:
        review = await supabase_service.get_review(review_id=str(review_id))
    except Exception as exc:
        logger.error("update_review fetch error: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch review.",
        ) from exc

    if not review:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Review not found.")

    if review.specialist_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only edit your own reviews.",
        )

    reviewed_at = datetime.fromisoformat(review.reviewed_at.replace("Z", "+00:00"))
    if datetime.now(timezone.utc) - reviewed_at > timedelta(hours=24):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Reviews can only be edited within 24 hours of submission.",
        )

    try:
        updated = await supabase_service.update_review(
            review_id=str(review_id),
            payload=payload,
        )
        return updated
    except Exception as exc:
        logger.error("update_review error: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update review.",
        ) from exc
