/**
 * Arquivo: src/components/Reveal.tsx
 * Objetivo: revelar conteúdo ao rolar — suave, sem exagero.
 * Entradas esperadas: qualquer árvore de componentes como children.
 *
 * Dois caminhos, mesmo resultado:
 * - Navegador com Scroll-driven Animations: o CSS (index.css, `.reveal`)
 *   já anima pelo progresso do scroll e o IntersectionObserver abaixo é
 *   inofensivo (a animação sobrepõe a transição da classe).
 * - Navegador sem suporte (Electron antigo): o observer adiciona
 *   `.reveal-in` quando o elemento encosta na viewport.
 * O observer se desconecta após revelar — sem listener eterno vazando.
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
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`reveal ${className}`}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}
