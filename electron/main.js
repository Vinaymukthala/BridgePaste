const {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  Menu,
  Tray,
  nativeImage,
  screen,
  dialog
} = require("electron");

const path = require("path");
const fs = require("fs");

const {
  startMonitoring,
  stopMonitoring,
  isMonitoring,
  toggleMonitoring,
  copyItem,
  copyText,
  deleteItem,
  toggleFavorite,
  clearHistory,
  forceCapture
} = require("./clipboard-manager");

const {
  getItems,
  getSettings,
  updateSettings,
  pruneExpiredItems
} = require("./store");

const { getProtectedTypes } = require("./security");

const auth = require("./auth");

let mainWindow = null;
let pickerWindow = null;
let tray = null;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

const iconPath = path.join(__dirname, "..", "assets", "icon.png");

function getAppIcon() {
  if (fs.existsSync(iconPath)) {
    return nativeImage.createFromPath(iconPath);
  }
  return createFallbackIcon();
}

function createFallbackIcon() {
  // Minimal 16x16 PNG (blue rounded square) as base64
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAxUlEQVQ4T2NkYGD4z0BFwMRAJxhGNTAwMDAwMjAw/GdgYPjPQEUA0sDwH6QBZAADAwMDyAaQBgaQBoYGBgaQDQwMDAwgG0AaGBgYGBjgNkA0MDAwMIBsAGlgYGBgYIDbANHAwMDAALIBpIGBgYGBAaYBpIGBgYEBpAGkgYGBgYEBpgGkgYGBgQGkAaSBgYGBAaYBpIGBgYEBpAGkgYGBgYEBpgGkgYGBgQGkAaSBgYGBAaYBpIGBgYEBpAGkgYGBgYEBpgGkgYGBgQGkAaSBgYGBAaYBpIGBgYEBpOE/AwMDAJ7yC+D6oYgPAAAAAElFTkSuQmCC",
    "base64"
  );
  return nativeImage.createFromBuffer(png);
}

function applyAutoStart(enabled) {
  try {
    app.setLoginItemSettings({
      openAtLogin: Boolean(enabled),
      path: process.execPath,
      args: []
    });
  } catch (error) {
    console.error("Failed to update auto-start:", error);
  }
}

function createMainWindow() {
  const settings = getSettings();

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#0f1419",
    show: !settings.launchMinimized,
    icon: getAppIcon(),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, "..", "renderer", "index.html"));

  mainWindow.on("close", (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function createPicker() {
  pickerWindow = new BrowserWindow({
    width: 760,
    height: 560,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    transparent: false,
    backgroundColor: "#0f1419",
    icon: getAppIcon(),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  pickerWindow.loadFile(path.join(__dirname, "..", "picker", "index.html"));

  pickerWindow.on("closed", () => {
    pickerWindow = null;
  });
}

function showMainWindow() {
  if (!mainWindow) {
    createMainWindow();
  }

  mainWindow.show();
  mainWindow.focus();
}

function hidePicker() {
  if (pickerWindow && !pickerWindow.isDestroyed()) {
    pickerWindow.hide();
  }
}

function showPicker() {
  if (!pickerWindow || pickerWindow.isDestroyed()) {
    createPicker();
  }

  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  const bounds = display.workArea;
  const width = 760;
  const height = 560;

  pickerWindow.setBounds({
    x: bounds.x + Math.round((bounds.width - width) / 2),
    y: bounds.y + Math.round((bounds.height - height) / 2),
    width,
    height
  });

  pickerWindow.show();
  pickerWindow.focus();
  pickerWindow.webContents.send("refresh-items");
}

function rebuildTrayMenu() {
  if (!tray) return;

  const monitoring = isMonitoring();

  const menu = Menu.buildFromTemplate([
    {
      label: "Open BridgePaste",
      click: showMainWindow
    },
    {
      label: "Open Quick Picker",
      accelerator: "CommandOrControl+Shift+V",
      click: showPicker
    },
    { type: "separator" },
    {
      label: monitoring ? "Pause Monitoring" : "Resume Monitoring",
      click: () => {
        toggleMonitoring();
        rebuildTrayMenu();
      }
    },
    {
      label: "Capture Current Clipboard",
      click: () => {
        forceCapture();
      }
    },
    { type: "separator" },
    {
      label: "Clear Clipboard History",
      click: () => {
        clearHistory();
      }
    },
    { type: "separator" },
    {
      label: "Exit",
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(menu);
}

function createTray() {
  tray = new Tray(getAppIcon());
  tray.setToolTip("BridgePaste — Secure Clipboard");
  rebuildTrayMenu();

  tray.on("double-click", showMainWindow);
  tray.on("click", showMainWindow);
}

function registerShortcuts() {
  const registered = globalShortcut.register(
    "CommandOrControl+Shift+V",
    showPicker
  );

  if (!registered) {
    console.error("Could not register Ctrl+Shift+V");
  }
}

/* ---------------- IPC ---------------- */

ipcMain.handle("get-items", () => {
  pruneExpiredItems();
  return getItems();
});

ipcMain.handle("copy-item", (_, id) => copyItem(id));

ipcMain.handle("copy-text", (_, text) => copyText(text));

ipcMain.handle("delete-item", (_, id) => deleteItem(id));

ipcMain.handle("favorite-item", (_, id) => toggleFavorite(id));

ipcMain.handle("clear-history", () => clearHistory());

ipcMain.handle("get-settings", () => getSettings());

ipcMain.handle("update-settings", (_, settings) => {
  const next = updateSettings(settings);

  if (Object.prototype.hasOwnProperty.call(settings, "autoStart")) {
    applyAutoStart(next.autoStart);
  }

  if (Object.prototype.hasOwnProperty.call(settings, "apiUrl")) {
    auth.saveSession({ apiUrl: next.apiUrl });
  }

  if (Object.prototype.hasOwnProperty.call(settings, "monitoringEnabled")) {
    if (next.monitoringEnabled && !isMonitoring()) {
      startMonitoring();
    }
    if (!next.monitoringEnabled && isMonitoring()) {
      stopMonitoring();
    }
    rebuildTrayMenu();
  }

  if (Object.prototype.hasOwnProperty.call(settings, "retentionDays")) {
    pruneExpiredItems();
  }

  return next;
});

ipcMain.handle("monitoring-status", () => isMonitoring());

ipcMain.handle("toggle-monitoring", () => {
  const active = toggleMonitoring();
  updateSettings({ monitoringEnabled: active });
  rebuildTrayMenu();
  return active;
});

ipcMain.handle("open-picker", () => {
  showPicker();
  return true;
});

ipcMain.handle("hide-picker", () => {
  hidePicker();
  return true;
});

ipcMain.handle("force-capture", () => forceCapture());

ipcMain.handle("get-security-info", () => ({
  protectedTypes: getProtectedTypes(),
  localOnly: true
}));

ipcMain.handle("auth-get-session", () => auth.getSession());

ipcMain.handle("auth-login", async (_, payload) => auth.login(payload));

ipcMain.handle("auth-register", async (_, payload) => auth.register(payload));

ipcMain.handle("auth-logout", async () => auth.logout());

ipcMain.handle("auth-refresh", async () => auth.refreshMe());

ipcMain.handle("auth-health", async (_, apiUrl) => auth.checkHealth(apiUrl));

ipcMain.handle("auth-pull", async () => auth.pullClipboard());

ipcMain.handle("auth-push", async () => auth.pushClipboard());

ipcMain.handle("auth-config", () => ({
  mockApiUrl: auth.getMockApiUrl()
}));

ipcMain.handle("auth-update-profile", async (_, payload) =>
  auth.updateProfile(payload)
);

ipcMain.handle("auth-change-password", async (_, payload) =>
  auth.changePassword(payload)
);

ipcMain.handle("export-history", async () => {
  const items = getItems();
  const result = await dialog.showSaveDialog({
    title: "Export clipboard history",
    defaultPath: `bridgepaste-history-${new Date().toISOString().slice(0, 10)}.json`,
    filters: [
      { name: "JSON", extensions: ["json"] },
      { name: "Text", extensions: ["txt"] }
    ]
  });

  if (result.canceled || !result.filePath) {
    return { canceled: true };
  }

  const filePath = result.filePath;
  if (filePath.toLowerCase().endsWith(".txt")) {
    const text = items
      .map(
        (item, index) =>
          `#${index + 1} [${item.type}] ${item.createdAt || ""}\n${item.text}\n`
      )
      .join("\n");
    fs.writeFileSync(filePath, text, "utf8");
  } else {
    fs.writeFileSync(
      filePath,
      JSON.stringify({ exportedAt: new Date().toISOString(), items }, null, 2),
      "utf8"
    );
  }

  return { canceled: false, path: filePath, count: items.length };
});

ipcMain.handle("import-history", async () => {
  const result = await dialog.showOpenDialog({
    title: "Import clipboard history",
    properties: ["openFile"],
    filters: [
      { name: "JSON", extensions: ["json"] },
      { name: "All files", extensions: ["*"] }
    ]
  });

  if (result.canceled || !result.filePaths?.length) {
    return { canceled: true };
  }

  const raw = fs.readFileSync(result.filePaths[0], "utf8");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (_) {
    throw new Error("Invalid JSON file");
  }

  const incoming = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed.items)
      ? parsed.items
      : [];

  if (!incoming.length) {
    throw new Error("No clipboard items found in file");
  }

  const { setItems: writeItems } = require("./store");
  const existing = getItems();
  const map = new Map();

  for (const item of [...incoming, ...existing]) {
    if (!item || !item.text) continue;
    const key = item.id || item.text;
    if (!map.has(key)) {
      map.set(key, {
        id: item.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        text: String(item.text),
        preview: String(item.preview || item.text).slice(0, 180),
        type: item.type || "TEXT",
        createdAt: item.createdAt || new Date().toISOString(),
        favorite: Boolean(item.favorite),
        useCount: Number(item.useCount) || 0,
        charCount: item.charCount || String(item.text).length,
        lineCount: item.lineCount || String(item.text).split(/\r?\n/).length
      });
    }
  }

  const merged = Array.from(map.values()).sort(
    (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
  );
  const maxHistory = Number(getSettings().maxHistory) || 1000;
  writeItems(merged.slice(0, maxHistory));

  return { canceled: false, imported: incoming.length, total: merged.length };
});

ipcMain.handle("dedupe-history", () => {
  const { setItems: writeItems } = require("./store");
  const existing = getItems();
  const map = new Map();

  for (const item of existing) {
    const key = String(item.text || "");
    if (!key) continue;
    if (!map.has(key)) {
      map.set(key, item);
    } else {
      const prev = map.get(key);
      map.set(key, {
        ...prev,
        favorite: prev.favorite || item.favorite,
        useCount: (prev.useCount || 0) + (item.useCount || 0)
      });
    }
  }

  const next = Array.from(map.values());
  writeItems(next);
  return { before: existing.length, after: next.length };
});

/* ---------------- Startup ---------------- */

app.whenReady().then(async () => {
  if (!gotLock) return;

  const settings = getSettings();

  applyAutoStart(settings.autoStart);
  createMainWindow();
  createPicker();
  createTray();
  registerShortcuts();

  if (settings.monitoringEnabled !== false) {
    startMonitoring();
  }

  pruneExpiredItems();

  try {
    await auth.refreshMe();
  } catch (_) {}
});

app.on("before-quit", () => {
  app.isQuitting = true;
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  stopMonitoring();
});

app.on("window-all-closed", (event) => {
  event.preventDefault();
});

app.on("activate", () => {
  showMainWindow();
});
