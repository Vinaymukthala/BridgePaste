const { clipboard, BrowserWindow } = require("electron");

const {
  getItems,
  setItems,
  addItem,
  bumpItem,
  getSettings,
  pruneExpiredItems
} = require("./store");

const { isSensitive, detectSensitiveContent } = require("./security");

let monitoring = false;
let timer = null;
let pruneTimer = null;
let lastClipboard = "";
let onChange = null;

const POLL_INTERVAL = 400;

function setChangeHandler(handler) {
  onChange = handler;
}

function emitChange(payload) {
  if (typeof onChange === "function") {
    onChange(payload);
  }

  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send("clipboard-changed", payload);
    }
  }
}

function detectType(text) {
  const value = text.trim();

  if (!value) {
    return "TEXT";
  }

  if (/^https?:\/\/\S+$/i.test(value) || /^www\.\S+\.\S+/i.test(value)) {
    return "URL";
  }

  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    return "EMAIL";
  }

  if (
    /^(\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}$/.test(
      value
    ) &&
    value.replace(/\D/g, "").length >= 7
  ) {
    return "PHONE";
  }

  if (/^curl\s+/i.test(value)) {
    return "cURL";
  }

  if (/^<\?xml[\s\S]*>/i.test(value) || /^<[a-zA-Z][\s\S]*>$/.test(value)) {
    return "XML";
  }

  if (
    /^(SELECT|INSERT|UPDATE|DELETE|WITH|CREATE|ALTER|DROP)\b/i.test(value)
  ) {
    return "SQL";
  }

  try {
    const parsed = JSON.parse(value);
    if (parsed !== null && typeof parsed === "object") {
      return "JSON";
    }
  } catch (_) {}

  if (
    /\b(function|const|let|var|class|import|export|def|async|await|return)\b/.test(
      value
    ) ||
    /=>/.test(value) ||
    /{\s*[\w"']+\s*:/.test(value)
  ) {
    return "CODE";
  }

  if (value.includes("\n") && value.length > 120) {
    return "NOTE";
  }

  return "TEXT";
}

function createClipboardItem(text) {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    text,
    preview: text.replace(/\s+/g, " ").trim().slice(0, 180),
    type: detectType(text),
    createdAt: new Date().toISOString(),
    favorite: false,
    useCount: 0,
    charCount: text.length,
    lineCount: text.split(/\r?\n/).length
  };
}

function captureClipboard(force = false) {
  if (!monitoring && !force) {
    return null;
  }

  let text;

  try {
    text = clipboard.readText();
  } catch (error) {
    console.error(error);
    return null;
  }

  if (!text || !text.trim()) {
    return null;
  }

  if (!force && text === lastClipboard) {
    return null;
  }

  lastClipboard = text;

  const settings = getSettings();

  if (settings.sensitiveProtection !== false && isSensitive(text)) {
    const detection = detectSensitiveContent(text);
    const payload = {
      blocked: true,
      matches: detection.matches
    };
    emitChange(payload);
    return payload;
  }

  const existing = getItems().find((item) => item.text === text);

  if (existing) {
    const bumped = bumpItem(existing.id);
    emitChange({ item: bumped, duplicate: true });
    return bumped;
  }

  const item = createClipboardItem(text);
  addItem(item);
  emitChange({ item });
  return item;
}

function startMonitoring() {
  if (monitoring) {
    return monitoring;
  }

  monitoring = true;

  try {
    lastClipboard = clipboard.readText() || "";
  } catch (_) {
    lastClipboard = "";
  }

  pruneExpiredItems();

  timer = setInterval(() => captureClipboard(false), POLL_INTERVAL);

  if (!pruneTimer) {
    pruneTimer = setInterval(pruneExpiredItems, 60 * 60 * 1000);
  }

  console.log("BridgePaste clipboard monitoring started");
  return monitoring;
}

function stopMonitoring() {
  monitoring = false;

  if (timer) {
    clearInterval(timer);
    timer = null;
  }

  console.log("BridgePaste clipboard monitoring stopped");
  return monitoring;
}

function isMonitoring() {
  return monitoring;
}

function toggleMonitoring() {
  if (monitoring) {
    stopMonitoring();
  } else {
    startMonitoring();
  }

  emitChange({ monitoring });
  return monitoring;
}

function copyItem(id) {
  const item = getItems().find((x) => x.id === id);

  if (!item) {
    return false;
  }

  clipboard.writeText(item.text);
  lastClipboard = item.text;

  const bumped = bumpItem(id);
  emitChange({ item: bumped, copied: true });
  return true;
}

function copyText(text) {
  clipboard.writeText(text);
  lastClipboard = text;
  return true;
}

function toggleFavorite(id) {
  const items = getItems();
  const item = items.find((x) => x.id === id);

  if (!item) {
    return false;
  }

  item.favorite = !item.favorite;
  setItems(items);
  emitChange({ item, favorited: item.favorite });
  return item.favorite;
}

function deleteItem(id) {
  setItems(getItems().filter((x) => x.id !== id));
  emitChange({ deleted: id });
  return true;
}

function clearHistory() {
  setItems([]);
  emitChange({ cleared: true });
  return true;
}

function forceCapture() {
  return captureClipboard(true);
}

module.exports = {
  startMonitoring,
  stopMonitoring,
  isMonitoring,
  toggleMonitoring,
  captureClipboard,
  forceCapture,
  copyItem,
  copyText,
  toggleFavorite,
  deleteItem,
  clearHistory,
  detectType,
  setChangeHandler
};
