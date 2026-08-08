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
                dailyData[date] = { date: date, timestamp: parseDateString(date), gmv: 0, orders: 0, adSpend: 0, adSales: 0, prepTimeSum: 0, onlinePctSum: 0, count: 0, discount: 0, newCustSum: 0, repeatCustSum: 0 };
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

    // --- GLOBALLY REGISTERED PYRAMID PLUGIN ---
    const customPyramidPlugin = {
        id: 'customPyramid',
        beforeDraw(chart, args, options) {
            if (!options || !options.layers) return;
            const { ctx, chartArea } = chart;
            if (!chartArea) return;
            const { top, bottom, left, width } = chartArea;
            
            const layers = options.layers;
            const numLayers = layers.length;
            
            const padY = 5; 
            const pyTop = top + padY;
            const pyBottom = bottom - padY;
            const pyHeight = pyBottom - pyTop;
            const layerHeight = pyHeight / numLayers;
            
            const centerX = left + (width * 0.38); 
            const pyMaxWidth = width * 0.76;

            ctx.save();
            ctx.clearRect(0, 0, chart.width, chart.height);
            
            // 1. Draw Perfect Geometric Triangle Slices
            for (let i = 0; i < numLayers; i++) {
                const y0 = pyTop + i * layerHeight;
                const y1 = pyTop + (i + 1) * layerHeight;
                
                const w0 = (i / numLayers) * pyMaxWidth;
                const w1 = ((i + 1) / numLayers) * pyMaxWidth;
                
                ctx.beginPath();
                ctx.moveTo(centerX - w0 / 2, y0);
                ctx.lineTo(centerX + w0 / 2, y0);
                ctx.lineTo(centerX + w1 / 2, y1);
                ctx.lineTo(centerX - w1 / 2, y1);
                ctx.closePath();
                
                ctx.fillStyle = layers[i].color;
                ctx.fill();
                
                ctx.lineWidth = 2;
                ctx.strokeStyle = '#ffffff';
                ctx.stroke();
            }
            
            // 2. Draw Dropoff Dashed Lines & Safely Anchored Right-Side Text
            for (let i = 0; i < numLayers - 1; i++) {
                const currentLayer = layers[i];   
                const prevLayer = layers[i+1];    
                const dropOffPct = prevLayer.vol > 0 ? (((prevLayer.vol - currentLayer.vol) / prevLayer.vol) * 100).toFixed(1) : 0;
                
                const lineY = pyTop + (i + 1) * layerHeight;
                const startX = centerX;
                const endX = centerX + (pyMaxWidth / 2) + 10; 
                
                ctx.beginPath();
                ctx.setLineDash([4, 4]);
                ctx.moveTo(startX, lineY);
                ctx.lineTo(endX, lineY);
                ctx.lineWidth = 1;
                ctx.strokeStyle = '#94a3b8';
                ctx.stroke();
                ctx.setLineDash([]);
                
                ctx.beginPath();
                ctx.arc(endX + 6, lineY, 3, 0, 2 * Math.PI);
                ctx.fillStyle = '#ef4444';
                ctx.fill();
                
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = '#64748b';
                ctx.font = `500 11px 'Hanken Grotesk', sans-serif`;
                ctx.fillText('Drop-off:', endX + 14, lineY);
                
                const textW = ctx.measureText('Drop-off: ').width;
                ctx.fillStyle = '#1e293b';
                ctx.font = `bold 12px 'Hanken Grotesk', sans-serif`;
                ctx.fillText(`${dropOffPct}%`, endX + 14 + textW, lineY);

                if (options.hasComp) {
                    const compDropPct = prevLayer.compVol > 0 ? (((prevLayer.compVol - currentLayer.compVol) / prevLayer.compVol) * 100).toFixed(1) : 0;
                    const diff = (dropOffPct - compDropPct).toFixed(1);
                    const isBetter = diff <= 0;
                    const colorCls = isBetter ? '#10b981' : '#ef4444';
                    const arrow = isBetter ? '↓' : '↑';
                    
                    ctx.fillStyle = colorCls;
                    ctx.font = `600 10px 'Hanken Grotesk', sans-serif`;
                    ctx.fillText(`${arrow} ${Math.abs(diff)}% vs prev`, endX + 14, lineY + 16);
                }
            }
            
            // 3. Draw Text In Center of Triangle Slices
            for (let i = 0; i < numLayers; i++) {
                const y0 = pyTop + i * layerHeight;
                const y1 = pyTop + (i + 1) * layerHeight;
                const textY = (y0 + y1) / 2;
                
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = '#ffffff';
                
                ctx.shadowColor = 'rgba(0,0,0,0.5)';
                ctx.shadowBlur = 4;
                ctx.shadowOffsetX = 1;
                ctx.shadowOffsetY = 1;
                
                // TEXT SWAP: Value on top, Title on bottom
                ctx.font = `bold 14px 'Hanken Grotesk', sans-serif`;
                ctx.fillText(layers[i].vol.toLocaleString(), centerX, textY - 8);

                ctx.font = `500 11px 'Hanken Grotesk', sans-serif`;
                ctx.fillText(layers[i].title, centerX, textY + 8);
                
                ctx.shadowColor = 'transparent';
                ctx.shadowBlur = 0;
            }
            
            ctx.restore();
            return false;
        }
    };
    
    Chart.register(customPyramidPlugin);

    if (window.toggleMaximize && !window.funnelTogglePatched) {
        const originalToggle = window.toggleMaximize;
        window.toggleMaximize = function(cardId, event) {
            originalToggle(cardId, event);
            if (cardId === 'chart-card-1') {
                const canvasContainer = document.getElementById('fullscreen-canvas-container');
                const modalLegend = document.getElementById('fullscreen-modal-legend');
                if (canvasContainer && modalLegend) {
                    canvasContainer.className = "w-[78%] h-full relative flex items-center justify-center min-h-[300px]";
                    modalLegend.className = "w-[22%] h-full flex flex-col justify-center items-center pr-2 pl-2";
                }
            }
        };
        window.funnelTogglePatched = true;
    }

    const ctxFunnel = document.getElementById('funnelChart');
    const legendContainer = document.getElementById('funnel-custom-legend');
    const canvasContainer = ctxFunnel ? ctxFunnel.parentElement : null;
    
    if (ctxFunnel && legendContainer && canvasContainer) {
        canvasContainer.parentElement.style.flexDirection = 'row-reverse';
        canvasContainer.className = "w-[78%] h-full relative flex items-center justify-center min-h-[300px]";
        legendContainer.className = "w-[22%] h-full flex flex-col justify-center items-center pr-2 pl-2";

        const imp = curr.totals.imp;
        const i2m_vol = Math.round(imp * (curr.averages.i2m / 100)) || 0; 
        const menu = curr.totals.menu;
        const m2c_vol = Math.round(menu * (curr.averages.m2c / 100)) || 0; 
        const orders = curr.totals.orders;

        const comp_imp = hasComp ? comp.totals.imp : 0;
        const comp_i2m_vol = hasComp ? Math.round(comp_imp * (comp.averages.i2m / 100)) : 0;
        const comp_menu = hasComp ? comp.totals.menu : 0;
        const comp_m2c_vol = hasComp ? Math.round(comp_menu * (comp.averages.m2c / 100)) : 0;
        const comp_orders = hasComp ? comp.totals.orders : 0;

        const brandColor = '#FC8019'; 

        const layers = [
            { title: 'Orders', color: '#ea580c', vol: orders, compVol: comp_orders },
            { title: 'M2C Volume', color: '#f97316', vol: m2c_vol, compVol: comp_m2c_vol },
            { title: 'Menu Opens', color: '#fb923c', vol: menu, compVol: comp_menu },
            { title: 'I2M Volume', color: '#64748b', vol: i2m_vol, compVol: comp_i2m_vol },
            { title: 'Impressions', color: '#334155', vol: imp, compVol: comp_imp }
        ];

        new Chart(ctxFunnel, {
            type: 'bar',
            data: { labels: [''], datasets: [{ data: [0] }] },
            options: {
                responsive: true, 
                maintainAspectRatio: false,
                events: [], 
                plugins: { 
                    legend: { display: false },
                    tooltip: { enabled: false },
                    customPyramid: { layers: layers, hasComp: hasComp }
                },
                scales: { x: { display: false }, y: { display: false } }
            }
        });

        const overallRate = imp > 0 ? ((orders / imp) * 100).toFixed(1) : 0;
        let compOverallHTML = '';
        if (hasComp && comp_imp > 0) {
            const compRate = ((comp_orders / comp_imp) * 100).toFixed(1);
            const diff = (overallRate - compRate).toFixed(1);
            const isUp = diff >= 0;
            const colorCls = isUp ? 'text-[#10b981]' : 'text-error';
            const arrow = isUp ? '↑' : '↓';
            compOverallHTML = `<div class="text-[11px] mt-2 font-medium ${colorCls}">${arrow} ${Math.abs(diff)}% vs Prev</div>`;
        }

        let leftColHTML = `
            <div class="bg-white border border-gray-100 shadow-[0_4px_12px_rgba(0,0,0,0.06)] rounded-2xl p-4 w-full shrink-0">
                <p class="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Conversion Rate</p>
                <p class="text-3xl font-bold text-gray-800 leading-none mb-1.5" style="color: ${brandColor}">${overallRate}%</p>
                <p class="text-[11px] text-gray-500">${orders.toLocaleString()} orders</p>
                ${compOverallHTML}
            </div>
        `;

        legendContainer.innerHTML = leftColHTML;
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
