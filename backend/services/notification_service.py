"""Notification service — email/webhook notifications for case events."""
import logging
from typing import Optional

import httpx

from config.settings import settings

logger = logging.getLogger(__name__)


class NotificationService:
    """Handles outbound notifications (email, webhooks) for case state changes."""

    async def notify_case_flagged(
        self,
        *,
        case_id: str,
        specialist_id: Optional[str],
        risk_score: float,
    ) -> None:
        """Notify a specialist that a case has been flagged for review."""
        if not specialist_id:
            logger.info("Case %s flagged but no specialist assigned — skipping notification", case_id)
            return

        logger.info(
            "Case %s flagged (risk=%.2f) — notification queued for specialist %s",
            case_id,
            risk_score,
            specialist_id,
        )
        # TODO (Phase 2): Integrate with SendGrid / Resend for actual email delivery.
        # For now we log the event which can be picked up by a webhook processor.

    async def notify_review_submitted(
        self,
        *,
        case_id: str,
        clinic_id: str,
        decision: str,
    ) -> None:
        """Notify the clinic that a specialist review has been submitted."""
        logger.info(
            "Review submitted for case %s (decision=%s) — notification queued for clinic %s",
            case_id,
            decision,
            clinic_id,
        )

    async def notify_report_ready(
        self,
        *,
        case_id: str,
        clinic_id: str,
        report_url: str,
    ) -> None:
        """Notify the clinic that their PDF report is ready for download."""
        logger.info(
            "Report ready for case %s — notification queued for clinic %s (url=%s)",
            case_id,
            clinic_id,
            report_url,
        )

    async def send_webhook(self, *, url: str, payload: dict) -> bool:
        """POST a JSON payload to an arbitrary webhook URL."""
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(url, json=payload)
                response.raise_for_status()
                logger.info("Webhook sent to %s — %d", url, response.status_code)
                return True
        except Exception as exc:
            logger.warning("Webhook delivery failed to %s: %s", url, exc)
            return False


notification_service = NotificationService()
