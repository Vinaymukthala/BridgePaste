const Store = require("electron-store");
const { MOCKAPI_URL } = require("./config");

const store = new Store({
  name: "bridgepaste",
  defaults: {
    items: [],
    settings: {
      maxHistory: 1000,
      monitoringEnabled: true,
      sensitiveProtection: true,
      autoStart: false,
      retentionDays: 7,
      launchMinimized: false,
      apiUrl: MOCKAPI_URL,
      cloudSync: false,
      useMockApi: true
    },
    session: {
      token: null,
      user: null,
      apiUrl: MOCKAPI_URL,
      mode: "mock"
    }
  }
});

function getItems() {
  return store.get("items", []);
}

function setItems(items) {
  store.set("items", items);
}

function addItem(item) {
  const items = getItems();
  items.unshift(item);

  const maxHistory = Number(getSettings().maxHistory) || 1000;
  setItems(items.slice(0, maxHistory));
}

function bumpItem(id) {
  const items = getItems();
  const index = items.findIndex((item) => item.id === id);
  if (index === -1) return null;

  const [item] = items.splice(index, 1);
  item.createdAt = new Date().toISOString();
  item.useCount = (item.useCount || 0) + 1;
  items.unshift(item);
  setItems(items);
  return item;
}

function pruneExpiredItems() {
  const settings = getSettings();
  const days = Number(settings.retentionDays);

  if (!days || days <= 0) {
    return getItems();
  }

  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const kept = getItems().filter((item) => {
    if (item.favorite) return true;
    const created = new Date(item.createdAt).getTime();
    return Number.isFinite(created) ? created >= cutoff : true;
  });

  setItems(kept);
  return kept;
}

function getSettings() {
  return {
    maxHistory: 1000,
    monitoringEnabled: true,
    sensitiveProtection: true,
    autoStart: false,
    retentionDays: 7,
    launchMinimized: false,
    apiUrl: require("./config").MOCKAPI_URL,
    cloudSync: false,
    useMockApi: true,
    ...store.get("settings", {})
  };
}

function setSettings(settings) {
  store.set("settings", {
    ...getSettings(),
    ...settings
  });
}

function updateSettings(settings) {
  setSettings(settings);
  return getSettings();
}

function getSetting(key) {
  return getSettings()[key];
}

function setSetting(key, value) {
  setSettings({ [key]: value });
}

function clearHistory() {
  setItems([]);
}

function deleteItem(id) {
  setItems(getItems().filter((item) => item.id !== id));
}

function updateItem(id, updates) {
  setItems(
    getItems().map((item) =>
      item.id === id ? { ...item, ...updates } : item
    )
  );
}

module.exports = {
  store,
  getItems,
  setItems,
  addItem,
  bumpItem,
  pruneExpiredItems,
  getSettings,
  setSettings,
  updateSettings,
  getSetting,
  setSetting,
  clearHistory,
  deleteItem,
  updateItem
};
