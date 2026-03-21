"""Streamlit UI rendering functions."""

import io
from typing import List, Optional, Tuple

import pandas as pd
import pdfplumber
import plotly.graph_objects as go
import streamlit as st

from budget import budget_vs_actual, load_budget, save_budget
from categories import TRANSFER_CATEGORIES, categorize, load_categories
from csv_handler import guess_columns
from ledger import build_ledger, summarize
from pdf_parser import parse_pdf_words_to_df
from year_detection import infer_year


def _render_pdf_file(
    idx: int, uploaded, content: bytes, categories
) -> Optional[pd.DataFrame]:
    """Process a PDF upload and return a ledger DataFrame."""
    with pdfplumber.open(io.BytesIO(content)) as _pdf:
        all_text = "\n".join((page.extract_text() or "") for page in _pdf.pages)
    default_year = infer_year(all_text, uploaded.name)

    with st.expander(f"File {idx}: {uploaded.name}", expanded=False):
        year_val = st.number_input(
            "Statement year (auto-detected — correct if wrong)",
            value=default_year,
            min_value=2000,
            max_value=2100,
            step=1,
            key=f"year_{uploaded.name}_{default_year}",
        )
        df, _ = parse_pdf_words_to_df(
            content, filename=uploaded.name, year_override=int(year_val)
        )
        if df is None or df.empty:
            st.error(
                f"Could not extract transactions from {uploaded.name}. "
                "Scanned PDFs are not supported — export a CSV instead."
            )
            return None
        st.caption(f"Extracted {len(df):,} transactions.")
        st.dataframe(df.head(20), use_container_width=True)

    return build_ledger(
        df=df,
        date_col="Date",
        desc_col="Description",
        amount_col="Amount",
        debit_col=None,
        credit_col=None,
        flip_sign=False,
    )


def _render_csv_file(idx: int, uploaded, content: bytes) -> Tuple[pd.DataFrame, dict]:
    """Process a CSV upload and return (df, column_config)."""
    df = pd.read_csv(io.BytesIO(content))

    with st.expander(f"File {idx}: {uploaded.name}", expanded=False):
        st.write("Detected columns. Adjust if needed.")
        guess = guess_columns(list(df.columns))
        st.dataframe(df.head(20), use_container_width=True)
        date_col = st.selectbox(
            "Date column",
            options=list(df.columns),
            index=(
                list(df.columns).index(guess.date) if guess.date in df.columns else 0
            ),
            key=f"date_{idx}",
        )
        desc_col = st.selectbox(
            "Description column",
            options=list(df.columns),
            index=(
                list(df.columns).index(guess.description)
                if guess.description in df.columns
                else 0
            ),
            key=f"desc_{idx}",
        )

        amount_mode = st.radio(
            "Amount source",
            options=["Amount column", "Debit/Credit columns"],
            index=0 if guess.amount else 1,
            key=f"amount_mode_{idx}",
        )

        amount_col = debit_col = credit_col = None

        if amount_mode == "Amount column":
            amount_col = st.selectbox(
                "Amount column",
                options=list(df.columns),
                index=(
                    list(df.columns).index(guess.amount)
                    if guess.amount in df.columns
                    else 0
                ),
                key=f"amount_{idx}",
            )
        else:
            debit_col = st.selectbox(
                "Debit column",
                options=list(df.columns),
                index=(
                    list(df.columns).index(guess.debit)
                    if guess.debit in df.columns
                    else 0
                ),
                key=f"debit_{idx}",
            )
            credit_col = st.selectbox(
                "Credit column",
                options=list(df.columns),
                index=(
                    list(df.columns).index(guess.credit)
                    if guess.credit in df.columns
                    else 0
                ),
                key=f"credit_{idx}",
            )

        flip_sign = st.checkbox(
            "Flip sign (use if expenses are positive)",
            value=False,
            key=f"flip_{idx}",
        )

    return df, {
        "date_col": date_col,
        "desc_col": desc_col,
        "amount_col": amount_col,
        "debit_col": debit_col,
        "credit_col": credit_col,
        "flip_sign": flip_sign,
    }


def _render_yearly_pnl(pnl_ledger: pd.DataFrame) -> None:
    """Render yearly P&L summary metrics."""
    yearly = pnl_ledger.copy()
    yearly["year"] = yearly["date"].dt.year
    yearly["income"] = yearly["amount"].where(yearly["amount"] > 0, 0)
    yearly["expense"] = yearly["amount"].where(yearly["amount"] < 0, 0)
    yearly_summary = (
        yearly.groupby("year", as_index=False)
        .agg(income=("income", "sum"), expenses=("expense", "sum"), net=("amount", "sum"))
        .sort_values("year")
    )
    yearly_summary["expenses"] = -yearly_summary["expenses"]
    yearly_summary["profitable"] = yearly_summary["net"] > 0

    st.subheader("Yearly P&L")
    for _, row in yearly_summary.iterrows():
        st.markdown(f"**{int(row['year'])}**")
        c1, c2, c3, c4 = st.columns(4)
        c1.metric("Income", f"${row['income']:,.2f}")
        c2.metric("Expenses", f"${row['expenses']:,.2f}")
        c3.metric("Net", f"${row['net']:,.2f}")
        c4.metric("Result", "Profitable" if row["profitable"] else "Net Loss")


def _render_monthly_pnl(monthly: pd.DataFrame) -> None:
    """Render monthly P&L table."""
    st.subheader("Monthly P&L")
    monthly_display = monthly[["month_str", "income", "expenses", "net"]].copy()
    monthly_display.columns = ["Month", "Income", "Expenses", "Net"]
    st.dataframe(
        monthly_display.style.format(
            {"Income": "${:,.2f}", "Expenses": "${:,.2f}", "Net": "${:,.2f}"}
        ),
        use_container_width=True,
        hide_index=True,
    )


def _render_transfers(transfers_ledger: pd.DataFrame) -> None:
    """Render transfers & credit card payments section."""
    if transfers_ledger.empty:
        return
    st.subheader("Transfers & Credit Card Payments")
    st.caption("These are account-to-account transfers excluded from the P&L above.")
    transfers_summary = (
        transfers_ledger.groupby("category", sort=False)
        .agg(total=("amount", "sum"), transactions=("amount", "count"))
        .reset_index()
        .sort_values("total")
    )
    st.dataframe(transfers_summary, use_container_width=True, hide_index=True)
    st.dataframe(
        transfers_ledger[["date", "description", "amount", "category", "source_file"]]
        .sort_values("date")
        .reset_index(drop=True),
        use_container_width=True,
        hide_index=True,
    )


def _render_spending_pie(pnl_ledger: pd.DataFrame) -> None:
    """Render spending profile with pie chart."""
    st.subheader("Spending Profile")
    spending = pnl_ledger[pnl_ledger["amount"] < 0].copy()
    spending["abs_amount"] = -spending["amount"]

    spending_by_cat = (
        spending.groupby("category", sort=False)["abs_amount"]
        .agg(["sum", "count"])
        .rename(columns={"sum": "total", "count": "transactions"})
        .reset_index()
        .sort_values("total", ascending=False)
    )
    spending_by_cat["total"] = spending_by_cat["total"].astype(float)

    total_spending = spending_by_cat["total"].sum()
    chart_data = spending_by_cat.copy()
    chart_data["pct"] = chart_data["total"] / total_spending
    main = chart_data[chart_data["pct"] >= 0.02].copy()
    small = chart_data[chart_data["pct"] < 0.02]
    if not small.empty:
        other_row = pd.DataFrame(
            [{"category": "Other", "total": small["total"].sum(),
              "transactions": small["transactions"].sum()}]
        )
        main = pd.concat([main, other_row], ignore_index=True)

    fig = go.Figure(
        data=[
            go.Pie(
                labels=main["category"].tolist(),
                values=main["total"].tolist(),
                hole=0.4,
                textinfo="label+percent",
                textposition="inside",
                insidetextorientation="horizontal",
                hovertemplate="%{label}<br>$%{value:,.2f}<br>%{percent:.1%}<extra></extra>",
                marker=dict(line=dict(color="#111", width=1)),
            )
        ]
    )
    fig.update_layout(
        title="Spending by Category",
        showlegend=False,
        height=500,
        margin=dict(t=60, b=20, l=20, r=20),
    )
    st.plotly_chart(fig, use_container_width=True)

    st.dataframe(
        spending_by_cat.style.format({"total": "${:,.2f}"}),
        use_container_width=True,
        hide_index=True,
    )


def _render_category_breakdown(ledger: pd.DataFrame) -> None:
    """Render full category breakdown table."""
    st.subheader("Category Breakdown")
    cat_summary = (
        ledger.groupby("category", sort=False)
        .agg(
            income=("amount", lambda x: x[x > 0].sum()),
            expenses=("amount", lambda x: -x[x < 0].sum()),
            net=("amount", "sum"),
            transactions=("amount", "count"),
        )
        .reset_index()
        .sort_values("expenses", ascending=False)
    )
    st.dataframe(cat_summary, use_container_width=True, hide_index=True)


def _render_transactions(ledger: pd.DataFrame) -> None:
    """Render all-transactions table."""
    st.subheader("All Transactions")
    st.caption(f"{len(ledger):,} transactions — sorted by date, categorized.")
    display_ledger = (
        ledger[["date", "description", "amount", "category", "source_file"]]
        .sort_values("date")
        .reset_index(drop=True)
    )
    st.dataframe(display_ledger, use_container_width=True, hide_index=True)


def _render_budget_editor(categories_in_data: list) -> dict:
    """Render an editable budget table and return current budget."""
    st.subheader("Monthly Budget")
    budget = load_budget()

    # Ensure all categories from data are represented
    for cat in categories_in_data:
        if cat not in budget:
            budget[cat] = 0.0

    edited = st.data_editor(
        pd.DataFrame(
            [{"Category": k, "Monthly Budget": v} for k, v in budget.items()]
        ),
        column_config={
            "Category": st.column_config.TextColumn(disabled=True),
            "Monthly Budget": st.column_config.NumberColumn(
                format="$%.2f", min_value=0, step=25.0
            ),
        },
        use_container_width=True,
        hide_index=True,
        key="budget_editor",
    )

    new_budget = dict(zip(edited["Category"], edited["Monthly Budget"]))
    if new_budget != budget:
        save_budget(new_budget)
        st.success("Budget saved.")

    return new_budget


def _render_budget_vs_actual(pnl_ledger: pd.DataFrame, budget: dict) -> None:
    """Render budget vs. actual comparison."""
    st.subheader("Budget vs. Actual")
    comparison = budget_vs_actual(pnl_ledger, budget)

    # Only show categories with a budget or actual spending
    comparison = comparison[
        (comparison["monthly_budget"] > 0) | (comparison["total_actual"] > 0)
    ]

    if comparison.empty:
        st.info("Set budget amounts above to see comparisons.")
        return

    n_months = int(comparison["months"].max()) if not comparison.empty else 1
    st.caption(f"Averages based on {n_months} month(s) of data.")

    # Summary metrics
    total_budget = comparison["monthly_budget"].sum()
    total_avg_actual = comparison["avg_actual"].sum()
    total_diff = total_budget - total_avg_actual

    c1, c2, c3 = st.columns(3)
    c1.metric("Monthly Budget", f"${total_budget:,.2f}")
    c2.metric("Avg Monthly Spending", f"${total_avg_actual:,.2f}")
    c3.metric(
        "Monthly Surplus/Deficit",
        f"${total_diff:,.2f}",
        delta=f"${total_diff:,.2f}",
        delta_color="normal",
    )

    # Per-category bars
    budgeted = comparison[comparison["monthly_budget"] > 0].copy()
    for _, row in budgeted.iterrows():
        pct = min(row["pct_used"], 100) / 100
        over = row["pct_used"] > 100
        label = f"{row['category']}: ${row['avg_actual']:,.0f} / ${row['monthly_budget']:,.0f}"
        if over:
            label += f"  **({row['pct_used']:.0f}% - OVER)**"
        else:
            label += f"  ({row['pct_used']:.0f}%)"
        st.markdown(label)
        st.progress(pct)

    # Full table
    display = comparison[
        ["category", "monthly_budget", "avg_actual", "total_actual", "diff", "pct_used"]
    ].copy()
    display.columns = [
        "Category", "Monthly Budget", "Avg/Month", "Total Actual", "Surplus/Deficit", "% Used"
    ]
    st.dataframe(
        display.style.format({
            "Monthly Budget": "${:,.2f}",
            "Avg/Month": "${:,.2f}",
            "Total Actual": "${:,.2f}",
            "Surplus/Deficit": "${:,.2f}",
            "% Used": "{:.0f}%",
        }),
        use_container_width=True,
        hide_index=True,
    )


def _render_exports(ledger: pd.DataFrame, monthly: pd.DataFrame) -> None:
    """Render CSV export buttons."""
    st.subheader("Export Options")
    st.download_button(
        "Download normalized ledger (CSV)",
        data=ledger.to_csv(index=False).encode("utf-8"),
        file_name="normalized_ledger.csv",
        mime="text/csv",
    )
    monthly_export = monthly[["month_str", "income", "expenses", "net"]].copy()
    monthly_export.columns = ["month", "income", "expenses", "net"]
    st.download_button(
        "Download monthly P&L (CSV)",
        data=monthly_export.to_csv(index=False).encode("utf-8"),
        file_name="monthly_pnl.csv",
        mime="text/csv",
    )


def process_files(uploaded_files) -> Tuple[List[pd.DataFrame], list, object]:
    """Process all uploaded files and return list of ledger DataFrames."""
    categories = load_categories("categories.csv")
    ledgers = []
    progress = st.progress(0, text="Preparing to process files...")
    total_files = len(uploaded_files)

    for idx, uploaded in enumerate(uploaded_files, start=1):
        progress_pct = int((idx - 1) / max(total_files, 1) * 100)
        progress.progress(
            progress_pct, text=f"Reading {uploaded.name} ({idx}/{total_files})..."
        )
        content = uploaded.getvalue()
        file_name = uploaded.name.lower()

        if file_name.endswith(".pdf"):
            ledger = _render_pdf_file(idx, uploaded, content, categories)
            if ledger is None:
                continue
        else:
            df, cols = _render_csv_file(idx, uploaded, content)
            ledger = build_ledger(df=df, **cols)

        ledger["source_file"] = uploaded.name
        ledgers.append(ledger)

    progress.progress(80, text="Categorizing and summarizing transactions...")
    return ledgers, categories, progress


def render_reports(ledger: pd.DataFrame, categories, progress) -> None:
    """Render all report sections."""
    ledger["category"] = ledger["description"].apply(
        lambda d: categorize(d, categories)
    )

    pnl_ledger = ledger[~ledger["category"].isin(TRANSFER_CATEGORIES)].copy()
    transfers_ledger = ledger[ledger["category"].isin(TRANSFER_CATEGORIES)].copy()
    monthly = summarize(pnl_ledger)

    progress.progress(100, text="All done. Reports are ready.")

    tab_pnl, tab_budget = st.tabs(["P&L", "Budget"])

    with tab_pnl:
        _render_yearly_pnl(pnl_ledger)
        _render_monthly_pnl(monthly)
        _render_transfers(transfers_ledger)
        _render_spending_pie(pnl_ledger)
        _render_category_breakdown(ledger)
        _render_transactions(ledger)
        _render_exports(ledger, monthly)

    with tab_budget:
        spending_cats = pnl_ledger[pnl_ledger["amount"] < 0]["category"].unique().tolist()
        budget = _render_budget_editor(spending_cats)
        _render_budget_vs_actual(pnl_ledger, budget)
