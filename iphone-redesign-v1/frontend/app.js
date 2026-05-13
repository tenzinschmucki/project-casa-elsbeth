"use strict";

const urlParameters = new URLSearchParams(window.location.search);

if (shouldRedirectFromLocalFile()) {
  window.location.replace(getServedPreviewUrl());
}

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
  activeMainView: "calendar",
  activeBookingDetailTab: "details",
  mobileScreen: "main",
  mobileBookingReturnScreen: "main",
  mobileShowFilters: false,
  filters: {
    areaId: "",
    status: "",
    person: ""
  }
};

const ICONS = {
  time: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.8"></circle><path d="M12 7.8v4.7l3.2 1.9" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"></path></svg>',
  person: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12a3.8 3.8 0 1 0 0-7.6 3.8 3.8 0 0 0 0 7.6Z" fill="none" stroke="currentColor" stroke-width="1.8"></path><path d="M5.5 19.2c1.6-2.7 4-4 6.5-4s4.9 1.3 6.5 4" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.8"></path></svg>',
  group: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" fill="none" stroke="currentColor" stroke-width="1.8"></path><path d="M16.3 10a2.5 2.5 0 1 0 0-5" fill="none" stroke="currentColor" stroke-width="1.8"></path><path d="M4.8 18.5c1.1-2.1 2.9-3.2 5-3.2 2.1 0 3.9 1.1 5 3.2" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.8"></path><path d="M15 15.6c1.7.1 3.1 1 4.2 2.9" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.8"></path></svg>',
  area: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 18.8V8.6l5.5-3.2 5.5 3.2v10.2" fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="1.8"></path><path d="M4.8 18.8h14.4M9.4 18.8v-4.4h5.2v4.4M9 10.5h.1M14.9 10.5h.1" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.8"></path></svg>',
  calendar: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4.5" y="6.5" width="15" height="13" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.8"></rect><path d="M8 4.8v3.4M16 4.8v3.4M4.5 10.2h15" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.8"></path></svg>',
  plane: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.4 5.4 13 12.8m0 0-1.3 5.8-2.2-3.6-3.6-2.2 5.8-1.3m1.3 1.3L20.4 5.4c.4-.4.4-1 0-1.4s-1-.4-1.4 0L11.6 11.4" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"></path></svg>',
  approval: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-dasharray="2.4 2.4" stroke-width="1.8"></circle><path d="m9.4 12.1 1.8 1.9 3.7-4.2" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"></path></svg>',
  history: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.2 8.1V4.8M6.2 4.8H2.9M6.2 4.8A8.5 8.5 0 1 1 3.8 10" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"></path><path d="M12 8.2v4.1l2.8 1.6" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"></path></svg>'
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
  syncClientMode();
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
  document.getElementById("period-previous-button").addEventListener("click", handlePeriodNavigationClick);
  document.getElementById("period-next-button").addEventListener("click", handlePeriodNavigationClick);
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
  document.getElementById("mobile-bottom-nav").addEventListener("click", handleMobileNavClick);
  document.getElementById("mobile-screen-root").addEventListener("click", handleMobileRootClick);
  document.getElementById("mobile-screen-root").addEventListener("submit", handleMobileRootSubmit);
  document.getElementById("mobile-screen-root").addEventListener("change", handleMobileRootChange);
  document.getElementById("mobile-screen-root").addEventListener("input", handleMobileRootInput);
  document.getElementById("mobile-logout-button").addEventListener("click", handleLogoutClick);
  window.addEventListener("resize", handleViewportResize);
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
    clearBackendUnavailableMessage();
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
  syncClientMode();
  updateDerivedBookingState();
  syncViewPermissions();
  syncSelectedBooking();
  renderSessionState();
  renderAreaOptions();
  renderFilterOptions();
  renderDisplaySwitch();
  renderViewSwitch();
  renderPeriodNavigation();
  renderBookingPanel();
  renderCalendar();
  renderSelectedDayPanel();
  renderBookingDetailPanel();
  renderMobileShell();
  updateCurrentPeriodLabel();
  syncStickyOffsets();
}

function handleViewportResize() {
  syncClientMode();
  syncStickyOffsets();
}

function syncClientMode() {
  const isMobileClient = window.matchMedia("(max-width: 768px), (pointer: coarse)").matches;
  document.body.classList.toggle("client-mobile", isMobileClient);
  document.body.classList.toggle("client-desktop", !isMobileClient);
}

function isMobileClient() {
  return document.body.classList.contains("client-mobile");
}

function renderPeriodNavigation() {
  const previousButton = document.getElementById("period-previous-button");
  const nextButton = document.getElementById("period-next-button");
  const shouldShow = state.displayMode === "calendar";

  previousButton.classList.toggle("hidden", !shouldShow);
  nextButton.classList.toggle("hidden", !shouldShow);
}

function renderMobileShell() {
  const shell = document.getElementById("mobile-app-shell");
  const root = document.getElementById("mobile-screen-root");

  if (!isMobileClient()) {
    shell.classList.add("hidden");
    root.innerHTML = "";
    return;
  }

  shell.classList.remove("hidden");
  root.innerHTML = renderMobileCurrentScreen();
  renderMobileBottomNav();
}

function renderMobileBottomNav() {
  const buttons = document.querySelectorAll(".mobile-nav-button");
  const approvalsRelevant = canCurrentViewUseApprovals();
  const createRelevant = Boolean(state.currentUser) && !state.fallbackMode;
  const isGuest = !state.currentUser;

  buttons.forEach(function (button) {
    const viewName = button.getAttribute("data-mobile-view");
    const isActive = state.mobileScreen === "main" && state.activeMainView === viewName;
    const isDisabled = (viewName === "approvals" && !approvalsRelevant) || (viewName === "create" && !createRelevant);
    const shouldHideForGuest = isGuest && !["calendar", "more"].includes(viewName);

    button.classList.toggle("is-active", isActive);
    button.classList.toggle("is-disabled", isDisabled);
    button.classList.toggle("hidden", shouldHideForGuest);
    button.disabled = isDisabled;
    button.setAttribute("aria-pressed", String(isActive));
    if (isGuest && viewName === "more") {
      button.querySelector(".mobile-nav-label").textContent = "Login";
    } else if (viewName === "more") {
      button.querySelector(".mobile-nav-label").textContent = "More";
    }
  });
}

function renderMobileCurrentScreen() {
  if (state.mobileScreen === "booking" && state.selectedBookingId) {
    return renderMobileSelectedBookingScreen();
  }

  if (state.mobileScreen === "day") {
    return renderMobileSelectedDayScreen();
  }

  if (state.activeMainView === "bookings") {
    return renderMobileBookingsScreen();
  }

  if (state.activeMainView === "create") {
    return renderMobileCreateScreen();
  }

  if (state.activeMainView === "approvals") {
    return renderMobileApprovalsScreen();
  }

  if (state.activeMainView === "more") {
    return renderMobileMoreScreen();
  }

  return renderMobileCalendarScreen();
}

function renderMobileCalendarScreen() {
  const contentMarkup = state.viewMode === "month"
    ? renderMonthMarkup(state.months[0])
    : renderYearMarkup(state.years[0]);

  return '<section class="mobile-screen">' +
    renderMobileScreenHeader("Calendar", getCurrentPeriodLabelText(), false) +
    '<section class="panel mobile-control-panel">' +
    '<div class="mobile-inline-actions">' +
    '<div class="view-switch" aria-label="Calendar view">' +
    '<button type="button" class="toggle-button' + (state.viewMode === "month" ? " is-active" : "") + '" data-view="month">Month</button>' +
    '<button type="button" class="toggle-button' + (state.viewMode === "year" ? " is-active" : "") + '" data-view="year">Year</button>' +
    '</div>' +
    '<div class="mobile-period-actions">' +
    '<button type="button" class="secondary-button icon-button" data-mobile-period="-1" aria-label="Previous period">&#x2039;</button>' +
    '<button type="button" class="secondary-button" data-mobile-today="true">Today</button>' +
    '<button type="button" class="secondary-button icon-button" data-mobile-period="1" aria-label="Next period">&#x203A;</button>' +
    '</div>' +
    '</div>' +
    '</section>' +
    '<section class="panel mobile-calendar-panel">' +
    (state.viewMode === "month" ? '<section class="weekdays"><div class="weekdays-row"><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span></div></section>' : "") +
    '<div class="mobile-calendar-scroll">' + contentMarkup + '</div>' +
    '</section>' +
    '</section>';
}

function renderMobileBookingsScreen() {
  const bookings = getSortedTableBookings();
  let markup = '<section class="mobile-screen">' +
    renderMobileScreenHeader("Bookings", bookings.length + " items", false) +
    '<section class="panel mobile-control-panel">' +
    '<div class="mobile-inline-actions">' +
    '<button type="button" class="secondary-button" data-mobile-toggle-filters="true">Filter</button>' +
    '<span class="small-text">Cards replace the wide desktop table on mobile.</span>' +
    '</div>';

  if (state.mobileShowFilters) {
    markup += renderMobileFilterPanel();
  }

  markup += '</section><section class="mobile-card-list">';

  if (bookings.length === 0) {
    markup += '<p class="empty-state">No bookings match the current filters.</p>';
  } else {
    bookings.forEach(function (booking) {
      markup += renderMobileBookingCard(booking, true);
    });
  }

  markup += '</section></section>';
  return markup;
}

function renderMobileCreateScreen() {
  const values = getMobileBookingFormValues();
  const editingBooking = getEditingBooking();

  if (!state.currentUser) {
    return '<section class="mobile-screen">' +
      renderMobileScreenHeader("Create booking", "Log in first to create bookings.", false) +
      '<p class="empty-state">Guests can browse only. Open the More tab to log in.</p>' +
      '</section>';
  }

  return '<section class="mobile-screen">' +
    renderMobileScreenHeader(editingBooking ? "Modify booking" : "Create booking", editingBooking ? "Changing area or time resets approvals." : "Full-screen form for easier booking on mobile.", false) +
    '<form id="mobile-booking-form" class="panel mobile-form-panel">' +
    '<div class="mobile-form-grid mobile-form-grid-two">' +
    '<div class="form-row compact-row">' +
    '<label for="mobile-booking-status">Starts as</label>' +
    '<select id="mobile-booking-status" name="mobile-booking-status" ' + (editingBooking ? "disabled" : "") + '>' +
    '<option value="requested"' + (values.status === "requested" ? " selected" : "") + '>Requested</option>' +
    '<option value="planned"' + (values.status === "planned" ? " selected" : "") + '>Planned</option>' +
    '</select></div>' +
    '<div class="form-row compact-row"><label>Areas</label>' + renderMobileAreaSelectionField(values.areaIds) + '</div>' +
    '</div>' +
    renderMobileOwnerGroupField(values.ownerGroupId, editingBooking) +
    '<div class="form-row"><label for="mobile-booking-title">Name</label><input id="mobile-booking-title" name="mobile-booking-title" type="text" maxlength="120" value="' + escapeHtml(values.title) + '" placeholder="Booking name" required></div>' +
    '<div class="mobile-form-grid mobile-form-grid-two">' +
    '<div class="form-row compact-row"><label for="mobile-start-time">Start</label><input id="mobile-start-time" name="mobile-start-time" type="datetime-local" value="' + escapeHtml(values.startTime) + '" required></div>' +
    '<div class="form-row compact-row"><label for="mobile-end-time">End</label><input id="mobile-end-time" name="mobile-end-time" type="datetime-local" value="' + escapeHtml(values.endTime) + '" required></div>' +
    '</div>' +
    '<div class="form-row"><label for="mobile-note">Short note</label><textarea id="mobile-note" name="mobile-note" rows="3" maxlength="200" placeholder="Optional short note">' + escapeHtml(values.note) + '</textarea></div>' +
    '<p class="small-text form-warning-text">' + escapeHtml(editingBooking && shouldShowResetWarning(editingBooking) ? RESET_WARNING_TEXT : "") + '</p>' +
    '<div class="mobile-sticky-submit">' +
    '<button type="submit">' + (editingBooking ? "Save changes" : "Create booking") + '</button>' +
    '<button type="button" class="secondary-button" data-mobile-cancel-create="true">' + (editingBooking ? "Cancel edit" : "Cancel") + '</button>' +
    '</div>' +
    '</form></section>';
}

function renderMobileApprovalsScreen() {
  const approvableBookings = state.filteredBookings.filter(function (booking) {
    const permissions = getEffectiveBookingPermissions(booking);
    return permissions.can_approve || permissions.can_reject;
  });

  return '<section class="mobile-screen">' +
    renderMobileScreenHeader("Approvals", approvableBookings.length + " awaiting this view", false) +
    '<section class="mobile-card-list">' +
    (approvableBookings.length === 0
      ? '<p class="empty-state">Nothing is waiting for your approval right now.</p>'
      : approvableBookings.map(function (booking) {
        return renderMobileBookingCard(booking, false);
      }).join("")) +
    '</section></section>';
}

function renderMobileMoreScreen() {
  let markup = '<section class="mobile-screen">' + renderMobileScreenHeader(state.currentUser ? "More" : "Login", state.currentUser ? "Secondary actions and account tools." : "Sign in to create bookings and unlock the rest of the app.", false) + '<section class="mobile-card-list">';

  if (!state.currentUser) {
    markup += renderMobileLoginCard();
  } else {
    markup += '<section class="panel mobile-more-card">' +
      '<h3>Account</h3>' +
      '<p class="small-text">' + escapeHtml(buildSessionLabel(state.currentUser)) + '</p>' +
      '<div class="button-row"><button type="button" class="secondary-button" data-mobile-logout="true">Log out</button>' +
      (state.currentUser.role === "admin" ? '<a class="action-link-button" href="admin.html">Admin area</a>' : '') +
      '</div></section>';
  }

  markup += '<section class="panel mobile-more-card"><h3>System</h3><p class="small-text">' +
    escapeHtml(state.fallbackMode ? "Fallback mode is active." : "Connected to " + API_BASE_URL + ".") +
    '</p></section>';

  markup += '</section></section>';
  return markup;
}

function renderMobileSelectedDayScreen() {
  const bookings = getBookingsForDate(state.selectedDateKey);
  const selectedDate = parseDateKey(state.selectedDateKey);
  const isGuest = getEffectiveViewRole() === "guest";

  return '<section class="mobile-screen">' +
    renderMobileScreenHeader(formatLongDate(selectedDate), bookings.length + " " + (isGuest ? "occupied" : "booking" + (bookings.length === 1 ? "" : "s")), true) +
    '<section class="mobile-card-list">' +
    (isGuest ? "" : renderMobileCreateShortcut(true)) +
    (bookings.length === 0
      ? '<p class="empty-state">' + (isGuest ? "No occupied slots on this day." : "No bookings for this selected day.") + '</p>'
      : isGuest
        ? '<p class="empty-state">Guests can see occupancy on the calendar, but booking details stay hidden.</p>'
      : bookings.map(function (booking) {
        return renderMobileBookingCard(booking, false, true);
      }).join("")) +
    '</section></section>';
}

function renderMobileSelectedBookingScreen() {
  const booking = getSelectedBooking();

  if (!booking) {
    return '<section class="mobile-screen">' +
      renderMobileScreenHeader("Selected booking", "No booking selected.", true) +
      '<p class="empty-state">Choose a booking first.</p>' +
      '</section>';
  }

  return '<section class="mobile-screen">' +
    renderMobileSelectedBookingHero(booking) +
    '<section class="panel mobile-detail-tabs">' +
    '<div class="view-switch mobile-detail-tab-switch" aria-label="Booking details tabs">' +
    renderMobileDetailTabButton("details", "Details") +
    renderMobileDetailTabButton("cycle", "Cycle") +
    renderMobileDetailTabButton("approvals", "Approvals") +
    renderMobileDetailTabButton("history", "History") +
    '</div>' +
    '</section>' +
    renderMobileSelectedBookingTabPanel(booking) +
    '</section>';
}

function renderMobileSelectedBookingHero(booking) {
  return '<section class="panel mobile-screen-header mobile-booking-hero-header">' +
    '<div class="mobile-screen-header-row">' +
    '<button type="button" class="secondary-button icon-button" data-mobile-back="true" aria-label="Go back">&#x2039;</button>' +
    '<div class="mobile-screen-title-block">' +
    '<p class="toolbar-label">Selected booking</p>' +
    '<div class="mobile-booking-hero-strip">' +
    '<div class="mobile-booking-hero-chip mobile-booking-hero-chip-area">' +
    '<span class="inline-icon">' + renderIcon("area") + '</span>' +
    '<span>' + escapeHtml(booking.area_name) + '</span>' +
    '</div>' +
    '<div class="mobile-booking-hero-chip mobile-booking-hero-chip-time">' +
    '<span class="inline-icon">' + renderIcon("time") + '</span>' +
    '<span>' + escapeHtml(formatMobileBookingHeroRange(booking.start_time, booking.end_time)) + '</span>' +
    '</div>' +
    '<span class="status-badge ' + escapeHtml(getStatusClass(booking.status)) + '">' + escapeHtml(formatStatusLabel(booking.status)) + '</span>' +
    '</div>' +
    '</div></div></section>';
}

function renderMobileSelectedBookingTabPanel(booking) {
  if (state.activeBookingDetailTab === "cycle") {
    return '<section class="mobile-card-list">' + renderBookingCycleMarkup(booking) + '</section>';
  }

  if (state.activeBookingDetailTab === "approvals") {
    return '<section class="mobile-card-list"><section class="detail-card"><div class="detail-card-header"><h3>Approvals</h3></div>' + renderApprovalChainMarkup(booking) + '</section></section>';
  }

  if (state.activeBookingDetailTab === "history") {
    return '<section class="mobile-card-list"><section class="detail-card"><div class="detail-card-header"><h3>History</h3></div>' + renderAuditTrailMarkup(booking) + '</section></section>';
  }

  return '<section class="mobile-card-list"><section class="detail-card"><div class="detail-card-header"><h3>Details</h3><span class="status-badge ' + escapeHtml(getStatusClass(booking.status)) + '">' + escapeHtml(formatStatusLabel(booking.status)) + '</span></div>' +
    renderSelectedBookingSummaryMarkup(booking) +
    '<p class="booking-note">' + escapeHtml(getBookingDetailText(booking)) + '</p>' +
    '<div class="booking-actions">' + renderActionButtons(booking) + renderFlightCheckLink(booking) + '</div>' +
    '</section></section>';
}

function renderMobileDetailTabButton(tabValue, label) {
  return '<button type="button" class="toggle-button' + (state.activeBookingDetailTab === tabValue ? " is-active" : "") + '" data-mobile-tab="' + tabValue + '">' + label + '</button>';
}

function renderMobileScreenHeader(title, subtitle, showBack) {
  return '<section class="panel mobile-screen-header">' +
    '<div class="mobile-screen-header-row">' +
    (showBack ? '<button type="button" class="secondary-button icon-button" data-mobile-back="true" aria-label="Go back">&#x2039;</button>' : '<span class="mobile-screen-spacer"></span>') +
    '<div class="mobile-screen-title-block">' +
    '<p class="toolbar-label">Mobile view</p>' +
    '<h2>' + escapeHtml(title) + '</h2>' +
    '<p class="small-text">' + escapeHtml(subtitle) + '</p>' +
    '</div></div></section>';
}

function renderMobileFilterPanel() {
  return '<div class="mobile-filter-sheet">' +
    '<div class="form-row compact-row"><label for="mobile-filter-area">Area</label><select id="mobile-filter-area">' + buildAreaFilterOptionsMarkup() + '</select></div>' +
    '<div class="form-row compact-row"><label for="mobile-filter-status">Status</label><select id="mobile-filter-status">' + buildStatusFilterOptionsMarkup() + '</select></div>' +
    '<div class="form-row compact-row"><label for="mobile-filter-person">Requested by</label><input id="mobile-filter-person" type="text" value="' + escapeHtml(state.filters.person) + '" placeholder="Filter by username"></div>' +
    '<div class="form-row compact-row"><label for="mobile-filter-sort">Sort by</label><select id="mobile-filter-sort">' + buildTableSortOptionsMarkup() + '</select></div>' +
    '</div>';
}

function renderMobileBookingCard(booking, includeSummary, showDayContext) {
  const approvalSummary = renderApprovalSummaryMarkup(booking);
  const detailsText = getBookingDetailText(booking);
  const bookingTitle = booking.title || "Untitled booking";

  return '<article class="panel mobile-booking-card" data-booking-select="' + booking.id + '">' +
    '<p class="mobile-booking-card-title">' + escapeHtml(bookingTitle) + '</p>' +
    '<div class="mobile-booking-card-strip">' +
    '<div class="mobile-booking-hero-chip mobile-booking-hero-chip-area">' +
    '<span class="inline-icon">' + renderIcon("area") + '</span>' +
    '<span>' + escapeHtml(booking.area_name) + '</span>' +
    '</div>' +
    '<span class="status-badge ' + escapeHtml(getStatusClass(booking.status)) + '">' + escapeHtml(formatStatusLabel(booking.status)) + '</span>' +
    '</div>' +
    '<p class="mobile-booking-card-range"><span class="inline-icon">' + renderIcon("time") + '</span><span>' + escapeHtml(formatMobileBookingListRange(booking.start_time, booking.end_time)) + '</span></p>' +
    '<div class="booking-meta-grid">' +
    '<p class="booking-meta meta-chip"><span class="inline-icon">' + renderIcon("calendar") + '</span>' + escapeHtml(formatBookingDayCountLabel(booking.start_time, booking.end_time)) + '</p>' +
    '<p class="booking-meta meta-chip"><span class="inline-icon">' + renderIcon("person") + '</span>' + escapeHtml(booking.requested_by || "Hidden") + '</p>' +
    '<p class="booking-meta meta-chip"><span class="inline-icon">' + renderIcon("group") + '</span>' + escapeHtml(booking.owner_group_name || "Hidden") + '</p>' +
    '</div>' +
    (includeSummary ? approvalSummary : "") +
    (showDayContext ? '<p class="booking-note">' + escapeHtml(detailsText) + '</p>' : "") +
    '<div class="booking-actions"><button type="button" class="secondary-button" data-booking-select="' + booking.id + '">View details</button>' +
    renderActionButtons(booking) +
    renderFlightCheckLink(booking) +
    '</div></article>';
}

function renderMobileLoginCard() {
  return '<section class="panel mobile-more-card">' +
    '<h3>Login</h3>' +
    '<p class="small-text">Log in to create bookings, act on approvals, and manage your group bookings.</p>' +
    '<form id="mobile-login-form">' +
    '<div class="form-row"><label for="mobile-username">Username</label><input id="mobile-username" name="mobile-username" type="text" required></div>' +
    '<div class="form-row"><label for="mobile-password">Password</label><input id="mobile-password" name="mobile-password" type="password" required></div>' +
    '<div class="button-row"><button type="submit">Log in</button></div>' +
    '</form></section>';
}

function renderMobileCreateShortcut(isInlineCard) {
  if (!state.currentUser) {
    return "";
  }

  const selectedDate = parseDateKey(state.selectedDateKey);
  const className = isInlineCard ? "panel mobile-inline-shortcut-card" : "mobile-create-shortcut";

  return '<div class="' + className + '">' +
    '<p class="small-text">Selected date: ' + escapeHtml(formatLongDate(selectedDate)) + '</p>' +
    '<button type="button" class="secondary-button" data-mobile-create-selected="true">Create request from this day</button>' +
    '</div>';
}

function renderMobileOwnerGroupField(ownerGroupId, editingBooking) {
  if (!state.currentUser || state.currentUser.role !== "admin" || editingBooking) {
    return "";
  }

  return '<div class="form-row"><label for="mobile-owner-group">Owner group</label><select id="mobile-owner-group" name="mobile-owner-group">' + buildOwnerGroupOptionsMarkup(ownerGroupId) + '</select></div>';
}

function renderMobileAreaSelectionField(selectedAreaIds) {
  return '<div class="area-selection-list area-selection-list-mobile">' + buildAreaSelectionMarkup("mobile-area-ids", selectedAreaIds) + '</div>';
}

function buildAreaSelectionMarkup(inputName, selectedAreaIds) {
  const selectedSet = new Set((selectedAreaIds || []).map(String));

  return state.areas.map(function (area) {
    const areaId = String(area.id);
    return '<label class="area-selection-option">' +
      '<input type="checkbox" name="' + inputName + '" value="' + areaId + '"' + (selectedSet.has(areaId) ? " checked" : "") + '>' +
      '<span class="area-selection-pill">' + escapeHtml(area.name) + '</span>' +
      '</label>';
  }).join("");
}

function getCheckedAreaIds(inputName) {
  return Array.from(document.querySelectorAll('input[name="' + inputName + '"]:checked')).map(function (input) {
    return input.value;
  });
}

function setCheckedAreaIds(inputName, areaIds) {
  const selectedSet = new Set((areaIds || []).map(String));
  document.querySelectorAll('input[name="' + inputName + '"]').forEach(function (input) {
    input.checked = selectedSet.has(input.value);
  });
}

function getBookingAreaIds(booking) {
  if (!booking) {
    return [];
  }

  if (Array.isArray(booking.area_ids) && booking.area_ids.length > 0) {
    return booking.area_ids.map(String);
  }

  if (booking.area_id !== undefined && booking.area_id !== null && booking.area_id !== "") {
    return [String(booking.area_id)];
  }

  return [];
}

function sameAreaSelection(areaIdsA, areaIdsB) {
  if (areaIdsA.length !== areaIdsB.length) {
    return false;
  }

  return areaIdsA.every(function (areaId, index) {
    return String(areaId) === String(areaIdsB[index]);
  });
}

function buildOwnerGroupOptionsMarkup(selectedValue) {
  let markup = '<option value="">Choose a group</option>';

  state.groups.forEach(function (group) {
    markup += '<option value="' + group.id + '"' + (String(selectedValue) === String(group.id) ? " selected" : "") + '>' + escapeHtml(group.name) + '</option>';
  });

  return markup;
}

function buildAreaFilterOptionsMarkup() {
  let markup = '<option value="">All areas</option>';
  state.areas.forEach(function (area) {
    markup += '<option value="' + area.id + '"' + (String(state.filters.areaId) === String(area.id) ? " selected" : "") + '>' + escapeHtml(area.name) + '</option>';
  });
  return markup;
}

function buildStatusFilterOptionsMarkup() {
  const values = ["", "requested", "planned", "approved", "completed", "rejected", "cancelled"];
  return values.map(function (value) {
    const label = value ? formatStatusLabel(value) : "All statuses";
    return '<option value="' + value + '"' + (state.filters.status === value ? " selected" : "") + '>' + label + '</option>';
  }).join("");
}

function buildTableSortOptionsMarkup() {
  const options = [
    { value: "start_asc", label: "Start time: earliest first" },
    { value: "start_desc", label: "Start time: latest first" },
    { value: "area_asc", label: "Area" },
    { value: "status_asc", label: "Status" },
    { value: "requester_asc", label: "Requested by" }
  ];

  return options.map(function (option) {
    return '<option value="' + option.value + '"' + (state.tableSort === option.value ? " selected" : "") + '>' + option.label + '</option>';
  }).join("");
}

function getMobileBookingFormValues() {
  const editingBooking = getEditingBooking();

  if (editingBooking) {
    return {
      status: editingBooking.stored_status,
      areaIds: (editingBooking.area_ids || [editingBooking.area_id]).map(function (areaId) {
        return String(areaId);
      }),
      title: editingBooking.title || "",
      startTime: formatDateTimeInputValue(editingBooking.start_time),
      endTime: formatDateTimeInputValue(editingBooking.end_time),
      note: editingBooking.note || "",
      ownerGroupId: editingBooking.owner_group_id ? String(editingBooking.owner_group_id) : ""
    };
  }

  const selectedDate = parseDateKey(state.selectedDateKey);

  return {
    status: "requested",
    areaIds: [],
    title: "",
    startTime: formatDateTimeLocalInput(selectedDate, 9, 0),
    endTime: formatDateTimeLocalInput(selectedDate, 10, 0),
    note: "",
    ownerGroupId: state.groups.length > 0 ? String(state.groups[0].id) : ""
  };
}

function canCurrentViewUseApprovals() {
  if (!state.currentUser) {
    return false;
  }

  return state.currentUser.role === "admin" || Boolean(state.currentUser.group_can_approve);
}

function getCurrentPeriodLabelText() {
  if (state.viewMode === "month") {
    return formatMonthLabel(state.months[0] || getMonthStart(new Date()));
  }

  return String((state.years[0] || getYearStart(new Date())).getFullYear());
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

  if (!state.currentUser && (state.activeMainView === "bookings" || state.activeMainView === "create" || state.activeMainView === "approvals")) {
    state.activeMainView = "calendar";
  }

  if (state.activeMainView === "approvals" && !canCurrentViewUseApprovals()) {
    state.activeMainView = "calendar";
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
  const mobileSessionText = document.getElementById("mobile-session-text");
  const mobileLogoutButton = document.getElementById("mobile-logout-button");
  const isAdmin = Boolean(state.currentUser) && state.currentUser.role === "admin";

  if (state.currentUser) {
    sessionText.textContent = buildSessionLabel(state.currentUser);
    mobileSessionText.textContent = state.currentUser.username + (state.currentUser.group_name ? " · " + state.currentUser.group_name : " · Admin");
    logoutButton.classList.remove("hidden");
    mobileLogoutButton.classList.remove("hidden");
    loginPanel.classList.add("hidden");
  } else {
    sessionText.textContent = "Browsing as guest.";
    mobileSessionText.textContent = "Browsing as guest.";
    logoutButton.classList.add("hidden");
    mobileLogoutButton.classList.add("hidden");
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
  const areaOptions = document.getElementById("area-options");
  const previousSelected = getCheckedAreaIds("area-ids");
  areaOptions.innerHTML = buildAreaSelectionMarkup("area-ids", previousSelected);
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
  bookingPanelToggle.textContent = state.bookingPanelCollapsed ? "Show" : "Hide";
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
    markup = renderMonthMarkup(state.months[0]);
  } else {
    calendarPeriods.className = "calendar-periods calendar-periods-year";
    weekdaysStrip.classList.add("hidden");
    markup = renderYearMarkup(state.years[0]);
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
  const iconName = tone === "planned" ? "calendar" : "approval";

  return '<span class="table-summary-badge table-summary-' + escapeHtml(tone) + '">' +
    '<span class="inline-icon">' + renderIcon(iconName) + "</span>" +
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
    '<div class="booking-card-heading">' +
    '<span class="icon-chip icon-chip-primary">' + renderIcon("calendar") + "</span>" +
    '<div>' +
    '<p class="booking-area">' + escapeHtml(getBookingCardHeading(booking)) + "</p>" +
    '<p class="booking-time booking-time-with-icon"><span class="inline-icon">' + renderIcon("time") + '</span>' + escapeHtml(formatDateTimeRange(booking.start_time, booking.end_time)) + "</p>" +
    "</div>" +
    "</div>" +
    '<span class="status-badge ' + escapeHtml(getStatusClass(booking.status)) + '">' + escapeHtml(formatStatusLabel(booking.status)) + "</span>" +
    "</div>" +
    '<div class="booking-meta-grid">' +
    '<p class="booking-meta meta-chip"><span class="inline-icon">' + renderIcon("person") + '</span>' + escapeHtml(booking.requested_by) + "</p>" +
    '<p class="booking-meta meta-chip"><span class="inline-icon">' + renderIcon("group") + '</span>' + escapeHtml(booking.owner_group_name) + "</p>" +
    "</div>" +
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
  if (getEffectiveViewRole() === "guest") {
    return "";
  }

  return '<a class="action-link-button action-link-button-primary" href="' + escapeHtml(getGoogleFlightsUrl(booking)) + '" target="_blank" rel="noopener noreferrer"><span class="inline-icon">' + renderIcon("plane") + '</span>Google Flight Check</a>';
}

function renderBookingDetailPanel() {
  const panel = document.getElementById("booking-detail-panel");
  const title = document.getElementById("selected-booking-title");
  const subtitle = document.getElementById("selected-booking-subtitle");
  const status = document.getElementById("selected-booking-status");
  const summary = document.getElementById("selected-booking-summary");
  const cycle = document.getElementById("selected-booking-cycle");
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
    cycle.innerHTML = '<p class="empty-state">Booking lifecycle is hidden in guest view.</p>';
    approvalChain.innerHTML = '<p class="empty-state">Approval chain is hidden in guest view.</p>';
    auditList.innerHTML = '<p class="empty-state">Audit history is hidden in guest view.</p>';
    return;
  }

  if (!booking) {
    title.textContent = "No booking selected";
    status.textContent = "Select a booking";
    subtitle.textContent = "Select a booking card or table row to inspect its approval chain and audit trail.";
    summary.innerHTML = '<p class="empty-state">No booking selected yet.</p>';
    cycle.innerHTML = '<p class="empty-state">Booking lifecycle details will appear here.</p>';
    approvalChain.innerHTML = '<p class="empty-state">Approval details will appear here.</p>';
    auditList.innerHTML = '<p class="empty-state">Change history will appear here.</p>';
    return;
  }

  title.textContent = getBookingCardHeading(booking);
  status.textContent = formatStatusLabel(booking.status);
  subtitle.textContent = formatDateTimeRange(booking.start_time, booking.end_time);
  summary.innerHTML = renderSelectedBookingSummaryMarkup(booking);
  cycle.innerHTML = renderBookingCycleMarkup(booking);
  approvalChain.innerHTML = renderApprovalChainMarkup(booking);
  auditList.innerHTML = renderAuditTrailMarkup(booking);
}

function renderSelectedBookingSummaryMarkup(booking) {
  return '<div class="booking-summary-grid booking-summary-grid-rich">' +
    '<div class="booking-summary-hero">' +
    '<div class="booking-summary-main">' +
    '<span class="icon-chip icon-chip-primary booking-summary-icon">' + renderIcon("area") + '</span>' +
    '<div class="booking-summary-main-copy">' +
    '<strong><span class="inline-icon">' + renderIcon("area") + '</span>Area</strong>' +
    '<span class="booking-summary-value booking-summary-value-strong">' + escapeHtml(booking.area_name) + '</span>' +
    '</div>' +
    '</div>' +
    '<span class="status-badge ' + escapeHtml(getStatusClass(booking.status)) + '">' + escapeHtml(formatStatusLabel(booking.status)) + '</span>' +
    '</div>' +
    '<div class="booking-summary-row-grid">' +
    '<div class="booking-summary-item">' + renderBookingSummaryDateTimeItem("Start", booking.start_time) + '</div>' +
    '<div class="booking-summary-item">' + renderBookingSummaryDateTimeItem("End", booking.end_time) + '</div>' +
    '</div>' +
    '<div class="booking-summary-row-grid">' +
    '<p class="booking-summary-item"><strong><span class="inline-icon">' + renderIcon("person") + '</span>Requested by</strong><span>' + escapeHtml(booking.requested_by || "Hidden") + '</span></p>' +
    '<p class="booking-summary-item"><strong><span class="inline-icon">' + renderIcon("group") + '</span>Owner group</strong><span>' + escapeHtml(booking.owner_group_name || "Hidden") + '</span></p>' +
    '</div>' +
    '<div class="booking-summary-row-grid">' +
    '<p class="booking-summary-item"><strong><span class="inline-icon">' + renderIcon("calendar") + '</span>Created</strong><span>' + escapeHtml(formatTableDateTime(booking.created_at)) + '</span></p>' +
    '<p class="booking-summary-item"><strong><span class="inline-icon">' + renderIcon("history") + '</span>Updated</strong><span>' + escapeHtml(formatTableDateTime(booking.updated_at)) + '</span></p>' +
    '</div>' +
    '<p class="booking-summary-item booking-summary-item-full"><strong><span class="inline-icon">' + renderIcon("approval") + '</span>Stored state</strong><span>' + escapeHtml(formatStatusLabel(booking.stored_status || booking.status)) + '</span></p>' +
    '</div>';
}

function renderBookingSummaryDateTimeItem(label, value) {
  const dateValue = parseDateTime(value);

  return '<strong><span class="inline-icon">' + renderIcon("time") + '</span>' + escapeHtml(label) + '</strong>' +
    '<span class="booking-summary-date-line">' + escapeHtml(formatLongDate(dateValue)) + '</span>' +
    '<span class="booking-summary-time-line">' + escapeHtml(formatTime(dateValue)) + '</span>';
}

function formatMobileBookingHeroRange(startValue, endValue) {
  const startDate = parseDateTime(startValue);
  const endDate = parseDateTime(endValue);
  const sameDay = getDateKey(startDate) === getDateKey(endDate);

  if (sameDay) {
    return formatLongDate(startDate) + " · " + formatTime(startDate) + " - " + formatTime(endDate);
  }

  return formatLongDate(startDate) + " - " + formatLongDate(endDate);
}

function formatMobileBookingListRange(startValue, endValue) {
  const startDate = parseDateTime(startValue);
  const endDate = parseDateTime(endValue);
  const sameDay = getDateKey(startDate) === getDateKey(endDate);

  if (sameDay) {
    return formatLongDate(startDate) + " · " + formatTime(startDate) + "-" + formatTime(endDate);
  }

  return formatLongDate(startDate) + " · " + formatTime(startDate) + " - " + formatLongDate(endDate) + " · " + formatTime(endDate);
}

function formatBookingDayCountLabel(startValue, endValue) {
  const startDate = getDateOnly(parseDateTime(startValue));
  const endDate = getDateOnly(parseDateTime(endValue));
  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  const diffDays = Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / millisecondsPerDay));
  const inclusiveDays = diffDays + 1;

  return inclusiveDays + " day" + (inclusiveDays === 1 ? "" : "s");
}

function renderBookingCycleMarkup(booking) {
  const steps = getBookingCycleSteps(booking);

  return '<section class="detail-card booking-cycle-card">' +
    '<div class="detail-card-header">' +
    '<h3>Booking cycle</h3>' +
    '<span class="status-badge ' + escapeHtml(getStatusClass(booking.status)) + '">' + escapeHtml(formatStatusLabel(booking.status)) + '</span>' +
    '</div>' +
    '<p class="small-text booking-cycle-caption">' + escapeHtml(getBookingCycleCaption(booking)) + '</p>' +
    '<div class="booking-cycle-steps">' + steps.map(function (step) {
      return renderBookingCycleStepMarkup(step);
    }).join("") + '</div>' +
    '</section>';
}

function renderBookingCycleStepMarkup(step) {
  const classNames = ["booking-cycle-step"];

  if (step.isActive) {
    classNames.push("booking-cycle-step-active");
  }

  if (step.isComplete) {
    classNames.push("booking-cycle-step-complete");
  }

  if (step.isMuted) {
    classNames.push("booking-cycle-step-muted");
  }

  return '<article class="' + classNames.join(" ") + '">' +
    '<div class="booking-cycle-step-icon">' + renderIcon(step.icon) + '</div>' +
    '<div class="booking-cycle-step-copy">' +
    '<strong>' + escapeHtml(step.label) + '</strong>' +
    '<p>' + escapeHtml(step.description) + '</p>' +
    '</div>' +
    (step.badge ? '<span class="status-badge ' + escapeHtml(step.badgeClass) + '">' + escapeHtml(step.badge) + '</span>' : '') +
    '</article>';
}

function getBookingCycleCaption(booking) {
  if (booking.status === "planned") {
    return "This booking is being held as a planned reservation and can later move into the approval flow.";
  }

  if (booking.status === "requested") {
    return "This booking is currently in the approval flow and still waiting for the remaining group approvals.";
  }

  if (booking.status === "approved") {
    return "This booking is approved and confirmed as occupied for its time range.";
  }

  if (booking.status === "completed") {
    return "This booking was approved and has already passed, so it is shown as completed.";
  }

  if (booking.status === "rejected") {
    return "This booking stopped in the approval flow because it was rejected.";
  }

  if (booking.status === "cancelled") {
    return "This booking was cancelled and is no longer active in the workflow.";
  }

  return "This booking follows the shared house lifecycle based on its current state and approvals.";
}

function getBookingCycleSteps(booking) {
  const currentStatus = booking.status;
  const isPlannedFlow = booking.stored_status === "planned" || currentStatus === "planned";
  const hasApproved = currentStatus === "approved" || currentStatus === "completed";
  const isTerminalCancelled = currentStatus === "cancelled";
  const isTerminalRejected = currentStatus === "rejected";
  const isTerminalCompleted = currentStatus === "completed";
  const cycle = [];

  cycle.push({
    label: "Planned hold",
    description: isPlannedFlow ? "Created as a hold before requesting approval." : "Optional hold stage before the request workflow.",
    icon: "calendar",
    isActive: currentStatus === "planned",
    isComplete: !isPlannedFlow && !isTerminalRejected && !isTerminalCancelled,
    isMuted: !isPlannedFlow && booking.stored_status !== "planned",
    badge: currentStatus === "planned" ? "Current" : "",
    badgeClass: "status-planned"
  });

  cycle.push({
    label: "Requested",
    description: "Submitted into the approval flow for the configured groups.",
    icon: "history",
    isActive: currentStatus === "requested",
    isComplete: hasApproved || isTerminalCompleted,
    isMuted: false,
    badge: currentStatus === "requested" ? "Current" : "",
    badgeClass: "status-requested"
  });

  cycle.push({
    label: "Approval chain",
    description: getApprovalChainStepText(booking),
    icon: "approval",
    isActive: currentStatus === "requested",
    isComplete: hasApproved || isTerminalCompleted,
    isMuted: false,
    badge: booking.pending_approval_groups && booking.pending_approval_groups.length > 0 ? booking.pending_approval_groups.length + " pending" : (hasApproved || isTerminalCompleted ? "Complete" : ""),
    badgeClass: booking.pending_approval_groups && booking.pending_approval_groups.length > 0 ? "status-requested" : "status-approved"
  });

  cycle.push({
    label: "Approved",
    description: "Booking is confirmed and occupies the selected area.",
    icon: "approval",
    isActive: currentStatus === "approved",
    isComplete: isTerminalCompleted,
    isMuted: isTerminalRejected || isTerminalCancelled,
    badge: currentStatus === "approved" ? "Current" : "",
    badgeClass: "status-approved"
  });

  cycle.push({
    label: "Completed",
    description: "Derived automatically once an approved booking has passed.",
    icon: "history",
    isActive: isTerminalCompleted,
    isComplete: false,
    isMuted: !isTerminalCompleted,
    badge: isTerminalCompleted ? "Current" : "",
    badgeClass: "status-completed"
  });

  if (isTerminalRejected) {
    cycle.push({
      label: "Rejected",
      description: "The booking stopped and cannot continue through approval.",
      icon: "history",
      isActive: true,
      isComplete: false,
      isMuted: false,
      badge: "Final",
      badgeClass: "status-rejected"
    });
  }

  if (isTerminalCancelled) {
    cycle.push({
      label: "Cancelled",
      description: "The booking was cancelled and removed from the active flow.",
      icon: "history",
      isActive: true,
      isComplete: false,
      isMuted: false,
      badge: "Final",
      badgeClass: "status-cancelled"
    });
  }

  return cycle;
}

function getApprovalChainStepText(booking) {
  if (booking.status === "planned") {
    return "No approvals are collected while the booking stays planned.";
  }

  if (!booking.pending_approval_groups || booking.pending_approval_groups.length === 0) {
    return "All required approval groups have already responded.";
  }

  return "Still waiting for " + booking.pending_approval_groups.map(function (group) {
    return group.name;
  }).join(", ") + ".";
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
      '<strong class="audit-title-with-icon"><span class="inline-icon">' + renderIcon("approval") + '</span>' + escapeHtml(entry.group_name) + '</strong>' +
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
      '<strong class="audit-title-with-icon"><span class="inline-icon">' + renderIcon("history") + '</span>' + escapeHtml(getAuditActionLabel(entry)) + '</strong>' +
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

  await performLogin(username, password);
}

async function performLogin(username, password) {
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
    state.activeMainView = isMobileClient() ? "bookings" : "calendar";
    state.mobileScreen = "main";
    localStorage.setItem(STORAGE_KEY, state.token);
    if (document.getElementById("login-form")) {
      document.getElementById("login-form").reset();
    }
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
  await submitBookingPayload(getBookingFormPayload(), true);
}

async function submitBookingPayload(payload, resetDesktopForm) {
  const editingBooking = getEditingBooking();
  const validationErrors = validateBookingForm(payload, editingBooking);

  if (validationErrors.length > 0) {
    showMessage(validationErrors.join(" "), "error");
    return false;
  }

  try {
    if (editingBooking) {
      if (requiresApprovalReset(editingBooking, payload)) {
        const confirmed = window.confirm(RESET_WARNING_TEXT);

        if (!confirmed) {
          return false;
        }
      }

      await apiRequest("/bookings/" + editingBooking.id, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          area_id: Number(payload.areaId),
          area_ids: payload.areaIds.map(Number),
          start_time: payload.startTime,
          end_time: payload.endTime,
          title: payload.title,
          description: "",
          note: payload.note
        })
      });

      showMessage("Booking updated successfully.", "success");
      resetBookingEditor(true);
      state.selectedBookingId = editingBooking.id;
      state.mobileScreen = isMobileClient() ? "booking" : state.mobileScreen;
    } else {
      await apiRequest("/bookings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          area_id: Number(payload.areaId),
          area_ids: payload.areaIds.map(Number),
          start_time: payload.startTime,
          end_time: payload.endTime,
          status: payload.status,
          title: payload.title,
          description: "",
          note: payload.note,
          owner_group_id: payload.ownerGroupId ? Number(payload.ownerGroupId) : null
        })
      });

      if (resetDesktopForm && document.getElementById("booking-form")) {
        document.getElementById("booking-form").reset();
        prefillBookingFormFromSelection();
      }
      state.mobileScreen = isMobileClient() ? "day" : state.mobileScreen;
      showMessage("Booking created successfully.", "success");
    }

    await refreshBoard();
    return true;
  } catch (error) {
    showMessage(error.message, "error");
    return false;
  }
}

function getBookingFormPayload() {
  const areaIds = getCheckedAreaIds("area-ids");
  return {
    areaId: areaIds[0] || "",
    areaIds: areaIds,
    startTime: document.getElementById("start-time").value,
    endTime: document.getElementById("end-time").value,
    status: document.getElementById("booking-status").value,
    title: document.getElementById("booking-title").value.trim(),
    note: document.getElementById("note").value.trim(),
    ownerGroupId: document.getElementById("owner-group").value
  };
}

function getMobileBookingFormPayload() {
  const areaIds = getCheckedAreaIds("mobile-area-ids");
  return {
    areaId: areaIds[0] || "",
    areaIds: areaIds,
    startTime: document.getElementById("mobile-start-time").value,
    endTime: document.getElementById("mobile-end-time").value,
    status: document.getElementById("mobile-booking-status").value,
    title: document.getElementById("mobile-booking-title").value.trim(),
    note: document.getElementById("mobile-note").value.trim(),
    ownerGroupId: document.getElementById("mobile-owner-group") ? document.getElementById("mobile-owner-group").value : ""
  };
}

function validateBookingForm(payload, editingBooking) {
  const errors = [];

  if (!payload.areaIds || payload.areaIds.length === 0) {
    errors.push("Select at least one area.");
  }

  if (!payload.startTime) {
    errors.push("Start time is required.");
  }

  if (!payload.endTime) {
    errors.push("End time is required.");
  }

  if (!payload.title) {
    errors.push("Name is required.");
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

function handlePeriodNavigationClick(event) {
  if (state.displayMode !== "calendar") {
    return;
  }

  const direction = event.currentTarget.id === "period-previous-button" ? -1 : 1;

  if (state.viewMode === "month") {
    state.months = [addMonths(state.months[0], direction)];
  } else {
    state.years = [addYears(state.years[0], direction)];
  }

  renderPage();
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

  await executeBookingAction(
    button.getAttribute("data-action"),
    Number(button.getAttribute("data-booking-id"))
  );
}

async function executeBookingAction(actionName, bookingId) {
  if (state.fallbackMode) {
    showMessage("Updates are unavailable in fallback mode.", "error");
    return;
  }

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

    if (isMobileClient() && actionName !== "delete") {
      state.mobileScreen = "booking";
      state.activeBookingDetailTab = "details";
      ensureBookingHistoryLoaded(bookingId);
    }

    if (isMobileClient() && actionName === "delete") {
      state.mobileScreen = "main";
      state.selectedBookingId = null;
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
  if (isMobileClient()) {
    state.activeMainView = "create";
    state.mobileScreen = "main";
    renderPage();
    return;
  }

  renderBookingPanel();
  document.getElementById("booking-panel").scrollIntoView({ behavior: "smooth", block: "start" });
}

function populateBookingFormForEdit(booking) {
  setCheckedAreaIds("area-ids", booking.area_ids || [booking.area_id]);
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

  return !sameAreaSelection(getBookingAreaIds(booking), payload.areaIds) ||
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
  ensureVisiblePeriodForDate(parseDateKey(state.selectedDateKey));
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

function handleMobileNavClick(event) {
  const button = event.target.closest("button[data-mobile-view]");

  if (!button || button.disabled) {
    return;
  }

  state.activeMainView = button.getAttribute("data-mobile-view");
  state.mobileScreen = "main";
  state.mobileShowFilters = false;
  state.activeBookingDetailTab = "details";

  if (state.activeMainView === "create") {
    resetBookingEditor(true);
  }

  renderPage();
}

async function handleMobileRootClick(event) {
  const actionButton = event.target.closest("button[data-action]");

  if (actionButton) {
    await executeBookingAction(
      actionButton.getAttribute("data-action"),
      Number(actionButton.getAttribute("data-booking-id"))
    );
    return;
  }

  const bookingButton = event.target.closest("button[data-booking-select]");

  if (bookingButton) {
    openMobileBooking(Number(bookingButton.getAttribute("data-booking-select")));
    return;
  }

  const bookingCard = event.target.closest("[data-booking-select]");

  if (bookingCard && !event.target.closest("a, button")) {
    openMobileBooking(Number(bookingCard.getAttribute("data-booking-select")));
    return;
  }

  const dayButton = event.target.closest("button[data-date-key]");

  if (dayButton) {
    state.selectedDateKey = dayButton.getAttribute("data-date-key");
    syncSelectedBooking();
    state.mobileScreen = "day";
    renderPage();
    return;
  }

  const tabButton = event.target.closest("button[data-mobile-tab]");

  if (tabButton) {
    state.activeBookingDetailTab = tabButton.getAttribute("data-mobile-tab");
    renderPage();
    return;
  }

  const filterButton = event.target.closest("button[data-mobile-toggle-filters]");

  if (filterButton) {
    state.mobileShowFilters = !state.mobileShowFilters;
    renderPage();
    return;
  }

  const backButton = event.target.closest("button[data-mobile-back]");

  if (backButton) {
    if (state.mobileScreen === "booking") {
      state.mobileScreen = state.mobileBookingReturnScreen || "main";
    } else {
      state.mobileScreen = "main";
    }
    renderPage();
    return;
  }

  const periodButton = event.target.closest("button[data-mobile-period]");

  if (periodButton) {
    const direction = Number(periodButton.getAttribute("data-mobile-period"));

    if (state.viewMode === "month") {
      state.months = [addMonths(state.months[0], direction)];
    } else {
      state.years = [addYears(state.years[0], direction)];
    }

    renderPage();
    return;
  }

  if (event.target.closest("button[data-mobile-today]")) {
    state.selectedDateKey = getDateKey(new Date());
    ensureVisiblePeriodForDate(parseDateKey(state.selectedDateKey));
    renderPage();
    return;
  }

  const viewButton = event.target.closest("button[data-view]");

  if (viewButton) {
    const nextView = viewButton.getAttribute("data-view");

    if (nextView !== state.viewMode) {
      state.viewMode = nextView;
      ensureVisiblePeriodForDate(parseDateKey(state.selectedDateKey));
      renderPage();
    }
    return;
  }

  if (event.target.closest("button[data-mobile-cancel-create]")) {
    resetBookingEditor(true);
    state.activeMainView = "bookings";
    state.mobileScreen = "main";
    renderPage();
    return;
  }

  if (event.target.closest("button[data-mobile-create-selected]")) {
    resetBookingEditor(true);
    state.activeMainView = "create";
    state.mobileScreen = "main";
    renderPage();
    return;
  }

  if (event.target.closest("button[data-mobile-logout]")) {
    handleLogoutClick();
  }
}

async function handleMobileRootSubmit(event) {
  if (event.target.id === "mobile-login-form") {
    event.preventDefault();
    await performLogin(
      document.getElementById("mobile-username").value.trim(),
      document.getElementById("mobile-password").value
    );
    return;
  }

  if (event.target.id === "mobile-booking-form") {
    event.preventDefault();
    const succeeded = await submitBookingPayload(getMobileBookingFormPayload(), false);

    if (succeeded) {
      state.activeMainView = "bookings";
      state.mobileScreen = state.selectedBookingId ? "booking" : "day";
      renderPage();
    }
  }
}

function handleMobileRootChange(event) {
  if (event.target.id === "mobile-filter-area") {
    state.filters.areaId = event.target.value;
    renderPage();
    return;
  }

  if (event.target.id === "mobile-filter-status") {
    state.filters.status = event.target.value;
    renderPage();
    return;
  }

  if (event.target.id === "mobile-filter-sort") {
    state.tableSort = event.target.value;
    renderPage();
  }
}

function handleMobileRootInput(event) {
  if (event.target.id === "mobile-filter-person") {
    state.filters.person = event.target.value.trim().toLowerCase();
    renderPage();
  }
}

function openMobileBooking(bookingId) {
  state.mobileBookingReturnScreen = state.mobileScreen === "day" ? "day" : "main";
  state.selectedBookingId = bookingId;
  const booking = getSelectedBooking();

  if (booking) {
    state.selectedDateKey = getDateKey(getDateOnly(parseDateTime(booking.start_time)));
  }

  state.mobileScreen = "booking";
  state.activeBookingDetailTab = "details";
  ensureBookingHistoryLoaded(bookingId);
  renderPage();
}

function handleWindowScroll() {
  updateCurrentPeriodLabel();
}

function maybeExtendCurrentView() {
  return;
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
  state.activeMainView = "calendar";
  state.activeBookingDetailTab = "details";
  state.mobileScreen = "main";
  state.mobileBookingReturnScreen = "main";
  state.mobileShowFilters = false;
  localStorage.removeItem(STORAGE_KEY);

  if (showConfirmation) {
    showMessage("Logged out. Guest view is active again.", "info");
  }
}

function getFilteredBookings() {
  return state.bookings.filter(function (booking) {
    const visibilityMatches = canBookingBeSeenInCurrentView(booking);
    const areaMatches = !state.filters.areaId || getBookingAreaIds(booking).includes(String(state.filters.areaId));
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

  let response;

  try {
    response = await fetch(API_BASE_URL + path, {
      method: requestOptions.method || "GET",
      headers: headers,
      body: requestOptions.body
    });
  } catch (error) {
    const requestError = new Error(getNetworkFailureMessage());
    requestError.cause = error;
    throw requestError;
  }

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

function hideMessage() {
  const messageBox = document.getElementById("message-box");
  messageBox.textContent = "";
  messageBox.className = "message-box hidden";
}

function clearBackendUnavailableMessage() {
  const messageBox = document.getElementById("message-box");
  const text = (messageBox.textContent || "").trim();

  if (text.indexOf("Backend unavailable.") === 0) {
    hideMessage();
  }
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

function renderIcon(iconName) {
  return ICONS[iconName] || "";
}

function formatMonthLabel(dateValue) {
  return dateValue.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric"
  });
}

function formatCompactDateWithWeekday(dateValue) {
  const weekday = dateValue.toLocaleDateString(undefined, {
    weekday: "short"
  });

  return weekday + " " + padNumber(dateValue.getDate()) + "." + padNumber(dateValue.getMonth() + 1) + "." + dateValue.getFullYear();
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

  return ["busy", "requested", "planned", "approved", "completed"].includes(booking.status);
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

function shouldRedirectFromLocalFile() {
  return window.location.protocol === "file:" && !urlParameters.has("stayLocalFile");
}

function getServedPreviewUrl() {
  return "http://127.0.0.1:8081/" + window.location.search + window.location.hash;
}

function getNetworkFailureMessage() {
  if (window.location.protocol === "file:") {
    return "Open the redesign from http://127.0.0.1:8081 instead of file:// so login can reach the backend.";
  }

  return "Could not reach the backend. Make sure the API on http://127.0.0.1:8000 is running.";
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
