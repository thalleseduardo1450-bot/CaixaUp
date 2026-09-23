import { useEffect, useEffectEvent, useRef, useState } from "react";

type AppSplashProps = {
  ready: boolean;
  onFinished: () => void;
};

export default function AppSplash({ ready, onFinished }: AppSplashProps) {
  const desktop = Boolean(window.caixaUpDesktop);
  const player = useRef<HTMLIFrameElement>(null);
  /** A abertura terminou de tocar (ou não pôde tocar). */
  const [complete, setComplete] = useState(desktop);
  /** O operador clicou em Pular: sai na hora, sem esperar o resto. */
  const [skipped, setSkipped] = useState(false);
  const finish = useEffectEvent(onFinished);

  useEffect(() => {
    if (desktop) return;
    const onPlayback = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== player.current?.contentWindow) return;
      if (event.data?.type !== "caixaup-opening") return;
      if (event.data.state === "dismissed") setSkipped(true);
      if (["finished", "failed", "skipped"].includes(event.data.state)) setComplete(true);
    };
    window.addEventListener("message", onPlayback);
    return () => window.removeEventListener("message", onPlayback);
  }, [desktop]);

  useEffect(() => {
    const fallback = window.setTimeout(() => setSkipped(true), 15000);
    return () => window.clearTimeout(fallback);
  }, []);

  /*
   * A abertura volta a tocar inteira: só sai quando o app está pronto E o vídeo
   * acabou. O botão Pular (dentro do player, no canto) atalha isso na hora.
   */
  useEffect(() => {
    if (skipped || (ready && complete)) finish();
  }, [ready, complete, skipped]);

  return (
    <div className="fixed inset-0 z-[9999] bg-white" role="status" aria-label="Preparando CaixaUp">
      {desktop ? (
        <img src={`${import.meta.env.BASE_URL}startup/poster.jpg`} alt="Preparando CaixaUp" className="h-full w-full object-contain" />
      ) : (
        <iframe
          ref={player}
          title="Abertura animada CaixaUp"
          src={`${import.meta.env.BASE_URL}opening-motion.html`}
          className="h-full w-full border-0"
        />
      )}
    </div>
  );
}
