// Ponte entre as telas (FRONTEND) e o lado Rust. Roda antes da página carregar, só na
// janela do caixa, e expõe window.caixaUpDesktop com a mesma forma da versão Electron:
// as telas não precisam saber que o programa agora é Tauri.
(() => {
  const invocar = (comando, args) => window.__TAURI_INTERNALS__.invoke(comando, args || {});

  // A janela do caixa só aparece quando a abertura animada termina. Depois de um
  // recarregamento da página (F5) a janela já está à vista: o sessionStorage lembra.
  let janelaExibida = false;
  try {
    janelaExibida = sessionStorage.getItem("cx-janela-exibida") === "1";
  } catch {}
  const aoExibirJanela = new Set();
  const ouvintesStatus = new Set();
  const ouvintesInstalada = new Set();

  // Chamados pelo Rust (window.eval).
  window.__cxJanelaExibida = () => {
    janelaExibida = true;
    try {
      sessionStorage.setItem("cx-janela-exibida", "1");
    } catch {}
    aoExibirJanela.forEach((callback) => callback());
    aoExibirJanela.clear();
  };
  window.__cxStatusAtualizacao = (status) => ouvintesStatus.forEach((cb) => cb(status));
  window.__cxAtualizacaoInstalada = (info) => ouvintesInstalada.forEach((cb) => cb(info));

  const assinar = (conjunto) => (callback) => {
    conjunto.add(callback);
    return () => conjunto.delete(callback);
  };

  window.caixaUpDesktop = {
    aberturaPendente: !janelaExibida,
    onJanelaExibida: (callback) => {
      if (janelaExibida) {
        callback();
        return () => {};
      }
      aoExibirJanela.add(callback);
      return () => aoExibirJanela.delete(callback);
    },
    fecharJanela: () => invocar("janela", { acao: "fechar" }),
    minimizarJanela: () => invocar("janela", { acao: "minimizar" }),
    maximizarJanela: () => invocar("janela", { acao: "maximizar" }),
    alternarTelaCheia: () => invocar("tela_cheia"),
    getPreferences: () => invocar("preferencias"),
    setPreference: (key, value) => invocar("definir_preferencia", { key, value }),
    getAppInfo: () => invocar("info_app"),
    getUpdateStatus: () => invocar("status_atualizacao"),
    checkForUpdates: () => invocar("procurar_atualizacao_cmd"),
    onUpdateStatus: assinar(ouvintesStatus),
    onUpdateInstalled: assinar(ouvintesInstalada),
  };

  // Sem a barra do Windows: texto sem seleção (só campos de digitar) e, fora da frente de
  // caixa, uma barra flutuante com arrastar, minimizar, maximizar, tela cheia e X. Na frente
  // de caixa os mesmos botões ficam dentro do cabeçalho (html[data-janela-integrada]).
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
      ["", "—", "Minimizar", () => invocar("janela", { acao: "minimizar" })],
      ["", "☐", "Maximizar ou restaurar", () => invocar("janela", { acao: "maximizar" })],
      ["", "⛶", "Tela cheia", () => invocar("tela_cheia")],
      ["cx-sair", "✕", "Fechar o CaixaUp", () => invocar("janela", { acao: "fechar" })],
    ];
    for (const [classe, texto, dica, acao] of itens) {
      const el = document.createElement(acao ? "button" : "div");
      el.className = classe;
      el.textContent = texto;
      el.title = dica;
      if (acao) el.addEventListener("click", acao);
      barra.appendChild(el);
    }
    document.body.appendChild(barra);
  });

  // Arrastar a janela (cabeçalho do PDV e alça da barra). O Windows cuida do movimento;
  // em tela cheia o Rust sai dela antes.
  window.addEventListener(
    "mousedown",
    (e) => {
      if (e.button !== 0) return;
      const alvo = e.target;
      if (!(alvo instanceof Element)) return;
      if (!alvo.closest(".pdv-topbar-drag, .cx-arrastar")) return;
      if (alvo.closest("button, input, a, select, textarea")) return;
      e.preventDefault();
      invocar("arrastar");
    },
    true,
  );

  // Links para fora (ex.: site, WhatsApp) abrem no navegador do Windows.
  window.addEventListener(
    "click",
    (e) => {
      const alvo = e.target instanceof Element ? e.target.closest("a[href]") : null;
      if (!alvo) return;
      const href = alvo.href || "";
      if (!/^(https?:|mailto:|tel:)/i.test(href)) return;
      if (href.startsWith(location.origin)) return;
      e.preventDefault();
      invocar("abrir_link", { url: href });
    },
    true,
  );
})();
