"""P&L Reporter — Streamlit entry point."""

import pandas as pd
import streamlit as st

from ui import process_files, render_reports


def main() -> None:
    st.set_page_config(page_title="P&L Reporter", layout="wide")
    st.title("P&L Reporter")
    st.write(
        "Upload your bank and credit card CSV statements to generate a monthly P&L."
    )

    uploaded_files = st.file_uploader(
        "Drag and drop statements here (CSV or PDF)",
        type=["csv", "pdf"],
        accept_multiple_files=True,
    )

    if not uploaded_files:
        st.info("Drop one or more CSV files to begin.")
        return

    ledgers, categories, progress = process_files(uploaded_files)

    if not ledgers:
        progress.progress(100, text="No usable transactions found.")
        st.warning("No usable transactions found.")
        return

    ledger = pd.concat(ledgers, ignore_index=True)
    render_reports(ledger, categories, progress)


if __name__ == "__main__":
    main()
