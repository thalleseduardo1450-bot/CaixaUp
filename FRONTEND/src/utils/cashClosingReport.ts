/**
 * Arquivo: src/utils/cashClosingReport.ts
 * Objetivo: imprimir o resumo do fechamento de caixa na impressora de cupom (80 mm).
 * Entradas esperadas: o caixa fechado, a conta do turno e o nome da loja.
 */
import type { CashClosingResult } from "@/services/api/cashRegisterService";
import { formatCentsBrl } from "@/utils/pdvMoney";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function dateTime(iso?: string | null) {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function line(label: string, value: string, bold = false) {
  return `<div class="line${bold ? " bold" : ""}"><span>${escapeHtml(label)}</span><span>${escapeHtml(value)}</span></div>`;
}

export function buildCashClosingHtml(result: CashClosingResult, companyName: string) {
  const { session, summary, countedCents, differenceCents } = result;
  const payments = summary.byPayment
    .filter((payment) => payment.cents !== 0 || payment.method === "dinheiro")
    .map((payment) => line(`${payment.label} (${payment.count})`, formatCentsBrl(payment.cents)))
    .join("");
  const movements = summary.movements
    .map((movement) =>
      line(
        `${movement.type === "sangria" ? "Sangria" : "Suprimento"}${movement.reason ? ` - ${movement.reason}` : ""}`,
        `${movement.type === "sangria" ? "-" : "+"} ${formatCentsBrl(movement.cents)}`,
      ),
    )
    .join("");
  const differenceLabel =
    differenceCents === 0 ? "Confere" : differenceCents > 0 ? "Sobra" : "Falta";

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <title>Fechamento de caixa</title>
    <style>
      @page { size: 80mm auto; margin: 4mm; }
      * { box-sizing: border-box; }
      body { margin: 0; color: #020617; font: 12px/1.3 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
      .receipt { width: 72mm; margin: 0 auto; }
      .center { text-align: center; }
      .brand { font-size: 14px; font-weight: 800; text-transform: uppercase; }
      .divider { border-top: 1px dashed #475569; margin: 8px 0; }
      .line { display: flex; justify-content: space-between; gap: 8px; }
      .line span:last-child { white-space: nowrap; text-align: right; }
      .bold { font-weight: 800; }
      .title { font-weight: 800; margin-bottom: 3px; }
      .sign { margin-top: 28px; border-top: 1px solid #020617; padding-top: 3px; text-align: center; }
    </style>
  </head>
  <body>
    <main class="receipt">
      <section class="center">
        <div class="brand">${escapeHtml(companyName || "CaixaUp")}</div>
        <div>FECHAMENTO DE CAIXA</div>
      </section>
      <div class="divider"></div>
      ${line("Aberto em", dateTime(session.openedAt))}
      ${line("Fechado em", dateTime(session.closedAt))}
      ${line("Operador", session.operatorName || "-")}
      ${session.closedByName ? line("Fechado por", session.closedByName) : ""}
      <div class="divider"></div>
      <div class="title">VENDAS</div>
      ${line("Vendas concluídas", String(summary.salesCount))}
      ${summary.canceledCount ? line("Canceladas", String(summary.canceledCount)) : ""}
      ${payments}
      ${line("TOTAL VENDIDO", formatCentsBrl(summary.soldCents), true)}
      <div class="divider"></div>
      <div class="title">GAVETA (DINHEIRO)</div>
      ${line("Fundo de troco", formatCentsBrl(summary.openingCents))}
      ${line("Vendas em dinheiro", `+ ${formatCentsBrl(summary.cashSalesCents)}`)}
      ${movements}
      ${line("ESPERADO", formatCentsBrl(summary.expectedCashCents), true)}
      ${line("CONTADO", formatCentsBrl(countedCents), true)}
      ${line(differenceLabel.toUpperCase(), formatCentsBrl(Math.abs(differenceCents)), true)}
      ${session.note ? `<div class="divider"></div><div>Obs.: ${escapeHtml(session.note)}</div>` : ""}
      <div class="sign">Assinatura do operador</div>
    </main>
  </body>
</html>`;
}

/** Imprime por um iframe escondido, igual ao cupom de venda. */
export function printCashClosingReport(result: CashClosingResult, companyName: string) {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  Object.assign(frame.style, {
    position: "fixed",
    width: "0",
    height: "0",
    right: "0",
    bottom: "0",
    border: "0",
  });
  document.body.appendChild(frame);

  const printWindow = frame.contentWindow;
  if (!printWindow) {
    frame.remove();
    return false;
  }

  const cleanup = () => frame.remove();
  printWindow.addEventListener("afterprint", cleanup, { once: true });
  printWindow.document.open();
  printWindow.document.write(buildCashClosingHtml(result, companyName));
  printWindow.document.close();
  window.setTimeout(() => {
    printWindow.focus();
    printWindow.print();
  }, 100);
  window.setTimeout(cleanup, 60_000);
  return true;
}
