/**
 * Arquivo: src/components/Loading/Skeleton.tsx
 * Objetivo: renderiza placeholder visual para estados de carregamento de blocos da interface.
 * Entradas esperadas: recebe classes opcionais de estilo e flag para formato circular.
 */
import type { HTMLAttributes } from "react";

type SkeletonProps = HTMLAttributes<HTMLDivElement> & {
  circle?: boolean;
};

export default function Skeleton({
  className = "",
  circle = false,
  ...props
}: SkeletonProps) {
  return (
    <div
      className={`animate-pulse bg-bg-gray-theme/80 ${circle ? "rounded-full" : "rounded-xl"} ${className}`.trim()}
      {...props}
    />
  );
}
