/**
 * Arquivo: src/components/CashRegister/CashMovementDialog.tsx
 * Objetivo: registrar sangria (dinheiro que sai da gaveta) ou suprimento (troco que entra).
 */
import { ArrowDownToLine, ArrowUpFromLine, X } from "lucide-react";
import { useEffect, useState } from "react";
import LoadingButton from "@/components/Loading/LoadingButton";
import type { CashMovementType } from "@/services/api/cashRegisterService";
import { parseCentsBr } from "@/utils/pdvMoney";
import CashMoneyInput from "./CashMoneyInput";
import { brl } from "./cashFormat";

type CashMovementDialogProps = {
  initialType: CashMovementType;
  expectedCashCents: number | null;
  saving: boolean;
  onCancel: () => void;
  onConfirm: (type: CashMovementType, cents: number, reason: string) => void;
};

const COPY = {
  sangria: {
    title: "Sangria",
    help: "Dinheiro que sai da gaveta: depósito, pagamento de fornecedor, retirada do dono.",
    reasonPlaceholder: "Ex.: depósito no banco",
  },
  suprimento: {
    title: "Suprimento",
    help: "Dinheiro que entra na gaveta sem ser venda, como reforço de troco.",
    reasonPlaceholder: "Ex.: reforço de moedas",
  },
};

export default function CashMovementDialog({
  initialType,
  expectedCashCents,
  saving,
  onCancel,
  onConfirm,
}: CashMovementDialogProps) {
  const [type, setType] = useState<CashMovementType>(initialType);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const cents = parseCentsBr(amount);
  const copy = COPY[type];
  const overdraw = type === "sangria" && expectedCashCents !== null && cents > expectedCashCents;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, saving]);

  const submit = () => {
    if (cents <= 0 || saving) return;
    onConfirm(type, cents, reason);
  };

  return (
    <div
      className="fixed inset-0 z-layer-dialog flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cash-movement-title"
    >
      <div className="relative w-full max-w-md rounded-2xl bg-bg-light p-5 shadow-xl">
        <button
          type="button"
          onClick={onCancel}
          className="absolute right-4 top-4 rounded-md p-1 text-text-secondary transition hover:bg-hover-light hover:text-text-primary"
          aria-label="Fechar"
        >
          <X className="h-5 w-5" />
        </button>

        <h2 id="cash-movement-title" className="text-lg font-bold text-text-primary">
          Registrar {copy.title.toLowerCase()}
        </h2>

        <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-bg-gray-theme p-1" role="radiogroup" aria-label="Tipo">
          {(["sangria", "suprimento"] as const).map((option) => {
            const active = option === type;
            const Icon = option === "sangria" ? ArrowUpFromLine : ArrowDownToLine;
            return (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setType(option)}
                className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg text-sm font-semibold transition ${
                  active ? "bg-bg-light text-text-primary shadow-sm" : "text-text-secondary hover:text-text-primary"
                }`}
              >
                <Icon size={16} className={option === "sangria" ? "text-primary" : "text-success"} aria-hidden="true" />
                {COPY[option].title}
              </button>
            );
          })}
        </div>

        <p className="mt-3 text-sm text-text-secondary">{copy.help}</p>

        <label htmlFor="cash-movement-amount" className="mt-4 block text-sm font-semibold text-text-primary">
          Valor
        </label>
        <div className="mt-1.5">
          <CashMoneyInput
            id="cash-movement-amount"
            value={amount}
            onChange={setAmount}
            onEnter={submit}
            autoFocus
            size="md"
            placeholder="0,00"
          />
        </div>
        {overdraw ? (
          <p className="mt-1.5 text-sm text-primary">
            É mais do que o esperado na gaveta ({brl(expectedCashCents ?? 0)}). Confira antes de salvar.
          </p>
        ) : null}

        <label htmlFor="cash-movement-reason" className="mt-4 block text-sm font-semibold text-text-primary">
          Motivo <span className="font-normal text-text-tertiary">(opcional)</span>
        </label>
        <input
          id="cash-movement-reason"
          value={reason}
          maxLength={120}
          onChange={(event) => setReason(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") submit();
          }}
          className="input-field mt-1.5 w-full"
          placeholder={copy.reasonPlaceholder}
        />

        <div className="mt-5 flex justify-end gap-3">
          <button type="button" onClick={onCancel} className="btn-back" disabled={saving}>
            Cancelar
          </button>
          <LoadingButton
            type="button"
            onClick={submit}
            isLoading={saving}
            loadingLabel="Salvando..."
            disabled={cents <= 0}
            className={`${type === "sangria" ? "btn-cancel" : "btn-success"} inline-flex items-center gap-2`}
          >
            Registrar {cents > 0 ? brl(cents) : ""}
          </LoadingButton>
        </div>
      </div>
    </div>
  );
}
