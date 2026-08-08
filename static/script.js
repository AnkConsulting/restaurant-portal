// --- INITIALIZATION ---
let selectedStartDate = null;
let selectedEndDate = null;
let viewDate = new Date();
let viewYear = viewDate.getFullYear();
let viewMonth = viewDate.getMonth();
let donutChartInstance = null;
let trendChartInstance = null;
let currentMetric = 'sales';

const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const PLATFORM_COLORS = {
    'Swiggy': '#FC8019',
    'Zomato': '#E23744'
};
const DEFAULT_COLOR = '#004ac6';

document.addEventListener("DOMContentLoaded", function () {
    const displayNameEl = document.getElementById("user-display-name");
    const displayName = displayNameEl ? displayNameEl.innerText.trim() : "";
    const avatarBadge = document.getElementById("avatar-initials");
    
    if (avatarBadge && displayName) {
      const words = displayName.split(/\s+/);
      let initials = words.map(w => w[0] ? w[0] : "").join("").toUpperCase();
      if (initials.length > 2) initials = initials.substring(0, 2);
      avatarBadge.innerText = initials || "RP";
    }
    
    const startInput = document.getElementById('start-date-input');
    const endInput = document.getElementById('end-date-input');
    
    selectedStartDate = startInput ? startInput.value : null;
    selectedEndDate = endInput ? endInput.value : null;

    if (selectedStartDate && !selectedEndDate) {
      selectedEndDate = selectedStartDate;
    }
    
    if (selectedStartDate) {
        viewDate = new Date(selectedStartDate);
        viewYear = viewDate.getFullYear();
        viewMonth = viewDate.getMonth();
    } else {
        const maxInput = document.getElementById('max-available-date');
        if (maxInput && maxInput.value) {
            viewDate = new Date(maxInput.value);
            viewYear = viewDate.getFullYear();
            viewMonth = viewDate.getMonth();
        }
    }
    
    renderMonthYearDropdowns();
    renderCalendar();

    if (window.INITIAL_CHART_DATA) {
        initCharts(window.INITIAL_CHART_DATA);
    }
});

// --- CHART.JS VISUALIZATION LOGIC ---
function initCharts(data) {
    const donutCtx = document.getElementById('platformDonutChart').getContext('2d');
    
    const platformLabels = Object.keys(data.platform_donut);
    const platformValues = Object.values(data.platform_donut);
    const totalOrders = platformValues.reduce((sum, val) => sum + val, 0);
    
    const labelsWithPct = platformLabels.map((platform, i) => {
        const val = platformValues[i];
        const pct = totalOrders > 0 ? Math.round((val / totalOrders) * 100) : 0;
        return `${platform} (${pct}%)`;
    });

    const mappedColors = platformLabels.map(platform => PLATFORM_COLORS[platform] || DEFAULT_COLOR);

    donutChartInstance = new Chart(donutCtx, {
        type: 'doughnut',
        data: {
            labels: labelsWithPct,
            datasets: [{
                data: platformValues,
                backgroundColor: mappedColors,
                borderWidth: 0,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '55%',
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { font: { family: "'Hanken Grotesk', sans-serif", size: 14 }, padding: 20 }
                }
            }
        }
    });

    const trendCtx = document.getElementById('salesTrendChart').getContext('2d');
    let gradient = trendCtx.createLinearGradient(0, 0, 0, 300);
    gradient.addColorStop(0, 'rgba(0, 74, 198, 0.2)');  
    gradient.addColorStop(1, 'rgba(0, 74, 198, 0)');
    
    window.latestChartPayload = data;

    trendChartInstance = new Chart(trendCtx, {
        type: 'line',
        data: {
            labels: data.trend_labels,
            datasets: [
                {
                    label: 'Current Period',
                    data: data.sales_trend,
                    borderColor: '#004ac6',
                    backgroundColor: gradient,
                    borderWidth: 2.5,
                    fill: true,
                    tension: 0.3,
                    pointRadius: 3,
                    pointBackgroundColor: '#ffffff',
                    pointBorderColor: '#004ac6'
                },
                {
                    label: 'Previous Period',
                    data: data.prev_sales_trend,
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
                legend: { 
                    display: true, 
                    position: 'top',
                    align: 'end',
                    labels: { boxWidth: 12, font: { family: "'Hanken Grotesk', sans-serif", size: 11 } }
                },
                tooltip: {
                    callbacks: {
                        title: function(tooltipItems) {
                            const index = tooltipItems[0].dataIndex;
                            const datasetIndex = tooltipItems[0].datasetIndex;
                            if (datasetIndex === 1 && window.latestChartPayload.prev_trend_labels) {
                                return window.latestChartPayload.prev_trend_labels[index] || tooltipItems[0].label;
                            }
                            return tooltipItems[0].label;
                        },
                        label: function(context) {
                            let val = context.raw;
                            let label = context.dataset.label || '';
                            if (currentMetric === 'orders') {
                                return `${label}: ${val.toLocaleString()} orders`;
                            } else {
                                return `${label}: ₹${val.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
                            }
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { font: { family: "'Hanken Grotesk', sans-serif" } }
                },
                y: {
                    border: { display: false },
                    ticks: { 
                        font: { family: "'Hanken Grotesk', sans-serif" },
                        callback: function(value) { 
                            if (currentMetric === 'orders') return value;
                            return '₹' + (value/1000) + 'k'; 
                        }
                    }
                }
            }
        }
    });
}

function switchTrendMetric(metricType, btnEl) {
    currentMetric = metricType;
    
    document.querySelectorAll('.trend-btn').forEach(btn => {
        btn.classList.remove('bg-white', 'dark:bg-slate-600', 'text-primary', 'dark:text-[#2563eb]', 'shadow-sm');
        btn.classList.add('text-on-surface-variant', 'dark:text-gray-300', 'hover:text-on-surface', 'dark:hover:text-white');
    });
    btnEl.classList.remove('text-on-surface-variant', 'dark:text-gray-300', 'hover:text-on-surface', 'dark:hover:text-white');
    btnEl.classList.add('bg-white', 'dark:bg-slate-600', 'text-primary', 'dark:text-[#2563eb]', 'shadow-sm');

    if (!window.latestChartPayload) return;
    
    const data = window.latestChartPayload;
    let targetData = data.sales_trend;
    let prevTargetData = data.prev_sales_trend;
    let titleText = 'Daily Sales Trend';

    if (metricType === 'gmv') {
        targetData = data.gmv_trend;
        prevTargetData = data.prev_gmv_trend;
        titleText = 'Daily GMV Trend';
    } else if (metricType === 'orders') {
        targetData = data.orders_trend;
        prevTargetData = data.prev_orders_trend;
        titleText = 'Delivered Orders Trend';
    } else if (metricType === 'ads') {
        targetData = data.ads_trend;
        prevTargetData = data.prev_ads_trend;
        titleText = 'Sales from Ads Trend';
    } else if (metricType === 'discount') {
        targetData = data.discount_trend;
        prevTargetData = data.prev_discount_trend;
        titleText = 'Discount Given Trend';
    }

    const titleEl = document.getElementById('trend-chart-title');
    if (titleEl) titleEl.innerText = titleText;

    trendChartInstance.data.datasets[0].data = targetData;
    trendChartInstance.data.datasets[1].data = prevTargetData;
    trendChartInstance.update();
}

function switchDonutMetric(metricType, btnEl) {
    currentMetric = metricType;
    
    document.querySelectorAll('.donut-btn').forEach(btn => {
        btn.classList.remove('bg-white', 'dark:bg-slate-600', 'text-primary', 'dark:text-[#2563eb]', 'shadow-sm');
        btn.classList.add('text-on-surface-variant', 'dark:text-gray-300', 'hover:text-on-surface', 'dark:hover:text-white');
    });
    btnEl.classList.remove('text-on-surface-variant', 'dark:text-gray-300', 'hover:text-on-surface', 'dark:hover:text-white');
    btnEl.classList.add('bg-white', 'dark:bg-slate-600', 'text-primary', 'dark:text-[#2563eb]', 'shadow-sm');

    if (!window.latestChartPayload) return;
    updateCharts(window.latestChartPayload);
}

function updateCharts(data) {
    if (!donutChartInstance || !trendChartInstance) return;
    window.latestChartPayload = data;

    const platformLabels = Object.keys(data.platform_donut);
    const platformValues = Object.values(data.platform_donut);
    const totalOrders = platformValues.reduce((sum, val) => sum + val, 0);
    
    const labelsWithPct = platformLabels.map((platform, i) => {
        const val = platformValues[i];
        const pct = totalOrders > 0 ? Math.round((val / totalOrders) * 100) : 0;
        return `${platform} (${pct}%)`;
    });

    const mappedColors = platformLabels.map(platform => PLATFORM_COLORS[platform] || DEFAULT_COLOR);

    donutChartInstance.data.labels = labelsWithPct;
    donutChartInstance.data.datasets[0].data = platformValues;
    donutChartInstance.data.datasets[0].backgroundColor = mappedColors;
    donutChartInstance.update();

    let targetData = data.sales_trend;
    let prevTargetData = data.prev_sales_trend;

    if (currentMetric === 'gmv') {
        targetData = data.gmv_trend;
        prevTargetData = data.prev_gmv_trend;
    } else if (currentMetric === 'orders') {
        targetData = data.orders_trend;
        prevTargetData = data.prev_orders_trend;
    } else if (currentMetric === 'ads') {
        targetData = data.ads_trend;
        prevTargetData = data.prev_ads_trend;
    } else if (currentMetric === 'discount') {
        targetData = data.discount_trend;
        prevTargetData = data.prev_discount_trend;
    }

    trendChartInstance.data.labels = data.trend_labels;
    trendChartInstance.data.datasets[0].data = targetData;
    trendChartInstance.data.datasets[1].data = prevTargetData;
    trendChartInstance.update();
}

// --- ASYNC DASHBOARD REFRESH ---
async function fetchDashboardData() {
    document.getElementById('main-content').style.opacity = '0.5';

    const brand = document.getElementById('brand-input').value;
    const outlet = document.getElementById('outlet-input').value;
    const platform = document.getElementById('platform-input').value;
    const startDate = document.getElementById('start-date-input').value;
    const endDate = document.getElementById('end-date-input').value;

    const params = new URLSearchParams();
    if (brand) params.append('brand', brand);
    if (outlet) params.append('outlet', outlet);
    if (platform) params.append('platform', platform);
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);
    
    window.history.pushState(null, '', '/?' + params.toString());
    params.append('ajax', '1');

    try {
        const response = await fetch('/?' + params.toString());
        const data = await response.json();
        
        const maxInput = document.getElementById('max-available-date');
        if (maxInput && data.max_available_date) {
            maxInput.value = data.max_available_date;
        }

        document.getElementById('kpi-gmv').innerText = data.total_gmv;
        document.getElementById('kpi-orders').innerText = data.total_orders;
        document.getElementById('kpi-aov').innerText = data.avg_aov;
        document.getElementById('kpi-ads').innerText = data.sales_ads;
        document.getElementById('kpi-discount').innerText = data.discount_given;

        if (data.chart_data) {
            updateCharts(data.chart_data);
        }

        const tbody = document.getElementById('data-table-body');
        tbody.innerHTML = '';

        if (data.table_data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="10" class="py-8 text-center text-gray-500 italic">No operational data found for the selected filter.</td></tr>`;
        } else {
            data.table_data.forEach(row => {
                tbody.innerHTML += `
                    <tr class="border-b border-gray-100 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors">
                        <td class="py-4 px-4 font-medium">${row['Restaurant Name']}</td>
                        <td class="py-4 px-4 text-gray-500 dark:text-gray-400">${row['Report Period']}</td>
                        <td class="py-4 px-4">${row['Location']}</td>
                        <td class="py-4 px-4 font-mono text-xs text-gray-400 dark:text-gray-500">${row['Res ID']}</td>
                        <td class="py-4 px-4 font-semibold">${row['Platform']}</td>
                        <td class="py-4 px-4 text-right font-bold">${row['Delivered orders']}</td>
                        <td class="py-4 px-4 text-right">${row['Sales']}</td>
                        <td class="py-4 px-4 text-right">${row['GMV']}</td>
                        <td class="py-4 px-4 text-right">${row['Sales from Ads']}</td>
                        <td class="py-4 px-4 text-right text-error font-medium">${row['Discount given']}</td>
                    </tr>
                `;
            });
        }
        
        const outletList = document.getElementById('outlet-list');
        if (outletList) {
            outletList.innerHTML = `<li onclick="submitCustomDropdown('outlet-input', '')" class="px-4 py-2 hover:bg-surface-container-high dark:hover:bg-slate-700 cursor-pointer transition-colors">All Outlets</li>`;
            data.outlets.forEach(loc => {
                outletList.innerHTML += `<li onclick="submitCustomDropdown('outlet-input', '${loc}')" class="px-4 py-2 hover:bg-surface-container-high dark:hover:bg-slate-700 cursor-pointer transition-colors">${loc}</li>`;
            });
        }

        const platformList = document.getElementById('platform-list');
        if (platformList) {
            platformList.innerHTML = `<li onclick="submitCustomDropdown('platform-input', '')" class="px-4 py-2 hover:bg-surface-container-high dark:hover:bg-slate-700 cursor-pointer transition-colors">All Platforms</li>`;
            data.platforms.forEach(p => {
                platformList.innerHTML += `<li onclick="submitCustomDropdown('platform-input', '${p}')" class="px-4 py-2 hover:bg-surface-container-high dark:hover:bg-slate-700 cursor-pointer transition-colors">${p}</li>`;
            });
        }
        
        document.querySelectorAll('.dropdown-menu-custom').forEach(menu => {
            menu.classList.add('hidden');
        });

        renderCalendar();

    } catch (e) {
        console.error("Error fetching data:", e);
    } finally {
        document.getElementById('main-content').style.opacity = '1';
    }
}

// --- CALENDAR ENGINE ---
function formatDateLabel(dateStr) {
    if (!dateStr) return "";
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const day = parts[2];
    const month = monthNames[parseInt(parts[1], 10) - 1];
    const year = parts[0];
    return `${day}/${month}/${year}`;
}

function renderMonthYearDropdowns() {
    const maxDateStr = document.getElementById('max-available-date') ? document.getElementById('max-available-date').value : '';
    let maxYear = 9999, maxMonth = 11;
    if (maxDateStr) {
        const parts = maxDateStr.split('-');
        maxYear = parseInt(parts[0], 10);
        maxMonth = parseInt(parts[1], 10) - 1;
    }

    document.getElementById('month-text').innerText = monthNames[viewMonth];
    document.getElementById('year-text').innerText = viewYear;

    const mList = document.getElementById('month-dropdown');
    mList.innerHTML = monthNames.map((m, i) => {
        const isFuture = (viewYear > maxYear) || (viewYear === maxYear && i > maxMonth);
        if (isFuture) {
            return `<div class="px-3 py-1.5 text-gray-300 dark:text-gray-600 cursor-not-allowed text-sm text-center">${m}</div>`;
        }
        return `<div class="px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-slate-700 cursor-pointer text-sm text-center" onclick="selectMonth(${i}, event)">${m}</div>`;
    }).join('');

    const yList = document.getElementById('year-dropdown');
    let yHTML = '';
    const currentYear = new Date().getFullYear();
    for(let y = currentYear - 5; y <= currentYear + 5; y++) {
        if (y > maxYear) {
            yHTML += `<div class="px-3 py-1.5 text-gray-300 dark:text-gray-600 cursor-not-allowed text-sm text-center">${y}</div>`;
        } else {
            yHTML += `<div class="px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-slate-700 cursor-pointer text-sm text-center" onclick="selectYear(${y}, event)">${y}</div>`;
        }
    }
    yList.innerHTML = yHTML;
}

function toggleMonthDropdown(e) {
    e.stopPropagation();
    document.getElementById('month-dropdown').classList.toggle('hidden');
    document.getElementById('year-dropdown').classList.add('hidden');
}

function toggleYearDropdown(e) {
    e.stopPropagation();
    document.getElementById('year-dropdown').classList.toggle('hidden');
    document.getElementById('month-dropdown').classList.add('hidden');
}

function selectMonth(m, e) {
    e.stopPropagation();
    viewMonth = m;
    document.getElementById('month-dropdown').classList.add('hidden');
    renderMonthYearDropdowns();
    renderCalendar();
}

function selectYear(y, e) {
    e.stopPropagation();
    viewYear = y;
    document.getElementById('year-dropdown').classList.add('hidden');
    renderMonthYearDropdowns();
    renderCalendar();
}

function renderCalendar() {
    renderMonthYearDropdowns();

    const maxDateStr = document.getElementById('max-available-date') ? document.getElementById('max-available-date').value : '';
    const grid = document.getElementById('calendar-days-grid');
    grid.innerHTML = "";

    const firstDay = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

    for (let i = 0; i < firstDay; i++) {
        grid.innerHTML += `<div></div>`;
    }

    for (let d = 1; d <= daysInMonth; d++) {
        let monthStr = String(viewMonth + 1).padStart(2, '0');
        let dayStr = String(d).padStart(2, '0');
        let dateStr = `${viewYear}-${monthStr}-${dayStr}`;
        
        if (maxDateStr && dateStr > maxDateStr) {
            grid.innerHTML += `<div class="w-8 h-8 flex items-center justify-center rounded-full mx-auto text-gray-300 dark:text-gray-600 cursor-not-allowed">${d}</div>`;
        } else {
            grid.innerHTML += `<div class="calendar-day-item w-8 h-8 flex items-center justify-center rounded-full mx-auto cursor-pointer transition-colors text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700" data-date="${dateStr}" onclick="handleDayClick(this)">${d}</div>`;
        }
    }
    
    updateCalendarHighlights();
}

function navigateCalendar(monthOffset, yearOffset) {
    const maxDateStr = document.getElementById('max-available-date') ? document.getElementById('max-available-date').value : '';
    let targetMonth = viewMonth + monthOffset;
    let targetYear = viewYear + yearOffset;
    
    if (targetMonth < 0) { targetMonth = 11; targetYear--; } 
    else if (targetMonth > 11) { targetMonth = 0; targetYear++; }

    if (maxDateStr) {
        const parts = maxDateStr.split('-');
        const maxYear = parseInt(parts[0], 10);
        const maxMonth = parseInt(parts[1], 10) - 1;
        if ((targetYear > maxYear) || (targetYear === maxYear && targetMonth > maxMonth)) return;
    }

    viewMonth = targetMonth;
    viewYear = targetYear;
    renderCalendar();
}

function handleDayClick(dayEl) {
    const clickedDate = dayEl.getAttribute('data-date');
    if (!clickedDate) return;

    const maxDateStr = document.getElementById('max-available-date') ? document.getElementById('max-available-date').value : '';
    if (maxDateStr && clickedDate > maxDateStr) return;

    if (!selectedStartDate || (selectedStartDate && selectedEndDate)) {
      selectedStartDate = clickedDate;
      selectedEndDate = null;
    } else if (selectedStartDate && !selectedEndDate) {
      if (clickedDate < selectedStartDate) {
        selectedEndDate = selectedStartDate;
        selectedStartDate = clickedDate;
      } else {
        selectedEndDate = clickedDate;
      }
    }
    updateCalendarHighlights();
}

function updateCalendarHighlights() {
    const dayCells = document.querySelectorAll('.calendar-day-item');
    dayCells.forEach(cell => {
      const cellDate = cell.getAttribute('data-date');
      cell.className = "calendar-day-item w-8 h-8 flex items-center justify-center text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700 rounded-full mx-auto cursor-pointer transition-colors";

      if (selectedStartDate && cellDate === selectedStartDate) {
        cell.className = "calendar-day-item w-8 h-8 flex items-center justify-center text-white bg-[#004ac6] dark:bg-[#2563eb] rounded-full mx-auto cursor-pointer font-bold shadow-md shadow-blue-200 dark:shadow-none";
      } else if (selectedEndDate && cellDate === selectedEndDate) {
        cell.className = "calendar-day-item w-8 h-8 flex items-center justify-center text-white bg-[#004ac6] dark:bg-[#2563eb] rounded-full mx-auto cursor-pointer font-bold shadow-md shadow-blue-200 dark:shadow-none";
      } else if (selectedStartDate && selectedEndDate && cellDate > selectedStartDate && cellDate < selectedEndDate) {
        cell.className = "calendar-day-item w-8 h-8 flex items-center justify-center text-[#004ac6] dark:text-[#2563eb] bg-blue-50 dark:bg-blue-900/30 font-semibold cursor-pointer rounded-full mx-auto";
      }
    });

    const labelEl = document.getElementById('custom-cal-label');
    if (selectedStartDate && selectedEndDate) {
        if (selectedStartDate === selectedEndDate) {
            labelEl.innerText = formatDateLabel(selectedStartDate);
        } else {
            labelEl.innerText = `${formatDateLabel(selectedStartDate)} to ${formatDateLabel(selectedEndDate)}`;
        }
    } else if (selectedStartDate) {
        labelEl.innerText = `${formatDateLabel(selectedStartDate)} to ...`;
    } else {
        labelEl.innerText = 'Select Date Range';
    }
}

function applyDateSelection() {
    if (!selectedStartDate) {
        document.getElementById('calendar-menu')?.classList.add('hidden');
        return;
    }
    if (!selectedEndDate) selectedEndDate = selectedStartDate;

    document.getElementById('start-date-input').value = selectedStartDate;
    document.getElementById('end-date-input').value = selectedEndDate;
    document.getElementById('calendar-menu').classList.add('hidden');
    fetchDashboardData();
}

function toggleCustomDropdown(menuId, event) {
    event.stopPropagation();
    document.querySelectorAll('.dropdown-menu-custom').forEach(menu => {
        if (menu.id !== menuId) menu.classList.add('hidden');
    });
    const menu = document.getElementById(menuId);
    menu.classList.toggle('hidden');
    if (!menu.classList.contains('hidden')) {
        const searchInput = menu.querySelector('input[type="text"]');
        if (searchInput) searchInput.focus();
    }
}

function filterCustomDropdown(inputId, listId) {
    const filter = document.getElementById(inputId).value.toLowerCase();
    const lis = document.getElementById(listId).getElementsByTagName('li');
    for (let i = 1; i < lis.length; i++) {
        let txtValue = lis[i].textContent || lis[i].innerText;
        lis[i].style.display = txtValue.toLowerCase().indexOf(filter) > -1 ? "" : "none";
    }
}

function submitCustomDropdown(inputId, selectedValue) {
    document.getElementById(inputId).value = selectedValue;

    if (inputId === 'brand-input') {
        const outletInput = document.getElementById('outlet-input');
        if (outletInput) outletInput.value = "";
        document.getElementById('brand-trigger-text').innerText = selectedValue || 'All Brands';
        document.getElementById('outlet-trigger-text').innerText = 'All Outlets';
    } else if (inputId === 'outlet-input') {
        document.getElementById('outlet-trigger-text').innerText = selectedValue || 'All Outlets';
    } else if (inputId === 'platform-input') {
        document.getElementById('platform-trigger-text').innerText = selectedValue || 'All Platforms';
    }
    fetchDashboardData();
}

document.addEventListener('click', function(event) {
    const brandContainer = document.getElementById('brand-dropdown-container');
    const outletContainer = document.getElementById('outlet-dropdown-container');
    const platformContainer = document.getElementById('platform-dropdown-container');
    const dateContainer = document.getElementById('date-dropdown-container');
    
    if (brandContainer && !brandContainer.contains(event.target)) document.getElementById('brand-menu')?.classList.add('hidden');
    if (outletContainer && !outletContainer.contains(event.target)) document.getElementById('outlet-menu')?.classList.add('hidden');
    if (platformContainer && !platformContainer.contains(event.target)) document.getElementById('platform-menu')?.classList.add('hidden');
    if (dateContainer && !dateContainer.contains(event.target)) document.getElementById('calendar-menu')?.classList.add('hidden');

    document.getElementById('month-dropdown')?.classList.add('hidden');
    document.getElementById('year-dropdown')?.classList.add('hidden');
});
