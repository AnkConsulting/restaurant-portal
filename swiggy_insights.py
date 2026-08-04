from fastapi import APIRouter, Request, Query
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
import pandas as pd
import os

router = APIRouter()

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
templates = Jinja2Templates(directory=os.path.join(BASE_DIR, "templates"))

SWIGGY_INSIGHTS_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vT2AAwYZA0r8Y59L5KAOZ0yszHcNjyVKynuPfqcTKBh6VSPsmSqg5pmCizX5qDEEno26-okgxtRvZN5/pub?gid=1328235442&single=true&output=csv"

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

def load_swiggy_insights_data():
    try:
        df = pd.read_csv(SWIGGY_INSIGHTS_CSV_URL)
        df.columns = df.columns.str.strip()
        
        if "Res ID" in df.columns:
            df["Res ID"] = df["Res ID"].dropna().astype(str).str.split('.').str[0].str.strip()
            
        numeric_cols = [
            "Delivered orders", "Delivered Orders", "Sales", "GMV", 
            "Sales from Ads", "Discount given", "Discount Given"
        ]
        for col in numeric_cols:
            if col in df.columns:
                cleaned_series = df[col].astype(str).str.replace(r'[₹, ]', '', regex=True)
                df[col] = pd.to_numeric(cleaned_series, errors="coerce").fillna(0)

        if "Delivered Orders" in df.columns and "Delivered orders" not in df.columns:
            df["Delivered orders"] = df["Delivered Orders"]
        if "Discount Given" in df.columns and "Discount given" not in df.columns:
            df["Discount given"] = df["Discount Given"]

        return df
    except Exception as e:
        print(f"Could not load Swiggy Insights master sheet: {e}")
        return pd.DataFrame(
            columns=[
                "Restaurant Name", "Report Period", "Location", "Res ID",
                "Delivered orders", "Sales", "GMV", "Sales from Ads", "Discount given"
            ]
        )

@router.get("/swiggy-insights", response_class=HTMLResponse)
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

    df = load_swiggy_insights_data()
    
    all_brands = sorted(df["Restaurant Name"].dropna().unique().tolist()) if "Restaurant Name" in df.columns else []

    if "Report Period" in df.columns:
        df["_temp_date"] = pd.to_datetime(df["Report Period"], dayfirst=True, format="mixed", errors="coerce")

    if not is_admin and "Res ID" in df.columns:
        df = df[df["Res ID"].astype(str).isin(authorized_res_ids)]
        all_brands = sorted(df["Restaurant Name"].dropna().unique().tolist()) if "Restaurant Name" in df.columns else []

    selected_brand = brand if brand in all_brands else ""
    
    context_df = df[df["Restaurant Name"] == selected_brand] if selected_brand and "Restaurant Name" in df.columns else df

    outlets = sorted(context_df["Location"].dropna().unique().tolist()) if "Location" in context_df.columns else []
    selected_outlet = outlet if outlet in outlets else ""
    if selected_outlet and "Location" in context_df.columns:
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

    if pd.notnull(start_dt) and pd.notnull(end_dt) and "_temp_date" in filtered_df.columns:
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
