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

// Sem a barra do Windows: botões próprios no canto (minimizar, tela cheia, sair),
// uma alça para arrastar a janela e texto sem seleção (só campos de digitar).
window.addEventListener("DOMContentLoaded", () => {
  const css = document.createElement("style");
  css.textContent = `
    body, body * { -webkit-user-select: none; user-select: none; }
    input, textarea, [contenteditable="true"], [contenteditable="true"] * { -webkit-user-select: text; user-select: text; }
    #cx-janela { position: fixed; top: 6px; right: 6px; z-index: 2147483647; display: flex; gap: 6px; }
    #cx-janela button, #cx-janela .cx-arrastar { width: 44px; height: 36px; border: 0; border-radius: 10px;
      font: 700 20px "Segoe UI", sans-serif; color: #1e3a5f; background: #fff; cursor: pointer;
      box-shadow: 0 1px 4px rgba(0,0,0,.25); display: flex; align-items: center; justify-content: center; -webkit-app-region: no-drag; }
    #cx-janela .cx-arrastar { -webkit-app-region: drag; cursor: move; color: #94a3b8; }
    #cx-janela button:hover { background: #e2e8f0; }
    #cx-janela .cx-sair { background: #dc2626; color: #fff; font-size: 22px; }
    #cx-janela .cx-sair:hover { background: #b91c1c; }`;
  document.head.appendChild(css);
  const barra = document.createElement("div");
  barra.id = "cx-janela";
  const itens = [
    ["cx-arrastar", "⠿", "Segure e arraste para mover a janela", null],
    ["", "—", "Minimizar", "minimizar"],
    ["", "⛶", "Tela cheia", "tela-cheia"],
    ["cx-sair", "✕", "Sair", "fechar"],
  ];
  for (const [classe, texto, dica, acao] of itens) {
    const el = document.createElement(acao ? "button" : "div");
    el.className = classe; el.textContent = texto; el.title = dica;
    if (acao) el.addEventListener("click", () => ipcRenderer.send("desktop:janela", acao));
    barra.appendChild(el);
  }
  document.body.appendChild(barra);
});
