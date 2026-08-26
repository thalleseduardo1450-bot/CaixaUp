import { Check, Eye, Printer, ShoppingCart } from "lucide-react";
import { useState } from "react";
import { useModalExit } from "@/hooks/useModalExit";
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
  const { closing, requestClose } = useModalExit(onStartNewSale);
  const itemCount = receipt.items.reduce((sum, item) => sum + item.quantity, 0);
  const total = receiptTotal(receipt);

  return (
    <div
      className={`fixed inset-0 z-layer-dialog grid place-items-center bg-slate-950/55 p-4 ${
        closing ? "modal-overlay-out" : "modal-overlay-in"
      }`}
      role="dialog"
      aria-modal="true"
      aria-label="Venda finalizada"
    >
      <div
        className={`success-pop w-full max-w-md overflow-hidden rounded-2xl border border-[#d9e8f1] bg-white shadow-2xl ${
          closing ? "modal-panel-out" : ""
        }`}
      >
        <div className="px-6 pb-5 pt-7 text-center">
          <div className="bag-float relative mx-auto h-24 w-24">
            <div className="absolute inset-0 flex items-center justify-center rounded-full bg-[#c6fac9]">
              <svg viewBox="0 0 64 64" className="h-14 w-14" aria-hidden="true">
                <path d="M23 28 a9 9 0 0 1 18 0" fill="none" stroke="#1e293b" strokeWidth="3.5" strokeLinecap="round" />
                <path d="M19 30 h26 l-2.6 22 a4.5 4.5 0 0 1 -4.5 4 h-12 a4.5 4.5 0 0 1 -4.5 -4 Z" fill="#1e293b" />
                <rect x="26" y="40" width="5.5" height="5.5" rx="1.2" fill="#fff" />
                <rect x="35" y="40" width="5.5" height="5.5" rx="1.2" fill="#fff" />
                <path d="M27.5 52 q4.5 4.5 9 0" stroke="#fff" strokeWidth="2.6" fill="none" strokeLinecap="round" />
              </svg>
            </div>
            <div className="absolute -bottom-1 -right-1 flex h-10 w-10 items-center justify-center rounded-full bg-[#22c55e] shadow-md ring-4 ring-white">
              <Check size={22} strokeWidth={3.2} className="text-white" />
            </div>
          </div>

          <p className="mt-5 text-xl font-bold text-[#07304d]">Venda concluída!</p>
          <p className="mt-2 text-[40px] font-black leading-none tracking-tight text-[#07304d]">
            R$ {formatMoney(total)}
          </p>
          <p className="mt-2 text-xs text-[#7894a6]">
            Venda {receipt.saleNumber} · {itemCount} {itemCount === 1 ? "item" : "itens"}
          </p>
        </div>

        <dl className="mx-6 grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border border-[#d9e8f1] bg-[#f7fbfe] p-4 text-sm">
          <div className="col-span-2">
            <dt className="text-xs font-semibold uppercase tracking-wide text-[#7894a6]">Pagamento</dt>
            <dd className="mt-1 font-bold text-[#07304d]">{receipt.paymentLabel || "Não informado"}</dd>
          </div>
          {receipt.cashGiven > 0 ? (
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-[#7894a6]">Recebido</dt>
              <dd className="mt-1 font-bold text-[#07304d]">R$ {formatMoney(receipt.cashGiven)}</dd>
            </div>
          ) : null}
          {receipt.change > 0 ? (
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-[#7894a6]">Troco</dt>
              <dd className="mt-1 text-xl font-black text-[#14803c]">R$ {formatMoney(receipt.change)}</dd>
            </div>
          ) : null}
        </dl>

        {showDetails ? (
          <div className="mx-6 mt-3 max-h-32 overflow-y-auto rounded-xl border border-[#d9e8f1] px-4 py-2">
            {receipt.items.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3 border-b border-[#edf2f6] py-2 last:border-0">
                <span className="truncate text-sm text-[#38566a]">{item.quantity} × {item.name}</span>
                <strong className="shrink-0 text-sm text-[#07304d]">R$ {formatMoney(item.total)}</strong>
              </div>
            ))}
          </div>
        ) : null}

        <div className="mt-4 grid grid-cols-2 gap-2 border-t border-[#e6eef4] bg-[#f7fbfe] px-6 py-4">
          <button
            type="button"
            onClick={onPrint}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[#c9dce8] bg-white px-3 py-2 text-sm font-semibold text-[#38566a] transition hover:border-[#0871ef] hover:text-[#075cbf]"
          >
            <Printer size={16} />
            Imprimir
          </button>
          <button
            type="button"
            onClick={() => setShowDetails((current) => !current)}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[#c9dce8] bg-white px-3 py-2 text-sm font-semibold text-[#38566a] transition hover:border-[#0871ef] hover:text-[#075cbf]"
          >
            <Eye size={16} />
            {showDetails ? "Ocultar" : "Ver detalhes"}
          </button>
        </div>

        <div className="px-6 pb-6">
          <button
            type="button"
            onClick={requestClose}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#0871ef] py-3.5 text-base font-black text-white shadow-md transition hover:bg-[#075cbf] active:scale-[0.98]"
          >
            <ShoppingCart size={19} />
            Nova venda
          </button>
        </div>
      </div>
    </div>
  );
}
