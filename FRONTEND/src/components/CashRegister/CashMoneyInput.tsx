/**
 * Arquivo: src/components/CashRegister/CashMoneyInput.tsx
 * Objetivo: campo de dinheiro grande da tela de caixa, no mesmo jeito do PDV:
 * "150" é R$ 150,00 e os centavos entram depois da vírgula ("150,50").
 */
import { forwardRef, type KeyboardEvent } from "react";
import { sanitizeCashTyping } from "@/utils/pdvMoney";

type CashMoneyInputProps = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  onEnter?: () => void;
  placeholder?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  size?: "lg" | "md";
  ariaDescribedBy?: string;
};

const CashMoneyInput = forwardRef<HTMLInputElement, CashMoneyInputProps>(function CashMoneyInput(
  { id, value, onChange, onEnter, placeholder = "0,00", autoFocus, disabled, size = "lg", ariaDescribedBy },
  ref,
) {
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && onEnter) {
      event.preventDefault();
      onEnter();
    }
  };

  const big = size === "lg";

  return (
    <div
      className={`flex items-center gap-2 rounded-xl border-2 border-border-secondary bg-bg-light px-4 transition focus-within:border-accent focus-within:ring-4 focus-within:ring-accent/15 ${
        disabled ? "opacity-70" : ""
      } ${big ? "h-14" : "h-12"}`}
    >
      <span className={`font-semibold text-text-tertiary ${big ? "text-xl" : "text-base"}`} aria-hidden="true">
        R$
      </span>
      <input
        ref={ref}
        id={id}
        value={value}
        inputMode="decimal"
        autoComplete="off"
        autoFocus={autoFocus}
        disabled={disabled}
        aria-describedby={ariaDescribedBy}
        onKeyDown={handleKeyDown}
        onChange={(event) => onChange(sanitizeCashTyping(event.target.value))}
        onFocus={(event) => event.currentTarget.select()}
        placeholder={placeholder}
        className={`min-w-0 flex-1 bg-transparent text-right font-bold tabular-nums text-text-primary outline-none placeholder:text-text-tertiary/60 focus-visible:outline-none ${
          big ? "text-3xl" : "text-xl"
        }`}
      />
    </div>
  );
});

export default CashMoneyInput;
