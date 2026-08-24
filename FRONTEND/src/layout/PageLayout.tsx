/**
 * Arquivo: src/layout/PageLayout.tsx
 * Objetivo: padroniza largura de leitura, espaçamento lateral e ritmo vertical das páginas.
 * Entradas esperadas: children e opcional de tamanho visual do container.
 * Observação: o respiro vertical é definido só aqui; as páginas não precisam informá-lo.
 */
import type { ReactNode } from "react";

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
  // As páginas ainda enviam o ritmo antigo no className; removemos só esses tokens
  // porque no Tailwind a ordem no atributo class não decide qual regra vence.
  const extraClass = className
    .split(/\s+/)
    .filter((token) => token && !VERTICAL_RHYTHM.test(token))
    .join(" ");

  return (
    <section
      className={`mx-auto w-full px-6 md:px-8 lg:px-10 ${RHYTHM_CLASS} ${SIZE_CLASS[size]} ${extraClass}`.trim()}
    >
      {children}
    </section>
  );
}
