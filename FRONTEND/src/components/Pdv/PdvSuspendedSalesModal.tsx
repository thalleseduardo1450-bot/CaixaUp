/**
 * Arquivo: src/components/Pdv/PdvSuspendedSalesModal.tsx
 * Objetivo: listar as vendas suspensas para retomar ou descartar (F6).
 * Entradas esperadas: lista de vendas suspensas e callbacks de retomar/descartar.
 *
 * Caso de uso concreto: o cliente esqueceu a carteira no carro. Sem isto, o
 * operador tem duas opções ruins — travar a fila esperando, ou cancelar e passar
 * os 20 itens de novo depois.
 */
import { PauseCircle, Play, Trash2, X } from "lucide-react";

import type { PdvSuspendedSale } from "@/types/pdv";
import { formatCentsBrl } from "@/utils/pdvMoney";

type PdvSuspendedSalesModalProps = {
  sales: PdvSuspendedSale[];
  onResume: (id: string) => void;
  onDiscard: (id: string) => void;
  onClose: () => void;
};

function formatWhen(timestamp: number): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export default function PdvSuspendedSalesModal({
  sales,
  onResume,
  onDiscard,
  onClose,
}: PdvSuspendedSalesModalProps) {
  return (
    <div
      className="fixed inset-0 z-layer-dialog grid place-items-center bg-black/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Vendas suspensas"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-xl border border-border-primary bg-bg-light"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border-primary px-5 py-3.5">
          <PauseCircle size={20} className="text-accent" aria-hidden="true" />
          <h2 className="font-display text-lg font-bold text-text-primary">
            Vendas suspensas
          </h2>
          <span className="rounded-full bg-bg-gray-theme px-2.5 py-1 text-xs font-semibold text-text-secondary">
            {sales.length}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar vendas suspensas"
            className="ml-auto grid h-9 w-9 place-items-center rounded-md text-text-tertiary transition hover:bg-hover-light hover:text-primary"
          >
            <X size={18} />
          </button>
        </div>

        {sales.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <p className="text-base font-semibold text-text-primary">
              Nenhuma venda suspensa
            </p>
            <p className="mt-1 text-sm text-text-secondary">
              Use <kbd className="font-mono font-semibold">F7</kbd> para guardar a
              venda atual e atender o próximo da fila.
            </p>
          </div>
        ) : (
          <ul className="max-h-[60vh] overflow-y-auto px-5 py-2">
            {sales.map((sale) => (
              <li
                key={sale.id}
                className="flex items-center gap-3 border-b border-border-primary py-3 last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-semibold text-text-primary">
                    {sale.label}
                  </p>
                  <p className="text-xs text-text-tertiary">
                    {formatWhen(sale.suspendedAt)} · {sale.items.length}{" "}
                    {sale.items.length === 1 ? "item" : "itens"}
                    {sale.customerName ? ` · ${sale.customerName}` : ""}
                    {sale.operatorName ? ` · ${sale.operatorName}` : ""}
                  </p>
                </div>

                <span className="shrink-0 font-mono text-lg font-bold text-text-primary">
                  {formatCentsBrl(sale.totalCents)}
                </span>

                <button
                  type="button"
                  onClick={() => onDiscard(sale.id)}
                  aria-label={`Descartar ${sale.label}`}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-border-secondary text-text-tertiary transition hover:border-primary hover:text-primary"
                >
                  <Trash2 size={17} />
                </button>

                <button
                  type="button"
                  onClick={() => onResume(sale.id)}
                  className="flex h-10 shrink-0 items-center gap-1.5 rounded-lg bg-accent px-3.5 text-sm font-semibold text-white transition hover:bg-hover-accent"
                >
                  <Play size={16} />
                  Retomar
                </button>
              </li>
            ))}
          </ul>
        )}

        {sales.length > 0 && (
          <div className="border-t border-border-primary bg-bg-gray-theme px-5 py-3">
            <p className="text-sm text-text-tertiary">
              Se já houver itens no cupom atual, eles são suspensos automaticamente
              antes de retomar — nada é perdido.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
