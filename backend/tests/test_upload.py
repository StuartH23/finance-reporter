"""Tests for upload router — confirms empty CSV, missing columns, and session isolation."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest
from fastapi.testclient import TestClient
from pdfminer.pdfdocument import PDFPasswordIncorrect

from main import app
from routers import upload as upload_router
from routers.upload import _process_csv, _process_pdf, _session_cookie_options
from sdk.pdf_parser import PDF_FAILURE_MESSAGES, PdfParseError


def test_process_csv_empty_bytes():
    """Empty file should return None, not crash with EmptyDataError."""
    result = _process_csv(b"")
    assert result is None


def test_process_csv_whitespace_only():
    """Whitespace-only file should return None."""
    result = _process_csv(b"   \n  \n")
    assert result is None


def test_process_csv_no_amount_columns():
    """CSV with date and description but no amount/debit/credit columns
    should return None, not produce garbage zero-amount data.
    """
    csv_content = b"date,description,notes\n2025-01-01,Payment,foo\n"
    result = _process_csv(csv_content)
    assert result is None


def test_process_csv_valid():
    """Valid CSV with recognized columns should return a DataFrame."""
    csv_content = b"Date,Description,Amount\n2025-01-01,Test Payment,100.00\n"
    result = _process_csv(csv_content)
    assert result is not None
    assert len(result) == 1
    assert result["amount"].iloc[0] == 100.00


def test_process_pdf_discover_statement_fixture():
    statement = Path("/Users/stu/Downloads/Discover-Statement-20260424-0229.pdf")
    if not statement.exists():
        pytest.skip("Discover statement fixture is only available on the local dev machine")

    result = _process_pdf(statement.read_bytes(), statement.name)

    assert result is not None
    assert len(result) == 25
    amounts_by_description = dict(zip(result["description"], result["amount"]))
    assert amounts_by_description["DIRECTPAY FULL BALANCE"] == 840.04
    assert amounts_by_description["SMITHS-FUEL #9207 SARATOGA SPRIUT Gasoline"] == -65.05
    assert amounts_by_description["SWIG SARATOGA SPRINGS SARATOGA Restaurants"] == -10.06


def test_process_csv_credit_card_statement_uses_charge_and_payment_when_amount_is_zero():
    """Some credit-card CSVs include a placeholder Amount column plus real
    Charge/Payment columns. The parser should not turn purchases into $0 rows.
    """
    csv_content = (
        b"Date,Description,Amount,Charge,Payment\n"
        b"2025-01-01,Coffee Shop,0.00,12.34,\n"
        b"2025-01-02,Autopay Thank You,0.00,,100.00\n"
    )

    result = _process_csv(csv_content)

    assert result is not None
    assert result["amount"].tolist() == [-12.34, 100.00]


def test_process_csv_credit_card_statement_detects_plural_charge_payment_columns():
    """Plural credit-card column labels should be treated as split amount columns."""
    csv_content = (
        b"Date,Description,Charges,Payments\n"
        b"2025-01-01,Grocery Store,45.67,\n"
        b"2025-01-02,Statement Credit,,5.00\n"
    )

    result = _process_csv(csv_content)

    assert result is not None
    assert result["amount"].tolist() == [-45.67, 5.00]


def test_process_csv_malformed():
    """Malformed CSV should return None, not crash."""
    result = _process_csv(b"\x00\x01\x02\x03")
    assert result is None


def test_session_cookie_defaults_secure_in_production(monkeypatch):
    """Production sessions should default to secure HTTP-only cookies."""
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.delenv("SESSION_COOKIE_SECURE", raising=False)
    monkeypatch.delenv("SESSION_COOKIE_SAMESITE", raising=False)

    options = _session_cookie_options()

    assert options == {"httponly": True, "samesite": "lax", "secure": True}


def test_session_cookie_samesite_none_forces_secure(monkeypatch):
    """SameSite=None requires Secure even if local env overrides it off."""
    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.setenv("SESSION_COOKIE_SECURE", "false")
    monkeypatch.setenv("SESSION_COOKIE_SAMESITE", "none")

    options = _session_cookie_options()

    assert options == {"httponly": True, "samesite": "none", "secure": True}


def test_oversized_upload_does_not_replace_existing_ledger(monkeypatch):
    client = TestClient(app)
    initial = b"Date,Description,Amount\n2025-01-01,Existing,100.00\n"
    upload = client.post(
        "/api/upload",
        files=[("files", ("initial.csv", initial, "text/csv"))],
    )
    assert upload.status_code == 200

    monkeypatch.setattr(upload_router, "MAX_UPLOAD_BYTES", 10)
    oversized = client.post(
        "/api/upload",
        files=[
            (
                "files",
                (
                    "large.csv",
                    b"Date,Description,Amount\n2025-01-02,Large,200.00\n",
                    "text/csv",
                ),
            )
        ],
    )

    assert oversized.status_code == 413
    ledger = client.get("/api/ledger").json()
    assert ledger["count"] == 1
    assert ledger["transactions"][0]["description"] == "Existing"


FIXTURES = Path(__file__).resolve().parent / "fixtures"


def test_bank_csv_fixture_keeps_spending_negative_and_income_positive():
    """A checking export already uses ledger signs and must not be flipped."""
    result = _process_csv(
        (FIXTURES / "bank_statement.csv").read_bytes(),
        "bank_statement.csv",
    )

    assert result is not None
    assert result["description"].tolist() == ["Payroll Deposit", "Grocery Store", "Gas Station"]
    assert result["amount"].tolist() == pytest.approx([2500.00, -84.20, -40.00])


def test_card_csv_fixture_makes_purchases_expenses_and_payments_income():
    """Card exports often store charges as positive numbers."""
    result = _process_csv(
        (FIXTURES / "card_statement.csv").read_bytes(),
        "card_statement.csv",
    )

    assert result is not None
    assert result["amount"].tolist() == pytest.approx([-54.18, -31.40, 200.00, 18.50])


def test_card_filename_flips_positive_charges_without_a_payment_row():
    csv_content = (
        b"Date,Description,Amount\n2025-04-01,Grocery Store,12.00\n2025-04-02,Coffee Shop,4.50\n"
    )

    result = _process_csv(csv_content, "visa-credit-card.csv")

    assert result is not None
    assert result["amount"].tolist() == pytest.approx([-12.00, -4.50])


def test_positive_amounts_without_card_signals_stay_positive():
    csv_content = (
        b"Date,Description,Amount\n2025-04-01,Grocery Store,12.00\n2025-04-02,Coffee Shop,4.50\n"
    )

    result = _process_csv(csv_content, "payroll.csv")

    assert result is not None
    assert result["amount"].tolist() == pytest.approx([12.00, 4.50])


def test_unsigned_card_type_column_signs_charges_and_payments():
    csv_content = (
        b"Date,Description,Type,Amount\n"
        b"2025-03-01,Grocery Store,Sale,22.00\n"
        b"2025-03-02,Payment Thank You,Payment,100.00\n"
        b"2025-03-03,Store Refund,Return,8.00\n"
    )

    result = _process_csv(csv_content, "credit-card.csv")

    assert result is not None
    assert result["amount"].tolist() == pytest.approx([-22.00, 100.00, 8.00])


def _simple_pdf(text: str) -> bytes:
    safe = text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
    stream = f"BT /F1 12 Tf 72 700 Td ({safe}) Tj ET\n".encode() if text else b""
    objects = {
        1: b"<< /Type /Catalog /Pages 2 0 R >>",
        2: b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        3: (
            b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
            b"/Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>"
        ),
        4: b"<< /Length %d >>\nstream\n" % len(stream) + stream + b"endstream",
        5: b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    }
    out = bytearray(b"%PDF-1.4\n")
    offsets: dict[int, int] = {}
    for num in range(1, 6):
        offsets[num] = len(out)
        out += f"{num} 0 obj\n".encode() + objects[num] + b"\nendobj\n"
    xref = len(out)
    out += b"xref\n0 6\n0000000000 65535 f \n"
    for num in range(1, 6):
        out += f"{offsets[num]:010d} 00000 n \n".encode()
    out += f"trailer << /Size 6 /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
    return bytes(out)


def test_scanned_pdf_reports_missing_text_layer():
    with pytest.raises(PdfParseError) as caught:
        _process_pdf(_simple_pdf(""), "scan.pdf")

    assert caught.value.code == "scanned"
    assert caught.value.message == PDF_FAILURE_MESSAGES["scanned"]


def test_unsupported_pdf_reports_unknown_format():
    with pytest.raises(PdfParseError) as caught:
        _process_pdf(_simple_pdf("City Water Utility invoice total due"), "water.pdf")

    assert caught.value.code == "unsupported"
    assert "not supported" in caught.value.message


def test_supported_statement_without_rows_reports_no_transactions():
    text = "Chase checking Transaction Detail this page has no transaction rows"
    with pytest.raises(PdfParseError) as caught:
        _process_pdf(_simple_pdf(text), "chase.pdf")

    assert caught.value.code == "no_transactions"
    assert "No transactions were found" in caught.value.message


def test_encrypted_pdf_reports_password_protection(monkeypatch):
    def _open(*_args, **_kwargs):
        raise PDFPasswordIncorrect

    monkeypatch.setattr(upload_router.pdfplumber, "open", _open)

    with pytest.raises(PdfParseError) as caught:
        _process_pdf(b"%PDF-1.4", "locked.pdf")

    assert caught.value.code == "encrypted"
    assert "password-protected" in caught.value.message


def test_upload_includes_pdf_failure_reason():
    client = TestClient(app)
    response = client.post(
        "/api/upload",
        files=[("files", ("scan.pdf", _simple_pdf(""), "application/pdf"))],
    )

    assert response.status_code == 200
    body = response.json()
    assert body["files"] == [
        {
            "file": "scan.pdf",
            "status": "error",
            "transactions": 0,
            "message": PDF_FAILURE_MESSAGES["scanned"],
        }
    ]
    assert body["total_transactions"] == 0


def test_already_signed_card_type_column_is_not_flipped_again():
    csv_content = (
        b"Date,Description,Type,Amount\n"
        b"2025-03-01,Grocery Store,Sale,-22.00\n"
        b"2025-03-02,Payment Thank You,Payment,100.00\n"
    )

    result = _process_csv(csv_content, "credit-card-export.csv")

    assert result is not None
    assert result["amount"].tolist() == pytest.approx([-22.00, 100.00])
