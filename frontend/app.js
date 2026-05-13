"use strict";

const urlParameters = new URLSearchParams(window.location.search);
const API_BASE_URL = urlParameters.get("apiBaseUrl") || getDefaultApiBaseUrl();
const STORAGE_KEY = "projectCasaElsbethToken";
const MONTH_BATCH_SIZE = 1;
const YEAR_BATCH_SIZE = 1;
const INITIAL_PAST_MONTHS = 0;
const INITIAL_FUTURE_MONTHS = 0;
const INITIAL_PAST_YEARS = 0;
const INITIAL_FUTURE_YEARS = 0;
const RESET_WARNING_TEXT = "Changing the date/time or area will reset this booking to requested and remove existing approvals.";

const STATUS_LABELS = {
  busy: "Occupied",
  requested: "Requested",
  planned: "Planned",
  approved: "Approved",
  completed: "Completed",
  rejected: "Rejected",
  cancelled: "Cancelled"
};

const state = {
  token: localStorage.getItem(STORAGE_KEY),
  currentUser: null,
  areas: [],
  groups: [],
  bookings: [],
  filteredBookings: [],
  bookingIndex: {},
  bookingHistoryById: {},
  fallbackMode: false,
  displayMode: "calendar",
  viewMode: "month",
  months: [],
  years: [],
  selectedDateKey: getDateKey(new Date()),
  selectedBookingId: null,
  editingBookingId: null,
  bookingPanelCollapsed: true,
  tableSort: "start_asc",
  previewRole: "current",
  previewGroupId: "",
  filters: {
    areaId: "",
    status: "",
    person: ""
  }
};

const mockAreas = [
  { id: 1, name: "Office", description: "Desk and work area" },
  { id: 2, name: "Guest room", description: "Small guest room" },
  { id: 3, name: "Garden", description: "Outdoor garden area" }
];

const mockGroups = [
  { id: 1, name: "Group Alpha", can_approve: true, approval_required: true },
  { id: 2, name: "Group Beta", can_approve: true, approval_required: true },
  { id: 3, name: "Group Gamma", can_approve: false, approval_required: false }
];

const mockBookings = [
  {
    id: 1,
    area_id: 1,
    area_name: "Office",
    user_id: 3,
    owner_group_id: 3,
    owner_group_name: "Group Gamma",
    start_time: "2026-05-11 09:00",
    end_time: "2026-05-11 11:00",
    requested_by: "user3",
    stored_status: "requested",
    status: "requested",
    title: "Writing session",
    description: "Open request",
    note: "Writing session",
    approvals: [],
    required_approval_groups: [{ id: 1, name: "Group Alpha" }, { id: 2, name: "Group Beta" }],
    pending_approval_groups: [{ id: 1, name: "Group Alpha" }, { id: 2, name: "Group Beta" }],
    permissions: {
      can_modify: false,
      can_cancel: false,
      can_submit_request: false,
      can_reject: false,
      can_approve: false
    }
  },
  {
    id: 2,
    area_id: 2,
    area_name: "Guest room",
    user_id: 2,
    owner_group_id: 2,
    owner_group_name: "Group Beta",
    start_time: "2026-05-12 14:00",
    end_time: "2026-05-12 18:00",
    requested_by: "user2",
    stored_status: "planned",
    status: "planned",
    title: "Family visit hold",
    description: "Priority hold",
    note: "Family visit draft",
    approvals: [],
    required_approval_groups: [{ id: 1, name: "Group Alpha" }],
    pending_approval_groups: [{ id: 1, name: "Group Alpha" }],
    permissions: {
      can_modify: false,
      can_cancel: false,
      can_submit_request: false,
      can_reject: false,
      can_approve: false
    }
  },
  {
    id: 3,
    area_id: 2,
    area_name: "Guest room",
    user_id: 3,
    owner_group_id: 3,
    owner_group_name: "Group Gamma",
    start_time: "2026-05-13 14:00",
    end_time: "2026-05-13 18:00",
    requested_by: "user3",
    stored_status: "approved",
    status: "approved",
    title: "Family visit",
    description: "Confirmed stay",
    note: "Family visit",
    approvals: [
      { approver_group_id: 1, approver_group_name: "Group Alpha", approver_username: "user1" },
      { approver_group_id: 2, approver_group_name: "Group Beta", approver_username: "user2" }
    ],
    required_approval_groups: [{ id: 1, name: "Group Alpha" }, { id: 2, name: "Group Beta" }],
    pending_approval_groups: [],
    permissions: {
      can_modify: false,
      can_cancel: false,
      can_submit_request: false,
      can_reject: false,
      can_approve: false
    }
  }
];

document.addEventListener("DOMContentLoaded", initialiseApp);

function initialiseApp() {
  initialisePeriodState();
  bindEventHandlers();
  restoreSession().finally(refreshBoard);
}

function bindEventHandlers() {
  document.getElementById("login-form").addEventListener("submit", handleLoginSubmit);
  document.getElementById("logout-button").addEventListener("click", handleLogoutClick);
  document.getElementById("booking-form").addEventListener("submit", handleBookingSubmit);
  document.getElementById("booking-form").addEventListener("reset", handleBookingFormReset);
  document.getElementById("booking-cancel-edit-button").addEventListener("click", handleCancelEditClick);
  document.getElementById("booking-panel-toggle").addEventListener("click", handleBookingPanelToggle);
  document.getElementById("today-button").addEventListener("click", handleTodayClick);
  document.getElementById("display-switch").addEventListener("click", handleDisplaySwitchClick);
  document.getElementById("view-switch").addEventListener("click", handleViewSwitchClick);
  document.getElementById("calendar-periods").addEventListener("click", handleCalendarClick);
  document.getElementById("calendar-periods").addEventListener("click", handleBoardActionClick);
  document.getElementById("selected-day-bookings").addEventListener("click", handleBoardActionClick);
  document.getElementById("table-sort").addEventListener("change", handleTableSortChange);
  document.getElementById("preview-role").addEventListener("change", handlePreviewRoleChange);
  document.getElementById("preview-group").addEventListener("change", handlePreviewGroupChange);
  document.getElementById("area-filter").addEventListener("change", handleFilterChange);
  document.getElementById("status-filter").addEventListener("change", handleFilterChange);
  document.getElementById("person-filter").addEventListener("input", handleFilterChange);
  document.getElementById("calendar-periods").addEventListener("scroll", handleWindowScroll);
  window.addEventListener("resize", syncStickyOffsets);
}

function initialisePeriodState() {
  initialiseMonthState();
  initialiseYearState();
}

function initialiseMonthState() {
  const currentMonth = getMonthStart(new Date());
  const months = [];
  let monthOffset = 0 - INITIAL_PAST_MONTHS;

  while (monthOffset <= INITIAL_FUTURE_MONTHS) {
    months.push(addMonths(currentMonth, monthOffset));
    monthOffset += 1;
  }

  state.months = months;
}

function initialiseYearState() {
  const currentYear = getYearStart(new Date());
  const years = [];
  let yearOffset = 0 - INITIAL_PAST_YEARS;

  while (yearOffset <= INITIAL_FUTURE_YEARS) {
    years.push(addYears(currentYear, yearOffset));
    yearOffset += 1;
  }

  state.years = years;
}

async function restoreSession() {
  if (!state.token) {
    renderPage();
    return;
  }

  try {
    state.currentUser = await apiRequest("/me");
    state.displayMode = "table";
  } catch (error) {
    clearSession(false);
    showMessage("Saved login could not be restored. Guest view is active again.", "warning");
  }

  renderPage();
}

async function refreshBoard() {
  try {
    const requests = [
      apiRequest("/areas"),
      apiRequest("/bookings")
    ];

    if (state.currentUser && state.currentUser.role === "admin") {
      requests.push(apiRequest("/admin/groups"));
    }

    const results = await Promise.all(requests);

    state.areas = results[0];
    state.bookings = results[1];
    state.groups = results[2] || [];
    state.bookingHistoryById = {};
    state.fallbackMode = false;
    renderPage();
  } catch (error) {
    if (error.status === 401 && state.token) {
      clearSession(false);
      showMessage("The saved session expired. Please log in again.", "warning");
      return refreshBoard();
    }

    enableFallbackMode();
  }
}

function enableFallbackMode() {
  clearSession(false);
  state.fallbackMode = true;
  state.areas = mockAreas.slice();
  state.groups = mockGroups.slice();
  state.bookings = mockBookings.slice();
  state.bookingHistoryById = {};
  state.editingBookingId = null;
  showMessage("Backend unavailable. Showing a tiny mock dataset so the calendar can still be demonstrated.", "warning");
  renderPage();
}

function renderPage() {
  updateDerivedBookingState();
  syncViewPermissions();
  syncSelectedBooking();
  renderSessionState();
  renderAreaOptions();
  renderFilterOptions();
  renderDisplaySwitch();
  renderViewSwitch();
  renderBookingPanel();
  renderCalendar();
  renderSelectedDayPanel();
  renderBookingDetailPanel();
  updateCurrentPeriodLabel();
  syncStickyOffsets();
}

function updateDerivedBookingState() {
  state.filteredBookings = getFilteredBookings();
  state.bookingIndex = buildBookingIndex(state.filteredBookings);
}

function syncViewPermissions() {
  if (!state.currentUser && state.displayMode === "table") {
    state.displayMode = "calendar";
  }

  if (getEffectiveViewRole() === "guest" && state.displayMode === "table") {
    state.displayMode = "calendar";
  }

  if (state.currentUser && state.currentUser.role === "admin" && state.previewRole === "member") {
    const hasSelectedPreviewGroup = state.groups.some(function (group) {
      return String(group.id) === String(state.previewGroupId);
    });

    if (!hasSelectedPreviewGroup) {
      state.previewGroupId = state.groups.length > 0 ? String(state.groups[0].id) : "";
    }
  }
}

function syncSelectedBooking() {
  const bookings = getBookingsForDate(state.selectedDateKey);
  const hasSelectedBookingOnDay = bookings.some(function (booking) {
    return booking.id === state.selectedBookingId;
  });

  if (hasSelectedBookingOnDay) {
    return;
  }

  state.selectedBookingId = bookings.length > 0 ? bookings[0].id : null;

  if (state.selectedBookingId) {
    ensureBookingHistoryLoaded(state.selectedBookingId);
  }
}

function renderDisplaySwitch() {
  const displaySwitch = document.getElementById("display-switch");
  const buttons = displaySwitch.querySelectorAll("button[data-display-mode]");
  const shouldShow = Boolean(state.currentUser);

  displaySwitch.classList.toggle("hidden", !shouldShow);

  buttons.forEach(function (button) {
    const isActive = button.getAttribute("data-display-mode") === state.displayMode;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}

function renderSessionState() {
  const sessionText = document.getElementById("session-text");
  const modeText = document.getElementById("mode-text");
  const logoutButton = document.getElementById("logout-button");
  const adminPageButton = document.getElementById("admin-page-button");
  const loginPanel = document.getElementById("login-panel");
  const isAdmin = Boolean(state.currentUser) && state.currentUser.role === "admin";

  if (state.currentUser) {
    sessionText.textContent = buildSessionLabel(state.currentUser);
    logoutButton.classList.remove("hidden");
    loginPanel.classList.add("hidden");
  } else {
    sessionText.textContent = "Browsing as guest.";
    logoutButton.classList.add("hidden");
    loginPanel.classList.remove("hidden");
  }

  adminPageButton.classList.toggle("hidden", !isAdmin);

  if (state.fallbackMode) {
    modeText.textContent = "Fallback mode: backend features are unavailable. Last API target was " + API_BASE_URL + ".";
  } else {
    modeText.textContent = "Live backend mode: calendar data is loaded from " + API_BASE_URL + ".";
  }
}

function buildSessionLabel(user) {
  if (user.role === "admin") {
    if (state.previewRole === "member") {
      return "Logged in as " + user.username + " (admin) · previewing member view for " + getEffectivePreviewGroupName() + ".";
    }

    if (state.previewRole === "guest") {
      return "Logged in as " + user.username + " (admin) · previewing guest view.";
    }

    return "Logged in as " + user.username + " (admin).";
  }

  return "Logged in as " + user.username + " · " + (user.group_name || "No group") + ".";
}

function renderAreaOptions() {
  const areaSelect = document.getElementById("area");
  areaSelect.innerHTML = '<option value="">Choose an area</option>';

  state.areas.forEach(function (area) {
    const option = document.createElement("option");
    option.value = String(area.id);
    option.textContent = area.name;
    areaSelect.appendChild(option);
  });
}

function renderFilterOptions() {
  const areaFilter = document.getElementById("area-filter");
  const statusFilterRow = document.getElementById("status-filter-row");
  const personFilterRow = document.getElementById("person-filter-row");
  const tableSortRow = document.getElementById("table-sort-row");
  const previewRoleRow = document.getElementById("preview-role-row");
  const previewGroupRow = document.getElementById("preview-group-row");
  const previewGroupSelect = document.getElementById("preview-group");
  const previousValue = state.filters.areaId;
  const isGuest = getEffectiveViewRole() === "guest";
  const showTableControls = state.displayMode === "table" && Boolean(state.currentUser);
  const showPreviewRole = Boolean(state.currentUser) && state.currentUser.role === "admin";
  const showPreviewGroup = showPreviewRole && state.previewRole === "member";

  areaFilter.innerHTML = '<option value="">All areas</option>';

  state.areas.forEach(function (area) {
    const option = document.createElement("option");
    option.value = String(area.id);
    option.textContent = area.name;
    areaFilter.appendChild(option);
  });

  previewGroupSelect.innerHTML = '<option value="">Choose a group</option>';

  state.groups.forEach(function (group) {
    const option = document.createElement("option");
    option.value = String(group.id);
    option.textContent = group.name;
    previewGroupSelect.appendChild(option);
  });

  areaFilter.value = previousValue;
  document.getElementById("status-filter").value = state.filters.status;
  document.getElementById("person-filter").value = state.filters.person;
  document.getElementById("table-sort").value = state.tableSort;
  document.getElementById("preview-role").value = state.previewRole;
  previewGroupSelect.value = state.previewGroupId;
  statusFilterRow.classList.toggle("hidden", isGuest);
  personFilterRow.classList.toggle("hidden", isGuest);
  tableSortRow.classList.toggle("hidden", !showTableControls);
  previewRoleRow.classList.toggle("hidden", !showPreviewRole);
  previewGroupRow.classList.toggle("hidden", !showPreviewGroup);
}

function renderViewSwitch() {
  const viewSwitch = document.getElementById("view-switch");
  const buttons = document.querySelectorAll("#view-switch button[data-view]");
  const shouldShow = state.displayMode === "calendar";

  viewSwitch.classList.toggle("hidden", !shouldShow);

  buttons.forEach(function (button) {
    const isActive = button.getAttribute("data-view") === state.viewMode;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}

function renderBookingPanel() {
  const bookingPanel = document.getElementById("booking-panel");
  const bookingPanelBody = document.getElementById("booking-panel-body");
  const bookingPanelTitle = document.getElementById("booking-panel-title");
  const bookingPanelSubtitle = document.getElementById("booking-panel-subtitle");
  const bookingPanelToggle = document.getElementById("booking-panel-toggle");
  const bookingSubmitButton = document.getElementById("booking-submit-button");
  const bookingStatusInput = document.getElementById("booking-status");
  const ownerGroupRow = document.getElementById("owner-group-row");
  const ownerGroupSelect = document.getElementById("owner-group");
  const cancelEditButton = document.getElementById("booking-cancel-edit-button");
  const warningText = document.getElementById("booking-warning-text");
  const shouldShowPanel = Boolean(state.currentUser) && !state.fallbackMode;
  const editingBooking = getEditingBooking();
  const isAdmin = Boolean(state.currentUser) && state.currentUser.role === "admin";

  bookingPanel.classList.toggle("hidden", !shouldShowPanel);

  if (!shouldShowPanel) {
    return;
  }

  if (editingBooking) {
    state.bookingPanelCollapsed = false;
  }

  renderOwnerGroupOptions();
  ownerGroupRow.classList.toggle("hidden", !isAdmin || Boolean(editingBooking));
  ownerGroupSelect.required = isAdmin && !editingBooking;

  if (editingBooking) {
    bookingPanelTitle.textContent = "Edit Booking";
    bookingPanelSubtitle.textContent = "Only date/time or area changes reset approval state. Planned bookings stay planned when edited.";
    bookingSubmitButton.textContent = "Save changes";
    bookingStatusInput.value = editingBooking.stored_status;
    bookingStatusInput.disabled = true;
    cancelEditButton.classList.remove("hidden");
    warningText.textContent = shouldShowResetWarning(editingBooking) ? RESET_WARNING_TEXT : "";
  } else {
    bookingPanelTitle.textContent = "Create Booking";
    bookingPanelSubtitle.textContent = "Users can start with a planned hold or a requested booking. Admins can create on behalf of a group.";
    bookingSubmitButton.textContent = "Create booking";
    bookingStatusInput.disabled = false;
    cancelEditButton.classList.add("hidden");
    warningText.textContent = "";
  }

  bookingPanelBody.classList.toggle("hidden", state.bookingPanelCollapsed);
  bookingPanelToggle.textContent = state.bookingPanelCollapsed ? "Expand" : "Collapse";
  bookingPanelToggle.setAttribute("aria-expanded", String(!state.bookingPanelCollapsed));
  prefillBookingFormFromSelection();
}

function syncStickyOffsets() {
  const toolbar = document.querySelector(".toolbar");
  const root = document.documentElement;

  if (!toolbar) {
    return;
  }

  const toolbarHeight = toolbar.offsetHeight;
  const toolbarTopOffset = parseFloat(getComputedStyle(root).getPropertyValue("--toolbar-top-offset")) || 0;
  const secondaryTop = toolbarHeight + toolbarTopOffset + 12;

  root.style.setProperty("--sticky-secondary-top", secondaryTop + "px");
}

function renderOwnerGroupOptions() {
  const ownerGroupSelect = document.getElementById("owner-group");
  const previousValue = ownerGroupSelect.value;

  ownerGroupSelect.innerHTML = '<option value="">Choose a group</option>';

  state.groups.forEach(function (group) {
    const option = document.createElement("option");
    option.value = String(group.id);
    option.textContent = group.name;
    ownerGroupSelect.appendChild(option);
  });

  if (previousValue) {
    ownerGroupSelect.value = previousValue;
  }
}

function renderCalendar() {
  const calendarPeriods = document.getElementById("calendar-periods");
  const weekdaysStrip = document.getElementById("weekdays-strip");
  let markup = "";

  if (state.displayMode === "table") {
    calendarPeriods.className = "calendar-periods calendar-periods-table";
    weekdaysStrip.classList.add("hidden");
    calendarPeriods.innerHTML = renderTableMarkup();
    return;
  }

  if (state.viewMode === "month") {
    calendarPeriods.className = "calendar-periods calendar-periods-month";
    weekdaysStrip.classList.remove("hidden");

    state.months.forEach(function (monthDate) {
      markup += renderMonthMarkup(monthDate);
    });
  } else {
    calendarPeriods.className = "calendar-periods calendar-periods-year";
    weekdaysStrip.classList.add("hidden");

    state.years.forEach(function (yearDate) {
      markup += renderYearMarkup(yearDate);
    });
  }

  calendarPeriods.innerHTML = markup;
}

function renderMonthMarkup(monthDate) {
  const monthLabel = formatMonthLabel(monthDate);
  const monthKey = getMonthKey(monthDate);
  const weeks = buildMonthWeeks(monthDate);
  let markup = '<section class="panel month-panel period-panel" data-period-key="' + monthKey + '" data-period-label="' + escapeHtml(monthLabel) + '">' +
    '<div class="month-header">' +
    '<h3>' + escapeHtml(monthLabel) + "</h3>" +
    '<p class="small-text">' + getDaysInMonth(monthDate) + " days</p>" +
    "</div>" +
    '<div class="month-weeks">';

  weeks.forEach(function (week) {
    markup += renderMonthWeekMarkup(week);
  });

  markup += "</div></section>";
  return markup;
}

function renderMonthWeekMarkup(week) {
  let markup = '<section class="month-week" style="--week-bar-rows: ' + week.segments.length + ';">' +
    '<div class="month-grid">';

  week.cells.forEach(function (cell) {
    markup += renderMonthCellMarkup(cell);
  });

  markup += "</div>";

  if (week.segments.length > 0) {
    markup += '<div class="week-bar-list">';

    week.segments.forEach(function (segment) {
      markup += renderWeekSegmentMarkup(segment);
    });

    markup += "</div>";
  }

  markup += "</section>";
  return markup;
}

function renderMonthCellMarkup(cell) {
  if (!cell.inMonth) {
    return '<div class="day-placeholder" aria-hidden="true"></div>';
  }

  const isToday = cell.dateKey === getDateKey(new Date());
  const isSelected = cell.dateKey === state.selectedDateKey;
  const classNames = ["day-card"];

  if (isToday) {
    classNames.push("day-card-today");
  }

  if (isSelected) {
    classNames.push("day-card-selected");
  }

  return '<button type="button" class="' + classNames.join(" ") + '" data-date-key="' + cell.dateKey + '" title="' + escapeHtml(formatLongDate(cell.date)) + '">' +
    '<span class="day-number">' + cell.date.getDate() + "</span>" +
    "</button>";
}

function renderWeekSegmentMarkup(segment) {
  const statusClass = getStatusClass(segment.booking.status);
  const spansMultipleDays = segment.spanColumns > 1;
  const labelPrefix = !isGuestView() && spansMultipleDays ? formatStatusLabel(segment.booking.status) + " · " : "";

  return '<div class="week-bar-row">' +
    '<div class="week-bar ' + escapeHtml(statusClass) + '" style="grid-column: ' + segment.columnStart + " / span " + segment.spanColumns + ';" title="' + escapeHtml(getBookingSpanTitle(segment.booking)) + '">' +
    '<span class="week-bar-label">' + escapeHtml(labelPrefix + getMonthBarLabel(segment.booking)) + "</span>" +
    "</div>" +
    "</div>";
}

function renderYearMarkup(yearDate) {
  const yearLabel = String(yearDate.getFullYear());
  const yearKey = getYearKey(yearDate);
  let markup = '<section class="panel year-panel period-panel" data-period-key="' + yearKey + '" data-period-label="' + yearLabel + '">' +
    '<div class="year-header">' +
    '<h3>' + yearLabel + "</h3>" +
    '<p class="small-text">Condensed view of all 12 months</p>' +
    "</div>" +
    '<div class="year-grid">';

  for (let monthIndex = 0; monthIndex < 12; monthIndex += 1) {
    markup += renderMiniMonthMarkup(addMonths(yearDate, monthIndex));
  }

  markup += "</div></section>";
  return markup;
}

function renderMiniMonthMarkup(monthDate) {
  const monthLabel = formatShortMonthLabel(monthDate);
  const weeks = buildMonthWeeks(monthDate);
  let markup = '<article class="mini-month-card">' +
    '<div class="mini-month-header">' +
    '<h4>' + escapeHtml(monthLabel) + "</h4>" +
    "</div>" +
    '<div class="mini-weekdays-row">' + renderMiniWeekdayMarkup() + "</div>" +
    '<div class="mini-month-weeks">';

  weeks.forEach(function (week) {
    markup += renderMiniMonthWeekMarkup(week);
  });

  markup += "</div></article>";
  return markup;
}

function renderMiniMonthWeekMarkup(week) {
  let markup = '<section class="mini-month-week">' +
    '<div class="mini-month-grid">';

  week.cells.forEach(function (cell) {
    markup += renderMiniMonthCellMarkup(cell);
  });

  markup += "</div>";

  if (week.segments.length > 0) {
    markup += '<div class="mini-week-bar-list">';

    week.segments.forEach(function (segment) {
      markup += renderMiniWeekSegmentMarkup(segment);
    });

    markup += "</div>";
  }

  markup += "</section>";
  return markup;
}

function renderMiniWeekdayMarkup() {
  return "<span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span><span>S</span>";
}

function renderMiniMonthCellMarkup(cell) {
  if (!cell.inMonth) {
    return '<span class="mini-day-placeholder" aria-hidden="true"></span>';
  }

  const bookings = getBookingsForDate(cell.dateKey);
  const isToday = cell.dateKey === getDateKey(new Date());
  const isSelected = cell.dateKey === state.selectedDateKey;
  const classNames = ["mini-day-card"];
  const buttonTitle = getDayButtonTitle(cell.date, bookings);

  if (isToday) {
    classNames.push("mini-day-card-today");
  }

  if (isSelected) {
    classNames.push("mini-day-card-selected");
  }

  if (bookings.length > 0) {
    classNames.push("mini-day-card-busy");
  }

  return '<button type="button" class="' + classNames.join(" ") + '" data-date-key="' + cell.dateKey + '" title="' + escapeHtml(buttonTitle) + '" aria-label="' + escapeHtml(buttonTitle) + '">' +
    '<span class="mini-day-number">' + cell.date.getDate() + "</span>" +
    '<span class="mini-day-count">' + (bookings.length > 0 ? bookings.length : "") + "</span>" +
    "</button>";
}

function renderMiniWeekSegmentMarkup(segment) {
  return '<div class="mini-week-bar-row">' +
    '<div class="mini-week-bar ' + escapeHtml(getStatusClass(segment.booking.status)) + '" style="grid-column: ' + segment.columnStart + " / span " + segment.spanColumns + ';" title="' + escapeHtml(getBookingSpanTitle(segment.booking)) + '"></div>' +
    "</div>";
}

function renderTableMarkup() {
  const bookings = getSortedTableBookings();
  const showStatus = getEffectiveViewRole() !== "guest";
  const showDetails = getEffectiveViewRole() !== "guest";
  const summaryMetrics = getTableSummaryMetrics();
  let markup = '<section class="panel table-panel period-panel" data-period-label="Booking table">' +
    '<div class="table-panel-header">' +
    '<div>' +
    '<h3>Booking table</h3>' +
    '<p class="small-text">Sorted list of bookings with the same actions and selection behavior.</p>' +
    '</div><div class="table-summary-badges">' +
    renderTableSummaryBadge(summaryMetrics.approvalCount, "warning", "Awaiting my approval") +
    renderTableSummaryBadge(summaryMetrics.plannedCount, "planned", "Planned holidays") +
    '</div>' +
    '</div>';

  if (bookings.length === 0) {
    markup += '<p class="empty-state">No bookings match the current filters.</p></section>';
    return markup;
  }

  markup += '<div class="table-scroll">' +
    '<table class="booking-table">' +
    '<thead><tr>' +
    '<th>Start</th>' +
    '<th>End</th>' +
    '<th>Area</th>' +
    (showStatus ? '<th>Status</th>' : "") +
    (showDetails ? '<th>Name</th><th>Booking created</th>' : "") +
    '<th>Actions</th>' +
    '</tr></thead><tbody>';

  bookings.forEach(function (booking) {
    markup += renderTableRowMarkup(booking, showStatus, showDetails);
  });

  markup += '</tbody></table></div></section>';
  return markup;
}

function renderTableSummaryBadge(count, tone, label) {
  return '<span class="table-summary-badge table-summary-' + escapeHtml(tone) + '">' +
    '<strong>' + count + '</strong> ' + escapeHtml(label) +
    '</span>';
}

function renderTableRowMarkup(booking, showStatus, showDetails) {
  const isSelected = booking.id === state.selectedBookingId;
  let markup = '<tr class="booking-row' + (isSelected ? " booking-row-selected" : "") + '" data-booking-select="' + booking.id + '">' +
    '<td data-label="Start">' + escapeHtml(formatTableDateTime(booking.start_time)) + '</td>' +
    '<td data-label="End">' + escapeHtml(formatTableDateTime(booking.end_time)) + '</td>' +
    '<td data-label="Area">' + escapeHtml(booking.area_name) + '</td>';

  if (showStatus) {
    markup += '<td data-label="Status"><span class="status-badge ' + escapeHtml(getStatusClass(booking.status)) + '">' + escapeHtml(formatStatusLabel(booking.status)) + '</span></td>';
  }

  if (showDetails) {
    markup += '<td data-label="Name">' + escapeHtml(getTableNameValue(booking)) + '</td>' +
      '<td data-label="Booking created">' + escapeHtml(formatTableDateTime(booking.created_at)) + '</td>';
  }

  markup += '<td data-label="Actions"><div class="table-actions">' + renderActionButtons(booking) + renderFlightCheckLink(booking) + '</div></td></tr>';
  return markup;
}

function getTableNameValue(booking) {
  if (booking.title) {
    return booking.title;
  }

  return "Untitled booking";
}

function renderSelectedDayPanel() {
  const title = document.getElementById("selected-day-title");
  const subtitle = document.getElementById("selected-day-subtitle");
  const count = document.getElementById("selected-day-count");
  const bookingsContainer = document.getElementById("selected-day-bookings");
  const guestDayMessage = document.getElementById("guest-day-message");
  const bookings = getBookingsForDate(state.selectedDateKey);
  const selectedDate = parseDateKey(state.selectedDateKey);
  const isGuest = getEffectiveViewRole() === "guest";

  title.textContent = formatLongDate(selectedDate);
  count.textContent = isGuest
    ? bookings.length + " occupied"
    : bookings.length + " booking" + (bookings.length === 1 ? "" : "s");

  guestDayMessage.classList.toggle("hidden", !isGuest);

  if (bookings.length === 0) {
    subtitle.textContent = isGuest
      ? "No occupied slots are visible on this day."
      : "No bookings match the current filters for this day.";
    bookingsContainer.innerHTML = '<p class="empty-state">' + (isGuest ? "No occupied slots for this day." : "No bookings for this day yet.") + "</p>";
    return;
  }

  if (isGuest) {
    subtitle.textContent = "The calendar shows that something is occupied on this day.";
    bookingsContainer.innerHTML = '<p class="empty-state">Occupancy is visible on the calendar only. Log in to inspect details.</p>';
    return;
  }

  subtitle.textContent = "Review the bookings for the selected day. Actions only appear when your role and group allow them.";
  bookingsContainer.innerHTML = bookings.map(function (booking) {
    return renderSelectedBookingCard(booking);
  }).join("");
}

function renderSelectedBookingCard(booking) {
  const isSelected = booking.id === state.selectedBookingId;

  return '<article class="booking-card' + (isSelected ? " booking-card-selected" : "") + '" data-booking-select="' + booking.id + '">' +
    '<div class="booking-card-top">' +
    '<div>' +
    '<p class="booking-area">' + escapeHtml(getBookingCardHeading(booking)) + "</p>" +
    '<p class="booking-time">' + escapeHtml(formatDateTimeRange(booking.start_time, booking.end_time)) + "</p>" +
    "</div>" +
    '<span class="status-badge ' + escapeHtml(getStatusClass(booking.status)) + '">' + escapeHtml(formatStatusLabel(booking.status)) + "</span>" +
    "</div>" +
    '<p class="booking-meta">Requested by ' + escapeHtml(booking.requested_by) + " · " + escapeHtml(booking.owner_group_name) + "</p>" +
    renderApprovalSummaryMarkup(booking) +
    '<p class="booking-note">' + escapeHtml(getBookingDetailText(booking)) + "</p>" +
    '<div class="booking-actions">' + renderActionButtons(booking) + renderFlightCheckLink(booking) + "</div>" +
    "</article>";
}

function getBookingCardHeading(booking) {
  if (booking.title) {
    return booking.title + " · " + booking.area_name;
  }

  return booking.area_name;
}

function getBookingDetailText(booking) {
  if (booking.description) {
    return booking.description;
  }

  return booking.note || "No extra details provided.";
}

function renderApprovalSummaryMarkup(booking) {
  if (booking.status === "planned") {
    return '<p class="booking-meta">Planned holds do not collect approvals yet.</p>';
  }

  if (booking.status !== "requested" && booking.stored_status !== "approved" && booking.status !== "approved" && booking.status !== "completed") {
    return "";
  }

  const approvedNames = booking.approvals.map(function (approval) {
    return approval.approver_group_name;
  });
  const pendingNames = booking.pending_approval_groups.map(function (group) {
    return group.name;
  });
  const approvedText = approvedNames.length > 0 ? "Approved by: " + approvedNames.join(", ") + "." : "No group approvals recorded yet.";
  const pendingText = pendingNames.length > 0 ? " Pending: " + pendingNames.join(", ") + "." : "";

  return '<p class="booking-meta">' + escapeHtml(approvedText + pendingText) + "</p>";
}

function renderActionButtons(booking) {
  const buttons = [];
  const permissions = getEffectiveBookingPermissions(booking);

  if (permissions.can_submit_request) {
    buttons.push(createActionButton("request", booking.id, "Submit request"));
  }

  if (permissions.can_approve) {
    buttons.push(createActionButton("approve", booking.id, "Approve"));
  }

  if (permissions.can_reject) {
    buttons.push(createActionButton("reject", booking.id, "Reject"));
  }

  if (permissions.can_modify) {
    buttons.push(createActionButton("edit", booking.id, "Edit"));
  }

  if (permissions.can_cancel) {
    buttons.push(createActionButton("cancel", booking.id, "Cancel"));
  }

  if (permissions.can_delete) {
    buttons.push(createActionButton("delete", booking.id, "Delete"));
  }

  if (buttons.length === 0) {
    return '<span class="small-text">View only</span>';
  }

  return buttons.join("");
}

function createActionButton(actionName, bookingId, label) {
  return '<button type="button" class="action-button secondary-button" data-action="' + actionName + '" data-booking-id="' + bookingId + '">' + label + "</button>";
}

function renderFlightCheckLink(booking) {
  return '<a class="action-link-button secondary-button" href="' + escapeHtml(getGoogleFlightsUrl(booking)) + '" target="_blank" rel="noopener noreferrer">Google Flight Check</a>';
}

function renderBookingDetailPanel() {
  const panel = document.getElementById("booking-detail-panel");
  const title = document.getElementById("selected-booking-title");
  const subtitle = document.getElementById("selected-booking-subtitle");
  const status = document.getElementById("selected-booking-status");
  const summary = document.getElementById("selected-booking-summary");
  const approvalChain = document.getElementById("approval-chain-list");
  const auditList = document.getElementById("booking-audit-list");
  const shouldShow = Boolean(state.currentUser);
  const booking = getSelectedBooking();

  panel.classList.toggle("hidden", !shouldShow);

  if (!shouldShow) {
    return;
  }

  if (getEffectiveViewRole() === "guest") {
    title.textContent = "Guest preview";
    status.textContent = "Occupancy only";
    subtitle.textContent = "Guest mode hides approval state, ownership, and the audit trail.";
    summary.innerHTML = '<p class="empty-state">Guests only see occupied spans on the calendar.</p>';
    approvalChain.innerHTML = '<p class="empty-state">Approval chain is hidden in guest view.</p>';
    auditList.innerHTML = '<p class="empty-state">Audit history is hidden in guest view.</p>';
    return;
  }

  if (!booking) {
    title.textContent = "No booking selected";
    status.textContent = "Select a booking";
    subtitle.textContent = "Select a booking card or table row to inspect its approval chain and audit trail.";
    summary.innerHTML = '<p class="empty-state">No booking selected yet.</p>';
    approvalChain.innerHTML = '<p class="empty-state">Approval details will appear here.</p>';
    auditList.innerHTML = '<p class="empty-state">Change history will appear here.</p>';
    return;
  }

  title.textContent = getBookingCardHeading(booking);
  status.textContent = formatStatusLabel(booking.status);
  subtitle.textContent = formatDateTimeRange(booking.start_time, booking.end_time);
  summary.innerHTML = renderSelectedBookingSummaryMarkup(booking);
  approvalChain.innerHTML = renderApprovalChainMarkup(booking);
  auditList.innerHTML = renderAuditTrailMarkup(booking);
}

function renderSelectedBookingSummaryMarkup(booking) {
  return '<div class="booking-summary-grid">' +
    '<p><strong>Area</strong><span>' + escapeHtml(booking.area_name) + '</span></p>' +
    '<p><strong>Owner group</strong><span>' + escapeHtml(booking.owner_group_name || "Hidden") + '</span></p>' +
    '<p><strong>Requested by</strong><span>' + escapeHtml(booking.requested_by || "Hidden") + '</span></p>' +
    '<p><strong>Stored state</strong><span>' + escapeHtml(formatStatusLabel(booking.stored_status || booking.status)) + '</span></p>' +
    '<p><strong>Created</strong><span>' + escapeHtml(formatTableDateTime(booking.created_at)) + '</span></p>' +
    '<p><strong>Updated</strong><span>' + escapeHtml(formatTableDateTime(booking.updated_at)) + '</span></p>' +
    '</div>';
}

function renderApprovalChainMarkup(booking) {
  const history = state.bookingHistoryById[booking.id];

  if (booking.stored_status === "planned") {
    return '<p class="empty-state">Planned bookings do not collect approvals yet. Move the booking into requested first.</p>';
  }

  if (!history) {
    return '<p class="empty-state">Loading approval chain...</p>';
  }

  if (!history.approval_chain || history.approval_chain.length === 0) {
    return '<p class="empty-state">No approval groups are required for this booking.</p>';
  }

  return history.approval_chain.map(function (entry) {
    return '<article class="audit-item approval-item">' +
      '<div class="approval-item-top">' +
      '<strong>' + escapeHtml(entry.group_name) + '</strong>' +
      '<span class="status-badge ' + escapeHtml(entry.approved ? "status-approved" : "status-requested") + '">' + escapeHtml(entry.approved ? "Approved" : "Pending") + '</span>' +
      '</div>' +
      '<p class="booking-meta">' + escapeHtml(entry.approved ? ("Approved by " + entry.approved_by + " on " + formatTableDateTime(entry.approved_at) + ".") : "Waiting for this group.") + '</p>' +
      '</article>';
  }).join("");
}

function renderAuditTrailMarkup(booking) {
  const history = state.bookingHistoryById[booking.id];

  if (!history) {
    return '<p class="empty-state">Loading change log...</p>';
  }

  if (!history.audit_entries || history.audit_entries.length === 0) {
    return '<p class="empty-state">No audit entries yet.</p>';
  }

  return history.audit_entries.map(function (entry) {
    return '<article class="audit-item">' +
      '<div class="audit-item-top">' +
      '<strong>' + escapeHtml(getAuditActionLabel(entry)) + '</strong>' +
      '<span class="small-text">' + escapeHtml(formatTableDateTime(entry.created_at)) + '</span>' +
      '</div>' +
      '<p class="booking-meta">' + escapeHtml(getAuditActorLabel(entry) + getAuditDetailText(entry)) + '</p>' +
      '</article>';
  }).join("");
}

async function handleLoginSubmit(event) {
  event.preventDefault();

  if (state.fallbackMode) {
    showMessage("Login is unavailable while the backend is offline.", "error");
    return;
  }

  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value;

  if (!username || !password) {
    showMessage("Username and password are required.", "error");
    return;
  }

  try {
    const result = await apiRequest("/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        username: username,
        password: password
      })
    });

    state.token = result.access_token;
    state.currentUser = result.user;
    state.displayMode = "table";
    localStorage.setItem(STORAGE_KEY, state.token);
    document.getElementById("login-form").reset();
    showMessage("Login successful.", "success");
    await refreshBoard();
  } catch (error) {
    showMessage(error.message, "error");
  }
}

function handleLogoutClick() {
  clearSession(true);
  resetBookingEditor(true);
  renderPage();
}

async function handleBookingSubmit(event) {
  event.preventDefault();

  const editingBooking = getEditingBooking();
  const payload = getBookingFormPayload();
  const validationErrors = validateBookingForm(payload, editingBooking);

  if (validationErrors.length > 0) {
    showMessage(validationErrors.join(" "), "error");
    return;
  }

  try {
    if (editingBooking) {
      if (requiresApprovalReset(editingBooking, payload)) {
        const confirmed = window.confirm(RESET_WARNING_TEXT);

        if (!confirmed) {
          return;
        }
      }

      await apiRequest("/bookings/" + editingBooking.id, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          area_id: Number(payload.areaId),
          start_time: payload.startTime,
          end_time: payload.endTime,
          title: payload.title,
          description: "",
          note: payload.note
        })
      });

      showMessage("Booking updated successfully.", "success");
      resetBookingEditor(true);
    } else {
      await apiRequest("/bookings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          area_id: Number(payload.areaId),
          start_time: payload.startTime,
          end_time: payload.endTime,
          status: payload.status,
          title: payload.title,
          description: "",
          note: payload.note,
          owner_group_id: payload.ownerGroupId ? Number(payload.ownerGroupId) : null
        })
      });

      document.getElementById("booking-form").reset();
      prefillBookingFormFromSelection();
      showMessage("Booking created successfully.", "success");
    }

    await refreshBoard();
  } catch (error) {
    showMessage(error.message, "error");
  }
}

function getBookingFormPayload() {
  return {
    areaId: document.getElementById("area").value,
    startTime: document.getElementById("start-time").value,
    endTime: document.getElementById("end-time").value,
    status: document.getElementById("booking-status").value,
    title: document.getElementById("booking-title").value.trim(),
    note: document.getElementById("note").value.trim(),
    ownerGroupId: document.getElementById("owner-group").value
  };
}

function validateBookingForm(payload, editingBooking) {
  const errors = [];

  if (!payload.areaId) {
    errors.push("Area is required.");
  }

  if (!payload.startTime) {
    errors.push("Start time is required.");
  }

  if (!payload.endTime) {
    errors.push("End time is required.");
  }

  if (!editingBooking && !payload.status) {
    errors.push("Choose whether this booking starts as planned or requested.");
  }

  if (state.currentUser && state.currentUser.role === "admin" && !editingBooking && !payload.ownerGroupId) {
    errors.push("Admin-created bookings must choose an owner group.");
  }

  if (payload.startTime && payload.endTime) {
    const startDate = new Date(payload.startTime);
    const endDate = new Date(payload.endTime);

    if (endDate <= startDate) {
      errors.push("End time must be after start time.");
    }
  }

  if (payload.title.length > 120) {
    errors.push("Title must be 120 characters or fewer.");
  }

  if (payload.note.length > 200) {
    errors.push("Note must be 200 characters or fewer.");
  }

  return errors;
}

function handleBookingFormReset() {
  if (state.editingBookingId) {
    setTimeout(function () {
      populateBookingFormForEdit(getEditingBooking());
    }, 0);
    return;
  }

  setTimeout(function () {
    prefillBookingFormFromSelection();
  }, 0);
}

function handleCancelEditClick() {
  resetBookingEditor(true);
  renderBookingPanel();
}

function handleBookingPanelToggle() {
  if (state.editingBookingId) {
    return;
  }

  state.bookingPanelCollapsed = !state.bookingPanelCollapsed;
  renderBookingPanel();
}

async function handleBoardActionClick(event) {
  const bookingCard = event.target.closest("[data-booking-select]");

  if (bookingCard && !event.target.closest("button[data-action], a")) {
    state.selectedBookingId = Number(bookingCard.getAttribute("data-booking-select"));
    const booking = getSelectedBooking();

    if (booking) {
      state.selectedDateKey = getDateKey(getDateOnly(parseDateTime(booking.start_time)));
    }

    ensureBookingHistoryLoaded(state.selectedBookingId);
    renderPage();
    return;
  }

  const button = event.target.closest("button[data-action]");

  if (!button) {
    return;
  }

  if (state.fallbackMode) {
    showMessage("Updates are unavailable in fallback mode.", "error");
    return;
  }

  const actionName = button.getAttribute("data-action");
  const bookingId = Number(button.getAttribute("data-booking-id"));

  if (actionName === "edit") {
    startEditingBooking(bookingId);
    return;
  }

  try {
    if (actionName === "delete") {
      await apiRequest("/bookings/" + bookingId, {
        method: "DELETE"
      });
    } else {
      await apiRequest("/bookings/" + bookingId + "/" + actionName, {
        method: "PATCH"
      });
    }

    if (state.editingBookingId === bookingId) {
      resetBookingEditor(true);
    }

    showMessage(actionName === "delete" ? "Booking deleted successfully." : "Booking updated successfully.", "success");
    await refreshBoard();
  } catch (error) {
    showMessage(error.message, "error");
  }
}

function startEditingBooking(bookingId) {
  const booking = findBookingById(bookingId);

  if (!booking) {
    showMessage("This booking could not be found anymore.", "error");
    return;
  }

  state.editingBookingId = bookingId;
  populateBookingFormForEdit(booking);
  renderBookingPanel();
  document.getElementById("booking-panel").scrollIntoView({ behavior: "smooth", block: "start" });
}

function populateBookingFormForEdit(booking) {
  document.getElementById("area").value = String(booking.area_id);
  document.getElementById("start-time").value = formatDateTimeInputValue(booking.start_time);
  document.getElementById("end-time").value = formatDateTimeInputValue(booking.end_time);
  document.getElementById("booking-status").value = booking.stored_status;
  document.getElementById("booking-title").value = booking.title || "";
  document.getElementById("note").value = booking.note || "";
  document.getElementById("owner-group").value = booking.owner_group_id ? String(booking.owner_group_id) : "";
}

function resetBookingEditor(resetForm) {
  state.editingBookingId = null;

  if (resetForm) {
    document.getElementById("booking-form").reset();
    prefillBookingFormFromSelection();
  }
}

function getEditingBooking() {
  if (!state.editingBookingId) {
    return null;
  }

  return findBookingById(state.editingBookingId);
}

function findBookingById(bookingId) {
  return state.bookings.find(function (booking) {
    return booking.id === bookingId;
  }) || null;
}

function getSelectedBooking() {
  if (!state.selectedBookingId) {
    return null;
  }

  return findBookingById(state.selectedBookingId);
}

function getEffectiveBookingPermissions(booking) {
  const role = getEffectiveViewRole();

  if (role === "guest") {
    return {};
  }

  if (role === "member" && state.currentUser && state.currentUser.role === "admin") {
    const previewGroup = getEffectivePreviewGroup();
    const previewGroupId = getEffectivePreviewGroupId();
    const isOwnerGroup = previewGroupId && previewGroupId === booking.owner_group_id;
    const isOpen = !["rejected", "cancelled", "completed"].includes(booking.status);
    const previewGroupAlreadyApproved = booking.approvals.some(function (approval) {
      return approval.approver_group_id === previewGroupId;
    });
    const canApproveFromPreviewGroup = Boolean(
      previewGroup &&
      previewGroup.can_approve &&
      booking.stored_status === "requested" &&
      previewGroupId !== booking.owner_group_id &&
      !previewGroupAlreadyApproved
    );

    return {
      can_modify: isOwnerGroup && isOpen,
      can_cancel: isOwnerGroup && isOpen,
      can_submit_request: isOwnerGroup && booking.stored_status === "planned",
      can_reject: false,
      can_approve: canApproveFromPreviewGroup,
      can_delete: false,
    };
  }

  return booking.permissions || {};
}

function requiresApprovalReset(booking, payload) {
  if (!booking || (booking.stored_status !== "requested" && booking.stored_status !== "approved")) {
    return false;
  }

  return String(booking.area_id) !== String(payload.areaId) ||
    formatDateTimeInputValue(booking.start_time) !== payload.startTime ||
    formatDateTimeInputValue(booking.end_time) !== payload.endTime;
}

function shouldShowResetWarning(booking) {
  return booking && (booking.stored_status === "requested" || booking.stored_status === "approved");
}

function handleCalendarClick(event) {
  const bookingRow = event.target.closest("[data-booking-select]");

  if (bookingRow && !event.target.closest("button[data-action], a")) {
    state.selectedBookingId = Number(bookingRow.getAttribute("data-booking-select"));
    const booking = getSelectedBooking();

    if (booking) {
      state.selectedDateKey = getDateKey(getDateOnly(parseDateTime(booking.start_time)));
    }

    ensureBookingHistoryLoaded(state.selectedBookingId);
    renderPage();
    return;
  }

  const dayButton = event.target.closest("button[data-date-key]");

  if (!dayButton) {
    return;
  }

  state.selectedDateKey = dayButton.getAttribute("data-date-key");
  syncSelectedBooking();
  renderCalendar();
  renderSelectedDayPanel();
  renderBookingDetailPanel();

  if (!state.editingBookingId) {
    prefillBookingFormFromSelection();
  }
}

function handleTodayClick() {
  state.selectedDateKey = getDateKey(new Date());
  ensureVisiblePeriodForDate(parseDateKey(state.selectedDateKey));
  renderPage();
  scrollSelectedDayIntoView("smooth");
}

function handleDisplaySwitchClick(event) {
  const displayButton = event.target.closest("button[data-display-mode]");

  if (!displayButton) {
    return;
  }

  const nextDisplayMode = displayButton.getAttribute("data-display-mode");

  if (nextDisplayMode === state.displayMode) {
    return;
  }

  state.displayMode = nextDisplayMode;
  syncViewPermissions();
  renderPage();
}

function handleViewSwitchClick(event) {
  const viewButton = event.target.closest("button[data-view]");

  if (!viewButton) {
    return;
  }

  const nextView = viewButton.getAttribute("data-view");

  if (nextView === state.viewMode) {
    return;
  }

  state.viewMode = nextView;
  ensureVisiblePeriodForDate(parseDateKey(state.selectedDateKey));
  renderPage();
  scrollSelectedDayIntoView("auto");
}

function handleFilterChange() {
  state.filters.areaId = document.getElementById("area-filter").value;
  state.filters.status = document.getElementById("status-filter").value;
  state.filters.person = document.getElementById("person-filter").value.trim().toLowerCase();
  renderPage();
}

function handleTableSortChange() {
  state.tableSort = document.getElementById("table-sort").value;
  renderCalendar();
}

function handlePreviewRoleChange() {
  state.previewRole = document.getElementById("preview-role").value;

  if (state.previewRole === "member" && !state.previewGroupId && state.groups.length > 0) {
    state.previewGroupId = String(state.groups[0].id);
  }

  syncViewPermissions();
  renderPage();
}

function handlePreviewGroupChange() {
  state.previewGroupId = document.getElementById("preview-group").value;
  syncViewPermissions();
  renderPage();
}

function handleWindowScroll() {
  if (state.displayMode === "calendar") {
    maybeExtendCurrentView();
  }
  updateCurrentPeriodLabel();
}

function maybeExtendCurrentView() {
  if (state.viewMode === "month") {
    maybeExtendMonths();
    return;
  }

  maybeExtendYears();
}

function maybeExtendMonths() {
  const calendarPeriods = document.getElementById("calendar-periods");

  if (calendarPeriods.scrollTop + calendarPeriods.clientHeight > calendarPeriods.scrollHeight - 800) {
    appendFutureMonths();
  }

  if (calendarPeriods.scrollTop < 220) {
    prependPastMonths();
  }
}

function maybeExtendYears() {
  const calendarPeriods = document.getElementById("calendar-periods");

  if (calendarPeriods.scrollTop + calendarPeriods.clientHeight > calendarPeriods.scrollHeight - 800) {
    appendFutureYears();
  }

  if (calendarPeriods.scrollTop < 220) {
    prependPastYears();
  }
}

function appendFutureMonths() {
  const lastMonth = state.months[state.months.length - 1];
  const calendarPeriods = document.getElementById("calendar-periods");
  const previousScrollTop = calendarPeriods.scrollTop;
  let offset = 1;

  while (offset <= MONTH_BATCH_SIZE) {
    const monthToAdd = addMonths(lastMonth, offset);

    if (!hasMonth(monthToAdd)) {
      state.months.push(monthToAdd);
    }

    offset += 1;
  }

  renderCalendar();
  calendarPeriods.scrollTop = previousScrollTop;
}

function prependPastMonths() {
  const firstMonth = state.months[0];
  const calendarPeriods = document.getElementById("calendar-periods");
  const previousHeight = calendarPeriods.scrollHeight;
  const monthsToAdd = [];
  let offset = MONTH_BATCH_SIZE;

  while (offset >= 1) {
    const monthToAdd = addMonths(firstMonth, 0 - offset);

    if (!hasMonth(monthToAdd)) {
      monthsToAdd.push(monthToAdd);
    }

    offset -= 1;
  }

  if (monthsToAdd.length === 0) {
    return;
  }

  state.months = monthsToAdd.concat(state.months);
  renderCalendar();
  calendarPeriods.scrollTop += calendarPeriods.scrollHeight - previousHeight;
}

function appendFutureYears() {
  const lastYear = state.years[state.years.length - 1];
  const calendarPeriods = document.getElementById("calendar-periods");
  const previousScrollTop = calendarPeriods.scrollTop;
  let offset = 1;

  while (offset <= YEAR_BATCH_SIZE) {
    const yearToAdd = addYears(lastYear, offset);

    if (!hasYear(yearToAdd)) {
      state.years.push(yearToAdd);
    }

    offset += 1;
  }

  renderCalendar();
  calendarPeriods.scrollTop = previousScrollTop;
}

function prependPastYears() {
  const firstYear = state.years[0];
  const calendarPeriods = document.getElementById("calendar-periods");
  const previousHeight = calendarPeriods.scrollHeight;
  const yearsToAdd = [];
  let offset = YEAR_BATCH_SIZE;

  while (offset >= 1) {
    const yearToAdd = addYears(firstYear, 0 - offset);

    if (!hasYear(yearToAdd)) {
      yearsToAdd.push(yearToAdd);
    }

    offset -= 1;
  }

  if (yearsToAdd.length === 0) {
    return;
  }

  state.years = yearsToAdd.concat(state.years);
  renderCalendar();
  calendarPeriods.scrollTop += calendarPeriods.scrollHeight - previousHeight;
}

function updateCurrentPeriodLabel() {
  const label = document.getElementById("current-period-label");
  const calendarPeriods = document.getElementById("calendar-periods");

  if (state.displayMode === "table") {
    label.textContent = "Booking table";
    return;
  }

  const periodPanels = document.querySelectorAll(".period-panel[data-period-label]");
  let activeLabel = null;

  periodPanels.forEach(function (panel) {
    const topOffset = panel.offsetTop - calendarPeriods.scrollTop;

    if (topOffset <= 48) {
      activeLabel = panel.getAttribute("data-period-label");
    }
  });

  if (!activeLabel && periodPanels.length > 0) {
    activeLabel = periodPanels[0].getAttribute("data-period-label");
  }

  if (!activeLabel) {
    activeLabel = getDefaultPeriodLabel();
  }

  label.textContent = activeLabel;
}

function getDefaultPeriodLabel() {
  if (state.displayMode === "table") {
    return "Booking table";
  }

  if (state.viewMode === "month") {
    return formatMonthLabel(state.months[0] || getMonthStart(new Date()));
  }

  return String((state.years[0] || getYearStart(new Date())).getFullYear());
}

function hasMonth(dateValue) {
  const monthKey = getMonthKey(dateValue);

  return state.months.some(function (monthDate) {
    return getMonthKey(monthDate) === monthKey;
  });
}

function hasYear(dateValue) {
  const yearKey = getYearKey(dateValue);

  return state.years.some(function (yearDate) {
    return getYearKey(yearDate) === yearKey;
  });
}

function clearSession(showConfirmation) {
  state.token = null;
  state.currentUser = null;
  state.groups = [];
  state.displayMode = "calendar";
  state.previewRole = "current";
  state.previewGroupId = "";
  localStorage.removeItem(STORAGE_KEY);

  if (showConfirmation) {
    showMessage("Logged out. Guest view is active again.", "info");
  }
}

function getFilteredBookings() {
  return state.bookings.filter(function (booking) {
    const visibilityMatches = canBookingBeSeenInCurrentView(booking);
    const areaMatches = !state.filters.areaId || String(booking.area_id) === state.filters.areaId;
    const statusMatches = isGuestView() || !state.filters.status || booking.status === state.filters.status;
    const requestedBy = booking.requested_by ? booking.requested_by.toLowerCase() : "";
    const personMatches = isGuestView() || !state.filters.person || requestedBy.indexOf(state.filters.person) !== -1;

    return visibilityMatches && areaMatches && statusMatches && personMatches;
  });
}

function buildBookingIndex(bookings) {
  const index = {};

  bookings.forEach(function (booking) {
    let currentDate = getDateOnly(parseDateTime(booking.start_time));
    const endDate = getDateOnly(parseDateTime(booking.end_time));

    while (currentDate.getTime() <= endDate.getTime()) {
      const dateKey = getDateKey(currentDate);

      if (!index[dateKey]) {
        index[dateKey] = [];
      }

      index[dateKey].push(booking);
      currentDate = addDays(currentDate, 1);
    }
  });

  Object.keys(index).forEach(function (dateKey) {
    index[dateKey].sort(function (bookingA, bookingB) {
      return parseDateTime(bookingA.start_time) - parseDateTime(bookingB.start_time);
    });
  });

  return index;
}

function getBookingsForDate(dateKey) {
  if (!state.bookingIndex[dateKey]) {
    return [];
  }

  return state.bookingIndex[dateKey].slice();
}

function getSortedTableBookings() {
  const bookings = state.filteredBookings.slice();

  bookings.sort(function (bookingA, bookingB) {
    switch (state.tableSort) {
      case "start_desc":
        return parseDateTime(bookingB.start_time) - parseDateTime(bookingA.start_time);
      case "area_asc":
        return compareTextValues(bookingA.area_name, bookingB.area_name) ||
          compareDateValues(bookingA.start_time, bookingB.start_time);
      case "status_asc":
        return compareTextValues(formatStatusLabel(bookingA.status), formatStatusLabel(bookingB.status)) ||
          compareDateValues(bookingA.start_time, bookingB.start_time);
      case "requester_asc":
        return compareTextValues(bookingA.requested_by, bookingB.requested_by) ||
          compareDateValues(bookingA.start_time, bookingB.start_time);
      case "start_asc":
      default:
        return compareDateValues(bookingA.start_time, bookingB.start_time);
    }
  });

  return bookings;
}

function getTableSummaryMetrics() {
  const approvalCount = state.filteredBookings.filter(function (booking) {
    const permissions = getEffectiveBookingPermissions(booking);
    return Boolean(permissions.can_approve);
  }).length;
  const previewGroupId = getEffectivePreviewGroupId();
  const plannedCount = previewGroupId ? state.filteredBookings.filter(function (booking) {
    return booking.owner_group_id === previewGroupId && booking.stored_status === "planned";
  }).length : 0;

  return {
    approvalCount: approvalCount,
    plannedCount: plannedCount,
  };
}

function buildMonthCells(monthDate) {
  const firstDayOfMonth = getMonthStart(monthDate);
  const leadingPlaceholders = getMondayBasedDayIndex(firstDayOfMonth);
  const totalDays = getDaysInMonth(monthDate);
  const totalSlots = leadingPlaceholders + totalDays;
  const trailingPlaceholders = (7 - (totalSlots % 7)) % 7;
  const firstGridDate = addDays(firstDayOfMonth, 0 - leadingPlaceholders);
  const slotCount = totalSlots + trailingPlaceholders;
  const cells = [];

  for (let slotIndex = 0; slotIndex < slotCount; slotIndex += 1) {
    const dateValue = addDays(firstGridDate, slotIndex);
    const isInMonth = dateValue.getMonth() === monthDate.getMonth();

    cells.push({
      inMonth: isInMonth,
      date: dateValue,
      dateKey: getDateKey(dateValue)
    });
  }

  return cells;
}

function buildMonthWeeks(monthDate) {
  const cells = buildMonthCells(monthDate);
  const weeks = [];

  for (let index = 0; index < cells.length; index += 7) {
    const weekCells = cells.slice(index, index + 7);

    weeks.push({
      cells: weekCells,
      segments: getWeekBookingSegments(weekCells)
    });
  }

  return weeks;
}

function getWeekBookingSegments(weekCells) {
  const uniqueBookings = {};
  const visibleWeekCells = weekCells.filter(function (cell) {
    return cell.inMonth;
  });

  if (visibleWeekCells.length === 0) {
    return [];
  }

  visibleWeekCells.forEach(function (cell) {
    getBookingsForDate(cell.dateKey).forEach(function (booking) {
      uniqueBookings[booking.id] = booking;
    });
  });

  return Object.keys(uniqueBookings).map(function (bookingId) {
    return buildWeekBookingSegment(uniqueBookings[bookingId], weekCells, visibleWeekCells);
  }).sort(function (segmentA, segmentB) {
    return parseDateTime(segmentA.booking.start_time) - parseDateTime(segmentB.booking.start_time);
  });
}

function buildWeekBookingSegment(booking, weekCells, visibleWeekCells) {
  const bookingStart = getDateOnly(parseDateTime(booking.start_time));
  const bookingEnd = getDateOnly(parseDateTime(booking.end_time));
  const weekStart = getDateOnly(weekCells[0].date);
  const weekEnd = getDateOnly(weekCells[6].date);
  const visibleStart = getDateOnly(visibleWeekCells[0].date);
  const visibleEnd = getDateOnly(visibleWeekCells[visibleWeekCells.length - 1].date);
  const segmentStart = maxDate(bookingStart, visibleStart);
  const segmentEnd = minDate(bookingEnd, visibleEnd);
  const columnStart = getDayOffset(weekStart, segmentStart) + 1;
  const columnEnd = getDayOffset(weekStart, minDate(weekEnd, segmentEnd)) + 1;

  return {
    booking: booking,
    columnStart: columnStart,
    spanColumns: columnEnd - columnStart + 1
  };
}

function prefillBookingFormFromSelection() {
  const panel = document.getElementById("booking-panel");
  const startInput = document.getElementById("start-time");
  const endInput = document.getElementById("end-time");
  const statusInput = document.getElementById("booking-status");
  const ownerGroupSelect = document.getElementById("owner-group");

  if (!panel || panel.classList.contains("hidden") || state.editingBookingId) {
    return;
  }

  if (!startInput.value) {
    const selectedDate = parseDateKey(state.selectedDateKey);
    startInput.value = formatDateTimeLocalInput(selectedDate, 9, 0);
  }

  if (!endInput.value) {
    const selectedDate = parseDateKey(state.selectedDateKey);
    endInput.value = formatDateTimeLocalInput(selectedDate, 10, 0);
  }

  if (!statusInput.value) {
    statusInput.value = "requested";
  }

  if (state.currentUser && state.currentUser.role === "admin" && !ownerGroupSelect.value && state.groups.length > 0) {
    ownerGroupSelect.value = String(state.groups[0].id);
  }
}

function ensureVisiblePeriodForDate(dateValue) {
  if (state.viewMode === "month") {
    const targetMonth = getMonthStart(dateValue);

    if (!hasMonth(targetMonth)) {
      state.months = [targetMonth];
    }

    return;
  }

  const targetYear = getYearStart(dateValue);

  if (!hasYear(targetYear)) {
    state.years = [targetYear];
  }
}

function scrollSelectedDayIntoView(behaviorValue) {
  const selectedDay = document.querySelector('[data-date-key="' + state.selectedDateKey + '"]');

  if (!selectedDay) {
    return;
  }

  selectedDay.scrollIntoView({
    behavior: behaviorValue,
    block: "center"
  });
}

async function ensureBookingHistoryLoaded(bookingId) {
  if (!bookingId || state.bookingHistoryById[bookingId] || !state.currentUser || state.fallbackMode) {
    return;
  }

  try {
    const history = await apiRequest("/bookings/" + bookingId + "/history");
    state.bookingHistoryById[bookingId] = history;

    if (state.selectedBookingId === bookingId) {
      renderBookingDetailPanel();
    }
  } catch (error) {
    state.bookingHistoryById[bookingId] = {
      approval_chain: [],
      audit_entries: []
    };

    if (state.selectedBookingId === bookingId) {
      renderBookingDetailPanel();
    }
  }
}

async function apiRequest(path, options) {
  const requestOptions = options || {};
  const headers = new Headers(requestOptions.headers || {});

  if (state.token) {
    headers.set("Authorization", "Bearer " + state.token);
  }

  const response = await fetch(API_BASE_URL + path, {
    method: requestOptions.method || "GET",
    headers: headers,
    body: requestOptions.body
  });

  let responseData = null;
  const responseText = await response.text();

  if (responseText) {
    try {
      responseData = JSON.parse(responseText);
    } catch (error) {
      responseData = null;
    }
  }

  if (!response.ok) {
    const message = responseData && responseData.detail ? responseData.detail : "Request failed.";
    const requestError = new Error(message);
    requestError.status = response.status;
    throw requestError;
  }

  return responseData;
}

function showMessage(text, messageType) {
  const messageBox = document.getElementById("message-box");

  messageBox.textContent = text;
  messageBox.className = "message-box message-" + messageType;
  messageBox.classList.remove("hidden");
  document.dispatchEvent(new CustomEvent("message:changed"));
}

function getDayButtonTitle(dateValue, bookings) {
  if (isGuestView()) {
    const occupiedText = bookings.length === 1 ? "occupied" : bookings.length + " occupied";
    return formatLongDate(dateValue) + " · " + occupiedText;
  }

  const bookingText = bookings.length === 1 ? "1 booking" : bookings.length + " bookings";
  return formatLongDate(dateValue) + " · " + bookingText;
}

function formatDateTimeRange(startValue, endValue) {
  const startDate = parseDateTime(startValue);
  const endDate = parseDateTime(endValue);
  return formatLongDate(startDate) + " · " + formatTime(startDate) + " to " + formatTime(endDate);
}

function formatTableDateTime(value) {
  return parseDateTime(value).toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function getBookingSpanTitle(booking) {
  if (isGuestView()) {
    return "Occupied";
  }

  return getBookingShortLabel(booking) + " · " + formatDateTimeRange(booking.start_time, booking.end_time) + " · " + formatStatusLabel(booking.status);
}

function getBookingShortLabel(booking) {
  if (isGuestView()) {
    return "Occupied";
  }

  if (booking.title) {
    return booking.title;
  }

  return booking.area_name;
}

function getMonthBarLabel(booking) {
  if (isGuestView()) {
    return "Occupied";
  }

  if (booking.title) {
    return booking.area_name + " · " + booking.title;
  }

  return booking.area_name;
}

function getGoogleFlightsUrl(booking) {
  const departureDate = getDateKey(getDateOnly(parseDateTime(booking.start_time)));
  const returnDate = getDateKey(getDateOnly(parseDateTime(booking.end_time)));
  const searchQuery = "ZRH VLC " + departureDate + " " + returnDate;

  return "https://www.google.com/travel/flights?gl=CH&hl=en&q=" + encodeURIComponent(searchQuery);
}

function formatMonthLabel(dateValue) {
  return dateValue.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric"
  });
}

function formatShortMonthLabel(dateValue) {
  return dateValue.toLocaleDateString(undefined, {
    month: "long"
  });
}

function formatLongDate(dateValue) {
  return dateValue.toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  });
}

function formatTime(dateValue) {
  return dateValue.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatDateTimeLocalInput(dateValue, hourValue, minuteValue) {
  const result = new Date(dateValue);
  result.setHours(hourValue, minuteValue, 0, 0);

  return result.getFullYear() +
    "-" + padNumber(result.getMonth() + 1) +
    "-" + padNumber(result.getDate()) +
    "T" + padNumber(result.getHours()) +
    ":" + padNumber(result.getMinutes());
}

function formatDateTimeInputValue(value) {
  return String(value).replace(" ", "T");
}

function getStatusClass(statusValue) {
  if (isGuestView()) {
    return "status-busy";
  }

  return "status-" + statusValue;
}

function formatStatusLabel(statusValue) {
  return STATUS_LABELS[statusValue] || statusValue;
}

function isGuestView() {
  return getEffectiveViewRole() === "guest";
}

function getEffectiveViewRole() {
  if (!state.currentUser) {
    return "guest";
  }

  if (state.currentUser.role === "admin") {
    if (state.previewRole === "member") {
      return "member";
    }

    if (state.previewRole === "guest") {
      return "guest";
    }

    return "admin";
  }

  return "member";
}

function getEffectivePreviewGroupId() {
  if (!state.currentUser) {
    return null;
  }

  if (state.currentUser.role === "admin") {
    if (state.previewRole !== "member") {
      return null;
    }

    return state.previewGroupId ? Number(state.previewGroupId) : null;
  }

  return state.currentUser.group_id || null;
}

function getEffectivePreviewGroup() {
  const groupId = getEffectivePreviewGroupId();

  if (!groupId) {
    return null;
  }

  return state.groups.find(function (group) {
    return group.id === groupId;
  }) || null;
}

function getEffectivePreviewGroupName() {
  const previewGroup = getEffectivePreviewGroup();

  if (!previewGroup) {
    return "no group";
  }

  return previewGroup.name;
}

function canBookingBeSeenInCurrentView(booking) {
  const role = getEffectiveViewRole();

  if (role === "admin") {
    return true;
  }

  if (role === "member") {
    const groupId = getEffectivePreviewGroupId();

    if (groupId && booking.owner_group_id === groupId) {
      return true;
    }

    return ["requested", "planned", "approved", "completed"].includes(booking.status);
  }

  return ["requested", "planned", "approved", "completed"].includes(booking.status);
}

function compareTextValues(valueA, valueB) {
  return String(valueA || "").localeCompare(String(valueB || ""), undefined, { sensitivity: "base" });
}

function compareDateValues(valueA, valueB) {
  return parseDateTime(valueA) - parseDateTime(valueB);
}

function getAuditActionLabel(entry) {
  const labels = {
    booking_created: "Booking created",
    booking_updated: "Booking updated",
    booking_requested: "Moved to requested",
    booking_group_approved: "Group approval recorded",
    booking_approved_admin: "Approved by admin",
    booking_rejected: "Rejected",
    booking_cancelled: "Cancelled",
    booking_deleted: "Deleted"
  };

  return labels[entry.action_type] || entry.action_type.replace(/_/g, " ");
}

function getAuditActorLabel(entry) {
  return (entry.actor_username || "System") + " · ";
}

function getAuditDetailText(entry) {
  const details = entry.details || {};

  if (entry.action_type === "booking_created") {
    return "created the booking in " + formatStatusLabel(details.status || "requested") + ".";
  }

  if (entry.action_type === "booking_updated") {
    if (details.approvals_cleared) {
      return "updated the booking and cleared prior approvals.";
    }

    return "updated booking details.";
  }

  if (entry.action_type === "booking_group_approved") {
    const booking = getSelectedBooking();
    const group = booking ? booking.required_approval_groups.find(function (item) {
      return item.id === details.approver_group_id;
    }) : null;
    return "recorded approval for " + (group ? group.name : "an approval group") + ".";
  }

  if (entry.action_type === "booking_approved_admin") {
    return "approved the booking directly.";
  }

  if (entry.action_type === "booking_requested") {
    return "moved a planned hold into the request workflow.";
  }

  if (entry.action_type === "booking_rejected") {
    return "rejected the request.";
  }

  if (entry.action_type === "booking_cancelled") {
    return "cancelled the booking.";
  }

  if (entry.action_type === "booking_deleted") {
    return "deleted the booking.";
  }

  return "performed " + entry.action_type.replace(/_/g, " ") + ".";
}

function getDefaultApiBaseUrl() {
  if (window.location.protocol === "file:") {
    return "http://127.0.0.1:8000";
  }

  return window.location.protocol + "//" + window.location.hostname + ":8000";
}

function parseDateTime(value) {
  return new Date(String(value).replace(" ", "T"));
}

function getDateOnly(dateValue) {
  return new Date(dateValue.getFullYear(), dateValue.getMonth(), dateValue.getDate());
}

function getMonthStart(dateValue) {
  return new Date(dateValue.getFullYear(), dateValue.getMonth(), 1);
}

function getYearStart(dateValue) {
  return new Date(dateValue.getFullYear(), 0, 1);
}

function addMonths(dateValue, monthCount) {
  return new Date(dateValue.getFullYear(), dateValue.getMonth() + monthCount, 1);
}

function addYears(dateValue, yearCount) {
  return new Date(dateValue.getFullYear() + yearCount, 0, 1);
}

function addDays(dateValue, dayCount) {
  return new Date(dateValue.getFullYear(), dateValue.getMonth(), dateValue.getDate() + dayCount);
}

function getDayOffset(startDate, endDate) {
  return Math.round((getDateOnly(endDate).getTime() - getDateOnly(startDate).getTime()) / 86400000);
}

function minDate(dateA, dateB) {
  return dateA.getTime() <= dateB.getTime() ? dateA : dateB;
}

function maxDate(dateA, dateB) {
  return dateA.getTime() >= dateB.getTime() ? dateA : dateB;
}

function getMondayBasedDayIndex(dateValue) {
  const dayIndex = dateValue.getDay();

  if (dayIndex === 0) {
    return 6;
  }

  return dayIndex - 1;
}

function getDaysInMonth(dateValue) {
  return new Date(dateValue.getFullYear(), dateValue.getMonth() + 1, 0).getDate();
}

function getDateKey(dateValue) {
  return dateValue.getFullYear() + "-" + padNumber(dateValue.getMonth() + 1) + "-" + padNumber(dateValue.getDate());
}

function getMonthKey(dateValue) {
  return dateValue.getFullYear() + "-" + padNumber(dateValue.getMonth() + 1);
}

function getYearKey(dateValue) {
  return String(dateValue.getFullYear());
}

function parseDateKey(dateKey) {
  const parts = dateKey.split("-");
  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
}

function padNumber(numberValue) {
  return String(numberValue).padStart(2, "0");
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
