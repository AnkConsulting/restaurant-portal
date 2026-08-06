// --- INITIALIZATION ---
let swiggyDonutChartInstance = null;
let swiggyTrendChartInstance = null;
let swiggyCurrentMetric = 'sales';

// Brand colors
const SWIGGY_PRIMARY = '#FC8019';
const SWIGGY_SECONDARY = '#004ac6'; // Blue for generic/ads

document.addEventListener("DOMContentLoaded", function () {
    if (window.swiggyChartData && window.swiggyChartData.length > 0) {
        swiggyInitCharts(window.swiggyChartData);
    }
});

// --- CHART.JS VISUALIZATION LOGIC ---
function swiggyInitCharts(rawData) {
    // 1. Process data for the charts
    const chartData = swiggyProcessChartData(rawData);
    window.swiggyLatestChartPayload = chartData;

    // 2. Initialize the Customer Conversion Funnel (Bar Chart)
    swiggyInitFunnelChart(chartData);

    // 3. Initialize the Revenue & Volume Trends (Line Chart with Comparison)
    swiggyInitTrendChart(chartData);
}

function swiggyProcessChartData(data) {
    let payload = {
        trend_labels: [],
        sales_trend: [],
        orders_trend: [],
        // Assuming we extract the historical comp data passed via Jinja if available
        // For this frontend-only rendering, we pull from the raw table data
        funnel: {
            impressions: 0,
            menu_opens: 0,
            orders: 0
        }
    };

    // Aggregate data by Date
    let dateMap = {};
    
    data.forEach(row => {
        // Funnel Aggregation
        payload.funnel.impressions += parseFloat(row['Impressions'] || 0);
        payload.funnel.menu_opens += parseFloat(row['Menu Opens'] || 0);
        payload.funnel.orders += parseFloat(row['Orders'] || 0);

        // Trend Aggregation
        let rawDate = row['Report Period'] || row['Report Date'] || row['Date'];
        if (!rawDate) return;
        
        if (!dateMap[rawDate]) {
            dateMap[rawDate] = { sales: 0, orders: 0, comp_sales: null, comp_orders: null };
        }
        
        // Clean currency strings
        let salesStr = String(row['GMV'] || '0').replace(/[₹,]/g, '');
        dateMap[rawDate].sales += parseFloat(salesStr);
        dateMap[rawDate].orders += parseInt(row['Orders'] || 0);
    });

    // Sort dates
    let sortedDates = Object.keys(dateMap).sort((a, b) => {
        let partsA = a.split('-');
        let partsB = b.split('-');
        // Assuming DD-MM-YYYY format from the backend mapping
        if(partsA.length === 3 && partsB.length === 3) {
            let dateA = new Date(partsA[2], partsA[1]-1, partsA[0]);
            let dateB = new Date(partsB[2], partsB[1]-1, partsB[0]);
            return dateA - dateB;
        }
        return new Date(a) - new Date(b);
    });

    sortedDates.forEach(date => {
        payload.trend_labels.push(date);
        payload.sales_trend.push(dateMap[date].sales);
        payload.orders_trend.push(dateMap[date].orders);
    });

    // NOTE: To get the dashed comparison line to draw, the backend Python script
    // needs to pass 'prev_sales_trend' and 'prev_trend_labels' directly into this window object.
    // Assuming the backend is passing the comp_data dictionary to the template, 
    // we map those arrays here if they exist.
    
    if (window.swiggyCompTrendData) {
        payload.prev_trend_labels = window.swiggyCompTrendData.prev_labels || [];
        payload.prev_sales_trend = window.swiggyCompTrendData.prev_sales || [];
        payload.prev_orders_trend = window.swiggyCompTrendData.prev_orders || [];
    } else {
        payload.prev_trend_labels = [];
        payload.prev_sales_trend = [];
        payload.prev_orders_trend = [];
    }

    return payload;
}

function swiggyInitFunnelChart(data) {
    const ctx = document.getElementById('funnelChart');
    if (!ctx) return;
    
    // Basic funnel rendering
    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Impressions', 'Menu Opens', 'Orders'],
            datasets: [{
                label: 'Volume',
                data: [data.funnel.impressions, data.funnel.menu_opens, data.funnel.orders],
                backgroundColor: ['#94a3b8', '#cbd5e1', SWIGGY_PRIMARY],
                borderWidth: 0,
                borderRadius: 4
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } }
        }
    });
}

function swiggyInitTrendChart(data) {
    const ctx = document.getElementById('trendChart');
    if (!ctx) return;
    
    let gradient = ctx.getContext('2d').createLinearGradient(0, 0, 0, 300);
    gradient.addColorStop(0, 'rgba(252, 128, 25, 0.2)');
    gradient.addColorStop(1, 'rgba(252, 128, 25, 0)');

    swiggyTrendChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.trend_labels,
            datasets: [
                {
                    label: 'Current Period',
                    data: data.sales_trend,
                    borderColor: SWIGGY_PRIMARY,
                    backgroundColor: gradient,
                    borderWidth: 2.5,
                    fill: true,
                    tension: 0.3,
                    pointRadius: 3,
                    pointBackgroundColor: '#ffffff',
                    pointBorderColor: SWIGGY_PRIMARY
                },
                // PHASE 5: THE COMPARISON LINE
                {
                    label: 'Comparison Period',
                    data: data.prev_sales_trend.length > 0 ? data.prev_sales_trend : [],
                    borderColor: '#94a3b8',
                    borderDash: [5, 5],
                    borderWidth: 2,
                    fill: false,
                    tension: 0.3,
                    pointRadius: 2,
                    pointBackgroundColor: '#ffffff',
                    pointBorderColor: '#94a3b8'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: true, position: 'top', align: 'end' },
                tooltip: {
                    callbacks: {
                        title: function(tooltipItems) {
                            const index = tooltipItems[0].dataIndex;
                            const datasetIndex = tooltipItems[0].datasetIndex;
                            // Custom Tooltip: Show the historical date for the dashed line
                            if (datasetIndex === 1 && window.swiggyLatestChartPayload.prev_trend_labels) {
                                return window.swiggyLatestChartPayload.prev_trend_labels[index] || tooltipItems[0].label;
                            }
                            return tooltipItems[0].label;
                        },
                        label: function(context) {
                            let val = context.raw;
                            let label = context.dataset.label || '';
                            if (swiggyCurrentMetric === 'orders') {
                                return `${label}: ${val.toLocaleString()} orders`;
                            } else {
                                return `${label}: ₹${val.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
                            }
                        }
                    }
                }
            },
            scales: {
                x: { grid: { display: false } },
                y: { border: { display: false } }
            }
        }
    });
}
