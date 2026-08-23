/**
 * Arquivo: src/components/Pdv/PdvNumericKeypad.tsx
 * Objetivo: teclado numérico grande para digitar valores no fechamento da venda.
 * Entradas esperadas: callbacks de dígito, apagar e limpar.
 *
 * Existe por dois motivos concretos de balcão:
 *  1) Terminal com tela de toque e sem teclado físico — sem isto não há como
 *     informar quanto o cliente deu em dinheiro.
 *  2) Alvo de 56px de altura: acertar na primeira, com pressa, de pé.
 *
 * Os dígitos entram da DIREITA para a esquerda (teclar 1-2-3-4 = R$ 12,34), que é
 * como funciona qualquer maquininha — o operador não precisa pensar na vírgula.
 */
import { Delete } from "lucide-react";

type PdvNumericKeypadProps = {
  onDigit: (digit: string) => void;
  onBackspace: () => void;
  onClear: () => void;
  disabled?: boolean;
};

const KEYS = ["7", "8", "9", "4", "5", "6", "1", "2", "3", "0", "00"];

export default function PdvNumericKeypad({
  onDigit,
  onBackspace,
  onClear,
  disabled = false,
}: PdvNumericKeypadProps) {
  return (
    <div className="grid grid-cols-3 gap-2" role="group" aria-label="Teclado numérico">
      {KEYS.map((key) => (
        <button
          key={key}
          type="button"
          disabled={disabled}
          onClick={() => onDigit(key)}
          className="h-14 rounded-lg border border-border-secondary bg-bg-light font-mono text-2xl font-bold text-text-primary transition hover:border-accent hover:bg-accent/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {key}
        </button>
      ))}

      <button
        type="button"
        disabled={disabled}
        onClick={onBackspace}
        aria-label="Apagar último dígito"
        className="grid h-14 place-items-center rounded-lg border border-border-secondary bg-bg-light text-text-secondary transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Delete size={22} />
      </button>

      <button
        type="button"
        disabled={disabled}
        onClick={onClear}
        className="col-span-3 h-12 rounded-lg border border-border-secondary bg-bg-light text-base font-semibold text-text-secondary transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
      >
        Limpar valor
      </button>
    </div>
  );
}
