"use strict";

const adminUrlParameters = new URLSearchParams(window.location.search);
const adminRuntimeConfig = window.APP_CONFIG || {};
const ADMIN_API_BASE_URL = adminUrlParameters.get("apiBaseUrl") || adminRuntimeConfig.apiBaseUrl || "http://127.0.0.1:8000/casa-elsbeth";
const ADMIN_STORAGE_KEY = "projectCasaElsbethToken";

const adminState = {
  token: localStorage.getItem(ADMIN_STORAGE_KEY),
  currentUser: null,
  groups: [],
  areas: [],
  users: []
};

document.addEventListener("DOMContentLoaded", initialiseAdminPage);

function initialiseAdminPage() {
  bindAdminEventHandlers();
  restoreAdminSession();
}

function bindAdminEventHandlers() {
  document.getElementById("admin-login-form").addEventListener("submit", handleAdminLoginSubmit);
  document.getElementById("admin-logout-button").addEventListener("click", handleAdminLogoutClick);
  document.getElementById("admin-new-group-form").addEventListener("submit", handleAdminNewGroupSubmit);
  document.getElementById("admin-new-area-form").addEventListener("submit", handleAdminNewAreaSubmit);
  document.getElementById("admin-new-user-form").addEventListener("submit", handleAdminNewUserSubmit);
  document.getElementById("admin-new-user-role").addEventListener("change", syncNewUserGroupState);
  document.getElementById("admin-groups-list").addEventListener("click", handleAdminGroupActionClick);
  document.getElementById("admin-areas-list").addEventListener("click", handleAdminAreaActionClick);
  document.getElementById("admin-users-list").addEventListener("click", handleAdminUserActionClick);
}

function requireAdminTypedConfirmation(actionLabel) {
  const typedValue = window.prompt('Admin changes are restricted. To continue with "' + actionLabel + '", type exactly: I confirm');

  if (typedValue !== "I confirm") {
    showAdminMessage('Action cancelled. Type exactly "I confirm" to make admin changes.', "info");
    return false;
  }

  return true;
}

async function restoreAdminSession() {
  if (!adminState.token) {
    renderAdminPage();
    return;
  }

  try {
    adminState.currentUser = await adminApiRequest("/me");

    if (adminState.currentUser.role !== "admin") {
      clearAdminSession(false);
      showAdminMessage("This page requires an admin account.", "error");
      renderAdminPage();
      return;
    }

    await refreshAdminData();
  } catch (error) {
    clearAdminSession(false);
    renderAdminPage();
  }
}

async function refreshAdminData() {
  const results = await Promise.all([
    adminApiRequest("/admin/groups"),
    adminApiRequest("/areas"),
    adminApiRequest("/admin/users")
  ]);

  adminState.groups = results[0];
  adminState.areas = results[1];
  adminState.users = results[2];
  renderAdminPage();
}

function renderAdminPage() {
  renderAdminSessionState();
  renderAdminPanelVisibility();
  renderAdminGroupOptions();
  renderAdminGroupsList();
  renderAdminAreasList();
  renderAdminUsersList();
}

function renderAdminSessionState() {
  const sessionText = document.getElementById("admin-session-text");
  const modeText = document.getElementById("admin-mode-text");

  if (adminState.currentUser) {
    sessionText.textContent = "Logged in as " + adminState.currentUser.username + " (" + adminState.currentUser.role + ").";
    modeText.textContent = "Admin tools are active.";
  } else {
    sessionText.textContent = "Not logged in.";
    modeText.textContent = "Admin access required.";
  }
}

function renderAdminPanelVisibility() {
  const isAdmin = Boolean(adminState.currentUser) && adminState.currentUser.role === "admin";

  document.getElementById("admin-login-panel").classList.toggle("hidden", isAdmin);
  document.getElementById("admin-session-panel").classList.toggle("hidden", !isAdmin);
  document.getElementById("admin-groups-panel").classList.toggle("hidden", !isAdmin);
  document.getElementById("admin-configs-panel").classList.toggle("hidden", !isAdmin);
  document.getElementById("admin-create-user-panel").classList.toggle("hidden", !isAdmin);
  document.getElementById("admin-users-panel").classList.toggle("hidden", !isAdmin);
}

function renderAdminGroupOptions() {
  const select = document.getElementById("admin-new-user-group");
  const previousValue = select.value;
  select.innerHTML = '<option value="">Choose a group</option>';

  adminState.groups.forEach(function (group) {
    const option = document.createElement("option");
    option.value = String(group.id);
    option.textContent = group.name;
    select.appendChild(option);
  });

  if (previousValue) {
    select.value = previousValue;
  }

  syncNewUserGroupState();
}

function renderAdminGroupsList() {
  const container = document.getElementById("admin-groups-list");

  if (!isAdminUser()) {
    container.innerHTML = '<p class="empty-state">Log in as admin to manage groups.</p>';
    return;
  }

  if (adminState.groups.length === 0) {
    container.innerHTML = '<p class="empty-state">No groups defined yet.</p>';
    return;
  }

  container.innerHTML = adminState.groups.map(function (group) {
    return '<article class="config-item">' +
      '<div class="form-row">' +
      '<label for="admin-group-name-' + group.id + '">Name</label>' +
      '<input id="admin-group-name-' + group.id + '" type="text" maxlength="80" value="' + escapeHtml(group.name) + '">' +
      "</div>" +
      '<div class="form-row">' +
      '<label for="admin-group-description-' + group.id + '">Description</label>' +
      '<textarea id="admin-group-description-' + group.id + '" rows="2" maxlength="200">' + escapeHtml(group.description || "") + "</textarea>" +
      "</div>" +
      '<div class="admin-toggle-grid">' +
      '<div class="form-row checkbox-row">' +
      '<label><input id="admin-group-can-approve-' + group.id + '" type="checkbox"' + (group.can_approve ? " checked" : "") + '><span>Approval group</span></label>' +
      "</div>" +
      '<div class="form-row checkbox-row">' +
      '<label><input id="admin-group-required-' + group.id + '" type="checkbox"' + (group.approval_required ? " checked" : "") + '><span>Required for approval</span></label>' +
      "</div>" +
      "</div>" +
      '<div class="button-row">' +
      '<button type="button" class="secondary-button" data-admin-group-action="save-group" data-group-id="' + group.id + '">Save</button>' +
      '<button type="button" class="secondary-button destructive-button" data-admin-group-action="delete-group" data-group-id="' + group.id + '">Delete</button>' +
      "</div>" +
      "</article>";
  }).join("");
}

function renderAdminAreasList() {
  const container = document.getElementById("admin-areas-list");

  if (!isAdminUser()) {
    container.innerHTML = '<p class="empty-state">Log in as admin to manage areas.</p>';
    return;
  }

  if (adminState.areas.length === 0) {
    container.innerHTML = '<p class="empty-state">No areas defined yet.</p>';
    return;
  }

  container.innerHTML = adminState.areas.map(function (area) {
    return '<article class="config-item">' +
      '<div class="form-row">' +
      '<label for="admin-area-name-' + area.id + '">Name</label>' +
      '<input id="admin-area-name-' + area.id + '" type="text" maxlength="80" value="' + escapeHtml(area.name) + '">' +
      "</div>" +
      '<div class="form-row">' +
      '<label for="admin-area-description-' + area.id + '">Description</label>' +
      '<textarea id="admin-area-description-' + area.id + '" rows="2" maxlength="200">' + escapeHtml(area.description || "") + "</textarea>" +
      "</div>" +
      '<div class="button-row">' +
      '<button type="button" class="secondary-button" data-admin-action="save-area" data-area-id="' + area.id + '">Save</button>' +
      '<button type="button" class="secondary-button destructive-button" data-admin-action="delete-area" data-area-id="' + area.id + '">Delete</button>' +
      "</div>" +
      "</article>";
  }).join("");
}

function renderAdminUsersList() {
  const container = document.getElementById("admin-users-list");

  if (!isAdminUser()) {
    container.innerHTML = '<p class="empty-state">Log in as admin to manage users.</p>';
    return;
  }

  if (adminState.users.length === 0) {
    container.innerHTML = '<p class="empty-state">No users found.</p>';
    return;
  }

  container.innerHTML = adminState.users.map(function (user) {
    const isCurrentAdmin = adminState.currentUser && adminState.currentUser.id === user.id;
    const groupOptions = buildUserGroupOptionsMarkup(user.group_id, user.role === "admin");

    return '<article class="config-item">' +
      '<div>' +
      '<p class="config-item-title">' + escapeHtml(user.username) + '</p>' +
      '<p class="small-text">' + (isCurrentAdmin ? "Current account" : "Managed account") + '</p>' +
      "</div>" +
      '<div class="form-row">' +
      '<label for="admin-user-role-' + user.id + '">Role</label>' +
      '<select id="admin-user-role-' + user.id + '" data-role-select-for-user="' + user.id + '">' +
      '<option value="user"' + (user.role === "user" ? " selected" : "") + '>User</option>' +
      '<option value="admin"' + (user.role === "admin" ? " selected" : "") + '>Admin</option>' +
      "</select>" +
      "</div>" +
      '<div class="form-row">' +
      '<label for="admin-user-group-' + user.id + '">Group</label>' +
      '<select id="admin-user-group-' + user.id + '"' + (user.role === "admin" ? " disabled" : "") + ">" +
      groupOptions +
      "</select>" +
      "</div>" +
      '<div class="form-row">' +
      '<label for="admin-reset-password-' + user.id + '">New password</label>' +
      '<input id="admin-reset-password-' + user.id + '" type="password" minlength="6" placeholder="Set a temporary password">' +
      "</div>" +
      '<div class="button-row">' +
      '<button type="button" class="secondary-button" data-admin-user-action="save-user" data-user-id="' + user.id + '">Save</button>' +
      '<button type="button" class="secondary-button" data-admin-user-action="reset-password" data-user-id="' + user.id + '">Reset password</button>' +
      (isCurrentAdmin
        ? '<span class="small-text">Change your own password from the app under More.</span>'
        : '<button type="button" class="secondary-button destructive-button" data-admin-user-action="delete-user" data-user-id="' + user.id + '">Delete user</button>') +
      "</div>" +
      "</article>";
  }).join("");

  bindRenderedUserRoleSelects();
}

function buildUserGroupOptionsMarkup(selectedGroupId, isAdminRole) {
  let markup = '<option value="">Choose a group</option>';

  adminState.groups.forEach(function (group) {
    const isSelected = !isAdminRole && String(group.id) === String(selectedGroupId);
    markup += '<option value="' + group.id + '"' + (isSelected ? " selected" : "") + ">" + escapeHtml(group.name) + "</option>";
  });

  return markup;
}

function bindRenderedUserRoleSelects() {
  const selects = document.querySelectorAll("[data-role-select-for-user]");

  selects.forEach(function (select) {
    select.addEventListener("change", function () {
      const userId = select.getAttribute("data-role-select-for-user");
      const groupSelect = document.getElementById("admin-user-group-" + userId);
      const isAdmin = select.value === "admin";

      groupSelect.disabled = isAdmin;

      if (isAdmin) {
        groupSelect.value = "";
      } else if (!groupSelect.value && adminState.groups.length > 0) {
        groupSelect.value = String(adminState.groups[0].id);
      }
    });
  });
}

async function handleAdminLoginSubmit(event) {
  event.preventDefault();

  const username = document.getElementById("admin-username").value.trim();
  const password = document.getElementById("admin-password").value;

  try {
    const result = await adminApiRequest("/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        username: username,
        password: password
      })
    });

    if (result.user.role !== "admin") {
      showAdminMessage("This account is not an admin.", "error");
      return;
    }

    adminState.token = result.access_token;
    adminState.currentUser = result.user;
    localStorage.setItem(ADMIN_STORAGE_KEY, adminState.token);
    document.getElementById("admin-login-form").reset();
    showAdminMessage("Admin login successful.", "success");
    await refreshAdminData();
  } catch (error) {
    showAdminMessage(error.message, "error");
  }
}

function handleAdminLogoutClick() {
  clearAdminSession(true);
  renderAdminPage();
}

async function handleAdminNewGroupSubmit(event) {
  event.preventDefault();

  if (!requireAdminTypedConfirmation("Create group")) {
    return;
  }

  const payload = {
    name: document.getElementById("admin-new-group-name").value.trim(),
    description: document.getElementById("admin-new-group-description").value.trim(),
    can_approve: document.getElementById("admin-new-group-can-approve").checked,
    approval_required: document.getElementById("admin-new-group-required").checked
  };

  try {
    await adminApiRequest("/admin/groups", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    document.getElementById("admin-new-group-form").reset();
    showAdminMessage("Group created successfully.", "success");
    await refreshAdminData();
  } catch (error) {
    showAdminMessage(error.message, "error");
  }
}

async function handleAdminNewAreaSubmit(event) {
  event.preventDefault();

  if (!requireAdminTypedConfirmation("Create area")) {
    return;
  }

  const name = document.getElementById("admin-new-area-name").value.trim();
  const description = document.getElementById("admin-new-area-description").value.trim();

  try {
    await adminApiRequest("/areas", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name: name,
        description: description
      })
    });

    document.getElementById("admin-new-area-form").reset();
    showAdminMessage("Area created successfully.", "success");
    await refreshAdminData();
  } catch (error) {
    showAdminMessage(error.message, "error");
  }
}

async function handleAdminNewUserSubmit(event) {
  event.preventDefault();

  if (!requireAdminTypedConfirmation("Create user")) {
    return;
  }

  const username = document.getElementById("admin-new-username").value.trim();
  const password = document.getElementById("admin-new-user-password").value;
  const role = document.getElementById("admin-new-user-role").value;
  const groupId = document.getElementById("admin-new-user-group").value;

  try {
    await adminApiRequest("/admin/users", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        username: username,
        password: password,
        role: role,
        group_id: role === "admin" ? null : Number(groupId)
      })
    });

    document.getElementById("admin-new-user-form").reset();
    document.getElementById("admin-new-user-role").value = "user";
    syncNewUserGroupState();
    showAdminMessage("User created successfully.", "success");
    await refreshAdminData();
  } catch (error) {
    showAdminMessage(error.message, "error");
  }
}

function handleAdminGroupActionClick(event) {
  const actionButton = event.target.closest("button[data-admin-group-action]");

  if (!actionButton) {
    return;
  }

  const groupId = actionButton.getAttribute("data-group-id");
  const actionName = actionButton.getAttribute("data-admin-group-action");

  if (actionName === "save-group") {
    saveAdminGroup(groupId);
    return;
  }

  if (actionName === "delete-group") {
    deleteAdminGroup(groupId);
  }
}

function handleAdminAreaActionClick(event) {
  const actionButton = event.target.closest("button[data-admin-action]");

  if (!actionButton) {
    return;
  }

  const areaId = actionButton.getAttribute("data-area-id");
  const actionName = actionButton.getAttribute("data-admin-action");

  if (actionName === "save-area") {
    saveAdminArea(areaId);
    return;
  }

  if (actionName === "delete-area") {
    deleteAdminArea(areaId);
  }
}

function handleAdminUserActionClick(event) {
  const actionButton = event.target.closest("button[data-admin-user-action]");

  if (!actionButton) {
    return;
  }

  const userId = actionButton.getAttribute("data-user-id");
  const actionName = actionButton.getAttribute("data-admin-user-action");

  if (actionName === "save-user") {
    saveAdminUser(userId);
    return;
  }

  if (actionName === "reset-password") {
    resetAdminUserPassword(userId);
    return;
  }

  if (actionName === "delete-user") {
    deleteAdminUser(userId);
  }
}

async function saveAdminGroup(groupId) {
  if (!requireAdminTypedConfirmation("Save group changes")) {
    return;
  }

  const payload = {
    name: document.getElementById("admin-group-name-" + groupId).value.trim(),
    description: document.getElementById("admin-group-description-" + groupId).value.trim(),
    can_approve: document.getElementById("admin-group-can-approve-" + groupId).checked,
    approval_required: document.getElementById("admin-group-required-" + groupId).checked
  };

  try {
    await adminApiRequest("/admin/groups/" + groupId, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    showAdminMessage("Group updated successfully.", "success");
    await refreshAdminData();
  } catch (error) {
    showAdminMessage(error.message, "error");
  }
}

async function deleteAdminGroup(groupId) {
  if (!requireAdminTypedConfirmation("Delete group")) {
    return;
  }

  try {
    await adminApiRequest("/admin/groups/" + groupId, {
      method: "DELETE"
    });

    showAdminMessage("Group deleted successfully.", "success");
    await refreshAdminData();
  } catch (error) {
    showAdminMessage(error.message, "error");
  }
}

async function saveAdminArea(areaId) {
  if (!requireAdminTypedConfirmation("Save area changes")) {
    return;
  }

  const name = document.getElementById("admin-area-name-" + areaId).value.trim();
  const description = document.getElementById("admin-area-description-" + areaId).value.trim();

  try {
    await adminApiRequest("/areas/" + areaId, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name: name,
        description: description
      })
    });

    showAdminMessage("Area updated successfully.", "success");
    await refreshAdminData();
  } catch (error) {
    showAdminMessage(error.message, "error");
  }
}

async function deleteAdminArea(areaId) {
  if (!requireAdminTypedConfirmation("Delete area")) {
    return;
  }

  try {
    await adminApiRequest("/areas/" + areaId, {
      method: "DELETE"
    });

    showAdminMessage("Area deleted successfully.", "success");
    await refreshAdminData();
  } catch (error) {
    showAdminMessage(error.message, "error");
  }
}

async function saveAdminUser(userId) {
  if (!requireAdminTypedConfirmation("Save user changes")) {
    return;
  }

  const role = document.getElementById("admin-user-role-" + userId).value;
  const groupValue = document.getElementById("admin-user-group-" + userId).value;

  try {
    await adminApiRequest("/admin/users/" + userId, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        role: role,
        group_id: role === "admin" ? null : Number(groupValue)
      })
    });

    showAdminMessage("User updated successfully.", "success");
    await refreshAdminData();
  } catch (error) {
    showAdminMessage(error.message, "error");
  }
}

async function resetAdminUserPassword(userId) {
  const newPassword = document.getElementById("admin-reset-password-" + userId).value;

  if (!newPassword || newPassword.length < 6) {
    showAdminMessage("The new password must be at least 6 characters long.", "error");
    return;
  }

  if (!requireAdminTypedConfirmation("Reset user password")) {
    return;
  }

  try {
    await adminApiRequest("/admin/users/" + userId + "/password", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        new_password: newPassword
      })
    });

    document.getElementById("admin-reset-password-" + userId).value = "";
    showAdminMessage("Password reset successfully.", "success");
  } catch (error) {
    showAdminMessage(error.message, "error");
  }
}

async function deleteAdminUser(userId) {
  if (!requireAdminTypedConfirmation("Delete user")) {
    return;
  }

  try {
    await adminApiRequest("/admin/users/" + userId, {
      method: "DELETE"
    });

    showAdminMessage("User deleted successfully.", "success");
    await refreshAdminData();
  } catch (error) {
    showAdminMessage(error.message, "error");
  }
}

function syncNewUserGroupState() {
  const roleSelect = document.getElementById("admin-new-user-role");
  const groupSelect = document.getElementById("admin-new-user-group");
  const isAdmin = roleSelect.value === "admin";

  groupSelect.disabled = isAdmin;

  if (isAdmin) {
    groupSelect.value = "";
  } else if (!groupSelect.value && adminState.groups.length > 0) {
    groupSelect.value = String(adminState.groups[0].id);
  }
}

function clearAdminSession(showConfirmation) {
  adminState.token = null;
  adminState.currentUser = null;
  adminState.groups = [];
  adminState.areas = [];
  adminState.users = [];
  localStorage.removeItem(ADMIN_STORAGE_KEY);

  if (showConfirmation) {
    showAdminMessage("Logged out of admin mode.", "info");
  }
}

async function adminApiRequest(path, options) {
  const requestOptions = options || {};
  const headers = new Headers(requestOptions.headers || {});

  if (adminState.token) {
    headers.set("Authorization", "Bearer " + adminState.token);
  }

  const response = await fetch(ADMIN_API_BASE_URL + path, {
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

function showAdminMessage(text, messageType) {
  const messageBox = document.getElementById("admin-message-box");

  messageBox.textContent = text;
  messageBox.className = "message-box message-" + messageType;
  messageBox.classList.remove("hidden");
}

function isAdminUser() {
  return Boolean(adminState.currentUser) && adminState.currentUser.role === "admin";
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
