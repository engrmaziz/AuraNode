"""Analysis router — trigger OCR + AI analysis, retrieve results."""
import logging
import time
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status

from middleware.auth_middleware import get_current_user
from models.analysis import AnalysisResultResponse
from models.user import UserProfile
from services.ai_analysis_service import ai_analysis_service
from services.ocr_service import ocr_service
from services.supabase_service import supabase_service

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/{case_id}", response_model=AnalysisResultResponse, status_code=status.HTTP_202_ACCEPTED)
async def trigger_analysis(
    case_id: UUID,
    background_tasks: BackgroundTasks,
    current_user: UserProfile = Depends(get_current_user),
) -> AnalysisResultResponse:
    """Trigger OCR + AI analysis pipeline for a case.

    Processing happens in the background. Poll GET /{case_id} for results.
    Returns a pending AnalysisResult record immediately.
    """
    case = await supabase_service.get_case(
        case_id=str(case_id), user_id=current_user.id, role=current_user.role
    )
    if not case:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found.")

    files = await supabase_service.list_case_files(case_id=str(case_id))
    if not files:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No files uploaded for this case. Upload at least one file before triggering analysis.",
        )

    # Mark case as processing
    await supabase_service.update_case_status(case_id=str(case_id), new_status="processing")

    # Create a pending analysis result record
    pending = await supabase_service.create_pending_analysis(case_id=str(case_id))

    # Run analysis in the background so we can return immediately
    background_tasks.add_task(
        _run_analysis_pipeline,
        case_id=str(case_id),
        analysis_id=pending.id,
        files=files,
    )

    return pending


async def _run_analysis_pipeline(case_id: str, analysis_id: str, files: list) -> None:
    """Background task: OCR → AI scoring → persist results → update case status."""
    start = time.time()
    try:
        # Step 1: Download first file and run OCR
        first_file = files[0]
        file_bytes = await supabase_service.download_file(storage_path=first_file.storage_path)
        extracted_text, confidence = await ocr_service.extract_text(file_bytes)

        # Step 2: Run AI analysis on extracted text
        risk_score, flagged, ai_findings = await ai_analysis_service.analyze(extracted_text)

        processing_time_ms = int((time.time() - start) * 1000)

        # Step 3: Persist result
        await supabase_service.update_analysis_result(
            analysis_id=analysis_id,
            extracted_text=extracted_text,
            confidence_score=confidence,
            risk_score=risk_score,
            flagged_status=flagged,
            ai_findings=ai_findings,
            processing_time_ms=processing_time_ms,
            file_id=first_file.id,
        )

        # Step 4: Update case status
        new_status = "flagged" if flagged else "completed"
        await supabase_service.update_case_status(case_id=case_id, new_status=new_status)

        logger.info(
            "Analysis complete for case %s — risk_score=%.2f flagged=%s [%dms]",
            case_id,
            risk_score,
            flagged,
            processing_time_ms,
        )
    except Exception as exc:
        logger.error("Analysis pipeline failed for case %s: %s", case_id, exc, exc_info=True)
        await supabase_service.update_case_status(case_id=case_id, new_status="uploaded")


@router.get("/{case_id}", response_model=AnalysisResultResponse)
async def get_analysis(
    case_id: UUID,
    current_user: UserProfile = Depends(get_current_user),
) -> AnalysisResultResponse:
    """Retrieve the latest analysis result for a case."""
    case = await supabase_service.get_case(
        case_id=str(case_id), user_id=current_user.id, role=current_user.role
    )
    if not case:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found.")

    result = await supabase_service.get_analysis_result(case_id=str(case_id))
    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No analysis result found for this case.",
        )
    return result
