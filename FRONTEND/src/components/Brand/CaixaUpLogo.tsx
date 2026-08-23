/**
 * Arquivo: src/components/Brand/CaixaUpLogo.tsx
 * Objetivo: renderiza a identidade visual do CaixaUp — marca (caixa registradora +
 * gráfico ascendente) e logotipo "CaixaUp" com tagline.
 * Entradas esperadas: variante de cor, tamanho do símbolo e se exibe a tagline.
 */
import { memo } from "react";

type LogoVariant = "default" | "light";

type CaixaUpLogoProps = {
  variant?: LogoVariant;
  size?: "sm" | "md";
  showTagline?: boolean;
  markOnly?: boolean;
  markHeight?: number;
  className?: string;
};

const PALETTE: Record<
  LogoVariant,
  {
    body: string;
    screen: string;
    screenMark: string;
    drawer: string;
    paper: string;
    paperDot: string;
    keypad: string;
    bars: string;
    arrow: string;
  }
> = {
  default: {
    body: "#334155",
    screen: "#7dd3fc",
    screenMark: "#1d4ed8",
    drawer: "#2563eb",
    paper: "#e2e8f0",
    paperDot: "#94a3b8",
    keypad: "#7dd3fc",
    bars: "#38bdf8",
    arrow: "#38bdf8",
  },
  light: {
    body: "#0b1120",
    screen: "#bfdbfe",
    screenMark: "#1d4ed8",
    drawer: "#60a5fa",
    paper: "#f8fafc",
    paperDot: "#94a3b8",
    keypad: "#bfdbfe",
    bars: "#bfdbfe",
    arrow: "#7dd3fc",
  },
};

export function CaixaUpMark({
  variant = "default",
  height = 44,
  className = "",
}: {
  variant?: LogoVariant;
  height?: number;
  className?: string;
}) {
  const c = PALETTE[variant];
  return (
    <svg
      viewBox="0 0 124 92"
      className={className}
      style={{ height, width: "auto" }}
      role="img"
      aria-label="CaixaUp"
    >
      {/* seta ascendente */}
      <path
        d="M72 72 C 94 66, 106 54, 116 34"
        fill="none"
        stroke={c.arrow}
        strokeWidth={7}
        strokeLinecap="round"
      />
      <path d="M108 30 L 118 33 L 113 43 Z" fill={c.arrow} />
      {/* gráfico ascendente */}
      <rect x="76" y="60" width="9" height="14" rx="3.5" fill={c.bars} />
      <rect x="89" y="50" width="9" height="24" rx="3.5" fill={c.bars} />
      <rect x="102" y="40" width="9" height="34" rx="3.5" fill={c.bars} />
      <rect x="115" y="30" width="9" height="44" rx="3.5" fill={c.bars} />
      {/* rolo de papel */}
      <circle cx="17" cy="42" r="8" fill={c.paper} />
      <circle cx="17" cy="42" r="2.5" fill={c.paperDot} />
      {/* tela com código de barras */}
      <rect x="20" y="18" width="36" height="18" rx="5" fill={c.screen} />
      <rect x="27" y="22" width="3" height="10" rx="1" fill={c.screenMark} />
      <rect x="34" y="22" width="2" height="10" rx="1" fill={c.screenMark} />
      <rect x="40" y="22" width="4" height="10" rx="1" fill={c.screenMark} />
      <rect x="48" y="22" width="2.5" height="10" rx="1" fill={c.screenMark} />
      {/* corpo do caixa registradora */}
      <rect x="12" y="36" width="52" height="30" rx="8" fill={c.body} />
      {/* teclado */}
      <circle cx="48" cy="46" r="2.6" fill={c.keypad} />
      <circle cx="56" cy="46" r="2.6" fill={c.keypad} />
      <circle cx="48" cy="54" r="2.6" fill={c.keypad} />
      <circle cx="56" cy="54" r="2.6" fill={c.keypad} />
      {/* gaveta aberta com fechadura */}
      <rect x="12" y="58" width="30" height="12" rx="4" fill={c.drawer} />
      <circle cx="27" cy="64" r="2" fill={c.paper} />
      <path d="M27 64 L 24 68 H 30 Z" fill={c.paper} />
    </svg>
  );
}

function LogoType({
  variant,
  size,
}: {
  variant: LogoVariant;
  size: "sm" | "md";
}) {
  const isLight = variant === "light";
  const textSize = size === "sm" ? "text-xl" : "text-2xl";
  const arrowSize = size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5";
  return (
    <span
      className={`inline-flex items-start font-black leading-none tracking-tight ${textSize}`}
    >
      <span className={isLight ? "text-white" : "text-[#1e3a5f]"}>Caixa</span>
      <span className={isLight ? "text-[#7dd3fc]" : "text-[#0ea5e9]"}>Up</span>
      <svg
        viewBox="0 0 16 16"
        className={`${arrowSize} mt-0.5 ml-0.5 ${isLight ? "text-[#7dd3fc]" : "text-[#0ea5e9]"}`}
        fill="none"
        stroke="currentColor"
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M5 11 L11 5" />
        <path d="M8 5 h3 v3" />
      </svg>
    </span>
  );
}

export default memo(function CaixaUpLogo({
  variant = "default",
  size = "md",
  showTagline = false,
  markOnly = false,
  markHeight = 44,
  className = "",
}: CaixaUpLogoProps) {
  const isLight = variant === "light";

  if (markOnly) {
    return <CaixaUpMark variant={variant} height={markHeight} className={className} />;
  }

  return (
    <div className={`inline-flex items-center gap-3 ${className}`}>
      <CaixaUpMark variant={variant} height={markHeight} />
      <div className="min-w-0 leading-none">
        <LogoType variant={variant} size={size} />
        {showTagline ? (
          <p
            className={`mt-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] ${
              isLight ? "text-white/75" : "text-text-secondary"
            }`}
          >
            Sua caixa. Sua gestão. Tudo em um só lugar.
          </p>
        ) : null}
      </div>
    </div>
  );
});
