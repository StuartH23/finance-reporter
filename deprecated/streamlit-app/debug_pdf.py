#!/usr/bin/env python3
"""One-off debug: run PDF parser on a file and show extracted txns + raw words/lines."""
import io
import re
import sys
from collections import defaultdict

import pdfplumber

# Reuse app's regexes and logic
date_word_re = re.compile(r"^\d{1,2}/\d{1,2}$")
amount_word_re = re.compile(r"^-?\$?(?:\d{1,3}(?:,\d{3})*|\d+)\.\d{2}$")
summary_line_re = re.compile(
    r"\b(balance|deposits?|withdrawals?|summary|subtotal|beginning|ending|account\s+number|transaction\s+detail)\b",
    re.IGNORECASE,
)


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else "/Users/stu/Downloads/20250116-statements-8983-.pdf"
    with open(path, "rb") as f:
        content = f.read()

    with pdfplumber.open(io.BytesIO(content)) as pdf:
        print("=== Page count:", len(pdf.pages))
        for pno, page in enumerate(pdf.pages):
            text = page.extract_text() or ""
            words = page.extract_words(x_tolerance=2, y_tolerance=3, keep_blank_chars=False, use_text_flow=False)
            if not words:
                continue
            line_map = defaultdict(list)
            for w in words:
                y_center = (w["top"] + w["bottom"]) / 2
                line_map[round(y_center / 4) * 4].append(w)

            txn_lines = {}
            orphan_amounts = []
            for y_key in sorted(line_map.keys()):
                line = sorted(line_map[y_key], key=lambda w: w["x0"])
                texts = [w["text"] for w in line]
                if not texts:
                    continue
                if date_word_re.match(texts[0]):
                    txn_lines[y_key] = texts
                elif not summary_line_re.search(" ".join(texts)):
                    for t in texts:
                        if amount_word_re.match(t) and not t.startswith("-"):
                            orphan_amounts.append(t)

            print(f"\n--- Page {pno + 1}: {len(txn_lines)} date lines, {len(orphan_amounts)} orphan amounts ---")
            for y_key in sorted(txn_lines.keys()):
                texts = txn_lines[y_key]
                amt_indices = [i for i, t in enumerate(texts) if amount_word_re.match(t)]
                amounts_on_row = [texts[i] for i in amt_indices]
                line_preview = " | ".join(texts[:10])
                if len(texts) > 10:
                    line_preview += " ..."
                print(f"  date-line: amt_indices={amt_indices} amounts={amounts_on_row} -> {line_preview}")
            if orphan_amounts:
                print(f"  orphans: {orphan_amounts[:15]}{'...' if len(orphan_amounts) > 15 else ''}")

    # Run actual parser
    sys.path.insert(0, "/Users/stu/Developer/pnl-reporter")
    from app import parse_pdf_words_to_df, clean_amount

    df, year = parse_pdf_words_to_df(content, filename=path)
    if df is None or df.empty:
        print("\nParser returned no rows.")
        return
    df["amount_num"] = df["Amount"].apply(clean_amount)
    income = df[df["amount_num"] > 0]
    print("\n=== Extracted transactions (parser output) ===")
    print(f"Detected year: {year}, rows: {len(df)}")
    print(f"Income rows: {len(income)}, total income: ${income['amount_num'].sum():,.2f}")
    print("\nPositive amounts (income):")
    for _, r in income.iterrows():
        print(f"  {r['Date']}  {r['Amount']:>14}  {r['Description'][:60]}")
    print("\nAll amounts that look like they might be missed (from raw text):")
    all_text = ""
    with pdfplumber.open(io.BytesIO(content)) as pdf:
        all_text = "\n".join((p.extract_text() or "") for p in pdf.pages)
    # Find dollar amounts in text that might be payroll-sized
    amt_candidates = re.findall(r"\$?[\d,]+\.\d{2}", all_text)
    for a in amt_candidates:
        clean = a.replace("$", "").replace(",", "")
        try:
            v = float(clean)
            if v > 10000:
                print(f"  {a} -> {v}")
        except ValueError:
            pass


if __name__ == "__main__":
    main()
