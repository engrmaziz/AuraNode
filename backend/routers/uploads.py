"""Uploads router — file upload to Supabase Storage."""
import logging
import uuid as _uuid
from datetime import datetime, timezone
from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status

from middleware.auth_middleware import get_current_clinic, get_current_user
from models.case import CaseCreate, CaseFileResponse, CaseWithFiles
from models.user import UserProfile
from services.processing_queue import processing_queue
from services.supabase_service import supabase_service

logger = logging.getLogger(__name__)
router = APIRouter()

ALLOWED_MIME_TYPES = {
    "image/jpeg",
    "image/jpg",
    "image/png",
    "application/pdf",
}
MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB
MAX_FILES_PER_UPLOAD = 5
MIN_FILES_PER_UPLOAD = 1


def _sanitize_filename(name: str) -> str:
    """Replace path separators and null bytes to prevent directory traversal."""
    import re
    return re.sub(r"[/\\:\*\?\"\<\>\|\x00]", "_", (name or "unnamed").strip()) or "unnamed"


async def _validate_and_read_files(files: List[UploadFile]) -> List[tuple]:
    """Validate files and read contents. Returns list of (file, contents) tuples."""
    if len(files) < MIN_FILES_PER_UPLOAD:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"At least {MIN_FILES_PER_UPLOAD} file is required.",
        )
    if len(files) > MAX_FILES_PER_UPLOAD:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Maximum {MAX_FILES_PER_UPLOAD} files allowed per upload.",
        )

    read_files = []
    for file in files:
        if file.content_type not in ALLOWED_MIME_TYPES:
            raise HTTPException(
                status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                detail=(
                    f"Unsupported file type '{file.content_type}' for '{file.filename}'. "
                    f"Accepted: image/jpeg, image/png, application/pdf."
                ),
            )
        contents = await file.read()
        if len(contents) > MAX_FILE_SIZE_BYTES:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=(
                    f"File '{file.filename}' is too large "
                    f"({len(contents) / (1024 * 1024):.1f} MB). Maximum is 10 MB."
                ),
            )
        read_files.append((file, contents))

    return read_files


@router.post("/case", response_model=CaseWithFiles, status_code=status.HTTP_201_CREATED)
async def upload_case(
    title: str = Form(..., min_length=3, max_length=300),
    description: str = Form(default=None),
    patient_reference: str = Form(default=None),
    priority: str = Form(default="normal"),
    files: List[UploadFile] = File(...),
    current_user: UserProfile = Depends(get_current_clinic),
) -> CaseWithFiles:
    """Create a new case with attached files.

    Validates file count (1–5), size (<= 10 MB each), and MIME type.
    Uploads to Supabase Storage at {clinic_id}/{case_id}/{filename}.
    Triggers OCR background processing after successful upload.
    """
    # Validate files before creating any DB records
    read_files = await _validate_and_read_files(files)

    # Deduplicate file names to avoid collision
    seen_names: set = set()
    sanitized_files = []
    for file, contents in read_files:
        raw_name = _sanitize_filename(file.filename or "unnamed")
        unique_name = raw_name
        counter = 1
        while unique_name in seen_names:
            base, _, ext = raw_name.rpartition(".")
            unique_name = f"{base}_{counter}.{ext}" if ext else f"{raw_name}_{counter}"
            counter += 1
        seen_names.add(unique_name)
        sanitized_files.append((file, contents, unique_name))

    # Create case record
    case_payload = CaseCreate(
        title=title,
        description=description or None,
        patient_reference=patient_reference or None,
        priority=priority,  # type: ignore[arg-type]
    )
    try:
        case = await supabase_service.create_case(
            clinic_id=current_user.id,
            payload=case_payload,
        )
    except Exception as exc:
        logger.error("Failed to create case: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create case record.",
        ) from exc

    # Upload each file; roll back if any fail
    uploaded_files: List[CaseFileResponse] = []
    try:
        for file, contents, unique_name in sanitized_files:
            case_file = await supabase_service.upload_file(
                clinic_id=current_user.id,
                case_id=case.id,
                file_name=unique_name,
                content_type=file.content_type or "application/octet-stream",
                contents=contents,
            )
            uploaded_files.append(case_file)
    except Exception as exc:
        logger.error("File upload failed for case %s: %s", case.id, exc)
        # Roll back uploaded files
        for uploaded in uploaded_files:
            try:
                await supabase_service.delete_case_file(
                    file_id=uploaded.id, case_id=case.id
                )
            except Exception as rollback_exc:
                logger.warning("Rollback failed for file %s: %s", uploaded.id, rollback_exc)
        # Soft-delete the case
        try:
            await supabase_service.delete_case(case_id=case.id)
        except Exception:
            pass
        raise HTTPException(
            status_code=status.HTTP_507_INSUFFICIENT_STORAGE,
            detail="File upload to storage failed. Please try again.",
        ) from exc

    # Update case status to 'processing'
    await supabase_service.update_case_status(case_id=case.id, new_status="processing")

    # Audit log
    await supabase_service.log_audit(
        user_id=current_user.id,
        action="case_created",
        resource_type="case",
        resource_id=case.id,
        metadata={"file_count": len(uploaded_files), "priority": priority},
    )

    # Enqueue OCR processing for each uploaded file
    for f in uploaded_files:
        await processing_queue.enqueue(
            {
                "task_id": str(_uuid.uuid4()),
                "case_id": case.id,
                "file_id": f.id,
                "file_url": f.file_url,
                "file_type": f.file_type,
                "priority": priority,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        )

    # Build and return CaseWithFiles
    case_data = case.model_dump()
    case_data["status"] = "processing"
    return CaseWithFiles(**case_data, files=uploaded_files)


@router.post("/case/{case_id}/file", response_model=CaseFileResponse, status_code=status.HTTP_201_CREATED)
async def upload_file_to_case(
    case_id: UUID,
    file: UploadFile = File(...),
    current_user: UserProfile = Depends(get_current_clinic),
) -> CaseFileResponse:
    """Add a single file to an existing case.

    Validates that the case belongs to the authenticated clinic.
    """
    # Verify case belongs to this clinic
    case = await supabase_service.get_case(
        case_id=str(case_id), user_id=current_user.id, role=current_user.role
    )
    if not case:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found.")

    if file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=(
                f"Unsupported file type '{file.content_type}'. "
                "Accepted: image/jpeg, image/png, application/pdf."
            ),
        )

    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds the 10 MB limit ({len(contents) / (1024 * 1024):.1f} MB).",
        )

    file_name = _sanitize_filename(file.filename or "unnamed")

    try:
        case_file = await supabase_service.upload_file(
            clinic_id=current_user.id,
            case_id=str(case_id),
            file_name=file_name,
            content_type=file.content_type or "application/octet-stream",
            contents=contents,
        )
    except Exception as exc:
        logger.error("File upload failed for case %s: %s", case_id, exc)
        raise HTTPException(
            status_code=status.HTTP_507_INSUFFICIENT_STORAGE,
            detail="File upload to storage failed. Please try again.",
        ) from exc

    await supabase_service.log_audit(
        user_id=current_user.id,
        action="file_uploaded",
        resource_type="case_file",
        resource_id=case_file.id,
        metadata={"case_id": str(case_id)},
    )

    return case_file


@router.delete("/case/{case_id}/file/{file_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_case_file(
    case_id: UUID,
    file_id: UUID,
    current_user: UserProfile = Depends(get_current_clinic),
) -> None:
    """Delete a file from Supabase Storage and the case_files table.

    Verifies that the case belongs to the authenticated clinic before deletion.
    """
    # Verify case ownership
    case = await supabase_service.get_case(
        case_id=str(case_id), user_id=current_user.id, role=current_user.role
    )
    if not case:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found.")

    # Verify file exists on this case
    file_record = await supabase_service.get_case_file(
        file_id=str(file_id), case_id=str(case_id)
    )
    if not file_record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found.")

    try:
        await supabase_service.delete_case_file(
            file_id=str(file_id), case_id=str(case_id)
        )
    except Exception as exc:
        logger.error("Failed to delete file %s: %s", file_id, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete file.",
        ) from exc

    await supabase_service.log_audit(
        user_id=current_user.id,
        action="file_deleted",
        resource_type="case_file",
        resource_id=str(file_id),
        metadata={"case_id": str(case_id)},
    )

