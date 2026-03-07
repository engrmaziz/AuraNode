"""Uploads router — file upload to Supabase Storage."""
import logging
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status

from config.settings import settings
from middleware.auth_middleware import get_current_user
from models.case import CaseFileResponse
from models.user import UserProfile
from services.supabase_service import supabase_service
from utils.validators import validate_file

logger = logging.getLogger(__name__)
router = APIRouter()

ACCEPTED_MIME_TYPES = {
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/tiff",
    "image/bmp",
    "application/pdf",
}


@router.post("/{case_id}", response_model=CaseFileResponse, status_code=status.HTTP_201_CREATED)
async def upload_file(
    case_id: UUID,
    file: UploadFile = File(...),
    current_user: UserProfile = Depends(get_current_user),
) -> CaseFileResponse:
    """Upload a diagnostic image to a case.

    Validates:
    - File size <= MAX_FILE_SIZE_MB
    - MIME type is an accepted diagnostic format
    - User has access to the specified case
    """
    # Validate MIME type
    if file.content_type not in ACCEPTED_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported file type '{file.content_type}'. Accepted: {', '.join(ACCEPTED_MIME_TYPES)}",
        )

    # Read content
    contents = await file.read()

    # Validate file size
    try:
        validate_file(contents, max_bytes=settings.max_file_size_bytes)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail=str(exc)) from exc

    # Confirm case exists and user has access
    case = await supabase_service.get_case(
        case_id=str(case_id), user_id=current_user.id, role=current_user.role
    )
    if not case:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found.")

    try:
        case_file = await supabase_service.upload_file(
            case_id=str(case_id),
            file_name=file.filename or "unnamed",
            content_type=file.content_type or "application/octet-stream",
            contents=contents,
        )
        return case_file
    except Exception as exc:
        logger.error("upload_file error for case %s: %s", case_id, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="File upload failed. Please try again.",
        ) from exc


@router.get("/{case_id}", response_model=list[CaseFileResponse])
async def list_files(
    case_id: UUID,
    current_user: UserProfile = Depends(get_current_user),
) -> list[CaseFileResponse]:
    """List all files attached to a case."""
    case = await supabase_service.get_case(
        case_id=str(case_id), user_id=current_user.id, role=current_user.role
    )
    if not case:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found.")

    try:
        return await supabase_service.list_case_files(case_id=str(case_id))
    except Exception as exc:
        logger.error("list_files error: %s", exc)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to list files") from exc
