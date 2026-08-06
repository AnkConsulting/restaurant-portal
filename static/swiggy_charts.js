document.addEventListener("DOMContentLoaded", function () {
    const rawData = window.swiggyChartData || [];
    const rawCompData = window.swiggyCompRawData || [];
    if (rawData.length === 0) return;

    // Robust Date Parsing
    const parseDateString = (dStr) => {
        if (!dStr) return 0;
        const parts = dStr.split('-');
        if (parts.length === 3) return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`).getTime();
        return new Date(dStr).getTime();
    };

    // STEP 1: Reusable Data Processor for Current and Comparison Periods
    const processData = (dataArray) => {
        if (!dataArray || dataArray.length === 0) return null;
        
        const dailyData = {};
        let t = { imp: 0, menu: 0, orders: 0, sumI2M: 0, cI2M: 0, sumM2C: 0, cM2C: 0, sumC2O: 0, cC2O: 0 };
        
        dataArray.forEach(row => {
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

            t.imp += Number(row['Impressions'] || 0);
            t.menu += Number(row['Menu Opens'] || 0);
            t.orders += Number(row['Orders'] || 0);

            let i2m = Number(row['Impressions to Menu'] || 0);
            if (i2m > 0) { t.sumI2M += i2m; t.cI2M++; }
            let m2c = Number(row['M2C'] || 0);
            if (m2c > 0) { t.sumM2C += m2c; t.cM2C++; }
            let c2o = Number(row['C2O'] || 0);
            if (c2o > 0) { t.sumC2O += c2o; t.cC2O++; }
        });

        let avgI2M = t.cI2M ? (t.sumI2M / t.cI2M) : 0;
        let avgM2C = t.cM2C ? (t.sumM2C / t.cM2C) : 0;
        let avgC2O = t.cC2O ? (t.sumC2O / t.cC2O) : 0;

        if (avgI2M > 0 && avgI2M <= 1) avgI2M *= 100;
        if (avgM2C > 0 && avgM2C <= 1) avgM2C *= 100;
        if (avgC2O > 0 && avgC2O <= 1) avgC2O *= 100;

        const list = Object.values(dailyData).sort((a, b) => a.timestamp - b.timestamp);
        return { list, totals: t, averages: { i2m: Math.round(avgI2M), m2c: Math.round(avgM2C), c2o: Math.round(avgC2O) } };
    };

    const curr = processData(rawData);
    const comp = processData(rawCompData);
    const hasComp = comp !== null && comp.list.length > 0;

    const getCompData = (metricFn) => curr.list.map((_, i) => comp.list[i] ? metricFn(comp.list[i]) : 0);
    const dateLabels = curr.list.map(item => item.date.substring(0, 5));
    Chart.defaults.font.family = 'Hanken Grotesk';

    // --- CHART 1: Concentric Radial Funnel (Nested Doughnut) ---
    const ctxFunnel = document.getElementById('funnelChart');
    const legendContainer = document.getElementById('funnel-custom-legend');
    
    if (ctxFunnel && legendContainer) {
        // 1. Calculate the exact integer volumes for Current Period
        const imp = curr.totals.imp;
        const i2m_vol = Math.round(imp * (curr.averages.i2m / 100)) || 0; 
        const menu = curr.totals.menu;
        const m2c_vol = Math.round(menu * (curr.averages.m2c / 100)) || 0; 
        const c2o_vol = Math.round(m2c_vol * (curr.averages.c2o / 100)) || 0; 
        const orders = curr.totals.orders;

        // 1B. Calculate the exact integer volumes for Comp Period
        const comp_imp = hasComp ? comp.totals.imp : 0;
        const comp_i2m_vol = hasComp ? Math.round(comp_imp * (comp.averages.i2m / 100)) : 0;
        const comp_menu = hasComp ? comp.totals.menu : 0;
        const comp_m2c_vol = hasComp ? Math.round(comp_menu * (comp.averages.m2c / 100)) : 0;
        const comp_c2o_vol = hasComp ? Math.round(comp_m2c_vol * (comp.averages.c2o / 100)) : 0;
        const comp_orders = hasComp ? comp.totals.orders : 0;

        // Max Value ensures rings don't stretch past the total impression boundary (360 degrees)
        let maxVal = imp || 1; 
        if (hasComp) maxVal = Math.max(imp, comp_imp) || 1;

        const brandColor = '#FC8019'; // Swiggy Orange
        const brandColorLight = '#fdba74'; // Lighter Orange
        const grayColor = '#475569';  // Dark Gray
        const grayColorLight = '#94a3b8'; // Lighter Gray
        const trackColor = '#f8fafc'; // Faint Gray for empty track space

        // Helper to dynamically build Chart.js layers (Supports transparent ghost rings!)
        const buildRing = (labelName, activeVal, color, isComp = false) => {
            return {
                label: isComp ? 'Comp ' + labelName : labelName,
                data: [activeVal, Math.max(0, maxVal - activeVal)],
                // Comp is transparent, Current is solid colored
                backgroundColor: isComp ? ['transparent', 'transparent'] : [color, trackColor],
                // We only apply the border to the active value slice, NOT the empty track!
                borderWidth: isComp ? [2, 0] : [2, 0],
                borderColor: isComp ? [color, 'transparent'] : ['#ffffff', 'transparent'],
                borderDash: isComp ? [4, 4] : [],
                borderRadius: isComp ? [0, 0] : [20, 0], // Rounded caps for current, flat for dash
                weight: isComp ? 0.3 : 1, // Comp rings are 30% thickness so they look like faint borders
                cutout: isComp ? '0%' : '20%' // spacing
            };
        };

        const datasets = [];
        // Helper to add layers paired with their comparison ghost rings
        const addLayer = (name, val, compVal, color) => {
            if (hasComp) datasets.push(buildRing(name, compVal, color, true));
            datasets.push(buildRing(name, val, color, false));
        };

        // Draw Chart Outside -> Inside
        addLayer('Impressions', imp, comp_imp, grayColor);
        addLayer('I2M Volume', i2m_vol, comp_i2m_vol, grayColorLight);
        addLayer('Menu Opens', menu, comp_menu, grayColorLight);
        addLayer('M2C Volume', m2c_vol, comp_m2c_vol, brandColorLight);
        addLayer('Checkout Initiated', c2o_vol, comp_c2o_vol, brandColor);
        addLayer('Orders', orders, comp_orders, brandColor); // Core

        new Chart(ctxFunnel, {
            type: 'doughnut',
            data: { labels: ['Volume', 'Drop-off'], datasets: datasets },
            options: {
                responsive: true, maintainAspectRatio: false,
                rotation: -90, // Starts at 12 o'clock
                circumference: 360,
                plugins: { 
                    legend: { display: false },
                    tooltip: {
                        filter: (t) => t.dataIndex === 0,
                        callbacks: { 
                            title: () => null, 
                            label: (c) => ` ${c.dataset.label}: ${c.raw.toLocaleString()}` 
                        }
                    }
                }
            }
        });

        // 2. Build the Rich HTML Legend (Now includes Comp Data + Delta Colors)
        const steps = [
            { icon: 'visibility', title: '1. Impressions', desc: 'People saw your product', vol: imp, compVol: comp_imp, pct: 100, color: grayColor },
            { icon: 'touch_app', title: '2. I2M Volume', desc: 'Clicked on restaurant', vol: i2m_vol, compVol: comp_i2m_vol, pct: curr.averages.i2m, color: grayColorLight },
            { icon: 'menu_book', title: '3. Menu Opens', desc: 'Viewed menu details', vol: menu, compVol: comp_menu, pct: imp ? ((menu/imp)*100).toFixed(1) : 0, color: grayColorLight },
            { icon: 'shopping_cart', title: '4. M2C Volume', desc: 'Added to cart', vol: m2c_vol, compVol: comp_m2c_vol, pct: curr.averages.m2c, color: brandColorLight },
            { icon: 'credit_card', title: '5. Checkout Initiated', desc: 'Started checkout', vol: c2o_vol, compVol: comp_c2o_vol, pct: curr.averages.c2o, color: brandColor },
            { icon: 'check_circle', title: '6. Orders', desc: 'Successfully purchased', vol: orders, compVol: comp_orders, pct: imp ? ((orders/imp)*100).toFixed(1) : 0, color: brandColor }
        ];

        let legendHTML = '';
        steps.forEach((step, index) => {
            let dropOffHTML = '';
            if (index > 0) {
                const prevVol = steps[index-1].vol;
                const dropOffPct = prevVol > 0 ? (((prevVol - step.vol) / prevVol) * 100).toFixed(1) : 0;
                
                let compDropHTML = '';
                if (hasComp) {
                    const prevCompVol = steps[index-1].compVol;
                    const compDropPct = prevCompVol > 0 ? (((prevCompVol - step.compVol) / prevCompVol) * 100).toFixed(1) : 0;
                    compDropHTML = `<span class="text-[9px] text-gray-300 ml-1">Comp: ${compDropPct}%</span>`;
                }

                dropOffHTML = `
                    <div class="flex items-center gap-2 ml-4 my-1">
                        <span class="material-symbols-outlined text-gray-300 text-[16px]">arrow_downward</span>
                        <div class="h-px border-t border-dashed border-gray-200 flex-1"></div>
                        <span class="text-[11px] text-gray-400 font-medium">Drop-off: ${dropOffPct}% ${compDropHTML}</span>
                    </div>
                `;
            }

            let compVolHTML = '';
            if (hasComp) {
                let diff = step.vol - step.compVol;
                let diffStr = diff >= 0 ? '+' + diff.toLocaleString() : diff.toLocaleString();
                let colorCls = diff >= 0 ? 'text-[#10b981]' : 'text-error';
                compVolHTML = `<p class="text-[10px] text-gray-400 mt-0.5">Comp: ${step.compVol.toLocaleString()} <span class="${colorCls}">(${diffStr})</span></p>`;
            }

            legendHTML += `
                ${dropOffHTML}
                <div class="flex items-center justify-between group hover:bg-gray-50 p-1.5 rounded-lg transition-colors">
                    <div class="flex items-center gap-3">
                        <div class="w-8 h-8 rounded flex items-center justify-center text-white shadow-sm" style="background-color: ${step.color}">
                            <span class="material-symbols-outlined text-[18px]">${step.icon}</span>
                        </div>
                        <div>
                            <p class="text-sm font-bold text-gray-800 leading-tight">${step.title}</p>
                            <p class="text-[10px] text-gray-500">${step.desc}</p>
                        </div>
                    </div>
                    <div class="text-right">
                        <p class="text-sm font-bold text-gray-800">${step.pct}%</p>
                        <p class="text-[11px] text-gray-500 font-medium">${step.vol.toLocaleString()}</p>
                        ${compVolHTML}
                    </div>
                </div>
            `;
        });

        let compOverallHTML = '';
        if (hasComp) {
            let compRate = comp_imp ? ((comp_orders/comp_imp)*100).toFixed(1) : 0;
            compOverallHTML = `<p class="text-[11px] text-gray-400 mt-1">Comp Rate: <span class="font-bold">${compRate}%</span> (${comp_orders.toLocaleString()} / ${comp_imp.toLocaleString()})</p>`;
        }

        legendHTML += `
            <div class="mt-4 p-3 rounded-xl border border-gray-100 bg-white shadow-[0_2px_8px_rgba(0,0,0,0.04)] flex flex-col justify-center">
                <div class="flex items-center gap-3">
                    <span class="material-symbols-outlined text-gray-400 text-[24px]">monitoring</span>
                    <div>
                        <p class="text-[11px] text-gray-500 font-medium">Overall Conversion Rate</p>
                        <div class="flex items-end gap-2">
                            <p class="text-lg font-bold leading-none" style="color: ${brandColor}">${imp ? ((orders/imp)*100).toFixed(1) : 0}%</p>
                            <p class="text-[10px] text-gray-400 mb-0.5">${orders.toLocaleString()} out of ${imp.toLocaleString()} views</p>
                        </div>
                    </div>
                </div>
                ${compOverallHTML}
            </div>
        `;

        legendContainer.innerHTML = legendHTML;
    }

    // --- CHART 2: Revenue & Volume Trends ---
    const ctxTrend = document.getElementById('trendChart');
    if (ctxTrend) {
        const trendData = {
            labels: dateLabels,
            datasets: [
                { label: 'GMV (₹)', data: curr.list.map(i => i.gmv), type: 'line', borderColor: '#FC8019', backgroundColor: '#FC8019', borderWidth: 2, tension: 0.4, pointRadius: 3, yAxisID: 'y', order: 1 },
                { label: 'Orders', data: curr.list.map(i => i.orders), type: 'bar', backgroundColor: '#cbd5e1', borderRadius: 4, yAxisID: 'y1', order: 2 }
            ]
        };

        if (hasComp) {
            trendData.datasets.push({ label: 'Comp GMV', data: getCompData(i => i.gmv), type: 'line', borderColor: '#FC8019', backgroundColor: 'transparent', borderDash: [5, 5], borderWidth: 2, tension: 0.4, pointRadius: 2, yAxisID: 'y', order: 1 });
            trendData.datasets.push({ label: 'Comp Orders', data: getCompData(i => i.orders), type: 'bar', backgroundColor: 'transparent', borderColor: '#cbd5e1', borderWidth: 2, borderDash: [5, 5], borderRadius: 4, yAxisID: 'y1', order: 2 });
        }

        new Chart(ctxTrend, {
            type: 'bar', data: trendData,
            options: {
                responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
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
        const adsData = {
            labels: dateLabels,
            datasets: [
                { label: 'Ad Spend (₹)', data: curr.list.map(i => i.adSpend), backgroundColor: '#94a3b8', borderRadius: 4, yAxisID: 'y1' },
                { label: 'Ad Sales (₹)', data: curr.list.map(i => i.adSales), backgroundColor: '#FC8019', borderRadius: 4, yAxisID: 'y' }
            ]
        };

        if (hasComp) {
            adsData.datasets.push({ label: 'Comp Spend', data: getCompData(i => i.adSpend), backgroundColor: 'transparent', borderColor: '#94a3b8', borderWidth: 2, borderDash: [5, 5], borderRadius: 4, yAxisID: 'y1' });
            adsData.datasets.push({ label: 'Comp Sales', data: getCompData(i => i.adSales), backgroundColor: 'transparent', borderColor: '#FC8019', borderWidth: 2, borderDash: [5, 5], borderRadius: 4, yAxisID: 'y' });
        }

        new Chart(ctxAds, {
            type: 'bar', data: adsData,
            options: {
                responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
                scales: {
                    x: { grid: { display: false } },
                    y: { type: 'linear', display: true, position: 'left', title: { display: true, text: 'Ad Sales (₹)' }, ticks: { callback: v => '₹' + (v/1000) + 'k' } },
                    y1: { type: 'linear', display: true, position: 'right', title: { display: true, text: 'Ad Spend (₹)' }, ticks: { callback: v => '₹' + (v/1000) + 'k' }, grid: { drawOnChartArea: false } }
                }
            }
        });
    }

    // --- CHART 4: Operational Efficiency Matrix ---
    const ctxOps = document.getElementById('opsChart');
    if (ctxOps) {
        const opsData = {
            labels: dateLabels,
            datasets: [
                { label: 'Avg Prep Time', data: curr.list.map(i => (i.prepTimeSum / i.count).toFixed(1)), borderColor: '#94a3b8', backgroundColor: '#94a3b8', tension: 0.3, yAxisID: 'y' },
                { label: 'Online %', data: curr.list.map(i => (i.onlinePctSum / i.count).toFixed(1)), borderColor: '#FC8019', backgroundColor: '#FC8019', tension: 0.3, yAxisID: 'y1' }
            ]
        };

        if (hasComp) {
            opsData.datasets.push({ label: 'Comp Prep Time', data: getCompData(i => (i.prepTimeSum / i.count).toFixed(1)), borderColor: '#94a3b8', backgroundColor: 'transparent', borderDash: [5, 5], tension: 0.3, yAxisID: 'y' });
            opsData.datasets.push({ label: 'Comp Online %', data: getCompData(i => (i.onlinePctSum / i.count).toFixed(1)), borderColor: '#FC8019', backgroundColor: 'transparent', borderDash: [5, 5], tension: 0.3, yAxisID: 'y1' });
        }

        new Chart(ctxOps, {
            type: 'line', data: opsData,
            options: {
                responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
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
        const discountData = {
            labels: dateLabels,
            datasets: [
                { label: 'GMV (₹)', data: curr.list.map(i => i.gmv), backgroundColor: '#e2e8f0', borderRadius: 4, yAxisID: 'y', order: 2 },
                { label: 'Discount Given (₹)', data: curr.list.map(i => i.discount), type: 'line', borderColor: '#FC8019', backgroundColor: '#FC8019', borderWidth: 2, tension: 0.4, yAxisID: 'y', order: 1 }
            ]
        };

        if (hasComp) {
            discountData.datasets.push({ label: 'Comp GMV', data: getCompData(i => i.gmv), backgroundColor: 'transparent', borderColor: '#e2e8f0', borderWidth: 2, borderDash: [5, 5], borderRadius: 4, yAxisID: 'y', order: 2 });
            discountData.datasets.push({ label: 'Comp Discount', data: getCompData(i => i.discount), type: 'line', borderColor: '#FC8019', backgroundColor: 'transparent', borderDash: [5, 5], borderWidth: 2, tension: 0.4, yAxisID: 'y', order: 1 });
        }

        new Chart(ctxDiscount, {
            type: 'bar', data: discountData,
            options: {
                responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
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
        const mixData = {
            labels: dateLabels,
            datasets: [
                { label: 'Repeat (%)', data: curr.list.map(i => (i.repeatCustSum / i.count).toFixed(1)), backgroundColor: '#94a3b8', stack: 'curr', borderRadius: { topLeft: 0, topRight: 0, bottomLeft: 4, bottomRight: 4 } },
                { label: 'New (%)', data: curr.list.map(i => (i.newCustSum / i.count).toFixed(1)), backgroundColor: '#FC8019', stack: 'curr', borderRadius: { topLeft: 4, topRight: 4, bottomLeft: 0, bottomRight: 0 } }
            ]
        };

        if (hasComp) {
            mixData.datasets.push({ label: 'Comp Repeat (%)', data: getCompData(i => (i.repeatCustSum / i.count).toFixed(1)), backgroundColor: 'transparent', borderColor: '#94a3b8', borderWidth: 2, borderDash: [5, 5], stack: 'comp', borderRadius: { topLeft: 0, topRight: 0, bottomLeft: 4, bottomRight: 4 } });
            mixData.datasets.push({ label: 'Comp New (%)', data: getCompData(i => (i.newCustSum / i.count).toFixed(1)), backgroundColor: 'transparent', borderColor: '#FC8019', borderWidth: 2, borderDash: [5, 5], stack: 'comp', borderRadius: { topLeft: 4, topRight: 4, bottomLeft: 0, bottomRight: 0 } });
        }

        new Chart(ctxCustomer, {
            type: 'bar', data: mixData,
            options: {
                responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
                scales: {
                    x: { stacked: true, grid: { display: false } },
                    y: { stacked: true, max: 100, ticks: { callback: v => v + '%' } }
                }
            }
        });
    }
});
