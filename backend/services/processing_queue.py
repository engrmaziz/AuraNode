"""Background task queue for OCR processing."""
import asyncio
import logging
import uuid
from datetime import datetime, timezone
from typing import Dict, Optional
from uuid import UUID

from services.ocr_service import _MIN_CONFIDENCE

logger = logging.getLogger(__name__)


class ProcessingQueue:
    """Manages a background asyncio queue that processes OCR tasks via workers.

    Up to ``max_workers`` worker coroutines run concurrently, each pulling
    tasks from the shared queue and calling ``OCRService.process_async``.
    """

    def __init__(self) -> None:
        self.queue: asyncio.Queue = asyncio.Queue()
        self.workers: list = []
        self.max_workers: int = 3
        # Maps case_id (str) → status dict
        self.processing_status: Dict[str, dict] = {}

    async def enqueue(self, task: dict) -> str:
        """Add a task to the queue and return its task_id.

        Expected task keys:
            task_id, case_id, file_id, file_url, file_type, priority, created_at
        """
        task_id = task.get("task_id") or str(uuid.uuid4())
        task["task_id"] = task_id

        case_id = str(task.get("case_id", ""))
        self.processing_status[case_id] = {
            "status": "queued",
            "progress": 0,
            "message": "Waiting in queue…",
            "task_id": task_id,
            "queued_at": datetime.now(timezone.utc).isoformat(),
        }

        await self.queue.put(task)
        logger.info(
            "Task %s enqueued for case=%s (queue depth=%d)",
            task_id,
            case_id,
            self.queue.qsize(),
        )
        return task_id

    async def worker(self, worker_id: int) -> None:
        """Infinite loop that pulls tasks from the queue and processes them."""
        logger.info("OCR worker %d started", worker_id)
        while True:
            try:
                task = await self.queue.get()
                case_id = str(task.get("case_id", ""))
                file_id_raw = task.get("file_id", "")
                file_url = task.get("file_url", "")
                file_type = task.get("file_type", "image/jpeg")

                logger.info(
                    "Worker %d processing task %s for case=%s",
                    worker_id,
                    task.get("task_id"),
                    case_id,
                )

                self.processing_status[case_id] = {
                    **self.processing_status.get(case_id, {}),
                    "status": "processing",
                    "progress": 10,
                    "message": "Extracting text from images…",
                    "started_at": datetime.now(timezone.utc).isoformat(),
                }

                try:
                    from services.ocr_service import ocr_service  # noqa: PLC0415

                    await ocr_service.process_async(
                        case_id=UUID(case_id),
                        file_id=UUID(str(file_id_raw)),
                        file_url=file_url,
                        file_type=file_type,
                    )

                    self.processing_status[case_id] = {
                        **self.processing_status.get(case_id, {}),
                        "status": "completed",
                        "progress": 100,
                        "message": "OCR complete",
                        "completed_at": datetime.now(timezone.utc).isoformat(),
                    }
                    logger.info(
                        "Worker %d completed task for case=%s", worker_id, case_id
                    )

                except Exception as exc:
                    logger.error(
                        "Worker %d task failed for case=%s: %s",
                        worker_id,
                        case_id,
                        exc,
                        exc_info=True,
                    )
                    self.processing_status[case_id] = {
                        **self.processing_status.get(case_id, {}),
                        "status": "failed",
                        "progress": 0,
                        "message": str(exc),
                        "failed_at": datetime.now(timezone.utc).isoformat(),
                    }
                finally:
                    self.queue.task_done()

            except asyncio.CancelledError:
                logger.info("OCR worker %d shutting down", worker_id)
                break
            except Exception as exc:
                # Worker crash guard — log and continue
                logger.error("Worker %d crashed: %s", worker_id, exc, exc_info=True)
                await asyncio.sleep(1)

    async def start_workers(self) -> None:
        """Start ``max_workers`` background worker coroutines."""
        for i in range(self.max_workers):
            task = asyncio.create_task(self.worker(i + 1), name=f"ocr-worker-{i + 1}")
            self.workers.append(task)
        logger.info("ProcessingQueue started %d OCR worker(s)", self.max_workers)

    async def stop_workers(self) -> None:
        """Cancel all running worker tasks."""
        for task in self.workers:
            task.cancel()
        if self.workers:
            await asyncio.gather(*self.workers, return_exceptions=True)
        self.workers.clear()
        logger.info("ProcessingQueue workers stopped")

    async def get_status(self, case_id: UUID) -> dict:
        """Return the current processing status for *case_id*.

        Falls back to the analysis_results table when the in-memory status
        is not available (e.g. after a server restart).
        """
        case_str = str(case_id)
        if case_str in self.processing_status:
            return self.processing_status[case_str]

        # Fallback: query the database
        try:
            from services.supabase_service import supabase_service  # noqa: PLC0415

            result = await supabase_service.get_analysis_result(case_id=case_str)
            if result:
                if result.confidence_score is not None and result.confidence_score < _MIN_CONFIDENCE:
                    return {
                        "status": "failed",
                        "progress": 0,
                        "message": "OCR confidence too low for reliable analysis",
                    }
                # Treat any existing analysis record as completed — even if
                # extracted_text is empty (e.g. X-rays produce no text but are valid)
                return {
                    "status": "completed",
                    "progress": 100,
                    "message": f"OCR complete (confidence: {int((result.confidence_score or 0) * 100)}%)",
                }
        except Exception as exc:
            logger.warning("Could not fetch analysis status from DB: %s", exc)

        return {
            "status": "queued",
            "progress": 0,
            "message": "Waiting in queue…",
        }

    async def get_queue_depth(self) -> int:
        """Return the number of tasks currently pending in the queue."""
        return self.queue.qsize()


# Module-level singleton
processing_queue = ProcessingQueue()
