document.addEventListener("DOMContentLoaded", function () {
    const rawData = window.swiggyChartData || [];
    const rawCompData = window.swiggyCompRawData || [];
    if (rawData.length === 0) return;

    const parseDateString = (dStr) => {
        if (!dStr) return 0;
        const parts = dStr.split('-');
        if (parts.length === 3) return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`).getTime();
        return new Date(dStr).getTime();
    };

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

    // --- CHART 1: PURE HTML/CSS CUSTOM FUNNEL (Replaces Chart.js entirely) ---
    const imp = curr.totals.imp;
    const i2m_vol = Math.round(imp * (curr.averages.i2m / 100)) || 0; 
    const menu = curr.totals.menu;
    const m2c_vol = Math.round(menu * (curr.averages.m2c / 100)) || 0; 
    const c2o_vol = Math.round(m2c_vol * (curr.averages.c2o / 100)) || 0; 
    const orders = curr.totals.orders;

    const comp_imp = hasComp ? comp.totals.imp : 0;
    const comp_i2m_vol = hasComp ? Math.round(comp_imp * (comp.averages.i2m / 100)) : 0;
    const comp_menu = hasComp ? comp.totals.menu : 0;
    const comp_m2c_vol = hasComp ? Math.round(comp_menu * (comp.averages.m2c / 100)) : 0;
    const comp_c2o_vol = hasComp ? Math.round(comp_m2c_vol * (comp.averages.c2o / 100)) : 0;
    const comp_orders = hasComp ? comp.totals.orders : 0;

    const overallRate = imp > 0 ? ((orders / imp) * 100).toFixed(1) : 0;
    let compOverallHTML = '';
    if (hasComp && comp_imp > 0) {
        const compRate = ((comp_orders / comp_imp) * 100).toFixed(1);
        const diff = (overallRate - compRate).toFixed(1);
        const isUp = diff >= 0;
        const colorCls = isUp ? 'text-[#10b981]' : 'text-error';
        const arrow = isUp ? '↑' : '↓';
        compOverallHTML = `<p class="text-[10px] mt-1.5 font-medium ${colorCls}">${arrow} ${Math.abs(diff)}% <span class="text-gray-400 font-normal">vs Previous</span></p>`;
    }

    const brandColor = '#FC8019'; 

    let leftColHTML = `
        <div class="bg-white border border-gray-100 shadow-[0_2px_8px_rgba(0,0,0,0.04)] rounded-xl p-3 mb-4 shrink-0">
            <div class="flex items-start gap-3">
                <div class="w-8 h-8 rounded-full bg-orange-50 flex items-center justify-center shrink-0" style="color: ${brandColor}">
                    <span class="material-symbols-outlined text-[18px]">pie_chart</span>
                </div>
                <div>
                    <p class="text-[10px] font-bold text-gray-500 mb-0.5 uppercase tracking-wide">Overall Conversion</p>
                    <p class="text-2xl font-bold leading-none" style="color: ${brandColor}">${overallRate}%</p>
                    <p class="text-[10px] text-gray-400 mt-1">${orders.toLocaleString()} of ${imp.toLocaleString()} views</p>
                    ${compOverallHTML}
                </div>
            </div>
        </div>
    `;

    const leftSteps = [
        { icon: 'local_mall', title: 'Orders', desc: 'Completed purchases' },
        { icon: 'credit_card', title: 'Checkout Initiated', desc: 'Started checkout process' },
        { icon: 'shopping_cart', title: 'Add to Cart', desc: 'M2C Volume' },
        { icon: 'menu_book', title: 'Menu Opens', desc: 'Viewed menu details' },
        { icon: 'touch_app', title: 'I2M Volume', desc: 'Clicked on restaurant' },
        { icon: 'campaign', title: 'Impressions', desc: 'Saw your content or ad' }
    ];

    leftSteps.forEach((step, i) => {
        leftColHTML += `
            <div class="flex items-center gap-3 mb-1.5 shrink-0">
                <div class="w-7 h-7 rounded-full bg-gray-50 border border-gray-100 flex items-center justify-center shrink-0">
                    <span class="material-symbols-outlined text-[14px]" style="color: ${brandColor}">${step.icon}</span>
                </div>
                <div>
                    <p class="text-[12px] font-bold text-gray-800 leading-tight">${step.title}</p>
                    <p class="text-[9px] text-gray-500">${step.desc}</p>
                </div>
            </div>
        `;
        if (i < leftSteps.length - 1) {
            leftColHTML += `
                <div class="pl-3.5 mb-1.5 shrink-0">
                    <span class="material-symbols-outlined text-[14px] text-gray-300 block">keyboard_arrow_down</span>
                </div>
            `;
        }
    });

    const layers = [
        { title: 'Orders', color: '#c2410c', vol: orders, compVol: comp_orders },
        { title: 'Checkout', color: '#ea580c', vol: c2o_vol, compVol: comp_c2o_vol },
        { title: 'Add to Cart', color: '#f97316', vol: m2c_vol, compVol: comp_m2c_vol },
        { title: 'Menu Opens', color: '#fb923c', vol: menu, compVol: comp_menu },
        { title: 'I2M', color: '#64748b', vol: i2m_vol, compVol: comp_i2m_vol },
        { title: 'Impressions', color: '#334155', vol: imp, compVol: comp_imp }
    ];

    let slicesHTML = '';
    let dropOffsHTML = '';

    layers.forEach((layer, i) => {
        const isLast = i === layers.length - 1;
        const borderBottom = isLast ? '' : 'border-b-[3px] border-white';
        
        slicesHTML += `
            <div class="w-full flex items-center justify-center ${borderBottom}" style="height: 16.666%; background-color: ${layer.color};">
                <div class="text-center">
                    <div class="text-white/90 text-[10px] font-medium leading-tight tracking-wide drop-shadow-md">${layer.title}</div>
                    <div class="text-white text-[13px] font-bold leading-tight drop-shadow-md">${layer.vol.toLocaleString()}</div>
                </div>
            </div>
        `;

        if (!isLast) {
            const currentLayer = layer;
            const prevLayer = layers[i+1]; // Layer below it
            const dropOffPct = prevLayer.vol > 0 ? (((prevLayer.vol - currentLayer.vol) / prevLayer.vol) * 100).toFixed(1) : 0;
            
            let compText = '';
            if (hasComp) {
                const compDropPct = prevLayer.compVol > 0 ? (((prevLayer.compVol - currentLayer.compVol) / prevLayer.compVol) * 100).toFixed(1) : 0;
                compText = `<span class="text-[9px] text-gray-400 block -mt-0.5">vs ${compDropPct}%</span>`;
            }

            const topPos = (i + 1) * 16.666;

            dropOffsHTML += `
                <div class="absolute flex items-center" style="top: ${topPos}%; left: 50%; right: -150px; transform: translateY(-50%); z-index: 0;">
                    <div class="flex-1 border-t border-dashed border-gray-300"></div>
                    <div class="pl-2 flex items-center gap-1.5 bg-white shrink-0">
                        <div class="w-1.5 h-1.5 rounded-full bg-red-500"></div>
                        <div class="flex flex-col">
                            <span class="text-[10px] text-gray-500 font-medium">Drop-off: <span class="font-bold text-gray-800">${dropOffPct}%</span></span>
                            ${compText}
                        </div>
                    </div>
                </div>
            `;
        }
    });

    const card1 = document.getElementById('chart-card-1');
    if (card1) {
        card1.classList.remove('p-5');
        card1.classList.add('p-4');
        card1.innerHTML = `
            <div class="flex justify-between items-start mb-2 shrink-0 px-2">
                <div>
                    <h3 class="font-title-md text-[16px] font-bold text-gray-800 tracking-wide">Sales Funnel Overview</h3>
                    <p class="text-[11px] text-gray-500 mt-0.5">Track customer journey from impressions to orders.</p>
                </div>
            </div>
            <div class="flex-1 w-full flex flex-row overflow-hidden pt-2">
                <div class="w-[35%] flex flex-col px-2 h-full overflow-y-auto custom-scrollbar">
                    ${leftColHTML}
                </div>
                <div class="w-[65%] flex items-center justify-center pr-[130px] pl-[20px] py-4">
                    <div class="w-full max-w-[280px] h-[90%] relative">
                        ${dropOffsHTML}
                        <div class="w-full h-full flex flex-col relative z-10 filter drop-shadow-lg" style="clip-path: polygon(50% 0%, 0% 100%, 100% 100%);">
                            ${slicesHTML}
                        </div>
                    </div>
                </div>
            </div>
        `;
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
                    y: { type: 'linear', display: true, position: 'left', title: { display: true, text: 'Ad Sales (₹)', font: { size: 11 } }, ticks: { callback: v => '₹' + (v/1000) + 'k' } },
                    y1: { type: 'linear', display: true, position: 'right', title: { display: true, text: 'Ad Spend (₹)', font: { size: 11 } }, ticks: { callback: v => '₹' + (v/1000) + 'k' }, grid: { drawOnChartArea: false } }
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
                { label: 'Avg Prep Time (mins)', data: curr.list.map(i => (i.prepTimeSum / i.count).toFixed(1)), borderColor: '#94a3b8', backgroundColor: '#94a3b8', tension: 0.3, yAxisID: 'y' },
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
                { label: 'Repeat Customers (%)', data: curr.list.map(i => (i.repeatCustSum / i.count).toFixed(1)), backgroundColor: '#94a3b8', stack: 'curr', borderRadius: { topLeft: 0, topRight: 0, bottomLeft: 4, bottomRight: 4 } },
                { label: 'New Customers (%)', data: curr.list.map(i => (i.newCustSum / i.count).toFixed(1)), backgroundColor: '#FC8019', stack: 'curr', borderRadius: { topLeft: 4, topRight: 4, bottomLeft: 0, bottomRight: 0 } }
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
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: function(context) { return context.dataset.label + ': ' + context.raw + '%'; }
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
