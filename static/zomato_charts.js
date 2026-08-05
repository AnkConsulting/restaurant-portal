document.addEventListener("DOMContentLoaded", function () {
    const rawData = window.zomatoChartData || [];
    if (rawData.length === 0) return;

    const parseDateString = (dStr) => {
        if (!dStr) return 0;
        const parts = dStr.split('-');
        if (parts.length === 3) return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`).getTime();
        return new Date(dStr).getTime();
    };

    const dailyData = {};
    
    let totalImpressions = 0, totalMenuOpens = 0, totalOrders = 0;
    
    let sumI2M = 0, countI2M = 0;
    let sumM2C = 0, countM2C = 0;
    let sumC2O = 0, countC2O = 0;

    rawData.forEach(row => {
        const date = row['Report Period'] || row['Report Date'] || 'Unknown';
        if (!dailyData[date]) {
            dailyData[date] = { 
                date: date, timestamp: parseDateString(date), 
                gmv: 0, orders: 0, adSpend: 0, adSales: 0, 
                prepTimeSum: 0, onlinePctSum: 0, count: 0, discount: 0,
                newCustSum: 0, repeatCustSum: 0 
            };
        }
        dailyData[date].gmv += Number(row['GMV'] || 0);
        dailyData[date].orders += Number(row['Orders'] || 0);
        dailyData[date].adSpend += Number(row['Ad Spend'] || 0);
        dailyData[date].adSales += Number(row['Ad Sales'] || 0);
        dailyData[date].discount += Number(row['Discount Given'] || 0);
        dailyData[date].prepTimeSum += Number(row['Kitchen Prep Time'] || 0);
        dailyData[date].onlinePctSum += parseFloat(String(row['Online %']).replace('%', '') || 0);
        
        dailyData[date].newCustSum += parseFloat(String(row['New Customer Order %'] || 0).replace('%', ''));
        dailyData[date].repeatCustSum += parseFloat(String(row['Repeat Customer Order %'] || 0).replace('%', ''));
        
        dailyData[date].count += 1;

        totalImpressions += Number(row['Impressions'] || 0);
        totalMenuOpens += Number(row['Menu Opens'] || 0);
        totalOrders += Number(row['Orders'] || 0);

        let i2m = Number(row['Impressions to Menu'] || 0);
        if (i2m > 0) { sumI2M += i2m; countI2M++; }
        
        let m2c = Number(row['M2C'] || 0);
        if (m2c > 0) { sumM2C += m2c; countM2C++; }
        
        let c2o = Number(row['C2O'] || 0);
        if (c2o > 0) { sumC2O += c2o; countC2O++; }
    });

    let avgI2M = countI2M ? (sumI2M / countI2M) : 0;
    let avgM2C = countM2C ? (sumM2C / countM2C) : 0;
    let avgC2O = countC2O ? (sumC2O / countC2O) : 0;

    if (avgI2M > 0 && avgI2M <= 1) avgI2M *= 100;
    if (avgM2C > 0 && avgM2C <= 1) avgM2C *= 100;
    if (avgC2O > 0 && avgC2O <= 1) avgC2O *= 100;

    avgI2M = Math.round(avgI2M);
    avgM2C = Math.round(avgM2C);
    avgC2O = Math.round(avgC2O);

    const aggregatedList = Object.values(dailyData).sort((a, b) => a.timestamp - b.timestamp);
    const dateLabels = aggregatedList.map(item => item.date.substring(0, 5));
    
    Chart.defaults.font.family = 'Hanken Grotesk';

    // --- CHART 1: Customer Conversion Funnel ---
    const ctxFunnel = document.getElementById('funnelChart');
    if (ctxFunnel) {
        new Chart(ctxFunnel, {
            type: 'bar',
            data: {
                labels: ['Impressions', 'I2M (%)', 'Menu Opens', 'M2C (%)', 'C2O (%)', 'Orders'],
                datasets: [
                    {
                        label: 'Volume Count',
                        data: [totalImpressions, null, totalMenuOpens, null, null, totalOrders],
                        backgroundColor: '#94a3b8', borderRadius: 4, xAxisID: 'x' 
                    },
                    {
                        label: 'Conversion Rate (%)',
                        data: [null, avgI2M, null, avgM2C, avgC2O, null],
                        backgroundColor: '#E23744', borderRadius: 4, xAxisID: 'x1' 
                    }
                ]
            },
            options: {
                indexAxis: 'y', 
                responsive: true, maintainAspectRatio: false,
                plugins: { 
                    legend: { display: true, position: 'top', labels: { boxWidth: 12, usePointStyle: true } },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) { label += ': '; }
                                if (context.datasetIndex === 1) { label += context.raw + '%'; } 
                                else { label += context.raw; }
                                return label;
                            }
                        }
                    }
                },
                scales: {
                    y: { stacked: true, grid: { display: false } },
                    x: { 
                        stacked: true, type: 'linear', position: 'bottom', 
                        title: { display: true, text: 'Volume Count', font: { size: 11 } },
                        ticks: { callback: v => v >= 1000 ? (v/1000) + 'k' : v }
                    },
                    x1: { 
                        stacked: true, type: 'linear', position: 'top', max: 100,
                        title: { display: true, text: 'Conversion Rate (%)', font: { size: 11 } },
                        grid: { drawOnChartArea: false },
                        ticks: { callback: v => v + '%' } 
                    }
                }
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
                        borderColor: '#E23744', backgroundColor: '#E23744',
                        borderWidth: 2, tension: 0.4, pointRadius: 3, yAxisID: 'y', order: 1
                    },
                    {
                        label: 'Orders',
                        data: aggregatedList.map(i => i.orders),
                        type: 'bar',
                        backgroundColor: '#cbd5e1', borderRadius: 4, yAxisID: 'y1', order: 2
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

    // --- CHART 3: Advertising ROI ---
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
                        backgroundColor: '#94a3b8', borderRadius: 4, yAxisID: 'y1'
                    },
                    {
                        label: 'Ad Sales (₹)',
                        data: aggregatedList.map(i => i.adSales),
                        backgroundColor: '#E23744', borderRadius: 4, yAxisID: 'y'
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
                        title: { display: true, text: 'Ad Sales (₹)', font: { size: 11 } },
                        ticks: { callback: v => '₹' + (v/1000) + 'k' }
                    },
                    y1: { 
                        type: 'linear', display: true, position: 'right',
                        title: { display: true, text: 'Ad Spend (₹)', font: { size: 11 } },
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
                        borderColor: '#94a3b8', backgroundColor: '#94a3b8', tension: 0.3, yAxisID: 'y'
                    },
                    {
                        label: 'Online %',
                        data: aggregatedList.map(i => (i.onlinePctSum / i.count).toFixed(1)),
                        borderColor: '#E23744', backgroundColor: '#E23744', borderDash: [5, 5], tension: 0.3, yAxisID: 'y1'
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
                        backgroundColor: '#e2e8f0', borderRadius: 4, yAxisID: 'y', order: 2
                    },
                    {
                        label: 'Discount Given (₹)',
                        data: aggregatedList.map(i => i.discount),
                        type: 'line',
                        borderColor: '#E23744', backgroundColor: '#E23744',
                        borderWidth: 2, tension: 0.4, yAxisID: 'y', order: 1
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

    // --- CHART 6: Customer Mix (New vs Repeat) ---
    const ctxCustomer = document.getElementById('customerMixChart');
    if (ctxCustomer) {
        new Chart(ctxCustomer, {
            type: 'bar',
            data: {
                labels: dateLabels,
                datasets: [
                    {
                        label: 'Repeat Customers (%)',
                        data: aggregatedList.map(i => (i.repeatCustSum / i.count).toFixed(1)),
                        backgroundColor: '#94a3b8', 
                        borderRadius: { topLeft: 0, topRight: 0, bottomLeft: 4, bottomRight: 4 }
                    },
                    {
                        label: 'New Customers (%)',
                        data: aggregatedList.map(i => (i.newCustSum / i.count).toFixed(1)),
                        backgroundColor: '#E23744', 
                        borderRadius: { topLeft: 4, topRight: 4, bottomLeft: 0, bottomRight: 0 }
                    }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return context.dataset.label + ': ' + context.raw + '%';
                            }
                        }
                    }
                },
                scales: {
                    x: { stacked: true, grid: { display: false } },
                    y: { stacked: true, max: 100, ticks: { callback: v => v + '%' } }
                }
            }
        });
    }
});
