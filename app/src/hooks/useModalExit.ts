/**
 * Arquivo: src/hooks/useModalExit.ts
 * Objetivo: segurar o unmount do modal até a animação de saída terminar.
 * Entradas esperadas: o callback que fecha o modal no componente pai.
 *
 * O modal continua renderizado pelo pai; aqui dentro apenas trocamos as
 * classes (modal-*-in → modal-*-out) e, quando a animação acaba, chamamos
 * o onClose de verdade. Sem isso o React removeria o elemento no mesmo
 * clique e a animação de saída nunca seria vista.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export function useModalExit(onClose: () => void, durationMs = 220) {
  const [closing, setClosing] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const onCloseRef = useRef(onClose);

  // Padrão "latest ref": grava em efeito, nunca durante o render.
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  const requestClose = useCallback(() => {
    setClosing((alreadyClosing) => {
      if (alreadyClosing) return alreadyClosing;
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => onCloseRef.current(), durationMs);
      return true;
    });
  }, [durationMs]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return { closing, requestClose };
}
