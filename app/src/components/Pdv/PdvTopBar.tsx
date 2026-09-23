/**
 * Arquivo: src/components/Pdv/PdvTopBar.tsx
 * Objetivo: barra superior da frente de caixa com status do caixa, operador e controles de conforto.
 * Entradas esperadas: dados de sessão do caixa, nome do operador e callbacks dos botões.
 *
 * A barra é fina de propósito: cada pixel gasto aqui é pixel que falta para a
 * lista de produtos e para o cupom. O que fica aqui é só o que o operador precisa
 * conferir de relance (caixa aberto? quem sou eu? que hora é?) e os interruptores
 * que ele mexe uma vez por turno.
 */
import {
  Boxes,
  HelpCircle,
  LayoutGrid,
  LogOut,
  Maximize2,
  Minimize2,
  Moon,
  Rows3,
  Sun,
  Volume2,
  VolumeX,
} from "lucide-react";

import { CaixaUpMark } from "@/components/Brand/CaixaUpLogo";
import type { PdvDensity } from "@/types/pdv";

type PdvTopBarProps = {
  operatorName: string;
  /** Texto pronto do status: "Caixa aberto desde 08:12". */
  cashStatusLabel: string;
  /** false pinta o status em vermelho e some com o "desde". */
  cashIsOpen: boolean;
  /** Hora corrente já formatada, atualizada pelo relógio da página. */
  clock: string;
  themeMode: "light" | "dark";
  density: PdvDensity;
  soundEnabled: boolean;
  isFullscreen: boolean;
  onToggleTheme: () => void;
  onToggleDensity: () => void;
  onToggleSound: () => void;
  onToggleFullscreen: () => void;
  onOpenHelp: () => void;
  onOpenManagement: () => void;
  onExit: () => void;
};

/** Botão quadrado da barra: alvo de 44px, que é o mínimo confortável no toque. */
function BarButton({
  label,
  onClick,
  active = false,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={`grid h-11 w-11 place-items-center rounded-lg border transition ${
        active
          ? "border-accent bg-accent/15 text-accent"
          : "border-border-primary bg-bg-light text-text-secondary hover:border-accent hover:text-accent"
      }`}
    >
      {children}
    </button>
  );
}

export default function PdvTopBar({
  operatorName,
  cashStatusLabel,
  cashIsOpen,
  clock,
  themeMode,
  density,
  soundEnabled,
  isFullscreen,
  onToggleTheme,
  onToggleDensity,
  onToggleSound,
  onToggleFullscreen,
  onOpenHelp,
  onOpenManagement,
  onExit,
}: PdvTopBarProps) {
  return (
    <header className="pdv-panel-header flex shrink-0 flex-wrap items-center gap-3 border-b border-border-primary px-4 py-2.5">
      {/* Identificação da tela */}
      <div className="flex items-center gap-3">
        <CaixaUpMark height={44} />
        <div className="leading-tight">
          <p className="font-display text-lg font-bold text-text-primary">
            Frente de caixa
          </p>
          <p className="text-xs text-text-tertiary">CaixaUp PDV</p>
        </div>
      </div>

      {/* Status do caixa: a informação que impede uma venda de ser perdida */}
      <div
        className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold ${
          cashIsOpen
            ? "border-success/40 bg-success/10 text-success"
            : "border-primary/40 bg-primary/10 text-primary"
        }`}
      >
        <span
          className={`h-2.5 w-2.5 rounded-full ${
            cashIsOpen ? "bg-success" : "bg-primary"
          }`}
          aria-hidden="true"
        />
        {cashStatusLabel}
      </div>

      <div className="ml-auto flex flex-wrap items-center gap-3">
        {/* Operador e relógio */}
        <div className="hidden text-right leading-tight sm:block">
          <p className="text-sm font-semibold text-text-primary">
            {operatorName || "Operador"}
          </p>
          <p
            className="font-mono text-xs text-text-tertiary"
            aria-label={`Hora atual ${clock}`}
          >
            {clock}
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onOpenManagement}
            className="flex h-11 items-center gap-2 rounded-lg border border-border-primary bg-bg-light px-3 text-sm font-semibold text-text-secondary transition hover:border-accent hover:text-accent"
            title="Abrir produtos e clientes"
          >
            <Boxes size={18} />
            <span className="hidden xl:inline">Cadastros</span>
          </button>

          <BarButton
            label={
              density === "confortavel"
                ? "Densidade: confortável (clique para compactar)"
                : "Densidade: compacta (clique para ampliar)"
            }
            active={density === "compacta"}
            onClick={onToggleDensity}
          >
            {density === "confortavel" ? (
              <LayoutGrid size={19} />
            ) : (
              <Rows3 size={19} />
            )}
          </BarButton>

          <BarButton
            label={soundEnabled ? "Som do bipe ligado" : "Som do bipe desligado"}
            active={soundEnabled}
            onClick={onToggleSound}
          >
            {soundEnabled ? <Volume2 size={19} /> : <VolumeX size={19} />}
          </BarButton>

          <BarButton
            label={themeMode === "dark" ? "Tema escuro" : "Tema claro"}
            active={themeMode === "dark"}
            onClick={onToggleTheme}
          >
            {themeMode === "dark" ? <Moon size={19} /> : <Sun size={19} />}
          </BarButton>

          <BarButton
            label={isFullscreen ? "Sair da tela cheia" : "Tela cheia"}
            active={isFullscreen}
            onClick={onToggleFullscreen}
          >
            {isFullscreen ? <Minimize2 size={19} /> : <Maximize2 size={19} />}
          </BarButton>

          <BarButton label="Atalhos do teclado (F1)" onClick={onOpenHelp}>
            <HelpCircle size={19} />
          </BarButton>
        </div>

        <button
          type="button"
          onClick={onExit}
          className="flex h-11 items-center gap-2 rounded-lg border border-border-secondary bg-bg-light px-4 text-sm font-semibold text-text-secondary transition hover:border-primary hover:text-primary"
        >
          <LogOut size={18} />
          Sair
        </button>
      </div>
    </header>
  );
}
