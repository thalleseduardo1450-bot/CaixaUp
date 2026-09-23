/**
 * Arquivo: src/layout/PageLayout.tsx
 * Objetivo: padroniza largura de leitura, espaçamento lateral e ritmo vertical das páginas.
 * Entradas esperadas: children e opcional de tamanho visual do container.
 * Observação: o respiro vertical é definido só aqui; as páginas não precisam informá-lo.
 */
import { useEffect, useRef, type ReactNode } from "react";

type PageLayoutSize = "default" | "wide" | "full";

type PageLayoutProps = {
  children: ReactNode;
  size?: PageLayoutSize;
  className?: string;
};

const SIZE_CLASS: Record<PageLayoutSize, string> = {
  default: "max-w-[1180px]",
  wide: "max-w-[1360px]",
  full: "max-w-none",
};

// Ritmo vertical padrão de todas as páginas: um único ponto de definição.
const RHYTHM_CLASS = "py-6 md:py-8 space-y-6 md:space-y-8";

// Tokens de ritmo vertical (com ou sem prefixo de breakpoint) vindos das páginas.
const VERTICAL_RHYTHM = /^(?:sm:|md:|lg:|xl:|2xl:)?(?:space-y-|py-|pt-|pb-)/;

export default function PageLayout({
  children,
  size = "default",
  className = "",
}: PageLayoutProps) {
  const pageRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const page = pageRef.current;
    if (!page || typeof IntersectionObserver === "undefined") return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const animations = new Set<Animation>();
    const stopAnimations = () => {
      if (motion.matches) animations.forEach((animation) => animation.cancel());
    };
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry, index) => {
        if (!entry.isIntersecting) return;
        observer.unobserve(entry.target);
        if (motion.matches || entry.target.contains(document.activeElement)) return;
        const animation = entry.target.animate([
          { opacity: 0.35, translate: "0 12px" },
          { opacity: 1, translate: "0 0" },
        ], { duration: 320, delay: Math.min(index * 45, 135), easing: "cubic-bezier(0.2, 0.85, 0.25, 1)" });
        animations.add(animation);
        animation.onfinish = () => animations.delete(animation);
        animation.oncancel = () => animations.delete(animation);
      });
    }, { threshold: 0 });
    Array.from(page.children).forEach((child) => observer.observe(child));
    motion.addEventListener("change", stopAnimations);
    return () => {
      observer.disconnect();
      motion.removeEventListener("change", stopAnimations);
      animations.forEach((animation) => animation.cancel());
    };
  }, []);

  // As páginas ainda enviam o ritmo antigo no className; removemos só esses tokens
  // porque no Tailwind a ordem no atributo class não decide qual regra vence.
  const extraClass = className
    .split(/\s+/)
    .filter((token) => token && !VERTICAL_RHYTHM.test(token))
    .join(" ");

  return (
    <section
      ref={pageRef}
      className={`adaptive-page-layout mx-auto w-full px-6 md:px-8 lg:px-10 ${RHYTHM_CLASS} ${SIZE_CLASS[size]} ${extraClass}`.trim()}
    >
      {children}
    </section>
  );
}
