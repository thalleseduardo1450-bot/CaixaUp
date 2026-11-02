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
  fecharJanela: () => ipcRenderer.send("desktop:janela", "fechar"),
  minimizarJanela: () => ipcRenderer.send("desktop:janela", "minimizar"),
  maximizarJanela: () => ipcRenderer.send("desktop:janela", "maximizar"),
  alternarTelaCheia: () => ipcRenderer.invoke("desktop:tela-cheia"),
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

// Sem a barra do Windows: texto sem seleção (só campos de digitar) e um X vermelho
// para sair. Na frente de caixa o X fica dentro do cabeçalho (html[data-janela-integrada]),
// então o X flutuante some ali e nada fica por cima dos botões.
window.addEventListener("DOMContentLoaded", () => {
  const css = document.createElement("style");
  css.textContent = `
    body, body * { -webkit-user-select: none; user-select: none; }
    input, textarea, [contenteditable="true"], [contenteditable="true"] * { -webkit-user-select: text; user-select: text; }
    #cx-sair { position: fixed; top: 6px; right: 6px; z-index: 2147483647; width: 40px; height: 40px; border: 0;
      border-radius: 10px; background: #dc2626; color: #fff; font: 700 20px "Segoe UI", sans-serif; cursor: pointer;
      box-shadow: 0 1px 4px rgba(0,0,0,.25); -webkit-app-region: no-drag; }
    #cx-sair:hover { background: #b91c1c; }
    html[data-janela-integrada] #cx-sair { display: none; }
    /* Fora da frente de caixa o X flutuante reserva uma faixa no topo, para não cobrir os cartões. */
    html:not([data-janela-integrada]) main[data-active-page] { padding-top: 52px !important; }`;
  document.head.appendChild(css);
  const sair = document.createElement("button");
  sair.id = "cx-sair"; sair.textContent = "✕"; sair.title = "Sair";
  sair.addEventListener("click", () => ipcRenderer.send("desktop:janela", "fechar"));
  document.body.appendChild(sair);
});
