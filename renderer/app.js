let items = [];
let current = "home";
let paused = false;
let activeType = "ALL";
let selectedId = null;
let searchQuery = "";
let activityLog = [];
let currentSession = null;

const content = document.getElementById("content");
const title = document.getElementById("title");
const eyebrow = document.getElementById("eyebrow");
const pauseBtn = document.getElementById("pauseBtn");
const captureBtn = document.getElementById("captureBtn");
const shortcutBtn = document.getElementById("shortcutBtn");
const accountBtn = document.getElementById("accountBtn");
const accountMenu = document.getElementById("accountMenu");

const TYPE_FILTERS = [
  "ALL",
  "TEXT",
  "URL",
  "CODE",
  "JSON",
  "SQL",
  "cURL",
  "EMAIL",
  "NOTE"
];

function pushLog(message, detail = "") {
  activityLog.unshift({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    at: new Date().toISOString(),
    message,
    detail
  });
  activityLog = activityLog.slice(0, 100);
  if (current === "activity") {
    activityView();
  }
}

function toast(message, kind = "info") {
  const el = document.getElementById("toast");
  el.textContent = message;
  el.classList.toggle("warn", kind === "warn");
  el.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove("show"), 1900);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) =>
    ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]
  );
}

function formatTime(date) {
  if (!date) return "Earlier";
  const d = new Date(date);
  const diff = Date.now() - d.getTime();
  const minutes = Math.floor(diff / 60000);

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  if (hours < 48) return "Yesterday";
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric"
  });
}

function formatBytesLike(chars) {
  if (chars < 1000) return `${chars} chars`;
  return `${(chars / 1000).toFixed(1)}k chars`;
}

function syncMonitorUi() {
  pauseBtn.textContent = paused ? "▶ Resume" : "Ⅱ Pause";
  const dot = document.getElementById("statusDot");
  const label = document.getElementById("statusLabel");
  if (dot) {
    dot.classList.toggle("on", !paused);
    dot.classList.toggle("off", paused);
  }
  if (label) {
    label.textContent = paused ? "Monitoring paused" : "Monitoring active";
  }
}

function syncNavCounts() {
  const historyCount = document.getElementById("navHistoryCount");
  const favCount = document.getElementById("navFavCount");
  if (historyCount) historyCount.textContent = String(items.length);
  if (favCount) {
    favCount.textContent = String(items.filter((x) => x.favorite).length);
  }
}

async function loadItems({ quiet } = {}) {
  items = await window.bridgePaste.getItems();
  syncNavCounts();
  render(current, { quiet });
}

function filteredItems(source = items) {
  const q = searchQuery.toLowerCase().trim();
  return source.filter((item) => {
    const typeOk = activeType === "ALL" || item.type === activeType;
    if (!typeOk) return false;
    if (!q) return true;
    return (
      item.text.toLowerCase().includes(q) ||
      String(item.type).toLowerCase().includes(q)
    );
  });
}

function typeFiltersHtml() {
  return `
    <div class="filters">
      ${TYPE_FILTERS.map(
        (type) => `
          <button class="chip ${activeType === type ? "active" : ""}" data-type="${type}">
            ${type === "ALL" ? "All" : type}
          </button>
        `
      ).join("")}
    </div>
  `;
}

function row(item) {
  const preview = (item.preview || item.text || "").replace(/\s+/g, " ");
  return `
    <div class="item ${selectedId === item.id ? "selected" : ""}" data-id="${item.id}">
      <span class="type ${escapeHtml(item.type)}">${escapeHtml(item.type)}</span>
      <div class="item-main">
        <b title="${escapeHtml(item.text)}">${escapeHtml(preview)}</b>
        <small>
          ${formatTime(item.createdAt)}
          · ${formatBytesLike(item.charCount || item.text.length)}
          ${item.lineCount > 1 ? ` · ${item.lineCount} lines` : ""}
          ${item.useCount ? ` · used ${item.useCount}×` : ""}
        </small>
      </div>
      <div class="item-actions">
        <button class="icon-btn star ${item.favorite ? "on" : ""}" data-action="favorite" title="Favorite">★</button>
        <button class="icon-btn" data-action="copy" title="Copy">⧉</button>
        <button class="icon-btn" data-action="delete" title="Delete">✕</button>
      </div>
    </div>
  `;
}

function bindFilters() {
  document.querySelectorAll(".chip[data-type]").forEach((chip) => {
    chip.onclick = () => {
      activeType = chip.dataset.type;
      render(current);
    };
  });
}

function bindSearch(inputId = "q") {
  const search = document.getElementById(inputId);
  if (!search) return;
  search.value = searchQuery;
  search.oninput = () => {
    searchQuery = search.value;
    const rows = document.getElementById("rows");
    if (!rows) return;
    const source =
      current === "favorites" ? items.filter((x) => x.favorite) : items;
    const list = filteredItems(source);
    rows.innerHTML = list.length
      ? list.map(row).join("")
      : `<div class="empty"><strong>No matches</strong>Try another search or filter.</div>`;
    bindRows();
    updatePreview(list);
  };
}

function updatePreview(list) {
  const preview = document.getElementById("previewBody");
  const meta = document.getElementById("previewMeta");
  if (!preview) return;

  const item =
    list.find((x) => x.id === selectedId) || list[0] || null;

  if (!item) {
    preview.textContent = "Select an item to preview.";
    if (meta) meta.textContent = "";
    return;
  }

  selectedId = item.id;
  preview.textContent = item.text;
  if (meta) {
    meta.textContent = `${item.type} · ${formatTime(item.createdAt)} · ${item.text.length} characters`;
  }
}

function bindRows() {
  document.querySelectorAll(".item").forEach((element) => {
    element.onclick = async (event) => {
      const action = event.target.closest("[data-action]")?.dataset.action;
      const id = element.dataset.id;
      const item = items.find((x) => String(x.id) === String(id));
      if (!item) return;

      if (action === "favorite") {
        event.stopPropagation();
        const favorited = await window.bridgePaste.favoriteItem(item.id);
        await loadItems({ quiet: true });
        toast(favorited ? "Added to favorites" : "Removed from favorites");
        return;
      }

      if (action === "delete") {
        event.stopPropagation();
        confirmAction({
          title: "Delete clipboard item?",
          body: "This removes the item from local history. The system clipboard is unchanged.",
          confirmLabel: "Delete",
          onConfirm: async () => {
            await window.bridgePaste.deleteItem(item.id);
            if (selectedId === item.id) selectedId = null;
            toast("Item deleted");
            await loadItems({ quiet: true });
          }
        });
        return;
      }

      if (action === "copy") {
        event.stopPropagation();
        await window.bridgePaste.copyItem(item.id);
        toast("Copied to clipboard");
        return;
      }

      selectedId = item.id;
      await window.bridgePaste.copyItem(item.id);
      toast("Copied to clipboard");
      render(current, { quiet: true });
    };
  });
}

function typeStats() {
  const counts = {};
  for (const item of items) {
    counts[item.type] = (counts[item.type] || 0) + 1;
  }
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const max = Math.max(1, ...entries.map(([, n]) => n));
  if (!entries.length) {
    return `<div class="empty" style="padding:20px">No type data yet.</div>`;
  }
  return `
    <div class="type-bars">
      ${entries
        .map(
          ([type, count]) => `
        <div class="type-bar">
          <span>${escapeHtml(type)}</span>
          <div class="track"><div class="fill" style="width:${(count / max) * 100}%"></div></div>
          <span>${count}</span>
        </div>
      `
        )
        .join("")}
    </div>
  `;
}

function home() {
  title.textContent = "Clipboard";
  eyebrow.textContent = "WORKSPACE";
  const recent = filteredItems(items).slice(0, 8);

  content.innerHTML = `
    <div class="hero">
      <div>
        <h2>Secure clipboard for your workspace.</h2>
        <p>
          Capture, search, and reuse approved content quickly —
          with sensitive data filtering built in.
        </p>
        <div class="hero-actions">
          <button class="primary" id="homeCaptureBtn">Capture now</button>
          <button class="ghost" id="homeExportBtn">Export history</button>
          <button class="ghost" id="homeHelpBtn">Shortcuts</button>
        </div>
      </div>
      <div class="shortcut-chip">Ctrl + Shift + V · Quick picker</div>
    </div>

    <div class="grid">
      <div class="panel">
        <div class="panel-head">
          <b>Recent clipboard</b>
          <div class="toolbar">
            <input id="q" class="search" placeholder="Search clipboard…">
          </div>
        </div>
        ${typeFiltersHtml()}
        <div id="rows">
          ${
            recent.length
              ? recent.map(row).join("")
              : `<div class="empty"><strong>No clipboard items yet</strong>Copy something, or press Capture to pull the current clipboard.</div>`
          }
        </div>
        <div class="preview-panel">
          <h3>Preview <span id="previewMeta" style="color:var(--muted);font-weight:500"></span></h3>
          <div class="preview-body" id="previewBody">Select an item to preview.</div>
        </div>
      </div>

      <div class="panel">
        <div class="stat">
          <strong>${items.length}</strong>
          <span>Items in history</span>
        </div>
        <div class="stat">
          <strong>${items.filter((x) => x.favorite).length}</strong>
          <span>Favorites</span>
        </div>
        <div class="stat">
          <strong>${paused ? "Paused" : "Active"}</strong>
          <span>Clipboard monitoring</span>
        </div>
        <div class="stat">
          <strong style="font-size:14px;padding-top:4px">By type</strong>
          <span>Distribution of captured content</span>
        </div>
        ${typeStats()}
      </div>
    </div>
  `;

  bindFilters();
  bindSearch();
  bindRows();
  updatePreview(recent);

  document.getElementById("homeCaptureBtn").onclick = () => captureNow();
  document.getElementById("homeExportBtn").onclick = () => exportHistory();
  document.getElementById("homeHelpBtn").onclick = () => render("help");
}

function list(view) {
  const favorites = view === "favorites";
  title.textContent = favorites ? "Favorites" : "History";
  eyebrow.textContent = favorites ? "PINNED" : "LIBRARY";

  const source = favorites ? items.filter((x) => x.favorite) : items;
  const listItems = filteredItems(source);

  content.innerHTML = `
    <div class="panel">
      <div class="panel-head">
        <b>${favorites ? "Pinned clipboard" : "All clipboard history"}</b>
        <div class="toolbar">
          <input id="q" class="search" placeholder="Search…">
          ${
            !favorites
              ? `<button class="ghost" id="clearBtn">Clear all</button>`
              : ""
          }
        </div>
      </div>
      ${typeFiltersHtml()}
      <div id="rows">
        ${
          listItems.length
            ? listItems.map(row).join("")
            : `<div class="empty"><strong>Nothing here yet</strong>${
                favorites
                  ? "Star items from History to pin them."
                  : "Copy text anywhere on Windows to build history."
              }</div>`
        }
      </div>
      <div class="preview-panel">
        <h3>Preview <span id="previewMeta" style="color:var(--muted);font-weight:500"></span></h3>
        <div class="preview-body" id="previewBody">Select an item to preview.</div>
      </div>
    </div>
  `;

  bindFilters();
  bindSearch();
  bindRows();
  updatePreview(listItems);

  const clearBtn = document.getElementById("clearBtn");
  if (clearBtn) {
    clearBtn.onclick = () => {
      confirmAction({
        title: "Clear all history?",
        body: "Favorites and non-favorites will be removed from local storage. This cannot be undone.",
        confirmLabel: "Clear history",
        onConfirm: async () => {
          await window.bridgePaste.clearHistory();
          selectedId = null;
          toast("History cleared");
          await loadItems({ quiet: true });
        }
      });
    };
  }
}

function switchClass(on) {
  return `switch ${on ? "on" : ""}`;
}

async function security() {
  title.textContent = "Security";
  eyebrow.textContent = "PRIVACY";

  const settings = await window.bridgePaste.getSettings();
  const info = await window.bridgePaste.getSecurityInfo();

  content.innerHTML = `
    <div class="two-col">
      <div class="panel security-card">
        <span class="badge">● Local-only</span>
        <h2>Privacy first</h2>
        <p class="lead">
          Clipboard history is stored locally on this Windows device.
          BridgePaste does not sync content and does not attempt to bypass
          AVD, RDP, Citrix, or corporate clipboard restrictions.
        </p>

        <div class="setting">
          <div>
            <b>Local-only storage</b>
            <small>Always on. History never leaves this machine.</small>
          </div>
          <button class="switch on" disabled title="Always enabled"></button>
        </div>

        <div class="setting">
          <div>
            <b>Sensitive content protection</b>
            <small>Skip storing tokens, keys, passwords, and similar secrets.</small>
          </div>
          <button class="${switchClass(settings.sensitiveProtection !== false)}" id="sensitiveSwitch"></button>
        </div>
      </div>

      <div class="panel security-card">
        <h2 style="margin-top:0;font-size:16px">Protected patterns</h2>
        <p class="lead">When protection is on, matching clipboard text is not saved to history.</p>
        <div class="protected-list">
          ${(info.protectedTypes || [])
            .map((type) => `<span class="tag">${escapeHtml(type)}</span>`)
            .join("")}
        </div>
      </div>
    </div>
  `;

  document.getElementById("sensitiveSwitch").onclick = async (event) => {
    const next = !event.currentTarget.classList.contains("on");
    await window.bridgePaste.updateSettings({ sensitiveProtection: next });
    event.currentTarget.classList.toggle("on", next);
    toast(next ? "Sensitive protection enabled" : "Sensitive protection disabled", next ? "info" : "warn");
  };
}

async function settingsView() {
  title.textContent = "Settings";
  eyebrow.textContent = "WORKSPACE";

  const settings = await window.bridgePaste.getSettings();
  paused = !(await window.bridgePaste.getMonitoringStatus());
  syncMonitorUi();

  content.innerHTML = `
    <p class="section-desc">Manage clipboard behavior for this device. Account and logout are in the Account menu.</p>

    <div class="panel settings-card">
      <h2 class="section-title">Clipboard preferences</h2>

      <div class="setting">
        <div>
          <b>History limit</b>
          <small>Maximum clipboard items kept locally.</small>
        </div>
        <select id="maxHistory">
          <option value="100">100</option>
          <option value="500">500</option>
          <option value="1000">1000</option>
          <option value="5000">5000</option>
        </select>
      </div>

      <div class="setting">
        <div>
          <b>Auto retention</b>
          <small>Automatically remove older non-favorite items.</small>
        </div>
        <select id="retentionDays">
          <option value="1">1 day</option>
          <option value="3">3 days</option>
          <option value="7">7 days</option>
          <option value="14">14 days</option>
          <option value="30">30 days</option>
          <option value="0">Keep forever</option>
        </select>
      </div>

      <div class="setting">
        <div>
          <b>Launch with Windows</b>
          <small>Start BridgePaste when you sign in to Windows.</small>
        </div>
        <button class="${switchClass(Boolean(settings.autoStart))}" id="startupSwitch"></button>
      </div>

      <div class="setting">
        <div>
          <b>Launch minimized to tray</b>
          <small>Keep the window hidden until opened from the tray.</small>
        </div>
        <button class="${switchClass(Boolean(settings.launchMinimized))}" id="minimizedSwitch"></button>
      </div>

      <div class="setting">
        <div>
          <b>Clipboard monitoring</b>
          <small>Watch the Windows clipboard for new text.</small>
        </div>
        <button class="${switchClass(!paused)}" id="monitorSwitch"></button>
      </div>

      <div style="display:flex;gap:8px;margin-top:18px;flex-wrap:wrap">
        <button class="ghost" id="captureSettingsBtn">Capture current clipboard</button>
        <button class="danger" id="clear">Clear all history</button>
      </div>
    </div>

    <div class="panel settings-card" style="margin-top:16px">
      <h2 class="section-title">Sync</h2>
      <p class="lead">Optionally sync history with your signed-in account.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="ghost" id="pullBtn">Pull from account</button>
        <button class="ghost" id="pushBtn">Push to account</button>
        <button class="ghost" id="healthBtn">Check connection</button>
      </div>
    </div>

    <div class="panel settings-card" style="margin-top:16px">
      <h2 class="section-title">Data tools</h2>
      <p class="lead">Backup, restore, and clean up clipboard history.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="ghost" id="exportBtn">Export history</button>
        <button class="ghost" id="importBtn">Import history</button>
        <button class="ghost" id="dedupeBtn">Remove duplicates</button>
        <button class="ghost" id="helpBtn">Shortcuts & tips</button>
      </div>
    </div>
  `;

  document.getElementById("maxHistory").value = String(settings.maxHistory || 1000);
  document.getElementById("maxHistory").onchange = async (event) => {
    await window.bridgePaste.updateSettings({ maxHistory: Number(event.target.value) });
    toast("History limit updated");
    pushLog("Settings updated", "History limit changed");
  };

  document.getElementById("retentionDays").value = String(
    settings.retentionDays === 0 ? 0 : settings.retentionDays || 7
  );
  document.getElementById("retentionDays").onchange = async (event) => {
    await window.bridgePaste.updateSettings({
      retentionDays: Number(event.target.value)
    });
    toast("Retention updated");
    pushLog("Settings updated", "Retention policy changed");
    await loadItems({ quiet: true });
  };

  document.getElementById("startupSwitch").onclick = async (event) => {
    const next = !event.currentTarget.classList.contains("on");
    await window.bridgePaste.updateSettings({ autoStart: next });
    event.currentTarget.classList.toggle("on", next);
    toast(next ? "Will launch with Windows" : "Startup disabled");
  };

  document.getElementById("minimizedSwitch").onclick = async (event) => {
    const next = !event.currentTarget.classList.contains("on");
    await window.bridgePaste.updateSettings({ launchMinimized: next });
    event.currentTarget.classList.toggle("on", next);
    toast(next ? "Will launch to tray" : "Will show window on launch");
  };

  document.getElementById("monitorSwitch").onclick = async () => {
    const active = await window.bridgePaste.toggleMonitoring();
    paused = !active;
    syncMonitorUi();
    toast(paused ? "Monitoring paused" : "Monitoring resumed");
    pushLog(paused ? "Monitoring paused" : "Monitoring resumed");
    render("settings");
  };

  document.getElementById("captureSettingsBtn").onclick = () => captureNow();

  document.getElementById("clear").onclick = () => {
    confirmAction({
      title: "Clear all history?",
      body: "This permanently removes every stored clipboard item from this device.",
      confirmLabel: "Clear history",
      onConfirm: async () => {
        await window.bridgePaste.clearHistory();
        toast("History cleared");
        pushLog("History cleared");
        await loadItems({ quiet: true });
      }
    });
  };

  document.getElementById("pullBtn").onclick = async () => {
    try {
      await window.bridgePaste.pullCloud();
      await loadItems({ quiet: true });
      toast("Synced from account");
      pushLog("Pulled clipboard from account");
    } catch (error) {
      toast(error.message || "Sign in required", "warn");
    }
  };

  document.getElementById("pushBtn").onclick = async () => {
    try {
      await window.bridgePaste.pushCloud();
      toast("Synced to account");
      pushLog("Pushed clipboard to account");
    } catch (error) {
      toast(error.message || "Sign in required", "warn");
    }
  };

  document.getElementById("healthBtn").onclick = async () => {
    const config = await window.bridgePaste.getAuthConfig();
    const result = await window.bridgePaste.checkApiHealth(config.mockApiUrl);
    toast(result.ok ? "Account service is reachable" : "Account service unreachable", result.ok ? "info" : "warn");
  };

  document.getElementById("exportBtn").onclick = () => exportHistory();
  document.getElementById("importBtn").onclick = () => importHistory();
  document.getElementById("helpBtn").onclick = () => render("help");
  document.getElementById("dedupeBtn").onclick = async () => {
    try {
      const result = await window.bridgePaste.dedupeHistory();
      toast(`Removed ${result.before - result.after} duplicates`);
      pushLog("Duplicates removed", `${result.before} → ${result.after}`);
      await loadItems({ quiet: true });
    } catch (error) {
      toast(error.message || "Dedupe failed", "warn");
    }
  };
}

async function profileView() {
  title.textContent = "Profile";
  eyebrow.textContent = "ACCOUNT";

  const session = currentSession || (await window.bridgePaste.getSession());
  const loggedIn = Boolean(session?.token && session?.user);
  const name = session?.user?.name || "Guest";
  const email = session?.user?.email || "";
  const initial = (loggedIn ? name || email : "G").slice(0, 1).toUpperCase();

  if (!loggedIn) {
    content.innerHTML = `
      <div class="panel settings-card">
        <h2 class="section-title">You're in guest mode</h2>
        <p class="lead">Sign in to edit your profile, change password, and sync clipboard history.</p>
        <button class="primary" id="profileLoginBtn">Sign in</button>
      </div>
    `;
    document.getElementById("profileLoginBtn").onclick = () =>
      showAuthGate({ force: true });
    return;
  }

  content.innerHTML = `
    <div class="panel settings-card">
      <div class="profile-grid">
        <div class="profile-avatar-lg">${escapeHtml(initial)}</div>
        <div>
          <h2 class="section-title" style="margin-bottom:6px">${escapeHtml(name)}</h2>
          <p class="lead" style="margin:0">${escapeHtml(email)}</p>
          <p class="lead" style="margin:10px 0 0">Signed in · profile editable</p>
        </div>
      </div>
    </div>

    <div class="panel settings-card" style="margin-top:16px">
      <h2 class="section-title">Edit profile</h2>
      <p class="section-desc">Update how your name and email appear across BridgePaste.</p>

      <label class="field-label" for="profileName">Display name</label>
      <input id="profileName" class="search auth-input" value="${escapeHtml(name)}" placeholder="Your name">

      <label class="field-label" for="profileEmail">Email</label>
      <input id="profileEmail" type="email" class="search auth-input" value="${escapeHtml(email)}" placeholder="you@company.com">

      <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
        <button class="primary" id="saveProfileBtn">Save profile</button>
        <button class="ghost" id="profileSettingsBtn">Open settings</button>
      </div>
      <div class="auth-msg" id="profileMsg"></div>
    </div>

    <div class="panel settings-card" style="margin-top:16px">
      <h2 class="section-title">Change password</h2>
      <p class="section-desc">Use a strong password of at least 6 characters.</p>

      <label class="field-label" for="currentPassword">Current password</label>
      <input id="currentPassword" type="password" class="search auth-input" placeholder="Current password">

      <label class="field-label" for="newPassword">New password</label>
      <input id="newPassword" type="password" class="search auth-input" placeholder="New password">

      <label class="field-label" for="confirmPassword">Confirm new password</label>
      <input id="confirmPassword" type="password" class="search auth-input" placeholder="Confirm password">

      <button class="primary" id="savePasswordBtn" style="margin-top:8px">Update password</button>
      <div class="auth-msg" id="passwordMsg"></div>
    </div>
  `;

  document.getElementById("profileSettingsBtn").onclick = () => render("settings");

  document.getElementById("saveProfileBtn").onclick = async () => {
    const msg = document.getElementById("profileMsg");
    msg.className = "auth-msg";
    msg.textContent = "Saving…";
    try {
      await window.bridgePaste.updateProfile({
        name: document.getElementById("profileName").value.trim(),
        email: document.getElementById("profileEmail").value.trim()
      });
      await syncAccountUi();
      msg.textContent = "Profile updated";
      toast("Profile saved");
      pushLog("Profile updated");
      render("profile");
    } catch (error) {
      msg.className = "auth-msg error";
      msg.textContent = error.message || "Could not update profile";
    }
  };

  document.getElementById("savePasswordBtn").onclick = async () => {
    const msg = document.getElementById("passwordMsg");
    const next = document.getElementById("newPassword").value;
    const confirm = document.getElementById("confirmPassword").value;
    msg.className = "auth-msg";

    if (next !== confirm) {
      msg.className = "auth-msg error";
      msg.textContent = "New passwords do not match";
      return;
    }

    msg.textContent = "Updating…";
    try {
      await window.bridgePaste.changePassword({
        currentPassword: document.getElementById("currentPassword").value,
        newPassword: next
      });
      document.getElementById("currentPassword").value = "";
      document.getElementById("newPassword").value = "";
      document.getElementById("confirmPassword").value = "";
      msg.textContent = "Password updated";
      toast("Password changed");
      pushLog("Password changed");
    } catch (error) {
      msg.className = "auth-msg error";
      msg.textContent = error.message || "Could not change password";
    }
  };
}

function activityView() {
  title.textContent = "Activity";
  eyebrow.textContent = "AUDIT";

  content.innerHTML = `
    <div class="panel-head" style="padding:0 0 14px;border:0">
      <div>
        <p class="section-desc" style="margin:0">Recent actions in this workspace for audit and troubleshooting.</p>
      </div>
      <button class="ghost" id="clearActivityBtn">Clear log</button>
    </div>
    <div class="panel">
      ${
        activityLog.length
          ? activityLog
              .map(
                (entry) => `
            <div class="activity-row">
              <time>${escapeHtml(formatTime(entry.at))}</time>
              <div>
                <b>${escapeHtml(entry.message)}</b>
                ${entry.detail ? `<span>${escapeHtml(entry.detail)}</span>` : ""}
              </div>
            </div>
          `
              )
              .join("")
          : `<div class="empty"><strong>No activity yet</strong>Captures, copies, and sign-in events will appear here.</div>`
      }
    </div>
  `;

  document.getElementById("clearActivityBtn").onclick = () => {
    activityLog = [];
    pushLog("Activity log cleared");
    activityView();
  };
}

function helpView() {
  title.textContent = "Shortcuts & tips";
  eyebrow.textContent = "HELP";

  content.innerHTML = `
    <p class="section-desc">Keyboard shortcuts and productivity tips for BridgePaste.</p>
    <div class="panel settings-card">
      <div class="setting"><div><b>Ctrl + Shift + V</b><small>Open quick picker</small></div><span class="tag">Global</span></div>
      <div class="setting"><div><b>Ctrl + K</b><small>Focus search in the current list</small></div><span class="tag">App</span></div>
      <div class="setting"><div><b>↑ / ↓</b><small>Navigate picker results</small></div><span class="tag">Picker</span></div>
      <div class="setting"><div><b>Enter</b><small>Copy selected picker item</small></div><span class="tag">Picker</span></div>
      <div class="setting"><div><b>Delete</b><small>Remove selected picker item</small></div><span class="tag">Picker</span></div>
      <div class="setting"><div><b>Esc</b><small>Close picker, menus, or dialogs</small></div><span class="tag">App</span></div>
    </div>
    <div class="panel settings-card" style="margin-top:16px">
      <h2 class="section-title">Tips</h2>
      <p class="lead">• Star important snippets so retention never deletes them.</p>
      <p class="lead">• Use Activity to audit captures and blocked secrets.</p>
      <p class="lead">• Export history before clearing or switching machines.</p>
      <p class="lead">• Sensitive tokens are never stored when protection is on.</p>
    </div>
  `;
}

function confirmAction({ title, body, confirmLabel, onConfirm }) {
  const modal = document.getElementById("modal");
  document.getElementById("modalTitle").textContent = title;
  document.getElementById("modalBody").textContent = body;
  const confirmBtn = document.getElementById("modalConfirm");
  confirmBtn.textContent = confirmLabel || "Confirm";
  modal.hidden = false;

  const close = () => {
    modal.hidden = true;
    confirmBtn.onclick = null;
    document.getElementById("modalCancel").onclick = null;
  };

  document.getElementById("modalCancel").onclick = close;
  confirmBtn.onclick = async () => {
    close();
    await onConfirm();
  };
}

async function render(view, { quiet } = {}) {
  current = view;

  document.querySelectorAll(".nav").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === view);
  });

  if (view === "home") home();
  else if (view === "history" || view === "favorites") list(view);
  else if (view === "activity") activityView();
  else if (view === "security") await security();
  else if (view === "settings") await settingsView();
  else if (view === "profile") await profileView();
  else if (view === "help") helpView();

  if (!quiet) {
    content.style.animation = "none";
    void content.offsetHeight;
    content.style.animation = "";
  }
}

async function captureNow() {
  const result = await window.bridgePaste.forceCapture();
  if (!result) {
    toast("Nothing new on the clipboard", "warn");
    return;
  }
  if (result.blocked) {
    toast(
      `Sensitive content blocked (${(result.matches || []).join(", ") || "secret"})`,
      "warn"
    );
    pushLog("Sensitive content blocked", (result.matches || []).join(", "));
    return;
  }
  toast(result.duplicate ? "Item refreshed in history" : "Clipboard captured");
  pushLog(
    result.duplicate ? "Clipboard item refreshed" : "Clipboard captured",
    result.type || result.item?.type || ""
  );
  await loadItems({ quiet: true });
}

document.querySelectorAll(".nav").forEach((button) => {
  button.onclick = () => {
    searchQuery = "";
    activeType = "ALL";
    render(button.dataset.view);
  };
});

pauseBtn.onclick = async () => {
  const active = await window.bridgePaste.toggleMonitoring();
  paused = !active;
  syncMonitorUi();
  toast(paused ? "Clipboard monitoring paused" : "Clipboard monitoring resumed");
  if (current === "home" || current === "settings") {
    render(current, { quiet: true });
  }
};

captureBtn.onclick = () => captureNow();
shortcutBtn.onclick = () => window.bridgePaste.openPicker();

window.bridgePaste.onClipboardChanged(async (payload) => {
  if (payload?.blocked) {
    toast(
      `Sensitive content not stored (${(payload.matches || []).join(", ") || "secret"})`,
      "warn"
    );
    pushLog("Sensitive content blocked", (payload.matches || []).join(", "));
    return;
  }

  if (payload?.cleared || payload?.deleted || payload?.item || payload?.favorited !== undefined) {
    await loadItems({ quiet: true });
  }

  if (payload?.item && !payload?.copied && !payload?.duplicate) {
    toast("Clipboard captured");
    pushLog("Clipboard captured", payload.item.type || "");
  }

  if (payload?.copied) {
    pushLog("Item copied to clipboard");
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    const modal = document.getElementById("modal");
    if (!modal.hidden) modal.hidden = true;
    closeAccountMenu();
  }

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    const search = document.getElementById("q");
    if (search) search.focus();
  }
});

function closeAccountMenu() {
  accountMenu.hidden = true;
  accountBtn.classList.remove("open");
  accountBtn.setAttribute("aria-expanded", "false");
}

function toggleAccountMenu() {
  const open = accountMenu.hidden;
  accountMenu.hidden = !open;
  accountBtn.classList.toggle("open", open);
  accountBtn.setAttribute("aria-expanded", String(open));
}

accountBtn.onclick = (event) => {
  event.stopPropagation();
  toggleAccountMenu();
};

document.addEventListener("click", (event) => {
  if (!accountMenu.hidden && !event.target.closest(".account-wrap")) {
    closeAccountMenu();
  }
});

accountMenu.querySelectorAll("[data-account-action]").forEach((button) => {
  button.onclick = async () => {
    const action = button.dataset.accountAction;
    closeAccountMenu();

    if (action === "profile") {
      render("profile");
      return;
    }

    if (action === "settings") {
      render("settings");
      return;
    }

    if (action === "help") {
      render("help");
      return;
    }

    if (action === "login") {
      showAuthGate({ force: true });
      return;
    }

    if (action === "logout") {
      confirmAction({
        title: "Log out?",
        body: "You will return to guest mode. Local clipboard history stays on this device.",
        confirmLabel: "Log out",
        onConfirm: async () => {
          await window.bridgePaste.logout();
          toast("Logged out");
          pushLog("Signed out");
          await syncAccountUi();
          if (current === "profile" || current === "settings") {
            render("home");
          }
        }
      });
    }
  };
});

(async function init() {
  paused = !(await window.bridgePaste.getMonitoringStatus());
  syncMonitorUi();
  await setupAuthGate();
  await syncAccountUi();
  pushLog("Workspace ready", "BridgePaste started");
  await loadItems();
})();

let authMode = "login";
let localModeChosen = false;

async function syncAccountUi() {
  currentSession = await window.bridgePaste.getSession();
  const loggedIn = Boolean(currentSession?.token && currentSession?.user);
  const titleEl = document.getElementById("accountTitle");
  const subtitleEl = document.getElementById("accountSubtitle");
  const avatarEl = document.getElementById("accountAvatar");
  const logoutBtn = document.getElementById("accountLogoutBtn");
  const loginBtn = document.getElementById("accountLoginBtn");

  if (loggedIn) {
    titleEl.textContent = "Account";
    subtitleEl.textContent = currentSession.user.name || currentSession.user.email;
    avatarEl.textContent = String(
      currentSession.user.name || currentSession.user.email || "A"
    )
      .trim()
      .charAt(0)
      .toUpperCase();
    logoutBtn.hidden = false;
    loginBtn.hidden = true;
  } else {
    titleEl.textContent = "Account";
    subtitleEl.textContent = "Guest · local only";
    avatarEl.textContent = "G";
    logoutBtn.hidden = true;
    loginBtn.hidden = false;
  }
}

async function setupAuthGate() {
  const gate = document.getElementById("authGate");
  const session = await window.bridgePaste.getSession();
  const config = await window.bridgePaste.getAuthConfig();

  document.getElementById("authMsg").textContent = "";

  document.querySelectorAll("[data-auth-mode]").forEach((chip) => {
    chip.onclick = () => {
      authMode = chip.dataset.authMode;
      document.querySelectorAll("[data-auth-mode]").forEach((c) => {
        c.classList.toggle("active", c === chip);
      });
      document.getElementById("authNameWrap").hidden = authMode !== "register";
      document.getElementById("authSubmit").textContent =
        authMode === "register" ? "Create account" : "Sign in";
    };
  });

  document.getElementById("authLocal").onclick = () => {
    localModeChosen = true;
    gate.hidden = true;
    toast("Continuing as guest");
    pushLog("Continued as guest");
  };

  document.getElementById("authSubmit").onclick = async () => {
    const msg = document.getElementById("authMsg");
    msg.className = "auth-msg";
    msg.textContent = "Signing in…";

    const payload = {
      apiUrl: config.mockApiUrl,
      email: document.getElementById("authEmail").value.trim(),
      password: document.getElementById("authPassword").value,
      name: document.getElementById("authName").value.trim()
    };

    try {
      await window.bridgePaste.updateSettings({
        apiUrl: payload.apiUrl,
        useMockApi: true
      });

      if (authMode === "register") {
        await window.bridgePaste.register(payload);
        pushLog("Account created", payload.email);
      } else {
        await window.bridgePaste.login(payload);
        pushLog("Signed in", payload.email);
      }

      gate.hidden = true;
      await syncAccountUi();
      toast(`Welcome, ${payload.email}`);
      if (current === "settings" || current === "profile") render(current);
    } catch (error) {
      msg.className = "auth-msg error";
      msg.textContent = error?.message || String(error) || "Sign-in failed";
    }
  };

  if (!session?.token && !localModeChosen) {
    gate.hidden = false;
  }
}

async function exportHistory() {
  try {
    const result = await window.bridgePaste.exportHistory();
    if (result?.canceled) return;
    toast(`Exported ${result.count} items`);
    pushLog("History exported", `${result.count} items`);
  } catch (error) {
    toast(error.message || "Export failed", "warn");
  }
}

async function importHistory() {
  try {
    const result = await window.bridgePaste.importHistory();
    if (result?.canceled) return;
    toast(`Imported ${result.imported} items`);
    pushLog("History imported", `${result.imported} items`);
    await loadItems({ quiet: true });
  } catch (error) {
    toast(error.message || "Import failed", "warn");
  }
}

function showAuthGate({ force } = {}) {
  const gate = document.getElementById("authGate");
  if (force) gate.hidden = false;
}
