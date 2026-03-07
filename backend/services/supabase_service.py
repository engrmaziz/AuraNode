"""Supabase service — all database and storage interactions."""
import logging
import uuid
from typing import List, Optional

from supabase import Client, create_client

from config.settings import settings
from models.analysis import AnalysisResultResponse
from models.case import CaseCreate, CaseFileResponse, CaseResponse, CaseUpdate, PaginatedCases
from models.report import ReportResponse
from models.review import ReviewCreate, ReviewResponse
from models.user import LoginResponse, UserProfile

logger = logging.getLogger(__name__)


class SupabaseService:
    """Centralised service for all Supabase operations."""

    def __init__(self) -> None:
        self._client: Optional[Client] = None

    @property
    def client(self) -> Client:
        if self._client is None:
            self._client = create_client(
                settings.supabase_url, settings.supabase_service_key
            )
        return self._client

    # ─── Auth ─────────────────────────────────────────────

    async def register_user(
        self,
        *,
        email: str,
        password: str,
        full_name: str,
        organization: Optional[str],
        role: str,
    ) -> UserProfile:
        """Create a new Supabase Auth user and insert a public.users record."""
        auth_resp = self.client.auth.sign_up(
            {"email": email, "password": password}
        )
        if not auth_resp.user:
            raise ValueError("Registration failed — please try again.")

        user_id = auth_resp.user.id
        now = auth_resp.user.created_at

        self.client.table("users").insert(
            {
                "id": user_id,
                "email": email,
                "role": role,
                "full_name": full_name,
                "organization": organization,
            }
        ).execute()

        return UserProfile(
            id=user_id,
            email=email,
            role=role,  # type: ignore[arg-type]
            full_name=full_name,
            organization=organization,
            created_at=str(now),
            updated_at=str(now),
        )

    async def login_user(self, *, email: str, password: str) -> LoginResponse:
        """Authenticate user and return session."""
        resp = self.client.auth.sign_in_with_password(
            {"email": email, "password": password}
        )
        if not resp.session or not resp.user:
            raise ValueError("Invalid email or password.")

        profile = await self.get_user_profile(user_id=resp.user.id)
        if not profile:
            raise ValueError("User profile not found.")

        return LoginResponse(
            access_token=resp.session.access_token,
            refresh_token=resp.session.refresh_token,
            expires_in=resp.session.expires_in or 3600,
            user=profile,
        )

    async def logout_user(self, token: str) -> None:
        """Sign out the user (best-effort)."""
        try:
            self.client.auth.sign_out()
        except Exception:
            pass

    async def get_user_profile(self, *, user_id: str) -> Optional[UserProfile]:
        """Fetch public user profile by ID."""
        resp = (
            self.client.table("users")
            .select("*")
            .eq("id", user_id)
            .single()
            .execute()
        )
        if not resp.data:
            return None
        d = resp.data
        return UserProfile(
            id=d["id"],
            email=d["email"],
            role=d["role"],
            full_name=d.get("full_name"),
            organization=d.get("organization"),
            created_at=d["created_at"],
            updated_at=d["updated_at"],
        )

    async def verify_token(self, token: str) -> Optional[UserProfile]:
        """Verify a JWT and return the corresponding user profile."""
        try:
            resp = self.client.auth.get_user(token)
            if not resp.user:
                return None
            return await self.get_user_profile(user_id=resp.user.id)
        except Exception:
            return None

    async def update_user(self, *, user_id: str, data: dict) -> UserProfile:
        """Update user profile fields and return the updated record."""
        resp = (
            self.client.table("users")
            .update(data)
            .eq("id", user_id)
            .execute()
        )
        if not resp.data:
            raise ValueError(f"User {user_id} not found or update failed.")
        d = resp.data[0]
        return UserProfile(
            id=d["id"],
            email=d["email"],
            role=d["role"],
            full_name=d.get("full_name"),
            organization=d.get("organization"),
            created_at=d["created_at"],
            updated_at=d["updated_at"],
        )

    async def get_user_by_id(self, *, user_id: str) -> Optional[UserProfile]:
        """Fetch public user profile by ID (alias for get_user_profile)."""
        return await self.get_user_profile(user_id=user_id)

    async def get_user_by_email(self, *, email: str) -> Optional[UserProfile]:
        """Fetch public user profile by email address."""
        resp = (
            self.client.table("users")
            .select("*")
            .eq("email", email)
            .single()
            .execute()
        )
        if not resp.data:
            return None
        d = resp.data
        return UserProfile(
            id=d["id"],
            email=d["email"],
            role=d["role"],
            full_name=d.get("full_name"),
            organization=d.get("organization"),
            created_at=d["created_at"],
            updated_at=d["updated_at"],
        )

    async def refresh_session(self, *, refresh_token: str) -> LoginResponse:
        """Refresh a Supabase session using a refresh token."""
        resp = self.client.auth.refresh_session(refresh_token)
        if not resp.session or not resp.user:
            raise ValueError("Invalid or expired refresh token.")

        profile = await self.get_user_profile(user_id=resp.user.id)
        if not profile:
            raise ValueError("User profile not found.")

        return LoginResponse(
            access_token=resp.session.access_token,
            refresh_token=resp.session.refresh_token,
            expires_in=resp.session.expires_in or 3600,
            user=profile,
        )

    async def send_password_reset(self, *, email: str) -> None:
        """Trigger a Supabase password reset email."""
        self.client.auth.reset_password_email(email)

    async def log_audit(
        self,
        *,
        user_id: Optional[str],
        action: str,
        resource_type: str,
        resource_id: Optional[str] = None,
        metadata: Optional[dict] = None,
        ip_address: Optional[str] = None,
    ) -> None:
        """Insert an audit log entry."""
        try:
            self.client.table("audit_logs").insert(
                {
                    "user_id": user_id,
                    "action": action,
                    "resource_type": resource_type,
                    "resource_id": resource_id,
                    "metadata": metadata,
                    "ip_address": ip_address,
                }
            ).execute()
        except Exception as exc:
            logger.warning("Audit log insertion failed: %s", exc)


    async def list_cases(
        self,
        *,
        user_id: str,
        role: str,
        page: int = 1,
        per_page: int = 20,
        status_filter: Optional[str] = None,
        search: Optional[str] = None,
    ) -> List[CaseResponse]:
        """Return cases filtered by user role."""
        query = self.client.table("cases").select("*")

        if role == "clinic":
            query = query.eq("clinic_id", user_id)
        elif role == "specialist":
            query = query.eq("assigned_specialist_id", user_id)
        # admin gets all cases

        if status_filter:
            query = query.eq("status", status_filter)

        if search:
            query = query.ilike("title", f"%{search}%")

        offset = (page - 1) * per_page
        query = query.order("created_at", desc=True).range(offset, offset + per_page - 1)

        resp = query.execute()
        return [self._row_to_case(row) for row in (resp.data or [])]

    async def list_cases_paginated(
        self,
        *,
        user_id: str,
        role: str,
        page: int = 1,
        per_page: int = 20,
        status_filter: Optional[str] = None,
        search: Optional[str] = None,
    ) -> PaginatedCases:
        """Return paginated cases with metadata, filtered by user role."""
        # Build both queries independently to avoid Supabase builder mutation issues
        count_q = self.client.table("cases").select("id", count="exact")
        rows_q = self.client.table("cases").select("*")

        if role == "clinic":
            count_q = count_q.eq("clinic_id", user_id)
            rows_q = rows_q.eq("clinic_id", user_id)
        elif role == "specialist":
            count_q = count_q.eq("assigned_specialist_id", user_id)
            rows_q = rows_q.eq("assigned_specialist_id", user_id)
        # admin sees all cases

        if status_filter:
            count_q = count_q.eq("status", status_filter)
            rows_q = rows_q.eq("status", status_filter)

        if search:
            count_q = count_q.ilike("title", f"%{search}%")
            rows_q = rows_q.ilike("title", f"%{search}%")

        count_resp = count_q.execute()
        total = count_resp.count or 0

        offset = (page - 1) * per_page
        rows_resp = rows_q.order("created_at", desc=True).range(offset, offset + per_page - 1).execute()
        cases = [self._row_to_case(row) for row in (rows_resp.data or [])]

        return PaginatedCases(
            cases=cases,
            total=total,
            page=page,
            per_page=per_page,
            has_next=(offset + per_page) < total,
        )

    async def create_case(self, *, clinic_id: str, payload: CaseCreate) -> CaseResponse:
        """Insert a new case record."""
        resp = (
            self.client.table("cases")
            .insert(
                {
                    "clinic_id": clinic_id,
                    "title": payload.title,
                    "description": payload.description,
                    "patient_reference": payload.patient_reference,
                    "priority": payload.priority,
                    "status": "uploaded",
                }
            )
            .execute()
        )
        return self._row_to_case(resp.data[0])

    async def get_case(self, *, case_id: str, user_id: str, role: str) -> Optional[CaseResponse]:
        """Fetch a single case, enforcing ownership/assignment access."""
        resp = (
            self.client.table("cases")
            .select("*")
            .eq("id", case_id)
            .single()
            .execute()
        )
        if not resp.data:
            return None

        row = resp.data
        # Enforce access control
        if role == "clinic" and row["clinic_id"] != user_id:
            return None
        if role == "specialist" and row.get("assigned_specialist_id") != user_id:
            return None

        return self._row_to_case(row)

    async def update_case(
        self, *, case_id: str, user_id: str, role: str, payload: CaseUpdate
    ) -> Optional[CaseResponse]:
        """Update case fields."""
        existing = await self.get_case(case_id=case_id, user_id=user_id, role=role)
        if not existing:
            return None

        update_data = payload.model_dump(exclude_none=True)
        if not update_data:
            return existing

        resp = (
            self.client.table("cases")
            .update(update_data)
            .eq("id", case_id)
            .execute()
        )
        return self._row_to_case(resp.data[0])

    async def update_case_status(self, *, case_id: str, new_status: str) -> None:
        """Update only the status field of a case."""
        self.client.table("cases").update({"status": new_status}).eq("id", case_id).execute()

    async def delete_case(self, *, case_id: str) -> None:
        """Soft-delete a case by setting its status to 'deleted'."""
        self.client.table("cases").update({"status": "deleted"}).eq("id", case_id).execute()

    # ─── Files ────────────────────────────────────────────

    async def upload_file(
        self,
        *,
        clinic_id: str,
        case_id: str,
        file_name: str,
        content_type: str,
        contents: bytes,
    ) -> CaseFileResponse:
        """Upload file to Supabase Storage and create case_files record."""
        storage_path = f"{clinic_id}/{case_id}/{uuid.uuid4()}/{file_name}"
        self.client.storage.from_(settings.uploads_bucket).upload(
            path=storage_path,
            file=contents,
            file_options={"content-type": content_type},
        )

        file_url = self.client.storage.from_(settings.uploads_bucket).get_public_url(storage_path)

        resp = (
            self.client.table("case_files")
            .insert(
                {
                    "case_id": case_id,
                    "file_url": file_url,
                    "file_name": file_name,
                    "file_size": len(contents),
                    "file_type": content_type,
                    "storage_path": storage_path,
                }
            )
            .execute()
        )
        return self._row_to_case_file(resp.data[0])

    async def get_case_file(self, *, file_id: str, case_id: str) -> Optional[CaseFileResponse]:
        """Fetch a single case_files record, verifying it belongs to the given case."""
        resp = (
            self.client.table("case_files")
            .select("*")
            .eq("id", file_id)
            .eq("case_id", case_id)
            .single()
            .execute()
        )
        if not resp.data:
            return None
        return self._row_to_case_file(resp.data)

    async def delete_case_file(self, *, file_id: str, case_id: str) -> None:
        """Delete a file from Supabase Storage and remove the case_files record."""
        file_record = await self.get_case_file(file_id=file_id, case_id=case_id)
        if not file_record:
            return

        try:
            self.client.storage.from_(settings.uploads_bucket).remove([file_record.storage_path])
        except Exception as exc:
            logger.warning("Storage deletion failed for %s: %s", file_record.storage_path, exc)

        self.client.table("case_files").delete().eq("id", file_id).execute()

    async def get_signed_url(self, *, storage_path: str, expires_in: int = 3600) -> str:
        """Generate a signed download URL for a file in Supabase Storage."""
        result = self.client.storage.from_(settings.uploads_bucket).create_signed_url(
            storage_path, expires_in
        )
        signed_url: str = result.get("signedURL") or result.get("signedUrl") or result.get("signed_url", "")
        return signed_url

    async def list_case_files(self, *, case_id: str) -> List[CaseFileResponse]:
        resp = (
            self.client.table("case_files")
            .select("*")
            .eq("case_id", case_id)
            .order("uploaded_at")
            .execute()
        )
        return [self._row_to_case_file(row) for row in (resp.data or [])]

    async def download_file(self, *, storage_path: str) -> bytes:
        """Download a file from Supabase Storage."""
        response = self.client.storage.from_(settings.uploads_bucket).download(storage_path)
        return response

    # ─── Analysis ─────────────────────────────────────────

    async def create_pending_analysis(self, *, case_id: str) -> AnalysisResultResponse:
        """Insert a pending analysis result placeholder."""
        resp = (
            self.client.table("analysis_results")
            .insert({"case_id": case_id, "flagged_status": False})
            .execute()
        )
        return self._row_to_analysis(resp.data[0])

    async def update_analysis_result(
        self,
        *,
        analysis_id: str,
        extracted_text: Optional[str] = None,
        confidence_score: Optional[float] = None,
        risk_score: Optional[float] = None,
        flagged_status: Optional[bool] = None,
        ai_findings: Optional[dict] = None,
        processing_time_ms: Optional[int] = None,
        file_id: Optional[str] = None,
        model_version: str = "1.0.0",
    ) -> None:
        update_data: dict = {"model_version": model_version}
        if extracted_text is not None:
            update_data["extracted_text"] = extracted_text
        if confidence_score is not None:
            update_data["confidence_score"] = confidence_score
        if risk_score is not None:
            update_data["risk_score"] = risk_score
        if flagged_status is not None:
            update_data["flagged_status"] = flagged_status
        if ai_findings is not None:
            update_data["ai_findings"] = ai_findings
        if processing_time_ms is not None:
            update_data["processing_time_ms"] = processing_time_ms
        if file_id is not None:
            update_data["file_id"] = file_id
        self.client.table("analysis_results").update(update_data).eq("id", analysis_id).execute()

    async def get_analysis_result(self, *, case_id: str) -> Optional[AnalysisResultResponse]:
        resp = (
            self.client.table("analysis_results")
            .select("*")
            .eq("case_id", case_id)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        if not resp.data:
            return None
        return self._row_to_analysis(resp.data[0])

    async def list_analysis_results(self, *, case_id: str) -> list:
        """Return all analysis results for a case, newest first."""
        resp = (
            self.client.table("analysis_results")
            .select("*")
            .eq("case_id", case_id)
            .order("created_at", desc=True)
            .execute()
        )
        return [self._row_to_analysis(row) for row in (resp.data or [])]

    # ─── Reviews ──────────────────────────────────────────

    async def create_review(
        self, *, case_id: str, specialist_id: str, payload: ReviewCreate
    ) -> ReviewResponse:
        resp = (
            self.client.table("reviews")
            .insert(
                {
                    "case_id": case_id,
                    "specialist_id": specialist_id,
                    "notes": payload.notes,
                    "decision": payload.decision,
                    "risk_assessment": payload.risk_assessment,
                    "recommendations": payload.recommendations,
                }
            )
            .execute()
        )
        return self._row_to_review(resp.data[0])

    async def list_reviews(self, *, case_id: str) -> List[ReviewResponse]:
        resp = (
            self.client.table("reviews")
            .select("*")
            .eq("case_id", case_id)
            .order("reviewed_at", desc=True)
            .execute()
        )
        return [self._row_to_review(row) for row in (resp.data or [])]

    # ─── Reports ──────────────────────────────────────────

    async def save_report(
        self,
        *,
        case_id: str,
        pdf_bytes: bytes,
        report_name: str,
        generated_by: str,
    ) -> ReportResponse:
        """Upload PDF to storage and create reports record."""
        storage_path = f"{case_id}/{uuid.uuid4()}/{report_name}"
        self.client.storage.from_(settings.reports_bucket).upload(
            path=storage_path,
            file=pdf_bytes,
            file_options={"content-type": "application/pdf"},
        )
        report_url = self.client.storage.from_(settings.reports_bucket).get_public_url(storage_path)

        resp = (
            self.client.table("reports")
            .insert(
                {
                    "case_id": case_id,
                    "report_url": report_url,
                    "storage_path": storage_path,
                    "generated_by": generated_by,
                }
            )
            .execute()
        )
        return self._row_to_report(resp.data[0])

    async def list_reports(self, *, case_id: str) -> List[ReportResponse]:
        resp = (
            self.client.table("reports")
            .select("*")
            .eq("case_id", case_id)
            .order("generated_at", desc=True)
            .execute()
        )
        return [self._row_to_report(row) for row in (resp.data or [])]

    async def get_report_storage_path(self, *, report_id: str) -> Optional[str]:
        resp = (
            self.client.table("reports")
            .select("storage_path")
            .eq("id", report_id)
            .single()
            .execute()
        )
        return resp.data["storage_path"] if resp.data else None

    async def download_report(self, *, storage_path: str) -> bytes:
        return self.client.storage.from_(settings.reports_bucket).download(storage_path)

    # ─── Row Mappers ──────────────────────────────────────

    @staticmethod
    def _row_to_case(row: dict) -> CaseResponse:
        return CaseResponse(
            id=row["id"],
            clinic_id=row["clinic_id"],
            title=row["title"],
            description=row.get("description"),
            patient_reference=row.get("patient_reference"),
            status=row["status"],
            priority=row["priority"],
            assigned_specialist_id=row.get("assigned_specialist_id"),
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )

    @staticmethod
    def _row_to_case_file(row: dict) -> CaseFileResponse:
        return CaseFileResponse(
            id=row["id"],
            case_id=row["case_id"],
            file_url=row["file_url"],
            file_name=row["file_name"],
            file_size=row["file_size"],
            file_type=row["file_type"],
            storage_path=row["storage_path"],
            uploaded_at=row["uploaded_at"],
        )

    @staticmethod
    def _row_to_analysis(row: dict) -> AnalysisResultResponse:
        return AnalysisResultResponse(
            id=row["id"],
            case_id=row["case_id"],
            file_id=row.get("file_id"),
            extracted_text=row.get("extracted_text"),
            confidence_score=row.get("confidence_score"),
            risk_score=row.get("risk_score"),
            flagged_status=row.get("flagged_status", False),
            ai_findings=row.get("ai_findings"),
            processing_time_ms=row.get("processing_time_ms"),
            model_version=row.get("model_version"),
            created_at=row["created_at"],
        )

    @staticmethod
    def _row_to_review(row: dict) -> ReviewResponse:
        return ReviewResponse(
            id=row["id"],
            case_id=row["case_id"],
            specialist_id=row["specialist_id"],
            notes=row.get("notes"),
            decision=row.get("decision"),
            risk_assessment=row.get("risk_assessment"),
            recommendations=row.get("recommendations"),
            reviewed_at=row["reviewed_at"],
        )

    @staticmethod
    def _row_to_report(row: dict) -> ReportResponse:
        return ReportResponse(
            id=row["id"],
            case_id=row["case_id"],
            report_url=row["report_url"],
            storage_path=row["storage_path"],
            generated_by=row.get("generated_by"),
            generated_at=row["generated_at"],
        )


supabase_service = SupabaseService()
