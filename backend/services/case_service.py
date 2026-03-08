"""Case management service — business logic for case workflow operations."""
import logging
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional
from uuid import UUID

from fastapi import HTTPException, status

from models.case import CaseResponse, PaginatedCases
from models.user import UserProfile
from services.supabase_service import supabase_service

logger = logging.getLogger(__name__)

# Valid status transitions: source → set of allowed targets
VALID_TRANSITIONS: Dict[str, set] = {
    "uploaded":     {"processing"},
    "processing":   {"flagged", "completed"},
    "flagged":      {"under_review"},
    "under_review": {"completed", "flagged"},
    "completed":    set(),
    "deleted":      set(),
}


class CaseService:
    """Centralised business-logic layer for case management."""

    # ─── Cases list ───────────────────────────────────────────

    async def get_cases_for_user(
        self,
        user: UserProfile,
        filters: Dict[str, Any],
        page: int,
        per_page: int,
    ) -> PaginatedCases:
        """Return paginated cases filtered by role and query params.

        - clinic: only cases where clinic_id = user.id
        - specialist: only cases where assigned_specialist_id = user.id
        - admin: all cases
        Filters: status, priority, search (title + patient_reference)
        """
        client = supabase_service.client

        count_q = client.table("cases").select("id", count="exact")
        rows_q = client.table("cases").select("*")

        # Role scoping
        if user.role == "clinic":
            count_q = count_q.eq("clinic_id", user.id)
            rows_q = rows_q.eq("clinic_id", user.id)
        elif user.role == "specialist":
            count_q = count_q.eq("assigned_specialist_id", user.id)
            rows_q = rows_q.eq("assigned_specialist_id", user.id)
        # admin: no additional filter

        # Exclude deleted by default (admin can pass status=deleted explicitly)
        status_filter: Optional[str] = filters.get("status")
        if status_filter:
            count_q = count_q.eq("status", status_filter)
            rows_q = rows_q.eq("status", status_filter)
        else:
            count_q = count_q.neq("status", "deleted")
            rows_q = rows_q.neq("status", "deleted")

        priority_filter: Optional[str] = filters.get("priority")
        if priority_filter:
            count_q = count_q.eq("priority", priority_filter)
            rows_q = rows_q.eq("priority", priority_filter)

        search: Optional[str] = filters.get("search")
        if search:
            # Search in title; Supabase PostgREST doesn't support OR across columns
            # via Python client easily, so we search title only.
            count_q = count_q.ilike("title", f"%{search}%")
            rows_q = rows_q.ilike("title", f"%{search}%")

        count_resp = count_q.execute()
        total: int = count_resp.count or 0

        offset = (page - 1) * per_page
        rows_resp = (
            rows_q
            .order("created_at", desc=True)
            .range(offset, offset + per_page - 1)
            .execute()
        )
        cases = [supabase_service._row_to_case(row) for row in (rows_resp.data or [])]

        return PaginatedCases(
            cases=cases,
            total=total,
            page=page,
            per_page=per_page,
            has_next=(offset + per_page) < total,
        )

    # ─── Stats ────────────────────────────────────────────────

    async def get_case_stats(self, user: UserProfile) -> dict:
        """Return aggregate case statistics scoped to the user's role.

        Returns::
            {
                total: int,
                by_status: {uploaded, processing, flagged, under_review, completed},
                by_priority: {low, normal, high, critical},
                flagged_today: int,
                completed_this_week: int,
                average_processing_time_hours: float,
            }
        """
        client = supabase_service.client

        def _base_query():  # type: ignore[return]
            q = client.table("cases").select("*")
            if user.role == "clinic":
                q = q.eq("clinic_id", user.id)
            elif user.role == "specialist":
                q = q.eq("assigned_specialist_id", user.id)
            return q.neq("status", "deleted")

        rows_resp = _base_query().execute()
        rows: List[Dict[str, Any]] = rows_resp.data or []

        by_status = {
            "uploaded": 0,
            "processing": 0,
            "flagged": 0,
            "under_review": 0,
            "completed": 0,
        }
        by_priority = {"low": 0, "normal": 0, "high": 0, "critical": 0}
        flagged_today = 0
        completed_this_week = 0
        total_processing_ms: float = 0
        processing_count = 0

        now = datetime.now(tz=timezone.utc)
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        week_start = now - timedelta(days=now.weekday())
        week_start = week_start.replace(hour=0, minute=0, second=0, microsecond=0)

        for row in rows:
            s = row.get("status", "")
            p = row.get("priority", "normal")

            if s in by_status:
                by_status[s] += 1
            if p in by_priority:
                by_priority[p] += 1

            # flagged_today: updated_at is today and status = flagged
            if s == "flagged":
                updated_raw = row.get("updated_at", "")
                try:
                    updated_dt = datetime.fromisoformat(
                        updated_raw.replace("Z", "+00:00")
                    )
                    if updated_dt >= today_start:
                        flagged_today += 1
                except (ValueError, AttributeError):
                    pass

            # completed_this_week
            if s == "completed":
                updated_raw = row.get("updated_at", "")
                try:
                    updated_dt = datetime.fromisoformat(
                        updated_raw.replace("Z", "+00:00")
                    )
                    if updated_dt >= week_start:
                        completed_this_week += 1
                except (ValueError, AttributeError):
                    pass

        # Average processing time from analysis_results.processing_time_ms
        # Scope to cases accessible to this user via a subquery on case IDs
        try:
            case_ids = [row["id"] for row in rows]
            if case_ids:
                analysis_resp = (
                    client.table("analysis_results")
                    .select("processing_time_ms")
                    .in_("case_id", case_ids)
                    .not_.is_("processing_time_ms", "null")
                    .execute()
                )
                for ar in analysis_resp.data or []:
                    ms = ar.get("processing_time_ms")
                    if ms:
                        total_processing_ms += ms
                        processing_count += 1
        except Exception as exc:
            logger.warning("Could not fetch processing times: %s", exc)

        avg_hours: float = 0.0
        if processing_count > 0:
            avg_hours = round((total_processing_ms / processing_count) / 3_600_000, 2)

        return {
            "total": len(rows),
            "by_status": by_status,
            "by_priority": by_priority,
            "flagged_today": flagged_today,
            "completed_this_week": completed_this_week,
            "average_processing_time_hours": avg_hours,
        }

    # ─── Status transitions ───────────────────────────────────

    async def update_case_status(
        self,
        case_id: UUID,
        new_status: str,
        updated_by: UUID,
    ) -> CaseResponse:
        """Validate status transition and update the case.

        Valid transitions::
            uploaded → processing
            processing → flagged | completed
            flagged → under_review
            under_review → completed | flagged
        Raises 400 for invalid transitions, 404 if case not found.
        """
        client = supabase_service.client
        resp = (
            client.table("cases")
            .select("*")
            .eq("id", str(case_id))
            .single()
            .execute()
        )
        if not resp.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Case not found.",
            )

        row = resp.data
        current_status: str = row["status"]

        allowed = VALID_TRANSITIONS.get(current_status, set())
        if new_status not in allowed:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Invalid status transition: '{current_status}' → '{new_status}'. "
                    f"Allowed next statuses: {sorted(allowed) or 'none'}."
                ),
            )

        update_resp = (
            client.table("cases")
            .update({"status": new_status})
            .eq("id", str(case_id))
            .execute()
        )
        updated_row = update_resp.data[0]

        await supabase_service.log_audit(
            user_id=str(updated_by),
            action="status_changed",
            resource_type="case",
            resource_id=str(case_id),
            metadata={"from_status": current_status, "to_status": new_status},
        )

        return supabase_service._row_to_case(updated_row)

    # ─── Assign specialist ────────────────────────────────────

    async def assign_specialist(
        self,
        case_id: UUID,
        specialist_id: UUID,
        assigned_by: UUID,
    ) -> CaseResponse:
        """Assign a specialist to a case and transition to under_review.

        Verifies that the target user exists and has role 'specialist'.
        """
        client = supabase_service.client

        # Verify specialist exists and has the right role
        specialist = await supabase_service.get_user_by_id(user_id=str(specialist_id))
        if not specialist:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Specialist not found.",
            )
        if specialist.role != "specialist":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Target user does not have the 'specialist' role.",
            )

        # Verify case exists
        case_resp = (
            client.table("cases")
            .select("*")
            .eq("id", str(case_id))
            .single()
            .execute()
        )
        if not case_resp.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Case not found.",
            )

        update_resp = (
            client.table("cases")
            .update({
                "assigned_specialist_id": str(specialist_id),
                "status": "under_review",
            })
            .eq("id", str(case_id))
            .execute()
        )
        updated_row = update_resp.data[0]

        await supabase_service.log_audit(
            user_id=str(assigned_by),
            action="specialist_assigned",
            resource_type="case",
            resource_id=str(case_id),
            metadata={
                "specialist_id": str(specialist_id),
                "specialist_name": specialist.full_name or specialist.email,
            },
        )

        return supabase_service._row_to_case(updated_row)

    # ─── Timeline ─────────────────────────────────────────────

    async def get_case_timeline(self, case_id: UUID) -> List[dict]:
        """Fetch audit_logs for this case in chronological order.

        Returns::
            [{action, performed_by, timestamp, metadata}]
        """
        client = supabase_service.client

        resp = (
            client.table("audit_logs")
            .select("*")
            .eq("resource_id", str(case_id))
            .eq("resource_type", "case")
            .order("created_at", desc=False)
            .execute()
        )

        events = []
        for row in resp.data or []:
            events.append({
                "action": row.get("action", ""),
                "performed_by": row.get("user_id"),
                "timestamp": row.get("created_at", ""),
                "metadata": row.get("metadata") or {},
            })

        return events

    # ─── Flagged cases ────────────────────────────────────────

    async def get_flagged_cases(self, user: UserProfile) -> List[CaseResponse]:
        """Return all flagged cases visible to this user."""
        client = supabase_service.client

        query = client.table("cases").select("*").eq("status", "flagged")

        if user.role == "specialist":
            query = query.eq("assigned_specialist_id", user.id)
        # admin sees all; clinic would see their own — but flagged is typically
        # admin/specialist only per spec, so no clinic restriction here

        resp = query.order("updated_at", desc=True).execute()
        return [supabase_service._row_to_case(row) for row in (resp.data or [])]

    # ─── Specialist queue ─────────────────────────────────────

    async def get_specialist_queue(self, user: UserProfile) -> List[CaseResponse]:
        """Return the specialist's assigned cases ordered by priority then date."""
        client = supabase_service.client

        PRIORITY_ORDER = {"critical": 0, "high": 1, "normal": 2, "low": 3}

        resp = (
            client.table("cases")
            .select("*")
            .eq("assigned_specialist_id", user.id)
            .not_.in_("status", ["completed", "deleted"])
            .execute()
        )
        rows = resp.data or []

        rows.sort(
            key=lambda r: (
                PRIORITY_ORDER.get(r.get("priority", "normal"), 2),
                r.get("created_at", ""),
            )
        )

        return [supabase_service._row_to_case(row) for row in rows]


case_service = CaseService()
