from typing import Optional
from fastapi import FastAPI, Request, Query, Form
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse, Response
from fastapi.templating import Jinja2Templates
from starlette.middleware.sessions import SessionMiddleware
from fastapi.staticfiles import StaticFiles
import pandas as pd
import os

app = FastAPI(title="Restaurant Daily Analytics Portal")
app.add_middleware(SessionMiddleware, secret_key="YOUR_SUPER_SECRET_SESSION_KEY")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
templates = Jinja2Templates(directory=os.path.join(BASE_DIR, "templates"))
app.mount("/static", StaticFiles(directory=os.path.join(BASE_DIR, "static")), name="static")

SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTw5dwFgDftzaf9t_AE3O1kfCigoSeiIHYCy9T1HVbkRC0gb43AmuU2U67_oOiIujc046TzlS3NQGbb/pub?gid=161887137&single=true&output=csv"
BRAND_MAPPING_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTw5dwFgDftzaf9t_AE3O1kfCigoSeiIHYCy9T1HVbkRC0gb43AmuU2U67_oOiIujc046TzlS3NQGbb/pub?gid=766978685&single=true&output=csv"
INACTIVE_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTw5dwFgDftzaf9t_AE3O1kfCigoSeiIHYCy9T1HVbkRC0gb43AmuU2U67_oOiIujc046TzlS3NQGbb/pub?gid=920943544&single=true&output=csv"


def format_indian_currency(val):
    try:
        val = float(val)
    except (TypeError, ValueError):
        val = 0.0
    parts = f"{val:.2f}".split(".")
    integer_part = parts[0]
    decimal_part = parts[1]
    last_three = integer_part[-3:]
    other_digits = integer_part[:-3]
    if other_digits:
        other_digits = ",".join([other_digits[max(0, i-2):i] for i in range(len(other_digits), 0, -2)][::-1])
        res = other_digits + "," + last_three
    else:
        res = last_three
    return f"₹{res}.{decimal_part}"


def format_indian_integer(val):
    try:
        val = int(float(val))
    except (TypeError, ValueError):
        val = 0
    integer_part = str(val)
    last_three = integer_part[-3:]
    other_digits = integer_part[:-3]
    if other_digits:
        other_digits = ",".join([other_digits[max(0, i-2):i] for i in range(len(other_digits), 0, -2)][::-1])
        res = other_digits + "," + last_three
    else:
        res = last_three
    return res


def load_data():
    try:
        df = pd.read_csv(SHEET_CSV_URL)
        df.columns = df.columns.str.strip()
        
        if "Unique Dropdown Key" in df.columns:
            df = df.drop(columns=["Unique Dropdown Key"])
            
        if "Res ID" in df.columns:
            df["Res ID"] = df["Res ID"].dropna().astype(str).str.split('.').str[0].str.strip()

        try:
            inactive_df = pd.read_csv(INACTIVE_CSV_URL)
            inactive_df.columns = inactive_df.columns.str.strip()
            
            inactive_swiggy = inactive_df["Swiggy Res ID"].dropna().astype(str).str.split('.').str[0].str.strip().tolist()
            inactive_zomato = inactive_df["Zomato Res ID"].dropna().astype(str).str.split('.').str[0].str.strip().tolist()
            inactive_ids = set(inactive_swiggy + inactive_zomato)
            
            if "Res ID" in df.columns:
                df = df[~df["Res ID"].isin(inactive_ids)]
        except Exception as e:
            print(f"Could not load inactive restaurants sheet: {e}")
            
    except Exception:
        return pd.DataFrame(
            columns=[
                "Restaurant Name", "Report Period", "Location", "Res ID",
                "Platform", "Delivered orders", "Sales", "GMV", "Sales from Ads", "Discount given"
            ]
        )

    numeric_cols = [
        "Delivered orders", "Delivered Orders", "Sales", "GMV", 
        "Sales from Ads", "Discount given", "Discount Given", "Total GST"
    ]
    for col in numeric_cols:
        if col in df.columns:
            cleaned_series = df[col].astype(str).str.replace(r'[₹, ]', '', regex=True)
            df[col] = pd.to_numeric(cleaned_series, errors="coerce").fillna(0)

    if "Delivered Orders" in df.columns and "Delivered orders" not in df.columns:
        df["Delivered orders"] = df["Delivered Orders"]
    if "Discount Given" in df.columns and "Discount given" not in df.columns:
        df["Discount given"] = df["Discount Given"]

    if "GMV" in df.columns and "Total GST" in df.columns:
        df["CV"] = df["GMV"] - df["Total GST"]

    leading_cols = ["Restaurant Name", "Report Period", "Location", "Res ID"]
    other_cols = [c for c in df.columns if c not in leading_cols]
    ordered_cols = [c for c in leading_cols if c in df.columns] + [c for c in other_cols if c in df.columns]

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
    if not request.session.get("logged_in"):
        return RedirectResponse(url="/login", status_code=303)

    is_admin = request.session.get("is_admin", False)
    authorized_res_ids = request.session.get("authorized_res_ids", [])

    df = load_data()

    if "Report Period" in df.columns:
        df["_temp_date"] = pd.to_datetime(df["Report Period"], dayfirst=True, format="mixed", errors="coerce")

    if not is_admin:
        df = df[df["Res ID"].astype(str).isin(authorized_res_ids)]

    all_brands = sorted(df["Restaurant Name"].dropna().unique().tolist())
    selected_brand = brand if brand in all_brands else ""
    
    if selected_brand:
        context_df = df[df["Restaurant Name"] == selected_brand]
    else:
        context_df = df

    outlets = sorted(context_df["Location"].dropna().unique().tolist())
    if outlet and outlet in outlets:
        context_df = context_df[context_df["Location"] == outlet]

    platforms = sorted(context_df["Platform"].dropna().unique().tolist())
    if platform and platform in platforms:
        context_df = context_df[context_df["Platform"] == platform]

    max_available_date = ""
    if "_temp_date" in context_df.columns and not context_df["_temp_date"].dropna().empty:
        max_date_obj = context_df["_temp_date"].max()
        if pd.notnull(max_date_obj):
            max_available_date = max_date_obj.strftime("%Y-%m-%d")

    if not start_date or not end_date:
        if max_available_date:
            start_date = max_available_date
            end_date = max_available_date

    filtered_df = context_df.copy()
    start_dt = pd.to_datetime(start_date, errors="coerce")
    end_dt = pd.to_datetime(end_date, errors="coerce")

    if pd.notnull(start_dt) and pd.notnull(end_dt):
        if end_date > max_available_date:
            end_date = max_available_date
            end_dt = pd.to_datetime(end_date, errors="coerce")

        current_filtered = filtered_df[(filtered_df["_temp_date"] >= start_dt) & (filtered_df["_temp_date"] <= end_dt)]
        
        # MoM Comparison Window
        prev_start = start_dt - pd.DateOffset(months=1)
        prev_end = end_dt - pd.DateOffset(months=1)
        prev_filtered = filtered_df[(filtered_df["_temp_date"] >= prev_start) & (filtered_df["_temp_date"] <= prev_end)]
    else:
        current_filtered = filtered_df
        prev_filtered = pd.DataFrame(columns=filtered_df.columns)

    # Core Metrics Calculations & Rounded Scorecard Strings
    total_gmv = float(current_filtered["GMV"].sum()) if "GMV" in current_filtered.columns else 0.0
    formatted_total_gmv = f"₹{format_indian_integer(round(total_gmv))}"

    total_orders = int(current_filtered["Delivered orders"].sum()) if "Delivered orders" in current_filtered.columns else 0
    formatted_total_orders = format_indian_integer(total_orders)

    avg_aov = float(total_gmv / total_orders) if total_orders > 0 else 0.0
    formatted_avg_aov = f"₹{format_indian_integer(round(avg_aov))}"

    sales_ads = float(current_filtered["Sales from Ads"].sum()) if "Sales from Ads" in current_filtered.columns else 0.0
    formatted_sales_ads = f"₹{format_indian_integer(round(sales_ads))}"

    discount_given = float(current_filtered["Discount given"].sum()) if "Discount given" in current_filtered.columns else 0.0
    formatted_discount_given = f"₹{format_indian_integer(round(discount_given))}"

    prev_total_gmv = float(prev_filtered["GMV"].sum()) if "GMV" in prev_filtered.columns else 0.0
    prev_total_orders = int(prev_filtered["Delivered orders"].sum()) if "Delivered orders" in prev_filtered.columns else 0
    prev_avg_aov = float(prev_total_gmv / prev_total_orders) if prev_total_orders > 0 else 0.0
    prev_sales_ads = float(prev_filtered["Sales from Ads"].sum()) if "Sales from Ads" in prev_filtered.columns else 0.0
    prev_discount_given = float(prev_filtered["Discount given"].sum()) if "Discount given" in prev_filtered.columns else 0.0

    # Efficiency Analytics
    discount_impact_val = (discount_given / total_gmv * 100) if total_gmv > 0 else 0.0
    discount_impact_str = f"{discount_impact_val:.1f}%"

    ad_spend = float(current_filtered["Ad Spend"].sum()) if "Ad Spend" in current_filtered.columns else 0.0
    ad_roi_str = f"₹{(total_gmv / ad_spend):.1f}" if ad_spend > 0 else "N/A"

    platform_aov_dict = {}
    if "Platform" in current_filtered.columns:
        for p in platforms:
            p_df = current_filtered[current_filtered["Platform"] == p]
            p_gmv = float(p_df["GMV"].sum()) if "GMV" in p_df.columns else 0.0
            p_orders = int(p_df["Delivered orders"].sum()) if "Delivered orders" in p_df.columns else 0
            platform_aov_dict[p] = float(p_gmv / p_orders) if p_orders > 0 else 0.0

    platform_orders, platform_gmv, platform_sales, platform_ads, platform_discount = {}, {}, {}, {}, {}
    if "Platform" in current_filtered.columns:
        if "Delivered orders" in current_filtered.columns:
            platform_orders = {k: int(v) for k, v in current_filtered.groupby("Platform")["Delivered orders"].sum().to_dict().items()}
        if "GMV" in current_filtered.columns:
            platform_gmv = {k: float(v) for k, v in current_filtered.groupby("Platform")["GMV"].sum().to_dict().items()}
        if "Sales" in current_filtered.columns:
            platform_sales = {k: float(v) for k, v in current_filtered.groupby("Platform")["Sales"].sum().to_dict().items()}
        if "Sales from Ads" in current_filtered.columns:
            platform_ads = {k: float(v) for k, v in current_filtered.groupby("Platform")["Sales from Ads"].sum().to_dict().items()}
        if "Discount given" in current_filtered.columns:
            platform_discount = {k: float(v) for k, v in current_filtered.groupby("Platform")["Discount given"].sum().to_dict().items()}

    # MoM Trend Alignment Engine
    trend_labels, prev_trend_labels = [], []
    sales_trend, gmv_trend, orders_trend, ads_trend, discount_trend = [], [], [], [], []
    prev_sales_trend, prev_gmv_trend, prev_orders_trend, prev_ads_trend, prev_discount_trend = [], [], [], [], []

    if "_temp_date" in current_filtered.columns and not current_filtered.empty:
        agg_dict = {col: "sum" for col in ["Sales", "GMV", "Delivered orders", "Sales from Ads", "Discount given"] if col in current_filtered.columns}
        if agg_dict:
            trend_df = current_filtered.groupby("_temp_date").agg(agg_dict).reset_index().sort_values("_temp_date")
            
            prev_agg_df = pd.DataFrame()
            if not prev_filtered.empty:
                prev_agg_df = prev_filtered.groupby("_temp_date").agg(agg_dict).reset_index()
                
            for _, row in trend_df.iterrows():
                curr_date = row["_temp_date"]
                trend_labels.append(curr_date.strftime('%d-%m-%Y'))
                
                sales_trend.append(float(row.get("Sales", 0)))
                gmv_trend.append(float(row.get("GMV", 0)))
                orders_trend.append(int(row.get("Delivered orders", 0)))
                ads_trend.append(float(row.get("Sales from Ads", 0)))
                discount_trend.append(float(row.get("Discount given", 0)))
                
                prior_date = curr_date - pd.DateOffset(months=1)
                prev_trend_labels.append(prior_date.strftime('%d-%m-%Y'))
                
                matched = False
                if not prev_agg_df.empty:
                    prior_row = prev_agg_df[prev_agg_df["_temp_date"] == prior_date]
                    if not prior_row.empty:
                        matched = True
                        prev_sales_trend.append(float(prior_row.iloc[0].get("Sales", 0)))
                        prev_gmv_trend.append(float(prior_row.iloc[0].get("GMV", 0)))
                        prev_orders_trend.append(int(prior_row.iloc[0].get("Delivered orders", 0)))
                        prev_ads_trend.append(float(prior_row.iloc[0].get("Sales from Ads", 0)))
                        prev_discount_trend.append(float(prior_row.iloc[0].get("Discount given", 0)))
                
                if not matched:
                    prev_sales_trend.append(None)
                    prev_gmv_trend.append(None)
                    prev_orders_trend.append(None)
                    prev_ads_trend.append(None)
                    prev_discount_trend.append(None)

    chart_data = {
        "platform_orders": platform_orders,
        "platform_gmv": platform_gmv,
        "platform_sales": platform_sales,
        "platform_ads": platform_ads,
        "platform_discount": platform_discount,
        "trend_labels": trend_labels,
        "sales_trend": sales_trend,
        "gmv_trend": gmv_trend,
        "orders_trend": orders_trend,
        "ads_trend": ads_trend,
        "discount_trend": discount_trend,
        "prev_trend_labels": prev_trend_labels,
        "prev_sales_trend": prev_sales_trend,
        "prev_gmv_trend": prev_gmv_trend,
        "prev_orders_trend": prev_orders_trend,
        "prev_ads_trend": prev_ads_trend,
        "prev_discount_trend": prev_discount_trend
    }

    if "_temp_date" in current_filtered.columns:
        current_filtered = current_filtered.drop(columns=["_temp_date"])
        
    table_records = current_filtered.to_dict(orient="records")

    if ajax == "1":
        formatted_table_data = []
        for row in table_records:
            formatted_table_data.append({
                "Restaurant Name": str(row.get('Restaurant Name', '')),
                "Report Period": str(row.get('Report Period', '')),
                "Location": str(row.get('Location', '')),
                "Res ID": str(row.get('Res ID', '')),
                "Platform": str(row.get('Platform', '')),
                "Delivered orders": format_indian_integer(row.get('Delivered orders', 0)),
                "Sales": format_indian_currency(row.get('Sales', 0)),
                "GMV": format_indian_currency(row.get('GMV', 0)),
                "Sales from Ads": format_indian_currency(row.get('Sales from Ads', 0)),
                "Discount given": format_indian_currency(row.get('Discount given', 0))
            })
            
        return JSONResponse(content={
            "max_available_date": max_available_date,
            "total_gmv": formatted_total_gmv,
            "raw_total_gmv": total_gmv,
            "raw_prev_total_gmv": prev_total_gmv,
            "total_orders": formatted_total_orders,
            "raw_total_orders": total_orders,
            "raw_prev_total_orders": prev_total_orders,
            "avg_aov": formatted_avg_aov,
            "raw_avg_aov": avg_aov,
            "raw_prev_avg_aov": prev_avg_aov,
            "sales_ads": formatted_sales_ads,
            "raw_sales_ads": sales_ads,
            "raw_prev_sales_ads": prev_sales_ads,
            "discount_given": formatted_discount_given,
            "raw_discount_given": discount_given,
            "raw_prev_discount_given": prev_discount_given,
            "ad_roi": ad_roi_str,
            "discount_impact": discount_impact_str,
            "platform_aov": platform_aov_dict,
            "outlets": outlets,
            "platforms": platforms,
            "table_data": formatted_table_data,
            "chart_data": chart_data
        })

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
            "max_available_date": max_available_date,
            
            "total_gmv": formatted_total_gmv,
            "total_orders": formatted_total_orders,
            "avg_aov": formatted_avg_aov,
            "sales_ads": formatted_sales_ads,
            "discount_given": formatted_discount_given,
            
            "raw_total_gmv": total_gmv,
            "raw_prev_total_gmv": prev_total_gmv,
            "raw_total_orders": total_orders,
            "raw_prev_total_orders": prev_total_orders,
            "raw_avg_aov": avg_aov,
            "raw_prev_avg_aov": prev_avg_aov,
            "raw_sales_ads": sales_ads,
            "raw_prev_sales_ads": prev_sales_ads,
            "raw_discount_given": discount_given,
            "raw_prev_discount_given": prev_discount_given,

            "ad_roi": ad_roi_str,
            "discount_impact": discount_impact_str,
            "platform_aov": platform_aov_dict,

            "table_data": table_records,
            "chart_data": chart_data
        },
    )


@app.get("/swiggy-insights", response_class=HTMLResponse)
async def swiggy_insights(
    request: Request,
    brand: Optional[str] = Query(None),
    outlet: Optional[str] = Query(None),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None)
):
    if not request.session.get("logged_in"):
        return RedirectResponse(url="/login", status_code=303)

    is_admin = request.session.get("is_admin", False)
    authorized_res_ids = request.session.get("authorized_res_ids", [])

    df = load_data()
    
    if "Platform" in df.columns:
        df = df[df["Platform"].astype(str).str.strip().str.lower() == "swiggy"]

    if "Report Period" in df.columns:
        df["_temp_date"] = pd.to_datetime(df["Report Period"], dayfirst=True, format="mixed", errors="coerce")

    if not is_admin:
        df = df[df["Res ID"].astype(str).isin(authorized_res_ids)]

    all_brands = sorted(df["Restaurant Name"].dropna().unique().tolist())
    selected_brand = brand if brand in all_brands else ""
    
    context_df = df[df["Restaurant Name"] == selected_brand] if selected_brand else df

    outlets = sorted(context_df["Location"].dropna().unique().tolist())
    selected_outlet = outlet if outlet in outlets else ""
    if selected_outlet:
        context_df = context_df[context_df["Location"] == selected_outlet]

    max_available_date = ""
    if "_temp_date" in context_df.columns and not context_df["_temp_date"].dropna().empty:
        max_date_obj = context_df["_temp_date"].max()
        if pd.notnull(max_date_obj):
            max_available_date = max_date_obj.strftime("%Y-%m-%d")

    if not start_date or not end_date:
        if max_available_date:
            start_date = max_available_date
            end_date = max_available_date

    filtered_df = context_df.copy()
    start_dt = pd.to_datetime(start_date, errors="coerce")
    end_dt = pd.to_datetime(end_date, errors="coerce")

    if pd.notnull(start_dt) and pd.notnull(end_dt):
        if end_date > max_available_date:
            end_date = max_available_date
            end_dt = pd.to_datetime(end_date, errors="coerce")
        filtered_df = filtered_df[(filtered_df["_temp_date"] >= start_dt) & (filtered_df["_temp_date"] <= end_dt)]

    total_gmv = float(filtered_df["GMV"].sum()) if "GMV" in filtered_df.columns else 0.0
    total_orders = int(filtered_df["Delivered orders"].sum()) if "Delivered orders" in filtered_df.columns else 0
    avg_aov = float(total_gmv / total_orders) if total_orders > 0 else 0.0
    sales_ads = float(filtered_df["Sales from Ads"].sum()) if "Sales from Ads" in filtered_df.columns else 0.0
    discount_given = float(filtered_df["Discount given"].sum()) if "Discount given" in filtered_df.columns else 0.0

    if "_temp_date" in filtered_df.columns:
        filtered_df = filtered_df.drop(columns=["_temp_date"])
        
    table_records = filtered_df.to_dict(orient="records")

    return templates.TemplateResponse(
        request=request,
        name="swiggy_insights.html",
        context={
            "request": request,
            "is_admin": is_admin,
            "all_brands": all_brands,
            "selected_brand": selected_brand,
            "outlets": outlets,
            "selected_outlet": selected_outlet,
            "start_date": start_date or "",
            "end_date": end_date or "",
            "max_available_date": max_available_date,
            "total_gmv": format_indian_currency(total_gmv),
            "total_orders": format_indian_integer(total_orders),
            "avg_aov": f"₹{format_indian_integer(round(avg_aov))}",
            "sales_ads": format_indian_currency(sales_ads),
            "discount_given": format_indian_currency(discount_given),
            "table_data": table_records
        }
    )


@app.get("/zomato-insights", response_class=HTMLResponse)
async def zomato_insights(request: Request):
    if not request.session.get("logged_in"):
        return RedirectResponse(url="/login", status_code=303)
    return HTMLResponse("""
        <html class='bg-[#f7f9fb] font-sans'>
            <body class='p-10 flex flex-col items-center justify-center min-h-screen text-center'>
                <h1 class='text-4xl font-bold text-[#E23744] mb-4'>Zomato Insights</h1>
                <p class='text-gray-600 mb-8'>This advanced funnel module is currently under construction (Phase 4).</p>
                <a href='/' class='bg-[#004ac6] text-white px-6 py-2 rounded-lg no-underline font-medium hover:bg-blue-700 transition'>Return to Dashboard</a>
            </body>
        </html>
    """)


@app.get("/export")
def export_csv(
    request: Request,
    brand: Optional[str] = Query(None),
    outlet: Optional[str] = Query(None),
    platform: Optional[str] = Query(None),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None)
):
    if not request.session.get("logged_in"):
        return RedirectResponse(url="/login", status_code=303)

    is_admin = request.session.get("is_admin", False)
    authorized_res_ids = request.session.get("authorized_res_ids", [])

    df = load_data()
    if "Report Period" in df.columns:
        df["_temp_date"] = pd.to_datetime(df["Report Period"], dayfirst=True, format="mixed", errors="coerce")

    if not is_admin:
        df = df[df["Res ID"].astype(str).isin(authorized_res_ids)]

    all_brands = sorted(df["Restaurant Name"].dropna().unique().tolist())
    selected_brand = brand if brand in all_brands else ""
    if selected_brand:
        context_df = df[df["Restaurant Name"] == selected_brand]
    else:
        context_df = df

    if outlet:
        context_df = context_df[context_df["Location"] == outlet]

    if platform:
        context_df = context_df[context_df["Platform"] == platform]

    max_available_date = ""
    if "_temp_date" in context_df.columns and not context_df["_temp_date"].dropna().empty:
        max_date_obj = context_df["_temp_date"].max()
        if pd.notnull(max_date_obj):
            max_available_date = max_date_obj.strftime("%Y-%m-%d")

    if not start_date or not end_date:
        if max_available_date:
            start_date = max_available_date
            end_date = max_available_date

    filtered_df = context_df.copy()
    start_dt = pd.to_datetime(start_date, errors="coerce")
    end_dt = pd.to_datetime(end_date, errors="coerce")

    if pd.notnull(start_dt) and pd.notnull(end_dt):
        if end_date > max_available_date:
            end_date = max_available_date
            end_dt = pd.to_datetime(end_date, errors="coerce")
        filtered_df = filtered_df[(filtered_df["_temp_date"] >= start_dt) & (filtered_df["_temp_date"] <= end_dt)]

    if "_temp_date" in filtered_df.columns:
        filtered_df = filtered_df.drop(columns=["_temp_date"])

    csv_data = filtered_df.to_csv(index=False)
    
    file_prefix = selected_brand.replace(" ", "_") if selected_brand else "All_Brands"
    filename = f"RDA_Export_{file_prefix}_{start_date}_to_{end_date}.csv"

    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
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
            swiggy_ids = matched_rows['Swiggy Res ID'].dropna().astype(str).str.split('.').str[0].str.strip().tolist()
            zomato_ids = matched_rows['Zomato Res ID'].dropna().astype(str).str.split('.').str[0].str.strip().tolist()
            allowed_ids = swiggy_ids + zomato_ids
            
            request.session["logged_in"] = True
            request.session["is_admin"] = False
            request.session["authorized_res_ids"] = allowed_ids
            return RedirectResponse(url="/", status_code=303)
    except Exception as e:
        print(f"Login error: {e}")
    return templates.TemplateResponse(request, "login.html", {"error": "Invalid Passkey."})


@app.get("/logout")
def logout(request: Request):
    request.session.clear()
    return RedirectResponse(url="/login", status_code=303)
