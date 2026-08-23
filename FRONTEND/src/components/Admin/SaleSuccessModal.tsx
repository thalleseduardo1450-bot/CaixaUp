/**
 * Arquivo: src/components/Admin/SaleSuccessModal.tsx
 * Objetivo: celebra a conclusão de uma venda com visual alegre (sacola sorridente,
 * selo de check, total e ação para iniciar nova venda ou imprimir o cupom).
 * Entradas esperadas: dados da venda finalizada, formatador de moeda e callbacks.
 */
import { Check, Printer } from "lucide-react";
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
  const itemCount = receipt.items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div
      className="fixed inset-0 z-layer-dialog grid place-items-center bg-[#082338]/55 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label="Venda finalizada"
    >
      <div className="success-pop w-full max-w-sm overflow-hidden rounded-3xl border border-[#d9e8f1] bg-white shadow-2xl">
        <div className="px-8 pt-9 pb-7 text-center">
          {/* Sacola sorridente com selo de check */}
          <div className="bag-float relative mx-auto h-32 w-32">
            <div className="absolute inset-0 flex items-center justify-center rounded-full bg-[#c6fac9]">
              <svg viewBox="0 0 64 64" className="h-[70px] w-[70px]" aria-hidden="true">
                {/* alça */}
                <path
                  d="M23 28 a9 9 0 0 1 18 0"
                  fill="none"
                  stroke="#1e293b"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                />
                {/* corpo da sacola */}
                <path
                  d="M19 30 h26 l-2.6 22 a4.5 4.5 0 0 1 -4.5 4 h-12 a4.5 4.5 0 0 1 -4.5 -4 Z"
                  fill="#1e293b"
                />
                {/* rosto */}
                <rect x="26" y="40" width="5.5" height="5.5" rx="1.2" fill="#fff" />
                <rect x="35" y="40" width="5.5" height="5.5" rx="1.2" fill="#fff" />
                <path
                  d="M27.5 52 q4.5 4.5 9 0"
                  stroke="#fff"
                  strokeWidth="2.6"
                  fill="none"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <div className="absolute -right-1 -bottom-1 flex h-12 w-12 items-center justify-center rounded-full bg-[#22c55e] shadow-md ring-4 ring-white">
              <Check size={26} strokeWidth={3.2} className="text-white" />
            </div>
          </div>

          <p className="mt-6 text-lg font-semibold text-[#07304d]">Venda Feita!</p>
          <p className="mt-1 text-[42px] leading-none font-black tracking-tight text-[#07304d]">
            R$ {formatMoney(receiptTotal(receipt))}
          </p>
          <p className="mt-2 text-xs text-[#7894a6]">
            Venda {receipt.saleNumber} · {itemCount} {itemCount === 1 ? "item" : "itens"}
          </p>
        </div>

        <div className="flex items-end justify-between gap-3 border-t border-[#e6eef4] bg-[#f7fbfe] px-6 py-4">
          <button
            type="button"
            onClick={onPrint}
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-2 text-xs font-semibold text-[#7894a6] transition hover:bg-[#eaf2f8] hover:text-[#075cbf]"
          >
            <Printer size={15} />
            Imprimir cupom
          </button>
          <span className="text-lg text-[#c3d2dd]" aria-hidden="true">
            ...
          </span>
        </div>

        <div className="px-6 pb-6">
          <button
            type="button"
            onClick={onStartNewSale}
            className="h-13 w-full rounded-xl bg-[#0871ef] py-3.5 text-base font-black text-white shadow-lg shadow-blue-200 transition hover:bg-[#075cbf] active:scale-[0.98]"
          >
            <span className="underline">I</span>niciar Nova Venda
          </button>
        </div>
      </div>
    </div>
  );
}
