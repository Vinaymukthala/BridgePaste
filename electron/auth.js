const {
  getSettings,
  updateSettings,
  store
} = require("./store");

const mockApi = require("./mock-api");
const { MOCKAPI_URL } = require("./config");

function isMockMode(apiUrl) {
  const settings = getSettings();
  const url = String(
    apiUrl || getSession().apiUrl || settings.apiUrl || MOCKAPI_URL
  ).trim();

  if (settings.useMockApi === false) {
    return false;
  }

  return (
    !url ||
    url === "mock" ||
    url.startsWith("mock://") ||
    url.includes("mockapi.io") ||
    url === "local" ||
    settings.useMockApi === true
  );
}

function getSession() {
  return (
    store.get("session", null) || {
      token: null,
      user: null,
      apiUrl: getSettings().apiUrl || MOCKAPI_URL,
      mode: "mock"
    }
  );
}

function normalizeApiUrl(url) {
  return String(url || "")
    .trim()
    .replace(/\/+$/, "");
}

function saveSession(session) {
  const current = getSession();
  const next = {
    ...current,
    ...session
  };

  if (session.apiUrl !== undefined) {
    next.apiUrl = normalizeApiUrl(session.apiUrl) || MOCKAPI_URL;
  }

  next.mode = isMockMode(next.apiUrl) ? "mock" : "live";
  store.set("session", next);

  if (session.apiUrl !== undefined) {
    updateSettings({
      apiUrl: next.apiUrl,
      useMockApi: next.mode === "mock"
    });
  }

  return next;
}

function clearSession() {
  const current = getSession();
  if (current.token && current.mode === "mock") {
    mockApi.revokeToken(current.token);
  }

  store.set("session", {
    token: null,
    user: null,
    apiUrl: current.apiUrl || MOCKAPI_URL,
    mode: isMockMode(current.apiUrl) ? "mock" : "live"
  });

  return getSession();
}

async function apiRequest(path, { method = "GET", body, token } = {}) {
  const session = getSession();
  const base = normalizeApiUrl(
    session.apiUrl || getSettings().apiUrl || "http://localhost:8787"
  );

  if (!base) {
    throw new Error("Cloud API URL is not set");
  }

  const headers = { "Content-Type": "application/json" };
  const authToken = token || session.token;
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  let response;
  try {
    response = await fetch(`${base}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });
  } catch (_) {
    throw new Error("Cannot reach Cloud API. Use Mock API or start the server.");
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Request failed (${response.status})`);
  }
  return data;
}

async function register({ email, password, name, apiUrl }) {
  if (apiUrl) {
    saveSession({ apiUrl });
  }

  if (isMockMode(apiUrl)) {
    const data = await mockApi.register({ email, password, name });
    return saveSession({
      token: data.token,
      user: data.user,
      mode: "mock",
      apiUrl: MOCKAPI_URL
    });
  }

  const data = await apiRequest("/api/auth/register", {
    method: "POST",
    body: { email, password, name }
  });

  return saveSession({
    token: data.token,
    user: data.user,
    mode: "live"
  });
}

async function login({ email, password, apiUrl }) {
  if (apiUrl) {
    saveSession({ apiUrl });
  }

  if (isMockMode(apiUrl)) {
    const data = await mockApi.login({ email, password });
    return saveSession({
      token: data.token,
      user: data.user,
      mode: "mock",
      apiUrl: MOCKAPI_URL
    });
  }

  const data = await apiRequest("/api/auth/login", {
    method: "POST",
    body: { email, password }
  });

  return saveSession({
    token: data.token,
    user: data.user,
    mode: "live"
  });
}

async function logout() {
  return clearSession();
}

async function refreshMe() {
  const session = getSession();
  if (!session.token) {
    return session;
  }

  try {
    if (isMockMode()) {
      const data = await mockApi.me(session.token);
      return saveSession({ user: data.user, mode: "mock" });
    }

    const data = await apiRequest("/api/auth/me");
    return saveSession({ user: data.user, mode: "live" });
  } catch (_) {
    return clearSession();
  }
}

async function pullClipboard() {
  const session = getSession();
  if (!session.token) {
    throw new Error("Login required");
  }

  if (isMockMode()) {
    return mockApi.pullIntoLocal(session.token);
  }

  const data = await apiRequest("/api/clipboard");
  const remote = Array.isArray(data.items) ? data.items : [];
  const { getItems, setItems } = require("./store");
  const local = getItems();
  const map = new Map();

  for (const item of [...remote, ...local]) {
    const key = item.id || item.text;
    if (!map.has(key)) map.set(key, item);
  }

  const merged = Array.from(map.values()).sort(
    (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
  );
  setItems(merged);
  return merged;
}

async function pushClipboard() {
  const session = getSession();
  if (!session.token) {
    throw new Error("Login required");
  }

  if (isMockMode()) {
    return mockApi.pushFromLocal(session.token);
  }

  const { getItems } = require("./store");
  return apiRequest("/api/clipboard", {
    method: "PUT",
    body: { items: getItems() }
  });
}

async function checkHealth(apiUrl) {
  if (isMockMode(apiUrl)) {
    const data = await mockApi.health();
    return { ok: Boolean(data.ok), base: MOCKAPI_URL, data };
  }

  const base = normalizeApiUrl(
    apiUrl || getSession().apiUrl || getSettings().apiUrl || "http://localhost:8787"
  );

  try {
    const response = await fetch(`${base}/api/health`);
    const data = await response.json();
    return { ok: Boolean(data.ok), base, data };
  } catch (_) {
    return { ok: false, base };
  }
}

async function updateProfile({ name, email }) {
  const session = getSession();
  if (!session.token) {
    throw new Error("Sign in required");
  }

  if (isMockMode()) {
    const data = await mockApi.updateProfile(session.token, { name, email });
    return saveSession({ user: data.user, mode: "mock" });
  }

  throw new Error("Profile update is only available in account mode");
}

async function changePassword({ currentPassword, newPassword }) {
  const session = getSession();
  if (!session.token) {
    throw new Error("Sign in required");
  }

  if (isMockMode()) {
    const data = await mockApi.changePassword(session.token, {
      currentPassword,
      newPassword
    });
    return saveSession({ user: data.user, mode: "mock" });
  }

  throw new Error("Password change is only available in account mode");
}

function getMockApiUrl() {
  return MOCKAPI_URL;
}

module.exports = {
  getSession,
  saveSession,
  clearSession,
  register,
  login,
  logout,
  refreshMe,
  pullClipboard,
  pushClipboard,
  checkHealth,
  isMockMode,
  getMockApiUrl,
  updateProfile,
  changePassword
};
