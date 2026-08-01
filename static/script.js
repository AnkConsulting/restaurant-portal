// --- INITIALIZATION ---
let selectedStartDate = null;
let selectedEndDate = null;
let viewDate = new Date();
let viewYear = viewDate.getFullYear();
let viewMonth = viewDate.getMonth();

const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

document.addEventListener("DOMContentLoaded", function () {
    // 1. Dynamic Avatar Initials (Reads from hidden brand input)
    const brandInput = document.getElementById("brand-input");
    const brandName = brandInput ? brandInput.value.trim() : "";
    const avatarBadge = document.getElementById("avatar-initials");
    
    if (avatarBadge && brandName) {
      const words = brandName.split(/\s+/);
      let initials = words.map(w => w[0]).join("").toUpperCase();
      if (initials.length > 2) initials = initials.substring(0, 2);
      avatarBadge.innerText = initials || "RP";
    }
    
    // 2. Initialize Calendar Dates from Hidden Inputs
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
    }
    
    renderMonthYearDropdowns();
    renderCalendar();
});


// --- ASYNC DASHBOARD REFRESH (AJAX) ---
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
        
        // Update KPIs
        document.getElementById('kpi-gmv').innerText = data.total_gmv;
        document.getElementById('kpi-gmv').title = data.total_gmv;
        document.getElementById('kpi-orders').innerText = data.total_orders;
        document.getElementById('kpi-orders').title = data.total_orders;
        document.getElementById('kpi-aov').innerText = data.avg_aov;
        document.getElementById('kpi-aov').title = data.avg_aov;
        document.getElementById('kpi-ads').innerText = data.sales_ads;
        document.getElementById('kpi-ads').title = data.sales_ads;
        document.getElementById('kpi-discount').innerText = data.discount_given;
        document.getElementById('kpi-discount').title = data.discount_given;

        // Update Data Table
        const tbody = document.getElementById('data-table-body');
        tbody.innerHTML = '';
        if (data.table_data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="10" class="py-8 text-center text-on-surface-variant">No operational data found for the selected filter.</td></tr>`;
        } else {
            data.table_data.forEach(row => {
                tbody.innerHTML += `
                <tr class="border-b border-surface-container-high hover:bg-surface-bright transition-colors">
                    <td class="py-4 px-6">${row['Restaurant Name']}</td>
                    <td class="py-4 px-6 text-on-surface-variant">${row['Report Period']}</td>
                    <td class="py-4 px-6">${row['Location']}</td>
                    <td class="py-4 px-6 font-label-sm text-outline">${row['Res ID']}</td>
                    <td class="py-4 px-6">${row['Platform']}</td>
                    <td class="py-4 px-6 text-right font-semibold">${row['Delivered orders']}</td>
                    <td class="py-4 px-6 text-right">${row['Sales']}</td>
                    <td class="py-4 px-6 text-right">${row['GMV']}</td>
                    <td class="py-4 px-6 text-right text-primary-container">${row['Sales from Ads']}</td>
                    <td class="py-4 px-6 text-right text-error">${row['Discount given']}</td>
                </tr>`;
            });
        }
        
        // Refresh Dropdowns
        const outletList = document.getElementById('outlet-list');
        if (outletList) {
            outletList.innerHTML = `<li onclick="submitCustomDropdown('outlet-input', '')" class="px-4 py-2 hover:bg-surface-container-high cursor-pointer transition-colors text-on-surface">All Outlets</li>`;
            data.outlets.forEach(loc => {
                outletList.innerHTML += `<li onclick="submitCustomDropdown('outlet-input', '${loc}')" class="px-4 py-2 hover:bg-surface-container-high cursor-pointer transition-colors text-on-surface">${loc}</li>`;
            });
        }

        const platformList = document.getElementById('platform-list');
        if (platformList) {
            platformList.innerHTML = `<li onclick="submitCustomDropdown('platform-input', '')" class="px-4 py-2 hover:bg-surface-container-high cursor-pointer transition-colors text-on-surface">All Platforms</li>`;
            data.platforms.forEach(p => {
                platformList.innerHTML += `<li onclick="submitCustomDropdown('platform-input', '${p}')" class="px-4 py-2 hover:bg-surface-container-high cursor-pointer transition-colors text-on-surface">${p}</li>`;
            });
        }
        
        document.querySelectorAll('.dropdown-menu-custom').forEach(menu => {
            menu.classList.add('hidden');
        });

    } catch (e) {
        console.error("Error fetching data:", e);
    } finally {
        document.getElementById('main-content').style.opacity = '1';
    }
}


// --- DYNAMIC DOCKER CALENDAR ENGINE ---
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
    document.getElementById('month-text').innerText = monthNames[viewMonth];
    document.getElementById('year-text').innerText = viewYear;

    const mList = document.getElementById('month-dropdown');
    mList.innerHTML = monthNames.map((m, i) => 
        `<div class="px-3 py-2 hover:bg-surface-container-high cursor-pointer text-sm font-medium ${i === viewMonth ? 'text-primary bg-primary/10' : 'text-on-surface'}" onclick="selectMonth(${i}, event)">${m}</div>`
    ).join('');
    
    const yList = document.getElementById('year-dropdown');
    let yHTML = '';
    const currentYear = new Date().getFullYear();
    for(let y = currentYear - 5; y <= currentYear + 5; y++) {
        yHTML += `<div class="px-3 py-2 hover:bg-surface-container-high cursor-pointer text-sm font-medium ${y === viewYear ? 'text-primary bg-primary/10' : 'text-on-surface'}" onclick="selectYear(${y}, event)">${y}</div>`;
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
    
    const grid = document.getElementById('calendar-days-grid');
    grid.innerHTML = "";

    const firstDay = new Date(viewYear, viewMonth, 1).getDay(); 
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

    for (let i = 0; i < firstDay; i++) {
        grid.innerHTML += `<div class="py-2"></div>`;
    }

    for (let d = 1; d <= daysInMonth; d++) {
        let monthStr = String(viewMonth + 1).padStart(2, '0');
        let dayStr = String(d).padStart(2, '0');
        let dateStr = `${viewYear}-${monthStr}-${dayStr}`;
        
        grid.innerHTML += `<div class="calendar-day-item py-2 text-gray-700 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors" data-date="${dateStr}" onclick="handleDayClick(this)">${d}</div>`;
    }
    
    updateCalendarHighlights();
}

function navigateCalendar(monthOffset, yearOffset) {
    viewMonth += monthOffset;
    viewYear += yearOffset;
    
    if (viewMonth < 0) { 
        viewMonth = 11; 
        viewYear--; 
    } else if (viewMonth > 11) { 
        viewMonth = 0; 
        viewYear++; 
    }
    renderCalendar();
}

function handleDayClick(dayEl) {
    const clickedDate = dayEl.getAttribute('data-date');
    if (!clickedDate) return;

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
      cell.className = "calendar-day-item py-2 text-gray-700 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors";

      if (selectedStartDate && cellDate === selectedStartDate) {
        cell.className = "calendar-day-item py-2 text-white bg-[#2563eb] rounded-lg cursor-pointer font-bold shadow-md shadow-blue-200";
      } else if (selectedEndDate && cellDate === selectedEndDate) {
        cell.className = "calendar-day-item py-2 text-white bg-[#2563eb] rounded-lg cursor-pointer font-bold shadow-md shadow-blue-200";
      } else if (selectedStartDate && selectedEndDate && cellDate > selectedStartDate && cellDate < selectedEndDate) {
        cell.className = "calendar-day-item py-2 text-[#2563eb] bg-blue-50 font-semibold cursor-pointer rounded-lg";
      }
    });

    const labelEl = document.getElementById('date-picker-label');
    if (selectedStartDate && selectedEndDate) {
        labelEl.innerText = `${formatDateLabel(selectedStartDate)} to ${formatDateLabel(selectedEndDate)}`;
    } else if (selectedStartDate) {
        labelEl.innerText = `${formatDateLabel(selectedStartDate)} to ...`;
    } else {
        labelEl.innerText = 'Select Date / Range';
    }
}

function applyDateSelection() {
    if (!selectedStartDate) {
        document.getElementById('calendar-menu')?.classList.add('hidden');
        return;
    }

    if (!selectedEndDate) {
      selectedEndDate = selectedStartDate;
    }

    document.getElementById('start-date-input').value = selectedStartDate;
    document.getElementById('end-date-input').value = selectedEndDate;

    fetchDashboardData();
}

// --- DROPDOWN UI LOGIC ---
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
        if (txtValue.toLowerCase().indexOf(filter) > -1) {
            lis[i].style.display = "";
        } else {
            lis[i].style.display = "none";
        }
    }
}

function submitCustomDropdown(inputId, selectedValue) {
    const hiddenInput = document.getElementById(inputId);
    hiddenInput.value = selectedValue;
    
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
    
    if (brandContainer && !brandContainer.contains(event.target)) {
        document.getElementById('brand-menu')?.classList.add('hidden');
    }
    if (outletContainer && !outletContainer.contains(event.target)) {
        document.getElementById('outlet-menu')?.classList.add('hidden');
    }
    if (platformContainer && !platformContainer.contains(event.target)) {
        document.getElementById('platform-menu')?.classList.add('hidden');
    }
    if (dateContainer && !dateContainer.contains(event.target)) {
        document.getElementById('calendar-menu')?.classList.add('hidden');
    }

    document.getElementById('month-dropdown')?.classList.add('hidden');
    document.getElementById('year-dropdown')?.classList.add('hidden');
});
