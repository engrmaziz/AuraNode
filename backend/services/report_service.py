"""Report service — PDF generation using ReportLab."""
import io
import logging
from datetime import datetime, timezone
from typing import List, Optional

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import (
    HRFlowable,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from models.analysis import AnalysisResultResponse
from models.case import CaseResponse
from models.report import ReportResponse
from models.review import ReviewResponse
from services.supabase_service import supabase_service

logger = logging.getLogger(__name__)

# Brand colours
AURA_BLUE = colors.HexColor("#1e3a8a")
AURA_CYAN = colors.HexColor("#06b6d4")
AURA_LIGHT = colors.HexColor("#eff6ff")
DANGER_RED = colors.HexColor("#ef4444")
WARN_ORANGE = colors.HexColor("#f97316")
SUCCESS_GREEN = colors.HexColor("#22c55e")
GREY = colors.HexColor("#6b7280")


class ReportService:
    """Generates clinic-branded PDF reports using ReportLab."""

    async def generate_pdf_report(
        self,
        *,
        case: CaseResponse,
        analysis: Optional[AnalysisResultResponse],
        reviews: List[ReviewResponse],
        generated_by: str,
    ) -> ReportResponse:
        """Generate a PDF report and store it in Supabase Storage."""
        pdf_bytes = self._build_pdf(case=case, analysis=analysis, reviews=reviews)

        report_name = f"auranode-report-{case.id[:8]}-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}.pdf"
        report = await supabase_service.save_report(
            case_id=case.id,
            pdf_bytes=pdf_bytes,
            report_name=report_name,
            generated_by=generated_by,
        )
        logger.info("PDF report generated for case %s (%d bytes)", case.id, len(pdf_bytes))
        return report

    async def get_report_bytes(self, *, report_id: str) -> bytes:
        """Download report bytes from Supabase Storage."""
        storage_path = await supabase_service.get_report_storage_path(report_id=report_id)
        if not storage_path:
            raise ValueError(f"Report {report_id} not found.")
        return await supabase_service.download_report(storage_path=storage_path)

    def _build_pdf(
        self,
        *,
        case: CaseResponse,
        analysis: Optional[AnalysisResultResponse],
        reviews: List[ReviewResponse],
    ) -> bytes:
        buffer = io.BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=A4,
            leftMargin=2 * cm,
            rightMargin=2 * cm,
            topMargin=2 * cm,
            bottomMargin=2 * cm,
        )

        styles = getSampleStyleSheet()
        story = []

        # ── Header ──────────────────────────────────────────
        header_style = ParagraphStyle(
            "Header",
            parent=styles["Normal"],
            fontSize=22,
            textColor=AURA_BLUE,
            fontName="Helvetica-Bold",
            spaceAfter=4,
        )
        story.append(Paragraph("🩺 AuraNode Diagnostic Report", header_style))
        story.append(
            Paragraph(
                f"Generated: {datetime.utcnow().strftime('%B %d, %Y at %H:%M UTC')}",
                ParagraphStyle("Sub", parent=styles["Normal"], fontSize=9, textColor=GREY),
            )
        )
        story.append(HRFlowable(width="100%", thickness=2, color=AURA_CYAN, spaceAfter=12))

        # ── Case Information ─────────────────────────────────
        section_style = ParagraphStyle(
            "Section",
            parent=styles["Heading2"],
            textColor=AURA_BLUE,
            fontSize=13,
            fontName="Helvetica-Bold",
            spaceBefore=12,
            spaceAfter=6,
        )
        story.append(Paragraph("Case Information", section_style))

        case_data = [
            ["Case ID", case.id],
            ["Title", case.title],
            ["Patient Reference", case.patient_reference or "—"],
            ["Priority", case.priority.upper()],
            ["Status", case.status.replace("_", " ").title()],
            ["Created", case.created_at[:10]],
        ]
        if case.description:
            case_data.append(["Description", case.description])

        story.append(self._build_table(case_data))
        story.append(Spacer(1, 0.3 * cm))

        # ── Analysis Results ─────────────────────────────────
        story.append(Paragraph("AI Analysis Results", section_style))

        if analysis:
            risk_color = DANGER_RED if (analysis.risk_score or 0) >= 0.7 else (
                WARN_ORANGE if (analysis.risk_score or 0) >= 0.4 else SUCCESS_GREEN
            )
            risk_label = (
                "HIGH RISK" if (analysis.risk_score or 0) >= 0.7
                else "MODERATE" if (analysis.risk_score or 0) >= 0.4
                else "LOW RISK"
            )

            analysis_data = [
                ["Risk Score", f"{(analysis.risk_score or 0):.1%} — {risk_label}"],
                ["Confidence", f"{(analysis.confidence_score or 0):.1%}"],
                ["Flagged", "YES — Specialist Review Required" if analysis.flagged_status else "No"],
                ["Model Version", analysis.model_version or "1.0.0"],
                ["Processing Time", f"{analysis.processing_time_ms or 0} ms"],
            ]
            story.append(self._build_table(analysis_data, highlight_row=0, highlight_color=risk_color))

            if analysis.ai_findings:
                findings = analysis.ai_findings
                summary = findings.get("summary", "")
                if summary:
                    story.append(Spacer(1, 0.2 * cm))
                    story.append(Paragraph("AI Summary", ParagraphStyle("Bold", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=10)))
                    story.append(Paragraph(summary, styles["Normal"]))

                anomalies = findings.get("anomalies", [])
                if anomalies:
                    story.append(Spacer(1, 0.2 * cm))
                    story.append(Paragraph("Findings / Anomalies", ParagraphStyle("Bold", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=10)))
                    for anomaly in anomalies:
                        story.append(Paragraph(f"• {anomaly}", styles["Normal"]))

                recommendations = findings.get("recommendations", [])
                if recommendations:
                    story.append(Spacer(1, 0.2 * cm))
                    story.append(Paragraph("Recommendations", ParagraphStyle("Bold", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=10)))
                    for rec in recommendations:
                        story.append(Paragraph(f"• {rec}", styles["Normal"]))

            if analysis.extracted_text:
                story.append(Spacer(1, 0.3 * cm))
                story.append(Paragraph("Extracted Text (OCR)", section_style))
                text_style = ParagraphStyle(
                    "OCRText",
                    parent=styles["Code"],
                    fontSize=8,
                    leading=12,
                    backColor=AURA_LIGHT,
                    borderPad=6,
                )
                # Truncate to 2000 chars for PDF readability
                truncated = analysis.extracted_text[:2000]
                if len(analysis.extracted_text) > 2000:
                    truncated += "\n… [truncated]"
                story.append(Paragraph(truncated.replace("\n", "<br/>"), text_style))
        else:
            story.append(
                Paragraph(
                    "No analysis results available for this case.",
                    ParagraphStyle("Warning", parent=styles["Normal"], textColor=GREY),
                )
            )

        # ── Specialist Reviews ──────────────────────────────
        if reviews:
            story.append(Paragraph("Specialist Reviews", section_style))
            for i, review in enumerate(reviews, 1):
                story.append(
                    Paragraph(
                        f"Review #{i} — {review.reviewed_at[:10]}",
                        ParagraphStyle("ReviewNum", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=10, spaceBefore=8),
                    )
                )
                review_data = [
                    ["Decision", (review.decision or "pending").replace("_", " ").title()],
                    ["Specialist ID", review.specialist_id[:8] + "…"],
                ]
                if review.risk_assessment:
                    review_data.append(["Risk Assessment", review.risk_assessment])
                if review.recommendations:
                    review_data.append(["Recommendations", review.recommendations])
                story.append(self._build_table(review_data))
                if review.notes:
                    story.append(Spacer(1, 0.1 * cm))
                    story.append(Paragraph(f"Notes: {review.notes}", styles["Normal"]))

        # ── Footer ──────────────────────────────────────────
        story.append(Spacer(1, 1 * cm))
        story.append(HRFlowable(width="100%", thickness=1, color=GREY))
        story.append(
            Paragraph(
                "This report was auto-generated by AuraNode AI Diagnostic Platform. "
                "It is intended for clinical use only and must be reviewed by a qualified medical professional.",
                ParagraphStyle("Footer", parent=styles["Normal"], fontSize=8, textColor=GREY, spaceBefore=6),
            )
        )

        doc.build(story)
        return buffer.getvalue()

    @staticmethod
    def _build_table(
        data: List[List[str]],
        highlight_row: Optional[int] = None,
        highlight_color: Optional[colors.Color] = None,
    ) -> Table:
        col_widths = [5 * cm, None]
        table = Table(data, colWidths=col_widths, hAlign="LEFT")
        style_cmds = [
            ("BACKGROUND", (0, 0), (0, -1), AURA_LIGHT),
            ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("TEXTCOLOR", (0, 0), (0, -1), AURA_BLUE),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.lightgrey),
            ("ROWBACKGROUNDS", (0, 0), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ]
        if highlight_row is not None and highlight_color is not None:
            style_cmds.append(
                ("TEXTCOLOR", (1, highlight_row), (1, highlight_row), highlight_color)
            )
            style_cmds.append(
                ("FONTNAME", (1, highlight_row), (1, highlight_row), "Helvetica-Bold")
            )
        table.setStyle(TableStyle(style_cmds))
        return table


report_service = ReportService()
