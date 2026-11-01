const { contextBridge, ipcRenderer } = require("electron");

// A janela do caixa só aparece quando a abertura animada termina. A tela usa
// isso para tocar a entrada suave na hora em que a janela aparece.
let janelaExibida = false;
try {
  janelaExibida = ipcRenderer.sendSync("desktop:janela-ja-exibida") === true;
} catch {
  janelaExibida = true;
}
const aoExibirJanela = new Set();
ipcRenderer.on("desktop:janela-exibida", () => {
  janelaExibida = true;
  aoExibirJanela.forEach((callback) => callback());
  aoExibirJanela.clear();
});

contextBridge.exposeInMainWorld("caixaUpDesktop", {
  aberturaPendente: !janelaExibida,
  onJanelaExibida: (callback) => {
    if (janelaExibida) {
      callback();
      return () => {};
    }
    aoExibirJanela.add(callback);
    return () => aoExibirJanela.delete(callback);
  },
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
