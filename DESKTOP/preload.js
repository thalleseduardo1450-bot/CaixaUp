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

// Sem a barra do Windows: texto sem seleção (só campos de digitar) e, fora da frente de
// caixa, uma barra flutuante com arrastar, minimizar, maximizar, tela cheia e X. Na frente
// de caixa os mesmos botões ficam dentro do cabeçalho (html[data-janela-integrada]).
// Arrastar é feito à mão (IPC) para funcionar também em tela cheia e maximizada.
window.addEventListener("DOMContentLoaded", () => {
  const css = document.createElement("style");
  css.textContent = `
    body, body * { -webkit-user-select: none; user-select: none; }
    input, textarea, [contenteditable="true"], [contenteditable="true"] * { -webkit-user-select: text; user-select: text; }
    #cx-janela { position: fixed; top: 6px; right: 6px; z-index: 2147483647; display: flex; gap: 6px; }
    #cx-janela button, #cx-janela .cx-arrastar { width: 40px; height: 40px; border: 0; border-radius: 10px;
      font: 700 18px "Segoe UI", sans-serif; color: #1e3a5f; background: #fff; cursor: pointer;
      box-shadow: 0 1px 4px rgba(0,0,0,.25); display: flex; align-items: center; justify-content: center; }
    #cx-janela .cx-arrastar { cursor: move; color: #94a3b8; }
    #cx-janela button:hover { background: #e2e8f0; }
    #cx-janela .cx-sair { background: #dc2626; color: #fff; font-size: 20px; }
    #cx-janela .cx-sair:hover { background: #b91c1c; }
    html[data-janela-integrada] #cx-janela { display: none; }
    /* Fora da frente de caixa a barra reserva uma faixa no topo, para não cobrir os cartões. */
    html:not([data-janela-integrada]) main[data-active-page] { padding-top: 52px !important; }`;
  document.head.appendChild(css);
  const barra = document.createElement("div");
  barra.id = "cx-janela";
  const itens = [
    ["cx-arrastar", "⠿", "Segure e arraste para mover a janela", null],
    ["", "—", "Minimizar", () => ipcRenderer.send("desktop:janela", "minimizar")],
    ["", "☐", "Maximizar ou restaurar", () => ipcRenderer.send("desktop:janela", "maximizar")],
    ["", "⛶", "Tela cheia", () => ipcRenderer.invoke("desktop:tela-cheia")],
    ["cx-sair", "✕", "Fechar o CaixaUp", () => ipcRenderer.send("desktop:janela", "fechar")],
  ];
  for (const [classe, texto, dica, acao] of itens) {
    const el = document.createElement(acao ? "button" : "div");
    el.className = classe; el.textContent = texto; el.title = dica;
    if (acao) el.addEventListener("click", acao);
    barra.appendChild(el);
  }
  document.body.appendChild(barra);
});

// Arrastar a janela (cabeçalho do PDV e alça da barra), inclusive em tela cheia.
window.addEventListener("mousedown", (e) => {
  if (e.button !== 0) return;
  const alvo = e.target;
  if (!(alvo instanceof Element)) return;
  if (!alvo.closest(".pdv-topbar-drag, .cx-arrastar")) return;
  if (alvo.closest("button, input, a, select, textarea")) return;
  ipcRenderer.send("desktop:arrastar", { fase: "inicio", x: e.screenX, y: e.screenY });
  const mover = (ev) => ipcRenderer.send("desktop:arrastar", { fase: "mover", x: ev.screenX, y: ev.screenY });
  const soltar = () => {
    window.removeEventListener("mousemove", mover, true);
    window.removeEventListener("mouseup", soltar, true);
    ipcRenderer.send("desktop:arrastar", { fase: "fim" });
  };
  window.addEventListener("mousemove", mover, true);
  window.addEventListener("mouseup", soltar, true);
}, true);
