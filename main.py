from typing import Optional
from fastapi import FastAPI, Request, Query, Form
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from starlette.middleware.sessions import SessionMiddleware
import pandas as pd
import os

app = FastAPI(title="Restaurant Daily Analytics Portal")

# Add session security
app.add_middleware(SessionMiddleware, secret_key="YOUR_SUPER_SECRET_SESSION_KEY")

# This forces Render to find the exact path to your templates folder
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
templates = Jinja2Templates(directory=os.path.join(BASE_DIR, "templates"))

# Published Google Sheet CSV URL for Main Financial Report
SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTw5dwFgDftzaf9t_AE3O1kfCigoSeiIHYCy9T1HVbkRC0gb43AmuU2U67_oOiIujc046TzlS3NQGbb/pub?gid=161887137&single=true&output=csv"

# Published Google Sheet CSV URL for Brand_Mapping Security Registry
BRAND_MAPPING_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTw5dwFgDftzaf9t_AE3O1kfCigoSeiIHYCy9T1HVbkRC0gb43AmuU2U67_oOiIujc046TzlS3NQGbb/pub?gid=766978685&single=true&output=csv"


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
        "Total GST"
    ]
    for col in numeric_cols:
        if col in df.columns:
            # Ensure commas are removed before converting to numeric
            df[col] = pd.to_numeric(df[col].astype(str).str.replace(',', ''), errors="coerce").fillna(0)

    # Apply CV calculation logic 
    if "GMV" in df.columns and "Total GST" in df.columns:
        df["CV"] = df["GMV"] - df["Total GST"]

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
    # 1. Security Check: Is user logged in?
    if not request.session.get("logged_in"):
        return RedirectResponse(url="/login", status_code=303)

    is_admin = request.session.get("is_admin", False)
    authorized_res_ids = request.session.get("authorized_res_ids", [])

    df = load_data()

    # 2. Apply Data Isolation Filtering for Stakeholders
    if not is_admin:
        # Stakeholders only see rows matching their authorized Restaurant IDs
        df = df[df["Res ID"].astype(str).isin(authorized_res_ids)]

    # Multi-tenant brand isolation
    all_brands = sorted(df["Restaurant Name"].dropna().unique().tolist())
    selected_brand = brand if brand in all_brands else (all_brands[0] if all_brands else "")
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
        request=request,
        name="index.html",
        context={
            "request": request,
            "is_admin": is_admin,
            "all_brands": all_brands,
            "selected_brand": selected_brand,
            "outlets": outlets,
            "selected_outlet": outlet or "",
            "search_res_id": search_res_id or "",
            "total_gmv": f"₹{total_gmv:,.2f}",
            "total_orders": f"{total_orders:,}",
            "avg_aov": f"₹{avg_aov:,.2f}",
            "sales_ads": f"₹{sales_ads:,.2f}",
            "discount_given": f"₹{discount_given:,.2f}",
            "table_data": table_records,
        },
    )


@app.get("/login", response_class=HTMLResponse)
def login_page(request: Request, error: Optional[str] = None):
    # If already logged in, redirect straight to dashboard
    if request.session.get("logged_in"):
        return RedirectResponse(url="/", status_code=303)
    return templates.TemplateResponse(request, "login.html", {"error": error})


@app.post("/login")
def handle_login(request: Request, passkey: str = Form(...)):
    # Master Admin Passkey
    MASTER_ADMIN_KEY = "AnK@2025"
    
    if passkey == MASTER_ADMIN_KEY:
        request.session["logged_in"] = True
        request.session["is_admin"] = True
        request.session["authorized_res_ids"] = []
        return RedirectResponse(url="/", status_code=303)
    
    # Check against Brand_Mapping sheet for stakeholder passkeys
    try:
        brand_df = pd.read_csv(BRAND_MAPPING_CSV_URL)
        
        # Clean column spaces if any
        brand_df.columns = brand_df.columns.str.strip()
        
        # Look for matching passkeys in the 'Passkeys' column
        matched_rows = brand_df[brand_df['Passkeys'].astype(str).str.strip() == passkey.strip()]
        
        if not matched_rows.empty:
            # Extract authorized Res IDs (checking both Swiggy and Zomato columns)
            swiggy_ids = matched_rows['Swiggy Res ID'].dropna().astype(str).tolist()
            zomato_ids = matched_rows['Zomato Res ID'].dropna().astype(str).tolist()
            allowed_ids = swiggy_ids + zomato_ids
            
            request.session["logged_in"] = True
            request.session["is_admin"] = False
            request.session["authorized_res_ids"] = allowed_ids
            return RedirectResponse(url="/", status_code=303)
    except Exception as e:
        print(f"Login lookup error: {e}")
        
    return templates.TemplateResponse(request, "login.html", {"error": "Invalid Passkey. Please try again."})


@app.get("/logout")
def logout(request: Request):
    request.session.clear()
    return RedirectResponse(url="/login", status_code=303)
