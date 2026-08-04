document.addEventListener("DOMContentLoaded", function () {
    const rawData = window.swiggyChartData || [];
    if (rawData.length === 0) return;

    // --- 1. DATA PREPARATION & AGGREGATION ---
    const parseDateString = (dStr) => {
        if (!dStr) return 0;
        const parts = dStr.split('-');
        if (parts.length === 3) return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`).getTime();
        return new Date(dStr).getTime();
    };

    const dailyData = {};
    const locationData = {};
    let totalImpressions = 0, totalMenuOpens = 0, totalOrders = 0;

    rawData.forEach(row => {
        const date = row['Report Date'] || 'Unknown';
        if (!dailyData[date]) {
            dailyData[date] = { 
                date: date, timestamp: parseDateString(date), 
                gmv: 0, orders: 0, adSpend: 0, adSales: 0, 
                prepTimeSum: 0, onlinePctSum: 0, count: 0, discount: 0
            };
        }
        dailyData[date].gmv += Number(row['GMV'] || 0);
        dailyData[date].orders += Number(row['Orders'] || 0);
        dailyData[date].adSpend += Number(row['Ad Spend'] || 0);
        dailyData[date].adSales += Number(row['Ad Sales'] || 0);
        dailyData[date].discount += Number(row['Discount Given'] || 0);
        dailyData[date].prepTimeSum += Number(row['Kitchen Prep Time'] || 0);
        dailyData[date].onlinePctSum += parseFloat(String(row['Online %']).replace('%', '') || 0);
        dailyData[date].count += 1;

        const loc = row['Location'] || 'Unknown';
        if (!locationData[loc]) locationData[loc] = 0;
        locationData[loc] += Number(row['GMV'] || 0);

        totalImpressions += Number(row['Impressions'] || 0);
        totalMenuOpens += Number(row['Menu Opens'] || 0);
        totalOrders += Number(row['Orders'] || 0);
    });

    const aggregatedList = Object.values(dailyData).sort((a, b) => a.timestamp - b.timestamp);
    const dateLabels = aggregatedList.map(item => item.date.substring(0, 5));
    
    Chart.defaults.font.family = 'Hanken Grotesk';

    // --- CHART 1: Customer Conversion Funnel ---
    const ctxFunnel = document.getElementById('funnelChart');
    if (ctxFunnel) {
        new Chart(ctxFunnel, {
            type: 'bar',
            data: {
                labels: ['Impressions', 'Menu Opens', 'Orders'],
                datasets: [{
                    data: [totalImpressions, totalMenuOpens, totalOrders],
                    backgroundColor: ['#94a3b8', '#3b82f6', '#FC8019'],
                    borderRadius: 4,
                    barPercentage: 0.6
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { x: { grid: { display: false } } }
            }
        });
    }

    // --- CHART 2: Revenue & Volume Trends ---
    const ctxTrend = document.getElementById('trendChart');
    if (ctxTrend) {
        new Chart(ctxTrend, {
            type: 'bar',
            data: {
                labels: dateLabels,
                datasets: [
                    {
                        label: 'GMV (₹)',
                        data: aggregatedList.map(i => i.gmv),
                        type: 'line',
                        borderColor: '#FC8019', backgroundColor: '#FC8019',
                        borderWidth: 2, tension: 0.4, pointRadius: 3,
                        yAxisID: 'y',
                        order: 1
                    },
                    {
                        label: 'Orders',
                        data: aggregatedList.map(i => i.orders),
                        type: 'bar',
                        backgroundColor: '#cbd5e1', borderRadius: 4,
                        yAxisID: 'y1',
                        order: 2
                    }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                scales: {
                    x: { grid: { display: false } },
                    y: { type: 'linear', display: true, position: 'left', ticks: { callback: v => '₹' + (v/1000) + 'k' } },
                    y1: { type: 'linear', display: true, position: 'right', grid: { drawOnChartArea: false } }
                }
            }
        });
    }

    // --- CHART 3: Advertising ROI (Dual Axis) ---
    const ctxAds = document.getElementById('adsChart');
    if (ctxAds) {
        new Chart(ctxAds, {
            type: 'bar',
            data: {
                labels: dateLabels,
                datasets: [
                    {
                        label: 'Ad Spend (₹)',
                        data: aggregatedList.map(i => i.adSpend),
                        backgroundColor: '#94a3b8',
                        borderRadius: 4,
                        yAxisID: 'y1'
                    },
                    {
                        label: 'Ad Sales (₹)',
                        data: aggregatedList.map(i => i.adSales),
                        backgroundColor: '#2563eb',
                        borderRadius: 4,
                        yAxisID: 'y'
                    }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                scales: {
                    x: { grid: { display: false } },
                    y: { 
                        type: 'linear', display: true, position: 'left',
                        title: { display: true, text: 'Ad Sales (₹)', font: { family: 'Hanken Grotesk', size: 11 } },
                        ticks: { callback: v => '₹' + (v/1000) + 'k' }
                    },
                    y1: { 
                        type: 'linear', display: true, position: 'right',
                        title: { display: true, text: 'Ad Spend (₹)', font: { family: 'Hanken Grotesk', size: 11 } },
                        ticks: { callback: v => '₹' + (v/1000) + 'k' },
                        grid: { drawOnChartArea: false }
                    }
                }
            }
        });
    }

    // --- CHART 4: Operational Efficiency Matrix ---
    const ctxOps = document.getElementById('opsChart');
    if (ctxOps) {
        new Chart(ctxOps, {
            type: 'line',
            data: {
                labels: dateLabels,
                datasets: [
                    {
                        label: 'Avg Prep Time (mins)',
                        data: aggregatedList.map(i => (i.prepTimeSum / i.count).toFixed(1)),
                        borderColor: '#ef4444', backgroundColor: '#ef4444',
                        tension: 0.3, yAxisID: 'y'
                    },
                    {
                        label: 'Online %',
                        data: aggregatedList.map(i => (i.onlinePctSum / i.count).toFixed(1)),
                        borderColor: '#10b981', backgroundColor: '#10b981',
                        borderDash: [5, 5], tension: 0.3, yAxisID: 'y1'
                    }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                scales: {
                    x: { grid: { display: false } },
                    y: { type: 'linear', position: 'left', title: { display: true, text: 'Minutes' } },
                    y1: { type: 'linear', position: 'right', max: 100, title: { display: true, text: 'Percentage' }, grid: { drawOnChartArea: false } }
                }
            }
        });
    }

    // --- CHART 5: Discount Impact on GMV ---
    const ctxDiscount = document.getElementById('discountChart');
    if (ctxDiscount) {
        new Chart(ctxDiscount, {
            type: 'bar',
            data: {
                labels: dateLabels,
                datasets: [
                    {
                        label: 'GMV (₹)',
                        data: aggregatedList.map(i => i.gmv),
                        backgroundColor: '#e2e8f0', 
                        borderRadius: 4, 
                        yAxisID: 'y',
                        order: 2
                    },
                    {
                        label: 'Discount Given (₹)',
                        data: aggregatedList.map(i => i.discount),
                        type: 'line',
                        borderColor: '#dc2626', 
                        backgroundColor: '#dc2626',
                        borderWidth: 2, 
                        tension: 0.4, 
                        yAxisID: 'y',
                        order: 1
                    }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                scales: {
                    x: { grid: { display: false } },
                    y: { ticks: { callback: v => '₹' + (v/1000) + 'k' } }
                }
            }
        });
    }

    // --- CHART 6: Outlet Leaderboard ---
    const ctxLeaderboard = document.getElementById('leaderboardChart');
    if (ctxLeaderboard) {
        const sortedLocations = Object.entries(locationData)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);

        new Chart(ctxLeaderboard, {
            type: 'bar',
            data: {
                labels: sortedLocations.map(i => i[0]),
                datasets: [{
                    label: 'GMV (₹)',
                    data: sortedLocations.map(i => i[1]),
                    backgroundColor: '#FC8019',
                    borderRadius: 4
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { grid: { display: true }, ticks: { callback: v => '₹' + (v/1000) + 'k' } },
                    y: { grid: { display: false } }
                }
            }
        });
    }
});
