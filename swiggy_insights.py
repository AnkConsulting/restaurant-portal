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
    
    if "Report Date" in df.columns:
        df["_temp_date"] = pd.to_datetime(df["Report Date"], dayfirst=True, format="mixed", errors="coerce")

    if not is_admin and "Res ID" in df.columns:
        df = df[df["Res ID"].astype(str).isin(authorized_res_ids)]

    all_brands = sorted(df["Restaurant Name"].dropna().unique().tolist()) if "Restaurant Name" in df.columns else []
    selected_brand = brand.strip() if brand and brand in all_brands else ""
    
    # Filter by Brand
    context_df = df[df["Restaurant Name"] == selected_brand] if selected_brand else df

    outlets = sorted(context_df["Location"].dropna().unique().tolist()) if "Location" in context_df.columns else []
    selected_outlet = outlet.strip() if outlet and outlet in outlets else ""
    
    # Filter by Outlet
    if selected_outlet and "Location" in context_df.columns:
        context_df = context_df[context_df["Location"] == selected_outlet]

    # --- UPDATED DATE FILTERING LOGIC ---
    max_available_date = ""
    max_date_obj = None
    if "_temp_date" in context_df.columns and not context_df["_temp_date"].dropna().empty:
        max_date_obj = context_df["_temp_date"].max()
        if pd.notnull(max_date_obj):
            max_available_date = max_date_obj.strftime("%Y-%m-%d")

    # Safely parse incoming dates from the URL, enforcing day-first for standard Indian dates
    start_dt = pd.to_datetime(start_date, dayfirst=True, format="mixed", errors="coerce")
    end_dt = pd.to_datetime(end_date, dayfirst=True, format="mixed", errors="coerce")

    # Default to max available date if invalid, empty, or out of bounds
    if pd.isnull(start_dt) or (max_date_obj is not None and start_dt > max_date_obj):
        start_dt = max_date_obj
        end_dt = max_date_obj

    # Standardize string format back to YYYY-MM-DD for the HTML template to render the calendar properly
    if pd.notnull(start_dt):
        start_date = start_dt.strftime("%Y-%m-%d")
    if pd.notnull(end_dt):
        end_date = end_dt.strftime("%Y-%m-%d")

    filtered_df = context_df.copy()

    # Apply the date filter stripping the time to avoid missed records
    if pd.notnull(start_dt) and pd.notnull(end_dt) and "_temp_date" in filtered_df.columns:
        filtered_df = filtered_df[
            (filtered_df["_temp_date"].dt.normalize() >= start_dt.normalize()) & 
            (filtered_df["_temp_date"].dt.normalize() <= end_dt.normalize())
        ]
    # -------------------------------------

    total_gmv = float(filtered_df["GMV"].sum()) if "GMV" in filtered_df.columns else 0.0
    total_orders = int(filtered_df["Orders"].sum()) if "Orders" in filtered_df.columns else 0
    avg_aov = float(filtered_df["Pre discounted AOV"].mean()) if "Pre discounted AOV" in filtered_df.columns and not filtered_df["Pre discounted AOV"].empty else 0.0
    sales_ads = float(filtered_df["Ad Sales"].sum()) if "Ad Sales" in filtered_df.columns else 0.0
    discount_given = float(filtered_df["Discount Given"].sum()) if "Discount Given" in filtered_df.columns else 0.0

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
