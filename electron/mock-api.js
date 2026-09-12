const crypto = require("crypto");
const { getItems, setItems, store } = require("./store");
const { MOCKAPI_URL } = require("./config");

function publicUser(user) {
  return {
    id: String(user.id),
    email: user.email,
    name: user.name || "User",
    createdAt: user.createdAt || new Date().toISOString()
  };
}

function issueLocalToken(user) {
  const token = `mockapi_${user.id}_${crypto.randomBytes(8).toString("hex")}`;
  const tokens = store.get("mockApiTokens", {});
  tokens[token] = publicUser(user);
  store.set("mockApiTokens", tokens);
  return token;
}

function userFromToken(token) {
  const tokens = store.get("mockApiTokens", {});
  return tokens[token] || null;
}

function revokeToken(token) {
  if (!token) return;
  const tokens = store.get("mockApiTokens", {});
  delete tokens[token];
  store.set("mockApiTokens", tokens);
}

async function mockRequest(url, { method = "GET", body } = {}) {
  let response;
  try {
    response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined
    });
  } catch (_) {
    throw new Error("Cannot reach MockAPI.io. Check your internet connection.");
  }

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      (data && (data.message || data.error)) ||
      `MockAPI request failed (${response.status})`;
    throw new Error(message);
  }

  return data;
}

function usersUrl(email) {
  if (!email) return MOCKAPI_URL;
  return `${MOCKAPI_URL}?email=${encodeURIComponent(
    String(email).toLowerCase().trim()
  )}`;
}

async function listUsers(email) {
  const data = await mockRequest(usersUrl(email));
  return Array.isArray(data) ? data : [];
}

async function register({ email, password, name }) {
  const normalized = String(email || "").toLowerCase().trim();
  if (!normalized.includes("@")) {
    throw new Error("Valid email required");
  }
  if (String(password || "").length < 6) {
    throw new Error("Password must be at least 6 characters");
  }

  const existing = await listUsers(normalized);
  if (existing.length) {
    throw new Error("Email already registered");
  }

  const created = await mockRequest(MOCKAPI_URL, {
    method: "POST",
    body: {
      name: String(name || "").trim() || "User",
      email: normalized,
      password: String(password)
    }
  });

  const token = issueLocalToken(created);
  return { token, user: publicUser(created), mode: "mock" };
}

async function login({ email, password }) {
  const users = await listUsers(email);
  const user = users.find(
    (entry) =>
      String(entry.email || "").toLowerCase() ===
        String(email || "").toLowerCase().trim() &&
      String(entry.password || "") === String(password || "")
  );

  if (!user) {
    throw new Error("Invalid email or password");
  }

  const token = issueLocalToken(user);
  return { token, user: publicUser(user), mode: "mock" };
}

async function me(token) {
  const user = userFromToken(token);
  if (!user) {
    throw new Error("Invalid or expired token");
  }
  return { user, mode: "mock" };
}

function refreshTokenUser(token, user) {
  const tokens = store.get("mockApiTokens", {});
  if (!tokens[token]) {
    throw new Error("Invalid or expired token");
  }
  tokens[token] = publicUser(user);
  store.set("mockApiTokens", tokens);
  return tokens[token];
}

async function updateProfile(token, { name, email }) {
  const current = userFromToken(token);
  if (!current) {
    throw new Error("Sign in required");
  }

  const nextName = String(name || "").trim() || current.name;
  const nextEmail = String(email || "").toLowerCase().trim();

  if (!nextEmail.includes("@")) {
    throw new Error("Valid email required");
  }

  if (nextEmail !== String(current.email).toLowerCase()) {
    const existing = await listUsers(nextEmail);
    if (existing.some((user) => String(user.id) !== String(current.id))) {
      throw new Error("Email already in use");
    }
  }

  const remote = await mockRequest(`${MOCKAPI_URL}/${current.id}`);
  const updated = await mockRequest(`${MOCKAPI_URL}/${current.id}`, {
    method: "PUT",
    body: {
      name: nextName,
      email: nextEmail,
      password: remote.password || ""
    }
  });

  const user = refreshTokenUser(token, {
    ...remote,
    ...updated,
    name: nextName,
    email: nextEmail
  });
  return { user, mode: "mock" };
}

async function changePassword(token, { currentPassword, newPassword }) {
  const sessionUser = userFromToken(token);
  if (!sessionUser) {
    throw new Error("Sign in required");
  }

  if (String(newPassword || "").length < 6) {
    throw new Error("New password must be at least 6 characters");
  }

  const remote = await mockRequest(`${MOCKAPI_URL}/${sessionUser.id}`);
  if (!remote || String(remote.password || "") !== String(currentPassword || "")) {
    throw new Error("Current password is incorrect");
  }

  const updated = await mockRequest(`${MOCKAPI_URL}/${sessionUser.id}`, {
    method: "PUT",
    body: {
      name: remote.name || sessionUser.name,
      email: remote.email || sessionUser.email,
      password: String(newPassword)
    }
  });

  const user = refreshTokenUser(token, {
    ...remote,
    ...updated,
    password: String(newPassword)
  });

  return { user, mode: "mock" };
}

function getClipboardStore() {
  return store.get("mockApiClipboards", {});
}

function setClipboardStore(db) {
  store.set("mockApiClipboards", db);
}

function getClipboard(token) {
  const user = userFromToken(token);
  if (!user) throw new Error("Invalid or expired token");
  const db = getClipboardStore();
  return { items: db[user.id] || [] };
}

function setClipboard(token, items) {
  const user = userFromToken(token);
  if (!user) throw new Error("Invalid or expired token");
  const db = getClipboardStore();
  db[user.id] = Array.isArray(items) ? items.slice(0, 5000) : [];
  setClipboardStore(db);
  return { items: db[user.id], count: db[user.id].length };
}

async function health() {
  try {
    const users = await listUsers();
    return {
      ok: true,
      service: "mockapi.io",
      mode: "mock",
      base: MOCKAPI_URL,
      users: users.length,
      time: new Date().toISOString()
    };
  } catch (error) {
    return {
      ok: false,
      service: "mockapi.io",
      mode: "mock",
      base: MOCKAPI_URL,
      error: error.message
    };
  }
}

function pullIntoLocal(token) {
  const remote = getClipboard(token).items || [];
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

function pushFromLocal(token) {
  return setClipboard(token, getItems());
}

module.exports = {
  MOCKAPI_BASE: MOCKAPI_URL,
  register,
  login,
  me,
  updateProfile,
  changePassword,
  getClipboard,
  setClipboard,
  health,
  revokeToken,
  pullIntoLocal,
  pushFromLocal
};
