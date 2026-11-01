/**
 * Arquivo: src/utils/entradaDoPrograma.ts
 * Objetivo: entrada suave de tudo quando o programa abre, logo depois da abertura animada.
 * Entradas esperadas: no aplicativo instalado, window.caixaUpDesktop avisa quando a janela do
 * caixa aparece. No navegador não faz nada.
 *
 * A janela do caixa carrega escondida enquanto a abertura de 7 s toca. Sem isto, as animações de
 * entrada das telas terminariam escondidas e tudo apareceria de uma vez. Então elas ficam paradas
 * no começo (classe app-aguardando no <html>) e, quando a janela aparece, tudo entra em cascata:
 * menu lateral, topo, conteúdo e cartões.
 */

const CLASSE_AGUARDANDO = "app-aguardando";
// Se o aviso da janela não chegar, libera mesmo assim para nada ficar parado.
const PRAZO_MAXIMO_MS = 25000;
const MAX_BLOCOS = 14;
const SUAVE = "cubic-bezier(0.2, 0.85, 0.25, 1)";

export function prepararEntradaDoPrograma() {
  const desktop = window.caixaUpDesktop;
  if (!desktop?.aberturaPendente || !desktop.onJanelaExibida) return;

  const html = document.documentElement;
  html.classList.add(CLASSE_AGUARDANDO);

  let liberado = false;
  const liberar = () => {
    if (liberado) return;
    liberado = true;
    html.classList.remove(CLASSE_AGUARDANDO);
    requestAnimationFrame(animarEntrada);
  };

  desktop.onJanelaExibida(liberar);
  window.setTimeout(liberar, PRAZO_MAXIMO_MS);
}

function visivelNaTela(el: Element) {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight;
}

// Desce pela tela até achar um nível com vários blocos lado a lado ou empilhados
// (cabeçalho, colunas, cartões) e devolve os que estão à vista.
function blocosDaTela(raiz: Element | null): HTMLElement[] {
  let atual = raiz;
  for (let nivel = 0; atual && nivel < 4; nivel++) {
    const filhos = Array.from(atual.children).filter(
      (el): el is HTMLElement => el instanceof HTMLElement && visivelNaTela(el),
    );
    if (filhos.length >= 2) return filhos.slice(0, MAX_BLOCOS);
    atual = filhos[0] ?? null;
  }
  return raiz instanceof HTMLElement ? [raiz] : [];
}

function animarEntrada() {
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  if (typeof Element.prototype.animate !== "function") return;

  const menu = document.querySelector<HTMLElement>("[data-app-sidebar]");
  if (menu && visivelNaTela(menu)) {
    menu.animate(
      [
        { opacity: 0, transform: "translateX(-28px)" },
        { opacity: 1, transform: "none" },
      ],
      { duration: 650, easing: SUAVE, fill: "backwards" },
    );
  }

  // Tela do login tem a entrada própria; aqui cuida do sistema já aberto.
  const conteudo =
    document.querySelector("main[data-active-page] .page-enter") ??
    document.querySelector("#root .page-enter");
  if (!conteudo) return;

  blocosDaTela(conteudo).forEach((bloco, i) => {
    bloco.animate(
      [
        { opacity: 0, transform: "translateY(18px) scale(0.985)" },
        { opacity: 1, transform: "none" },
      ],
      { duration: 620, delay: (menu ? 140 : 40) + i * 75, easing: SUAVE, fill: "backwards" },
    );
  });
}
