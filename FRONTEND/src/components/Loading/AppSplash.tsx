/**
 * Arquivo: src/components/Loading/AppSplash.tsx
 * Objetivo: tela de abertura do CaixaUp — marca, indicador de carregamento e saída suave.
 * Entradas esperadas: `ready` informa que o conteúdo por trás já pode ser exibido;
 * `onFinished` é chamado só depois da animação de saída, quando o splash pode sair do DOM.
 *
 * Duração mínima de exibição (MIN_VISIBLE_MS): mesmo com o app carregando rápido,
 * a abertura precisa ser percebida — sem ela a tela piscava e sumia no mesmo quadro.
 * Não é espera artificial longa: é o tempo da própria animação de entrada terminar.
 */
import { useEffect, useEffectEvent, useRef, useState } from "react";

import { CaixaUpMark } from "@/components/Brand/CaixaUpLogo";

const MIN_VISIBLE_MS = 700;
const LEAVE_MS = 460;

type AppSplashProps = {
  ready: boolean;
  onFinished: () => void;
};

export default function AppSplash({ ready, onFinished }: AppSplashProps) {
  const [leaving, setLeaving] = useState(false);
  const mountedAt = useRef(0);
  const finished = useRef(false);
  const finish = useEffectEvent(onFinished);

  // Date.now() é impuro: só pode rodar dentro de efeito, nunca durante o render.
  useEffect(() => {
    if (mountedAt.current === 0) mountedAt.current = Date.now();
  }, []);

  useEffect(() => {
    if (!ready || leaving) return;

    // Faltou tempo para a abertura? Espera o restante antes de sair.
    const elapsed = Date.now() - (mountedAt.current || Date.now());
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const remaining = reducedMotion ? 0 : Math.max(0, MIN_VISIBLE_MS - elapsed);
    const leaveTimer = window.setTimeout(() => setLeaving(true), remaining);
    return () => window.clearTimeout(leaveTimer);
  }, [ready, leaving]);

  useEffect(() => {
    if (!leaving || finished.current) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const finishTimer = window.setTimeout(() => {
      finished.current = true;
      finish();
    }, reducedMotion ? 0 : LEAVE_MS);
    return () => window.clearTimeout(finishTimer);
  }, [leaving]);

  return (
    <div className={`splash ${leaving ? "splash-leave" : ""}`} role="status" aria-live="polite" aria-label={ready ? "CaixaUp pronto" : "Carregando CaixaUp"}>
      <div className="flex flex-col items-center gap-5 px-6 text-center">
        <div className="splash-mark">
          <span className="splash-orbit" aria-hidden="true" />
          <CaixaUpMark height={96} />
        </div>

        <div className="splash-word">
          <span className="text-4xl font-black tracking-tight text-text-primary">
            Caixa<span className="text-[#10b981]">Up</span>
          </span>
        </div>

        <p className="splash-tag max-w-xs text-sm font-semibold uppercase tracking-[0.18em] text-text-tertiary">
          Sua caixa. Sua gestão.
        </p>

        <div className="splash-status mt-2 flex flex-col items-center gap-4">
          <span className="text-sm text-text-secondary">{ready ? "Tudo pronto para começar" : "Preparando seu espaço de trabalho"}</span>
          <div className="splash-track">
            <div className="splash-track-fill" />
          </div>
          <span className="splash-dots" aria-label="Carregando">
            <span />
            <span />
            <span />
          </span>
        </div>
      </div>
    </div>
  );
}
