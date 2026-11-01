/**
 * Arquivo: src/components/CashRegister/CashOpenPanel.tsx
 * Objetivo: abrir o caixa com o fundo de troco (dinheiro que fica na gaveta).
 */
import { UnlockKeyhole } from "lucide-react";
import { useEffect, useRef } from "react";
import LoadingButton from "@/components/Loading/LoadingButton";
import { formatCents } from "@/utils/pdvMoney";
import CashMoneyInput from "./CashMoneyInput";
import { brl } from "./cashFormat";

type CashOpenPanelProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  saving: boolean;
  /** Dinheiro contado no último fechamento, para sugerir como fundo de troco. */
  lastCountedCents: number | null;
};

const QUICK_VALUES = [0, 5000, 10000, 20000];

export default function CashOpenPanel({ value, onChange, onSubmit, saving, lastCountedCents }: CashOpenPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Já deixa o cursor no valor, sem rolar a tela para baixo.
  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  const suggestions = [
    ...QUICK_VALUES.map((cents) => ({ cents, label: `R$ ${cents / 100}` })),
    ...(lastCountedCents && !QUICK_VALUES.includes(lastCountedCents)
      ? [{ cents: lastCountedCents, label: `Último contado: ${brl(lastCountedCents)}` }]
      : []),
  ];

  return (
    <section className="card p-4 md:p-5" aria-labelledby="cash-open-title">
      <div className="flex items-center gap-2">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-success/10 text-success">
          <UnlockKeyhole size={18} aria-hidden="true" />
        </span>
        <h2 id="cash-open-title" className="text-lg font-bold text-text-primary">
          Abrir caixa
        </h2>
      </div>

      <label htmlFor="cash-opening-amount" className="mt-4 block text-sm font-semibold text-text-primary">
        Fundo de troco
      </label>
      <p id="cash-opening-hint" className="mb-2 text-sm text-text-secondary">
        Quanto em dinheiro fica na gaveta para dar troco.
      </p>
      <CashMoneyInput
        id="cash-opening-amount"
        value={value}
        onChange={onChange}
        onEnter={onSubmit}
        ref={inputRef}
        ariaDescribedBy="cash-opening-hint"
      />

      <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Valores rápidos">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion.label}
            type="button"
            onClick={() => onChange(formatCents(suggestion.cents).replace(/\./g, ""))}
            className="h-8 rounded-full border border-border-secondary px-3 text-sm font-medium text-text-secondary transition hover:border-accent hover:text-accent"
          >
            {suggestion.label}
          </button>
        ))}
      </div>

      <LoadingButton
        type="button"
        onClick={onSubmit}
        isLoading={saving}
        loadingLabel="Abrindo..."
        className="btn-success mt-5 inline-flex w-full items-center justify-center gap-2 text-lg"
      >
        <UnlockKeyhole size={18} aria-hidden="true" />
        Abrir caixa
      </LoadingButton>
      <p className="mt-2 text-center text-xs text-text-tertiary">Enter também abre o caixa.</p>
    </section>
  );
}
