/**
 * Arquivo: src/components/Reveal.tsx
 * Objetivo: revelar conteúdo ao rolar — suave, sem exagero.
 * Entradas esperadas: qualquer árvore de componentes como children.
 *
 * Revela uma vez por montagem, inclusive blocos maiores que a viewport.
 * O observer se desconecta após revelar.
 */
import { useEffect, useRef, type ReactNode } from "react";

type RevealProps = {
  children: ReactNode;
  className?: string;
  /** Atraso em ms para entrada em cascata. */
  delay?: number;
};

export default function Reveal({ children, className = "", delay = 0 }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    if (typeof IntersectionObserver === "undefined") {
      element.classList.add("reveal-in");
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          element.classList.add("reveal-in");
          observer.disconnect();
        }
      },
      { threshold: 0 },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      onFocusCapture={() => ref.current?.classList.add("reveal-in")}
      className={`reveal ${className}`}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}
