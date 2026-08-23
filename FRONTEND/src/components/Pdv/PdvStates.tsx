/**
 * Arquivo: src/components/Pdv/PdvStates.tsx
 * Objetivo: telas de estado da frente de caixa — carregando, caixa fechado e erro.
 * Entradas esperadas: mensagens e callbacks de ação de cada estado.
 *
 * POR QUE ISTO É UM ARQUIVO SEPARADO
 * Antes, caixa fechado e falha de carregamento apareciam como um aviso pequeno
 * dentro da tela normal, com todos os botões ainda ali, clicáveis. O operador
 * tentava vender, clicava, nada acontecia. Agora cada estado ocupa a tela e diz
 * exatamente qual é o próximo passo — abrir o caixa ou tentar de novo.
 */
import { AlertTriangle, Lock, RefreshCw } from "lucide-react";

/** Esqueleto de carregamento com a mesma silhueta da tela real, para não "pular". */
export function PdvLoadingState() {
  return (
    <div className="flex h-full animate-pulse gap-4 p-4" aria-busy="true">
      <div className="flex flex-1 flex-col gap-3">
        <div className="h-14 rounded-lg bg-bg-gray-theme" />
        <div className="grid flex-1 grid-cols-3 gap-3">
          {Array.from({ length: 9 }).map((_, index) => (
            <div key={index} className="rounded-lg bg-bg-gray-theme" />
          ))}
        </div>
      </div>
      <div className="hidden w-[380px] flex-col gap-3 lg:flex">
        <div className="h-12 rounded-lg bg-bg-gray-theme" />
        <div className="flex-1 rounded-lg bg-bg-gray-theme" />
        <div className="h-32 rounded-lg bg-bg-gray-theme" />
      </div>
      <span className="sr-only">Carregando a frente de caixa…</span>
    </div>
  );
}

export function PdvClosedRegisterState({
  reason,
  onOpenCashRegister,
  onRetry,
}: {
  reason: string;
  onOpenCashRegister: () => void;
  onRetry: () => void;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 px-6 text-center">
      <div
        className="grid h-24 w-24 place-items-center rounded-full bg-primary/10 text-primary"
        aria-hidden="true"
      >
        <Lock size={44} />
      </div>

      <div className="space-y-2">
        <h2 className="font-display text-2xl font-bold text-text-primary">
          Caixa fechado
        </h2>
        <p className="max-w-md text-base text-text-secondary">
          {reason || "Abra o caixa com o valor inicial da gaveta para começar a vender."}
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <button type="button" onClick={onOpenCashRegister} className="btn-primary">
          Abrir o caixa
        </button>
        <button
          type="button"
          onClick={onRetry}
          className="btn-back flex items-center gap-2"
        >
          <RefreshCw size={17} />
          Verificar de novo
        </button>
      </div>

      <p className="max-w-md text-sm text-text-tertiary">
        O caixa precisa estar aberto para que cada venda entre no fechamento do
        turno com o valor certo.
      </p>
    </div>
  );
}

export function PdvErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 px-6 text-center">
      <div
        className="grid h-24 w-24 place-items-center rounded-full bg-primary/10 text-primary"
        aria-hidden="true"
      >
        <AlertTriangle size={44} />
      </div>

      <div className="space-y-2">
        <h2 className="font-display text-2xl font-bold text-text-primary">
          Não foi possível carregar os produtos
        </h2>
        <p className="max-w-md text-base text-text-secondary">{message}</p>
      </div>

      <button
        type="button"
        onClick={onRetry}
        className="btn-primary flex items-center gap-2"
      >
        <RefreshCw size={18} />
        Tentar de novo
      </button>
    </div>
  );
}
