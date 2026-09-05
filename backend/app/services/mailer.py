"""Bulk payslip email (spec B8).

Runs against Mailpit in Compose, which catches every message in a browsable
inbox at http://localhost:8025. Judges see 30 payslip emails land with zero
deliverability risk, and a .env switch points at real SMTP later.

Called from BackgroundTasks, so it opens its own session: the request's
session is already closed by the time this runs.
"""
from __future__ import annotations

import logging
import smtplib
from email.message import EmailMessage

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.models.payroll import Payrun, Payslip
from app.services import pdf

logger = logging.getLogger("paypulse.mailer")


def _build_message(payslip: Payslip, content: bytes, extension: str) -> EmailMessage:
    employee = payslip.employee
    period = f"{payslip.period_start:%B %Y}"

    message = EmailMessage()
    message["Subject"] = f"Your payslip for {period}"
    message["From"] = f"{settings.MAIL_FROM_NAME} <{settings.MAIL_FROM}>"
    message["To"] = employee.work_email
    message.set_content(
        f"Hello {employee.first_name},\n\n"
        f"Your payslip for {period} is attached.\n\n"
        f"Net salary: {payslip.currency} {payslip.net}\n"
        f"Payable days: {payslip.payable_days} of {payslip.period_days}\n\n"
        "This document is confidential. If you have questions about any "
        "line on it, reply to this email and payroll will help.\n\n"
        f"-- {settings.COMPANY_NAME}\n"
    )

    subtype = "pdf" if extension == "pdf" else "html"
    maintype = "application" if extension == "pdf" else "text"
    message.add_attachment(
        content,
        maintype=maintype,
        subtype=subtype,
        filename=f"payslip-{payslip.period_start:%Y-%m}-{employee.last_name}."
        f"{extension}",
    )
    return message


def send_payslips(payslip_ids: list[int]) -> dict:
    """Email each payslip with its document attached.

    One failure must not stop the batch: a bad address on employee 7 cannot
    prevent employees 8 to 30 from being sent.
    """
    from app.db.session import SessionLocal

    sent = failed = 0
    with SessionLocal() as db:
        payslips = list(
            db.scalars(
                select(Payslip)
                .where(Payslip.id.in_(payslip_ids))
                .options(
                    selectinload(Payslip.employee),
                    selectinload(Payslip.payrun).selectinload(
                        Payrun.salary_structure
                    ),
                )
            )
        )

        try:
            server = smtplib.SMTP(
                settings.SMTP_HOST, settings.SMTP_PORT, timeout=10
            )
        except OSError as exc:
            logger.error("SMTP unreachable at %s: %s", settings.SMTP_HOST, exc)
            return {"sent": 0, "failed": len(payslips), "error": str(exc)}

        with server:
            if settings.SMTP_TLS:
                server.starttls()
            if settings.SMTP_USER:
                server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)

            for payslip in payslips:
                try:
                    content, _, extension = pdf.render_payslip(db, payslip)
                    server.send_message(
                        _build_message(payslip, content, extension)
                    )
                    sent += 1
                except Exception as exc:
                    failed += 1
                    logger.warning(
                        "payslip %s to %s failed: %s",
                        payslip.id,
                        payslip.employee.work_email if payslip.employee else "?",
                        exc,
                    )

    logger.info("payslip email batch: %d sent, %d failed", sent, failed)
    return {"sent": sent, "failed": failed}
