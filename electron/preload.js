const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("bridgePaste", {
  getItems: () => ipcRenderer.invoke("get-items"),

  copyItem: (id) => ipcRenderer.invoke("copy-item", id),

  copyText: (text) => ipcRenderer.invoke("copy-text", text),

  deleteItem: (id) => ipcRenderer.invoke("delete-item", id),

  favoriteItem: (id) => ipcRenderer.invoke("favorite-item", id),

  clearHistory: () => ipcRenderer.invoke("clear-history"),

  getSettings: () => ipcRenderer.invoke("get-settings"),

  updateSettings: (settings) =>
    ipcRenderer.invoke("update-settings", settings),

  getMonitoringStatus: () => ipcRenderer.invoke("monitoring-status"),

  toggleMonitoring: () => ipcRenderer.invoke("toggle-monitoring"),

  openPicker: () => ipcRenderer.invoke("open-picker"),

  hidePicker: () => ipcRenderer.invoke("hide-picker"),

  forceCapture: () => ipcRenderer.invoke("force-capture"),

  getSecurityInfo: () => ipcRenderer.invoke("get-security-info"),

  getSession: () => ipcRenderer.invoke("auth-get-session"),
  login: (payload) => ipcRenderer.invoke("auth-login", payload),
  register: (payload) => ipcRenderer.invoke("auth-register", payload),
  logout: () => ipcRenderer.invoke("auth-logout"),
  refreshSession: () => ipcRenderer.invoke("auth-refresh"),
  checkApiHealth: (apiUrl) => ipcRenderer.invoke("auth-health", apiUrl),
  pullCloud: () => ipcRenderer.invoke("auth-pull"),
  pushCloud: () => ipcRenderer.invoke("auth-push"),
  getAuthConfig: () => ipcRenderer.invoke("auth-config"),
  updateProfile: (payload) => ipcRenderer.invoke("auth-update-profile", payload),
  changePassword: (payload) =>
    ipcRenderer.invoke("auth-change-password", payload),
  exportHistory: () => ipcRenderer.invoke("export-history"),
  importHistory: () => ipcRenderer.invoke("import-history"),
  dedupeHistory: () => ipcRenderer.invoke("dedupe-history"),

  onClipboardChanged: (callback) => {
    const listener = (_, payload) => callback(payload);
    ipcRenderer.on("clipboard-changed", listener);
    return () => ipcRenderer.removeListener("clipboard-changed", listener);
  },

  onRefresh: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("refresh-items", listener);
    return () => ipcRenderer.removeListener("refresh-items", listener);
  }
});
