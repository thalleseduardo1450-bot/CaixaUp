/**
 * Arquivo: src/components/Admin/ReceiptPreviewModal.tsx
 * Objetivo: exibir e imprimir uma prévia de cupom não fiscal reutilizável no PDV.
  * Entradas esperadas: recebe dados da venda, itens, empresa e callbacks para fechar/imprimir o recibo.
*/
import { Printer, ReceiptText, X } from "lucide-react";

import { useModalExit } from "@/hooks/useModalExit";

export type PaymentType = "dinheiro" | "pix" | "debito" | "credito" | string;

export type ReceiptCompany = {
  fantasyName?: string;
  corporateName?: string;
  cnpj?: string;
  address?: string;
  number?: string;
  neighborhood?: string;
  city?: string;
  uf?: string;
  phone?: string;
  sacPhone?: string;
} | null;

export type SaleReceiptItem = {
  id: string;
  code: string;
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
};

export type SaleReceipt = {
  saleNumber: string;
  issuedAt: string;
  printedAt?: string;
  company: ReceiptCompany;
  customerCpf: string;
  paymentType: PaymentType;
  paymentLabel: string;
  paymentLines?: Array<{ label: string; amount: number }>;
  operatorName: string;
  /** Soma dos itens, sem desconto. */
  subtotal: number;
  /**
   * Desconto e total são opcionais porque cupons salvos antes do desconto
   * existir não têm esses campos. Sem eles, total = subtotal e nenhuma linha de
   * desconto é impressa — é exatamente o que aquelas vendas foram.
   */
  discount?: number;
  total?: number;
  cashGiven: number;
  change: number;
  items: SaleReceiptItem[];
};

/** Total efetivamente cobrado: respeita o desconto quando o cupom tem um. */
export function receiptTotal(receipt: SaleReceipt) {
  if (typeof receipt.total === "number") return receipt.total;
  return Math.max(0, receipt.subtotal - (receipt.discount ?? 0));
}

function receiptPayments(receipt: SaleReceipt) {
  if (receipt.paymentLines?.length) return receipt.paymentLines;
  return [{ label: receipt.paymentLabel || "Não informado", amount: receiptTotal(receipt) }];
}

function formatReceiptDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/**
 * Passo de fonte conforme o tamanho do valor impresso: em bobina de 80mm,
 * valores muito longos descem meio ponto em vez de disputar espaço com o rótulo.
 */
function moneySizeClass(formatted: string) {
  const len = formatted.length + 3; // conta o prefixo "R$ "
  if (len >= 17) return "money-xs";
  if (len >= 14) return "money-sm";
  return "";
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function buildReceiptPrintHtml(receipt: SaleReceipt, formatMoney: (value: number) => string) {
  const companyName =
    receipt.company?.fantasyName || receipt.company?.corporateName || "CaixaUp";
  const companyAddress = [
    receipt.company?.address,
    receipt.company?.number,
    receipt.company?.neighborhood,
  ]
    .filter(Boolean)
    .join(", ");
  const companyCity = [receipt.company?.city, receipt.company?.uf].filter(Boolean).join(" - ");
  const discount = receipt.discount ?? 0;
  const totalFormatted = formatMoney(receiptTotal(receipt));
  const totalSizeCls = moneySizeClass(totalFormatted);
  const payments = receiptPayments(receipt);
  const paymentsTotal = payments.reduce((sum, payment) => sum + payment.amount, 0);
  const rows = receipt.items
    .map(
      (item, index) => `
        <div class="item">
          <div class="item-name"><span>${String(index + 1).padStart(2, "0")}</span> ${escapeHtml(item.name)}</div>
          <div class="item-code">COD: ${escapeHtml(item.code)}</div>
          <div class="line item-values">
            <span>${item.quantity} x R$ ${formatMoney(item.unitPrice)}</span>
            <strong>R$ ${formatMoney(item.total)}</strong>
          </div>
        </div>
      `,
    )
    .join("");
  const paymentRows = payments
    .map(
      (payment) => `
        <div class="line payment-line">
          <span>${escapeHtml(payment.label)}</span>
          <strong>R$ ${formatMoney(payment.amount)}</strong>
        </div>
      `,
    )
    .join("");

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <title>Cupom ${escapeHtml(receipt.saleNumber)}</title>
    <style>
      @page { size: 58mm auto; margin: 3mm 5mm; }
      * { box-sizing: border-box; }
      body { margin: 0; color: #000; font: 13px/1.3 Arial, Helvetica, sans-serif; }
      .receipt { width: 48mm; margin: 0 auto; overflow: visible; }
      .center { text-align: center; }
      .brand { font-size: 17px; font-weight: 900; text-transform: uppercase; overflow-wrap: anywhere; }
      .divider { border-top: 1px dashed #000; margin: 9px 0; }
      .line { display: flex; justify-content: space-between; align-items: baseline; gap: 5px; }
      .line > span { white-space: nowrap; }
      .line > span:first-child { flex-shrink: 1; min-width: 0; overflow-wrap: break-word; }
      .right { text-align: right; white-space: nowrap; }
      .bold { font-weight: 900; }
      .item { margin-top: 9px; padding-bottom: 2px; }
      .item-name { font-size: 13px; font-weight: 800; overflow-wrap: anywhere; }
      .item-code { margin: 2px 0; font-size: 11px; overflow-wrap: anywhere; }
      .item-values { font-size: 13px; }
      .totals { font-size: 13px; }
      .totals .line { line-height: 1.5; }
      .money-sm { font-size: 16px; }
      .money-xs { font-size: 14px; }
      .total-line { margin: 3px 0; border-top: 2px solid #000; border-bottom: 2px solid #000; padding: 5px 0; font-size: 19px; letter-spacing: 0.01em; }
      .total-line.money-sm { font-size: 16px; }
      .total-line.money-xs { font-size: 14px; }
      .payment-title { margin-top: 7px; font-size: 12px; font-weight: 900; text-align: center; }
      .payment-line { font-size: 13px; }
      @media print {
        html, body { width: 58mm; margin: 0 !important; padding: 0 !important;
          background: #fff !important; -webkit-print-color-adjust: exact; }
        .receipt { width: 48mm; max-width: 48mm; }
      }
    </style>
  </head>
  <body>
    <main class="receipt">
      <section class="center">
        <div class="brand">${escapeHtml(companyName)}</div>
        <div>${escapeHtml(receipt.company?.corporateName || companyName)}</div>
        <div>CNPJ: ${escapeHtml(receipt.company?.cnpj || "-")}</div>
        ${companyAddress ? `<div>${escapeHtml(companyAddress)}</div>` : ""}
        ${companyCity ? `<div>${escapeHtml(companyCity)}</div>` : ""}
        <div>Telefone: ${escapeHtml(receipt.company?.phone || receipt.company?.sacPhone || "-")}</div>
      </section>
      <div class="divider"></div>
      <section>
        <div>CUPOM NAO FISCAL</div>
        <div>Venda: ${escapeHtml(receipt.saleNumber)}</div>
        <div>Emissao: ${escapeHtml(formatReceiptDate(receipt.issuedAt))}</div>
        <div>Operador: ${escapeHtml(receipt.operatorName || "-")}</div>
        <div>CPF/CNPJ consumidor: ${escapeHtml(receipt.customerCpf || "-")}</div>
      </section>
      <div class="divider"></div>
      <section>
        <div class="bold center">ITENS DA VENDA</div>
        ${rows}
      </section>
      <div class="divider"></div>
      <section class="totals">
        <div class="line"><span>Soma dos itens</span><strong>R$ ${formatMoney(receipt.subtotal)}</strong></div>
        ${discount > 0 ? `<div class="line"><span>Desconto</span><strong>- R$ ${formatMoney(discount)}</strong></div>` : ""}
        <div class="line bold total-line ${totalSizeCls}"><span>TOTAL</span><span>R$ ${totalFormatted}</span></div>
        <div class="payment-title">FORMA DE PAGAMENTO</div>
        ${paymentRows}
        ${payments.length > 1 ? `<div class="line bold"><span>Total pago</span><span>R$ ${formatMoney(paymentsTotal)}</span></div>` : ""}
        ${
          receipt.cashGiven > 0
            ? `<div class="line"><span>Valor recebido</span><span>R$ ${formatMoney(receipt.cashGiven)}</span></div>
               <div class="line"><span>Troco</span><span>R$ ${formatMoney(receipt.change)}</span></div>`
            : ""
        }
      </section>
      <div class="divider"></div>
      <p class="center">Obrigado pela preferencia.</p>
    </main>
  </body>
</html>`;
}

export function printSaleReceipt(
  receipt: SaleReceipt,
  formatMoney: (value: number) => string,
) {
  const printFrame = document.createElement("iframe");
  printFrame.setAttribute("aria-hidden", "true");
  printFrame.style.position = "fixed";
  printFrame.style.width = "0";
  printFrame.style.height = "0";
  printFrame.style.right = "0";
  printFrame.style.bottom = "0";
  printFrame.style.border = "0";
  document.body.appendChild(printFrame);

  const printWindow = printFrame.contentWindow;
  if (!printWindow) {
    printFrame.remove();
    return false;
  }

  const cleanup = () => printFrame.remove();
  printWindow.addEventListener("afterprint", cleanup, { once: true });
  printWindow.document.open();
  printWindow.document.write(buildReceiptPrintHtml(receipt, formatMoney));
  printWindow.document.close();
  window.setTimeout(() => {
    printWindow.focus();
    printWindow.print();
  }, 100);
  window.setTimeout(cleanup, 60_000);
  return true;
}

export default function ReceiptPreviewModal({
  receipt,
  formatMoney,
  onClose,
  mode = "print",
}: {
  receipt: SaleReceipt;
  formatMoney: (value: number) => string;
  onClose: () => void;
  mode?: "print" | "view";
}) {
  const companyName =
    receipt.company?.fantasyName || receipt.company?.corporateName || "CaixaUp";
  const companyAddress = [
    receipt.company?.address,
    receipt.company?.number,
    receipt.company?.neighborhood,
  ]
    .filter(Boolean)
    .join(", ");
  const companyCity = [receipt.company?.city, receipt.company?.uf].filter(Boolean).join(" - ");
  const payments = receiptPayments(receipt);
  const paymentsTotal = payments.reduce((sum, payment) => sum + payment.amount, 0);

  const { closing, requestClose } = useModalExit(onClose);
  const printReceipt = () => printSaleReceipt(receipt, formatMoney);

  return (
    <div
      className={`fixed inset-0 z-layer-dialog flex items-end bg-black/55 px-3 backdrop-blur-sm md:items-center md:justify-center ${
        closing ? "modal-overlay-out" : "modal-overlay-in"
      }`}
    >
      <div
        className={`w-full max-w-4xl overflow-hidden rounded-t-2xl border border-border-primary bg-bg-light shadow-2xl md:rounded-2xl ${
          closing ? "modal-panel-out" : "modal-panel-in"
        }`}
      >
        <div className="flex items-center justify-between border-b border-border-primary px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-accent/10 text-accent">
              <ReceiptText size={18} />
            </span>
            <div>
              <h2 className="text-base font-semibold text-text-primary">
                {mode === "view" ? "Detalhes da venda" : "Previa de impressao"}
              </h2>
              <p className="text-xs text-text-secondary">
                {mode === "view"
                  ? `Venda ${receipt.saleNumber} · venda finalizada`
                  : `Cupom da venda ${receipt.saleNumber}`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={requestClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border-primary text-text-secondary hover:bg-hover-light"
            aria-label="Fechar prévia de impressão"
          >
            <X size={16} />
          </button>
        </div>

        <div className="grid max-h-[74vh] overflow-y-auto bg-bg-primary md:grid-cols-[minmax(0,1fr)_320px]">
          <div className="p-4">
            <div className="mx-auto w-full max-w-[360px] border border-border-secondary bg-white px-5 py-4 font-mono text-[12px] leading-tight text-slate-950 shadow-sm">
              <div className="text-center">
                <p className="text-sm font-bold uppercase">{companyName}</p>
                <p>{receipt.company?.corporateName || companyName}</p>
                <p>CNPJ: {receipt.company?.cnpj || "-"}</p>
                {companyAddress ? <p>{companyAddress}</p> : null}
                {companyCity ? <p>{companyCity}</p> : null}
                <p>Telefone: {receipt.company?.phone || receipt.company?.sacPhone || "-"}</p>
              </div>

              <div className="my-3 border-t border-dashed border-slate-500" />

              <div className="space-y-1">
                <p>CUPOM NAO FISCAL</p>
                <p>Venda: {receipt.saleNumber}</p>
                <p>Emissao: {formatReceiptDate(receipt.issuedAt)}</p>
                <p>Operador: {receipt.operatorName}</p>
                <p>CPF/CNPJ consumidor: {receipt.customerCpf || "-"}</p>
              </div>

              <div className="my-3 border-t border-dashed border-slate-500" />

              <p className="text-center text-sm font-black">ITENS DA VENDA</p>
              <div className="mt-1 space-y-2">
                {receipt.items.map((item, index) => (
                  <div key={`${item.id}-${index}`}>
                    <p className="font-bold break-words">
                      {String(index + 1).padStart(2, "0")} {item.name}
                    </p>
                    <p className="text-[11px] break-all">COD: {item.code}</p>
                    <div className="flex justify-between gap-2">
                      <span>{item.quantity} x R$ {formatMoney(item.unitPrice)}</span>
                      <strong className="whitespace-nowrap">R$ {formatMoney(item.total)}</strong>
                    </div>
                  </div>
                ))}
              </div>

              <div className="my-3 border-t border-dashed border-slate-500" />

              <div className="space-y-1">
                <div className="flex justify-between">
                  <span>Soma dos itens</span>
                  <strong className="whitespace-nowrap font-mono">R$ {formatMoney(receipt.subtotal)}</strong>
                </div>
                {(receipt.discount ?? 0) > 0 ? (
                    <div className="flex justify-between">
                      <span>Desconto</span>
                      <span className="whitespace-nowrap font-mono">- R$ {formatMoney(receipt.discount ?? 0)}</span>
                    </div>
                ) : null}
                <div className="my-2 flex justify-between border-y-2 border-slate-950 py-2 text-lg font-black">
                  <span>TOTAL</span>
                  <span className="whitespace-nowrap font-mono">R$ {formatMoney(receiptTotal(receipt))}</span>
                </div>
                <p className="pt-1 text-center font-black">FORMA DE PAGAMENTO</p>
                {payments.map((payment, index) => (
                  <div key={`${payment.label}-${index}`} className="flex justify-between gap-2">
                    <span>{payment.label}</span>
                    <strong className="whitespace-nowrap">R$ {formatMoney(payment.amount)}</strong>
                  </div>
                ))}
                {payments.length > 1 ? (
                  <div className="flex justify-between font-black">
                    <span>Total pago</span>
                    <span className="whitespace-nowrap">R$ {formatMoney(paymentsTotal)}</span>
                  </div>
                ) : null}
                {receipt.cashGiven > 0 ? (
                  <>
                    <div className="flex justify-between">
                      <span>Valor recebido</span>
                      <span className="whitespace-nowrap font-mono">R$ {formatMoney(receipt.cashGiven)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Troco</span>
                      <span className="whitespace-nowrap font-mono">R$ {formatMoney(receipt.change)}</span>
                    </div>
                  </>
                ) : null}
              </div>

              <div className="my-3 border-t border-dashed border-slate-500" />
              <p className="text-center">Obrigado pela preferencia.</p>
            </div>
          </div>

          <aside className="border-t border-border-primary bg-bg-light p-4 md:border-l md:border-t-0">
            <div className="rounded-xl border border-success/25 bg-success/10 px-3 py-2 text-sm font-semibold text-success">
              {mode === "view" ? "Venda finalizada" : "Pronto para reimpressao"}
            </div>
            <dl className="mt-4 space-y-3 text-sm">
              <div>
                <dt className="text-xs uppercase text-text-tertiary">Venda</dt>
                <dd className="font-semibold text-text-primary">{receipt.saleNumber}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-text-tertiary">Emissao</dt>
                <dd className="font-semibold text-text-primary">
                  {formatReceiptDate(receipt.issuedAt)}
                </dd>
              </div>
              {receipt.printedAt ? (
                <div>
                  <dt className="text-xs uppercase text-text-tertiary">Solicitada em</dt>
                  <dd className="font-semibold text-text-primary">{receipt.printedAt}</dd>
                </div>
              ) : null}
              <div>
                <dt className="text-xs uppercase text-text-tertiary">Itens</dt>
                <dd className="font-semibold text-text-primary">{receipt.items.length}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-text-tertiary">Total</dt>
                <dd className="text-2xl font-bold text-text-primary">
                  R$ {formatMoney(receiptTotal(receipt))}
                </dd>
              </div>
            </dl>
          </aside>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-border-primary px-4 py-3 sm:flex-row sm:justify-end">
          <button type="button" onClick={requestClose} className="btn-outline-secondary">
            Fechar
          </button>
          <button type="button" onClick={printReceipt} className="btn-primary inline-flex items-center justify-center gap-2">
            <Printer size={16} />
            {mode === "view" ? "Imprimir cupom" : "Imprimir agora"}
          </button>
        </div>
      </div>
    </div>
  );
}
