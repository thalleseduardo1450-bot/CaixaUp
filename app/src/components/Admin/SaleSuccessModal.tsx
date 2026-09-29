import { Banknote, Check, Printer, ReceiptText, X } from "lucide-react";
import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import "./SaleSuccessModal.css";
import { receiptTotal, type SaleReceipt } from "./ReceiptPreviewModal";

type SaleSuccessModalProps = {
  receipt: SaleReceipt;
  formatMoney: (value: number) => string;
  onPrint: () => void;
  onStartNewSale: () => void;
};

export default function SaleSuccessModal({
  receipt,
  formatMoney,
  onPrint,
  onStartNewSale,
}: SaleSuccessModalProps) {
  const [showDetails, setShowDetails] = useState(false);
  const [starting, setStarting] = useState(false);
  const transition = useRef<HTMLDivElement>(null);
  const finish = useEffectEvent(onStartNewSale);
  const requestClose = useCallback(() => setStarting(true), []);
  const itemCount = receipt.items.reduce((sum, item) => sum + item.quantity, 0);
  const total = receiptTotal(receipt);

  useEffect(() => {
    if (!starting) return;
    transition.current?.focus();
    const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 80 : 1150;
    const timer = window.setTimeout(() => finish(), duration);
    return () => window.clearTimeout(timer);
  }, [starting]);

  useEffect(() => {
    const handleEnter = (event: KeyboardEvent) => {
      if (starting) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      if (event.key !== "Enter" && event.key !== "Escape") return;
      event.preventDefault();
      if (!event.repeat) requestClose();
    };
    window.addEventListener("keydown", handleEnter, true);
    return () => window.removeEventListener("keydown", handleEnter, true);
  }, [requestClose, starting]);

  if (starting) {
    return (
      <div ref={transition} tabIndex={-1} className="new-sale-motion fixed inset-0 z-layer-dialog" role="dialog" aria-modal="true" aria-label="Preparando nova venda" aria-busy="true">
        <div className="new-sale-motion-content" role="status">
          <div className="new-sale-motion-art" aria-hidden="true">
            <span className="new-sale-motion-halo" />
            <svg viewBox="0 0 100 100" className="new-sale-motion-cart" fill="none">
              <rect className="new-sale-motion-parcel" x="43" y="20" width="20" height="20" rx="5" fill="#10b981" />
              <path className="new-sale-motion-handle" d="M53 21v8" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
              <path className="new-sale-motion-outline" d="M19 30h10l8 33h34l8-24H32" stroke="#1760e8" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" pathLength="1" />
              <circle className="new-sale-motion-wheel" cx="43" cy="74" r="4" fill="#1760e8" />
              <circle className="new-sale-motion-wheel" cx="68" cy="74" r="4" fill="#1760e8" />
            </svg>
          </div>
          <p className="new-sale-motion-title">Nova venda</p>
        </div>
      </div>
    );
  }

  const mono = { fontFamily: "'IBM Plex Mono', ui-monospace, monospace" };
  const kbd = "rounded-[5px] border border-b-2 px-1.5 py-1 text-[11px] font-semibold leading-none";

  return (
    <div
      className="sale-confirmation-overlay fixed inset-0 z-layer-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sale-confirmation-title"
    >
      <div className="relative flex max-h-[calc(100vh-2rem)] w-[520px] max-w-[calc(100vw-2rem)] flex-col gap-5 overflow-y-auto rounded-[20px] border border-[#e2e8f0] bg-white p-8 text-[#0f172a]">
        <button
          type="button"
          onClick={requestClose}
          aria-label="Fechar e iniciar nova venda"
          className="absolute right-5 top-5 flex h-9 items-center gap-1.5 rounded-[10px] border border-[#e2e8f0] bg-white px-2.5 text-[#475569] transition hover:bg-[#f8fafc]"
        >
          <kbd className={`${kbd} border-[#cbd5e1] bg-[#f1f5f9] text-[#334155]`} style={mono}>Esc</kbd>
          <X size={16} />
        </button>

        <div className="flex flex-col items-center gap-3 pt-1 text-center">
          <div className="grid h-14 w-14 place-items-center rounded-full bg-[#dcfce7] text-[#15803d]" aria-hidden="true">
            <Check size={28} strokeWidth={2.5} />
          </div>
          <div className="flex flex-col gap-1">
            <h2 id="sale-confirmation-title" className="m-0 text-[26px] font-bold tracking-[-0.01em]">Venda concluída</h2>
            <p className="m-0 text-sm text-[#475569]">
              Venda <span style={mono}>#{receipt.saleNumber}</span> · {receipt.items.length}{" "}
              {receipt.items.length === 1 ? "produto" : "produtos"} · {itemCount} un.
            </p>
          </div>
        </div>

        <div className="flex flex-col overflow-hidden rounded-[14px] border border-[#e2e8f0]">
          <div className="flex items-baseline justify-between px-5 py-4">
            <span className="text-[13px] font-bold tracking-[0.08em] text-[#334155]">TOTAL</span>
            <span style={mono}>
              <span className="text-xl font-medium text-[#64748b]">R$ </span>
              <span className="text-[40px] font-semibold leading-none tracking-[-0.03em]">{formatMoney(total)}</span>
            </span>
          </div>

          <div className="flex flex-col gap-2 border-t border-[#e2e8f0] px-5 py-3.5 text-sm text-[#475569]">
            {(receipt.paymentLines?.length ? receipt.paymentLines : [{ label: receipt.paymentLabel || "Não informado", amount: total }]).map((line) => (
              <div key={line.label} className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Banknote size={16} className="text-[#64748b]" aria-hidden="true" />
                  {line.label}
                </span>
                <span className="text-[#0f172a]" style={mono}>R$ {formatMoney(line.amount)}</span>
              </div>
            ))}
            {receipt.cashGiven > 0 && (
              <div className="flex justify-between">
                <span>Recebido</span>
                <span className="text-[#0f172a]" style={mono}>R$ {formatMoney(receipt.cashGiven)}</span>
              </div>
            )}
          </div>

          {receipt.change > 0 && (
            <div className="flex items-center justify-between border-t border-[#bbf7d0] bg-[#f0fdf4] px-5 py-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-[13px] font-bold tracking-[0.08em] text-[#166534]">TROCO</span>
                <span className="text-xs text-[#166534]">Devolver ao cliente</span>
              </div>
              <span className="text-[#14532d]" style={mono}>
                <span className="text-xl font-medium">R$ </span>
                <span className="text-[40px] font-semibold leading-none tracking-[-0.03em]">{formatMoney(receipt.change)}</span>
              </span>
            </div>
          )}
        </div>

        {showDetails && (
          <div id="sale-confirmation-items" className="rounded-[14px] border border-[#e2e8f0] px-5 py-2">
            {receipt.items.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3 border-b border-[#edf2f6] py-2 last:border-0">
                <span className="min-w-0 break-words text-sm text-[#475569]">{item.quantity} × {item.name}</span>
                <strong className="shrink-0 text-sm" style={mono}>R$ {formatMoney(item.total)}</strong>
              </div>
            ))}
          </div>
        )}

        <div className="grow" />

        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={onPrint}
            className="flex h-12 items-center justify-center gap-2 rounded-xl border border-[#cbd5e1] bg-white text-sm font-semibold text-[#0f172a] transition hover:bg-[#f8fafc]"
          >
            <Printer size={18} />
            Imprimir cupom
          </button>
          <button
            type="button"
            onClick={() => setShowDetails((current) => !current)}
            aria-expanded={showDetails}
            aria-controls="sale-confirmation-items"
            className="flex h-12 items-center justify-center gap-2 rounded-xl border border-[#cbd5e1] bg-white text-sm font-semibold text-[#0f172a] transition hover:bg-[#f8fafc]"
          >
            <ReceiptText size={18} />
            {showDetails ? "Ocultar detalhes" : "Ver detalhes"}
          </button>
        </div>

        <button
          type="button"
          onClick={requestClose}
          className="flex h-[60px] items-center justify-center gap-2.5 rounded-[14px] bg-[#1d4ed8] text-[17px] font-semibold text-white shadow-[0_1px_0_#1e3a8a,0_6px_16px_rgba(29,78,216,0.25)] transition hover:bg-[#1e40af]"
        >
          Nova venda
          <kbd className={`${kbd} border-white/35 bg-white/20 text-white`} style={mono}>Enter</kbd>
        </button>
      </div>
    </div>
  );
}
