from typing import Optional
from fastapi import APIRouter, Request, Query
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
import pandas as pd
import os
from datetime import timedelta

router = APIRouter()

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
templates = Jinja2Templates(directory=os.path.join(BASE_DIR, "templates"))

# Official Swiggy Master CSV Link
# (Replace this with your actual Swiggy CSV URL if different)
SWIGGY_INSIGHTS_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1v.../pub?output=csv" 

def format_indian_currency(val):
    try:
        val = float(val)
    except (TypeError, ValueError):
        val = 0.0
    parts = f"{val:.2f}".split(".")
    integer_part = parts[0]
    decimal_part = parts[1] if len(parts) > 1 else "00"
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

# PHASE 2: Python Date Math Logic
def get_comparison_date_range(start_dt, end_dt, compare_mode):
    if pd.isnull(start_dt) or pd.isnull(end_dt):
        return None, None
        
    days_diff = (end_dt - start_dt).days + 1
    
    if compare_mode == "prev_period":
        comp_end = start_dt - timedelta(days=1)
        comp_start = comp_end - timedelta(days=days_diff - 1)
    elif compare_mode == "prev_week":
        comp_start = start_dt - timedelta(days=7)
        comp_end = end_dt - timedelta(days=7)
    elif compare_mode == "prev_month":
        comp_start = start_dt - pd.DateOffset(months=1)
        comp_end = end_dt - pd.DateOffset(months=1)
    elif compare_mode == "prev_year":
        comp_start = start_dt - pd.DateOffset(years=1)
        comp_end = end_dt - pd.DateOffset(years=1)
    else:
        return None, None
        
    return comp_start, comp_end

# PHASE 3: Percentage & Delta Calculator
def calculate_growth(current_val, baseline_val):
    if not baseline_val or baseline_val == 0:
        return {"pct": 0.0, "diff": current_val, "is_positive": True, "show": False}
    
    diff = current_val - baseline_val
    pct = (diff / baseline_val) * 100
    
    return {
        "pct": round(pct, 1),
        "diff": diff,
        "is_positive": diff >= 0,
        "show": True
    }

def load_swiggy_insights_data():
    try:
        # Load the CSV
        df = pd.read_csv(SWIGGY_INSIGHTS_CSV_URL)
        df.columns = df.columns.str.strip()
        
        # Clean text columns
        if "Restaurant Name" in df.columns:
            df["Restaurant Name"] = df["Restaurant Name"].astype(str).str.strip()
        if "Location" in df.columns:
            df["Location"] = df["Location"].astype(str).str.strip()
        if "Res ID" in df.columns:
            df["Res ID"] = df["Res ID"].dropna().astype(str).str.split('.').str[0].str.strip()
            
        # Clean numeric columns
        numeric_cols = [
            "Orders", "GMV", "Total GST collected from customers", "Pre discounted AOV", "Online %", "Kitchen Prep Time",
            "Impressions", "Impressions to Menu", "Menu Opens", "M2C", "C2O",
            "New Customer Order %", "Repeat Customer Order %", "Total Complaints",
            "Average Rating", "Ad Sales", "Ad Spend", "Ads ROI", "Discount Given"
        ]
        for col in numeric_cols:
            if col in df.columns:
                cleaned_series = df[col].astype(str).str.replace(r'[₹, %]', '', regex=True)
                df[col] = pd.to_numeric(cleaned_series, errors="coerce").fillna(0)

        # Enforce exact calculation for Comm Value (CV)
        if "GMV" in df.columns and "Total GST collected from customers" in df.columns:
            df["CV"] = df["GMV"] - df["Total GST collected from customers"]
        else:
            df["CV"] = 0.0

        # Rearrange to the strictly mandated 4-column format
        cols = df.columns.tolist()
        
        # Standardize Date column for the mandated layout
        if "Report Date" in cols and "Report Period" not in cols:
            df.rename(columns={"Report Date": "Report Period"}, inplace=True)
            cols = df.columns.tolist()

        priority_cols = ["Restaurant Name", "Report Period", "Location", "Res ID"]
        existing_priority = [c for c in priority_cols if c in cols]
        
        for c in existing_priority:
            cols.remove(c)
            
        final_cols = existing_priority + cols
        df = df[final_cols]

        return df
    except Exception as e:
        print(f"Could not load Swiggy Insights master sheet: {e}")
        return pd.DataFrame()

@router.get("/swiggy-insights", response_class=HTMLResponse)
async def swiggy_insights(
    request: Request,
    brand: Optional[str] = Query(None),
    outlet: Optional[str] = Query(None),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    compare: Optional[str] = Query("none")
):
    if not request.session.get("logged_in"):
        return RedirectResponse(url="/login", status_code=303)

    is_admin = request.session.get("is_admin", False)
    authorized_res_ids = request.session.get("authorized_res_ids", [])

    df = load_swiggy_insights_data()
    
    if "Report Period" in df.columns:
        df["_temp_date"] = pd.to_datetime(df["Report Period"], dayfirst=True, format="mixed", errors="coerce")

    if not is_admin and "Res ID" in df.columns:
        df = df[df["Res ID"].astype(str).isin(authorized_res_ids)]

    all_brands = sorted(df["Restaurant Name"].dropna().unique().tolist()) if "Restaurant Name" in df.columns else []
    selected_brand = brand.strip() if brand and brand in all_brands else ""
    
    context_df = df[df["Restaurant Name"] == selected_brand] if selected_brand else df

    outlets = sorted(context_df["Location"].dropna().unique().tolist()) if "Location" in context_df.columns else []
    selected_outlet = outlet.strip() if outlet and outlet in outlets else ""
    
    if selected_outlet and "Location" in context_df.columns:
        context_df = context_df[context_df["Location"] == selected_outlet]

    max_available_date = ""
    max_date_obj = None
    if "_temp_date" in context_df.columns and not context_df["_temp_date"].dropna().empty:
        max_date_obj = context_df["_temp_date"].max()
        if pd.notnull(max_date_obj):
            max_available_date = max_date_obj.strftime("%Y-%m-%d")

    start_dt = pd.to_datetime(start_date, errors="coerce")
    end_dt = pd.to_datetime(end_date, errors="coerce")

    if pd.isnull(start_dt) or (max_date_obj is not None and start_dt > max_date_obj):
        start_dt = max_date_obj
        end_dt = max_date_obj

    if pd.notnull(start_dt):
        start_date = start_dt.strftime("%Y-%m-%d")
    if pd.notnull(end_dt):
        end_date = end_dt.strftime("%Y-%m-%d")

    filtered_df = context_df.copy()
    if pd.notnull(start_dt) and pd.notnull(end_dt) and "_temp_date" in filtered_df.columns:
        filtered_df = filtered_df[
            (filtered_df["_temp_date"].dt.normalize() >= start_dt.normalize()) & 
            (filtered_df["_temp_date"].dt.normalize() <= end_dt.normalize())
        ]

    # Calculate Current KPIs
    total_gmv = float(filtered_df["GMV"].sum()) if "GMV" in filtered_df.columns else 0.0
    total_orders = int(filtered_df["Orders"].sum()) if "Orders" in filtered_df.columns else 0
    avg_aov = float(filtered_df["Pre discounted AOV"].mean()) if "Pre discounted AOV" in filtered_df.columns and not filtered_df["Pre discounted AOV"].empty else 0.0
    sales_ads = float(filtered_df["Ad Sales"].sum()) if "Ad Sales" in filtered_df.columns else 0.0
    discount_given = float(filtered_df["Discount Given"].sum()) if "Discount Given" in filtered_df.columns else 0.0

    # PHASE 3: Comparison Calculations
    comp_data = {
        "mode": compare,
        "label": "",
        "gmv": None, "orders": None, "aov": None, "ads": None, "discount": None
    }

    if compare and compare != "none" and pd.notnull(start_dt) and pd.notnull(end_dt) and "_temp_date" in context_df.columns:
        comp_start, comp_end = get_comparison_date_range(start_dt, end_dt, compare)
        if comp_start and comp_end:
            comp_df = context_df[
                (context_df["_temp_date"].dt.normalize() >= comp_start.normalize()) & 
                (context_df["_temp_date"].dt.normalize() <= comp_end.normalize())
            ]
            
            base_gmv = float(comp_df["GMV"].sum()) if "GMV" in comp_df.columns else 0.0
            base_orders = int(comp_df["Orders"].sum()) if "Orders" in comp_df.columns else 0
            base_aov = float(comp_df["Pre discounted AOV"].mean()) if "Pre discounted AOV" in comp_df.columns and not comp_df["Pre discounted AOV"].empty else 0.0
            base_ads = float(comp_df["Ad Sales"].sum()) if "Ad Sales" in comp_df.columns else 0.0
            base_discount = float(comp_df["Discount Given"].sum()) if "Discount Given" in comp_df.columns else 0.0

            comp_data["gmv"] = calculate_growth(total_gmv, base_gmv)
            comp_data["orders"] = calculate_growth(total_orders, base_orders)
            comp_data["aov"] = calculate_growth(avg_aov, base_aov)
            comp_data["ads"] = calculate_growth(sales_ads, base_ads)
            comp_data["discount"] = calculate_growth(discount_given, base_discount)
            
            labels = {
                "prev_period": "Previous Period",
                "prev_week": "Last Week",
                "prev_month": "Last Month",
                "prev_year": "Last Year"
            }
            comp_data["label"] = labels.get(compare, "Comparison")

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
            "compare_mode": compare,
            "comp_data": comp_data,
            "total_gmv": format_indian_currency(total_gmv),
            "total_orders": format_indian_integer(total_orders),
            "avg_aov": f"₹{format_indian_integer(round(avg_aov))}",
            "sales_ads": format_indian_currency(sales_ads),
            "discount_given": format_indian_currency(discount_given),
            "table_data": table_records
        }
    )
