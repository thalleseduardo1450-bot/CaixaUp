const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("caixaUpDesktop", {
  minimizeWindow: () => ipcRenderer.invoke("desktop:window:minimize"),
  toggleMaximizeWindow: () => ipcRenderer.invoke("desktop:window:toggle-maximize"),
  closeWindow: () => ipcRenderer.invoke("desktop:window:close"),
  getPreferences: () => ipcRenderer.invoke("desktop:preferences:get"),
  setPreference: (key, value) =>
    ipcRenderer.invoke("desktop:preferences:set", { key, value }),
  getAppInfo: () => ipcRenderer.invoke("desktop:app-info"),
  getUpdateStatus: () => ipcRenderer.invoke("desktop:update-status"),
  checkForUpdates: () => ipcRenderer.invoke("desktop:update-check"),
  onUpdateStatus: (callback) => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on("desktop:update-status", listener);
    return () => ipcRenderer.removeListener("desktop:update-status", listener);
  },
  onUpdateInstalled: (callback) => {
    const listener = (_event, update) => callback(update);
    ipcRenderer.on("desktop:update-installed", listener);
    return () => ipcRenderer.removeListener("desktop:update-installed", listener);
  },
});
