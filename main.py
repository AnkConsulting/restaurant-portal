from typing import Optional
from fastapi import FastAPI, Request, Query
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
import pandas as pd
import os

app = FastAPI(title="Restaurant Daily Analytics Portal")

# This forces Render to find the exact path to your templates folder
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
templates = Jinja2Templates(directory=os.path.join(BASE_DIR, "templates"))

# Paste your Published Google Sheet CSV URL here
https://docs.google.com/spreadsheets/d/e/2PACX-1vTw5dwFgDftzaf9t_AE3O1kfCigoSeiIHYCy9T1HVbkRC0gb43AmuU2U67_oOiIujc046TzlS3NQGbb/pub?gid=161887137&single=true&output=csv


def load_data():
    """Fetches live data directly from the published Google Sheet CSV link."""
    try:
        df = pd.read_csv(SHEET_CSV_URL)
    except Exception:
        # Fallback empty dataframe if URL is not yet connected
        return pd.DataFrame(
            columns=[
                "Restaurant Name",
                "Report Period",
                "Location",
                "Res ID",
                "Platform",
                "Delivered orders",
                "Sales",
                "GMV",
                "Sales from Ads",
                "Discount given",
            ]
        )

    # Clean numeric columns
    numeric_cols = [
        "Delivered orders",
        "Sales",
        "GMV",
        "Sales from Ads",
        "Discount given",
    ]
    for col in numeric_cols:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0)

    # Strict Leading Column Enforcement
    leading_cols = ["Restaurant Name", "Report Period", "Location", "Res ID"]
    other_cols = [c for c in df.columns if c not in leading_cols]
    ordered_cols = [c for c in leading_cols if c in df.columns] + [
        c for c in other_cols if c in df.columns
    ]

    return df[ordered_cols]


@app.get("/", response_class=HTMLResponse)
async def render_dashboard(
    request: Request,
    brand: Optional[str] = Query(None),
    outlet: Optional[str] = Query(None),
    search_res_id: Optional[str] = Query(None),
):
    df = load_data()

    # Multi-tenant brand isolation
    brands = sorted(df["Restaurant Name"].dropna().unique().tolist())
    selected_brand = brand if brand in brands else (brands[0] if brands else "")
    filtered_df = df[df["Restaurant Name"] == selected_brand]

    # Outlet filter
    outlets = sorted(filtered_df["Location"].dropna().unique().tolist())
    if outlet and outlet in outlets:
        filtered_df = filtered_df[filtered_df["Location"] == outlet]

    # Search filter
    if search_res_id:
        filtered_df = filtered_df[
            filtered_df["Res ID"]
            .astype(str)
            .str.contains(search_res_id, case=False)
        ]

    # Top-level KPIs
    total_gmv = (
        filtered_df["GMV"].sum() if "GMV" in filtered_df.columns else 0.0
    )
    total_orders = (
        int(filtered_df["Delivered orders"].sum())
        if "Delivered orders" in filtered_df.columns
        else 0
    )
    avg_aov = (total_gmv / total_orders) if total_orders > 0 else 0.0
    sales_ads = (
        filtered_df["Sales from Ads"].sum()
        if "Sales from Ads" in filtered_df.columns
        else 0.0
    )
    discount_given = (
        filtered_df["Discount given"].sum()
        if "Discount given" in filtered_df.columns
        else 0.0
    )

    table_records = filtered_df.to_dict(orient="records")

    return templates.TemplateResponse(
        "index.html",
        {
            "request": request,
            "brands": brands,
            "selected_brand": selected_brand,
            "outlets": outlets,
            "selected_outlet": outlet or "All Outlets",
            "search_res_id": search_res_id or "",
            "total_gmv": f"₹{total_gmv:,.2f}",
            "total_orders": f"{total_orders:,}",
            "avg_aov": f"₹{avg_aov:,.2f}",
            "sales_ads": f"₹{sales_ads:,.2f}",
            "discount_given": f"₹{discount_given:,.2f}",
            "table_data": table_records,
        },
    )
