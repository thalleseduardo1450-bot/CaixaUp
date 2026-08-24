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

export function CaixaUpMark({
  height = 44,
  className = "",
}: {
  variant?: LogoVariant;
  height?: number;
  className?: string;
}) {
  return (
    <img
      src="./logo-caixaup.png"
      alt="CaixaUp"
      className={`shrink-0 object-contain ${className}`}
      style={{ height, width: height }}
    />
  );
}

function LogoType({ variant, size }: { variant: LogoVariant; size: "sm" | "md" }) {
  const isLight = variant === "light";
  return (
    <span
      className={`inline-flex font-black leading-none tracking-tight ${
        size === "sm" ? "text-xl" : "text-2xl"
      }`}
    >
      <span className={isLight ? "text-white" : "text-[#1e3a5f]"}>Caixa</span>
      <span className={isLight ? "text-[#6ee7b7]" : "text-[#10b981]"}>Up</span>
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
    return <CaixaUpMark height={markHeight} className={className} />;
  }

  return (
    <div className={`inline-flex items-center gap-3 ${className}`}>
      <CaixaUpMark height={markHeight} />
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
