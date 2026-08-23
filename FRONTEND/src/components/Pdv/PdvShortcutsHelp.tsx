/**
 * Arquivo: src/components/Pdv/PdvShortcutsHelp.tsx
 * Objetivo: painel de atalhos do teclado, aberto com F1.
 * Entradas esperadas: apenas o callback de fechar.
 *
 * Existe porque atalho que ninguém conhece não é atalho. Operador novo aprende o
 * caixa em um turno se puder consultar a lista sem sair da venda em andamento.
 */
import { Keyboard, X } from "lucide-react";

import { PDV_SHORTCUT_HINTS } from "@/hooks/Pdv/usePdvShortcuts";

export default function PdvShortcutsHelp({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-layer-dialog grid place-items-center bg-black/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Atalhos do teclado"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-xl border border-border-primary bg-bg-light"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border-primary px-5 py-3.5">
          <Keyboard size={20} className="text-accent" aria-hidden="true" />
          <h2 className="font-display text-lg font-bold text-text-primary">
            Atalhos do teclado
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar atalhos"
            className="ml-auto grid h-9 w-9 place-items-center rounded-md text-text-tertiary transition hover:bg-hover-light hover:text-primary"
          >
            <X size={18} />
          </button>
        </div>

        <ul className="max-h-[60vh] overflow-y-auto px-5 py-3">
          {PDV_SHORTCUT_HINTS.map((hint) => (
            <li
              key={hint.keys}
              className="flex items-center justify-between gap-4 border-b border-border-primary py-2.5 last:border-b-0"
            >
              <span className="text-base text-text-secondary">{hint.label}</span>
              <kbd className="shrink-0 rounded-md border border-border-secondary bg-bg-gray-theme px-2.5 py-1 font-mono text-sm font-semibold text-text-primary">
                {hint.keys}
              </kbd>
            </li>
          ))}
        </ul>

        <div className="border-t border-border-primary bg-bg-gray-theme px-5 py-3">
          <p className="text-sm text-text-tertiary">
            Dica: mantenha o cursor no campo de produto. O leitor de código de
            barras digita e dá Enter sozinho — o item entra sem você tocar em nada.
          </p>
        </div>
      </div>
    </div>
  );
}
