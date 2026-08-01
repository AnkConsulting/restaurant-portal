from typing import Optional
from fastapi import FastAPI, Request, Query, Form
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from starlette.middleware.sessions import SessionMiddleware
from fastapi.staticfiles import StaticFiles
import pandas as pd
import os

app = FastAPI(title="Restaurant Daily Analytics Portal")

# Add session security
app.add_middleware(SessionMiddleware, secret_key="YOUR_SUPER_SECRET_SESSION_KEY")

# This forces Render to find the exact path to your templates folder
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
templates = Jinja2Templates(directory=os.path.join(BASE_DIR, "templates"))

# Mount the static directory so the browser can download script.js
app.mount("/static", StaticFiles(directory=os.path.join(BASE_DIR, "static")), name="static")

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

    # Clean numeric columns robustly
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
            # Strip out commas, spaces, and currency symbols safely before converting
            cleaned_series = df[col].astype(str).str.replace(r'[₹, ]', '', regex=True)
            df[col] = pd.to_numeric(cleaned_series, errors="coerce").fillna(0)

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
    platform: Optional[str] = Query(None),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    ajax: Optional[str] = Query(None)
):
    # 1. Security Check
    if not request.session.get("logged_in"):
        return RedirectResponse(url="/login", status_code=303)

    is_admin = request.session.get("is_admin", False)
    authorized_res_ids = request.session.get("authorized_res_ids", [])

    df = load_data()

    # ALWAYS Parse dates safely at the top level with dayfirst=True
    if "Report Period" in df.columns:
        df["_temp_date"] = pd.to_datetime(df["Report Period"], dayfirst=True, format="mixed", errors="coerce")

    # 2. Data Isolation Filtering
    if not is_admin:
        df = df[df["Res ID"].astype(str).isin(authorized_res_ids)]

    # 3. Date Range Filtering
    if start_date and end_date and "_temp_date" in df.columns:
        start = pd.to_datetime(start_date, errors="coerce")
        end = pd.to_datetime(end_date, errors="coerce")
        if pd.notnull(start) and pd.notnull(end):
            df = df[(df["_temp_date"] >= start) & (df["_temp_date"] <= end)]

    # Multi-tenant brand isolation
    all_brands = sorted(df["Restaurant Name"].dropna().unique().tolist())
    selected_brand = brand if brand in all_brands else (all_brands[0] if all_brands else "")
    filtered_df = df[df["Restaurant Name"] == selected_brand]

    # Outlet filter
    outlets = sorted(filtered_df["Location"].dropna().unique().tolist())
    if outlet and outlet in outlets:
        filtered_df = filtered_df[filtered_df["Location"] == outlet]

    # Platform filter
    platforms = sorted(filtered_df["Platform"].dropna().unique().tolist())
    if platform and platform in platforms:
        filtered_df = filtered_df[filtered_df["Platform"] == platform]

    # Top-level KPIs
    total_gmv = filtered_df["GMV"].sum() if "GMV" in filtered_df.columns else 0.0
    total_orders = int(filtered_df["Delivered orders"].sum()) if "Delivered orders" in filtered_df.columns else 0
    avg_aov = (total_gmv / total_orders) if total_orders > 0 else 0.0
    sales_ads = filtered_df["Sales from Ads"].sum() if "Sales from Ads" in filtered_df.columns else 0.0
    discount_given = filtered_df["Discount given"].sum() if "Discount given" in filtered_df.columns else 0.0

    # Chart Data Aggregation
    if "Platform" in filtered_df.columns and "Delivered orders" in filtered_df.columns:
        platform_orders = filtered_df.groupby("Platform")["Delivered orders"].sum().to_dict()
    else:
        platform_orders = {}

    trend_labels = []
    trend_values = []
    if "_temp_date" in filtered_df.columns and "Sales" in filtered_df.columns:
        # Group by true parsed date to ensure perfect chronological sorting
        trend_df = filtered_df.groupby("_temp_date")["Sales"].sum().reset_index()
        trend_df = trend_df.sort_values("_temp_date")
        
        trend_labels = trend_df["_temp_date"].dt.strftime('%d-%m-%Y').tolist()
        trend_values = trend_df["Sales"].tolist()

    chart_data = {
        "platform_donut": platform_orders,
        "trend_labels": trend_labels,
        "trend_values": trend_values
    }

    # Clean up _temp_date before passing to frontend table
    if "_temp_date" in filtered_df.columns:
        filtered_df = filtered_df.drop(columns=["_temp_date"])
        
    table_records = filtered_df.to_dict(orient="records")

    # 4. JSON Response for Seamless Async Refresh
    if ajax == "1":
        formatted_table_data = []
        for row in table_records:
            formatted_table_data.append({
                "Restaurant Name": str(row.get('Restaurant Name', '')),
                "Report Period": str(row.get('Report Period', '')),
                "Location": str(row.get('Location', '')),
                "Res ID": str(row.get('Res ID', '')),
                "Platform": str(row.get('Platform', '')),
                "Delivered orders": f"{int(row.get('Delivered orders', 0)):,}",
                "Sales": f"₹{row.get('Sales', 0):,.2f}",
                "GMV": f"₹{row.get('GMV', 0):,.2f}",
                "Sales from Ads": f"₹{row.get('Sales from Ads', 0):,.2f}",
                "Discount given": f"₹{row.get('Discount given', 0):,.2f}"
            })
            
        return JSONResponse(content={
            "total_gmv": f"₹{total_gmv:,.2f}",
            "total_orders": f"{total_orders:,}",
            "avg_aov": f"₹{avg_aov:,.2f}",
            "sales_ads": f"₹{sales_ads:,.2f}",
            "discount_given": f"₹{discount_given:,.2f}",
            "outlets": outlets,
            "platforms": platforms,
            "table_data": formatted_table_data,
            "chart_data": chart_data
        })

    # Standard HTML Response (Initial Page Load)
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
            "platforms": platforms,
            "selected_platform": platform or "",
            "start_date": start_date or "",
            "end_date": end_date or "",
            "total_gmv": f"₹{total_gmv:,.2f}",
            "total_orders": f"{total_orders:,}",
            "avg_aov": f"₹{avg_aov:,.2f}",
            "sales_ads": f"₹{sales_ads:,.2f}",
            "discount_given": f"₹{discount_given:,.2f}",
            "table_data": table_records,
            "chart_data": chart_data
        },
    )


@app.get("/login", response_class=HTMLResponse)
def login_page(request: Request, error: Optional[str] = None):
    if request.session.get("logged_in"):
        return RedirectResponse(url="/", status_code=303)
    return templates.TemplateResponse(request, "login.html", {"error": error})


@app.post("/login")
def handle_login(request: Request, passkey: str = Form(...)):
    MASTER_ADMIN_KEY = "AnK@2025"
    
    if passkey == MASTER_ADMIN_KEY:
        request.session["logged_in"] = True
        request.session["is_admin"] = True
        request.session["authorized_res_ids"] = []
        return RedirectResponse(url="/", status_code=303)
    
    try:
        brand_df = pd.read_csv(BRAND_MAPPING_CSV_URL)
        brand_df.columns = brand_df.columns.str.strip()
        matched_rows = brand_df[brand_df['Passkeys'].astype(str).str.strip() == passkey.strip()]
        
        if not matched_rows.empty:
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
