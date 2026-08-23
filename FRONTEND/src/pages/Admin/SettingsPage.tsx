/**
 * Arquivo: src/pages/Admin/SettingsPage.tsx
 * Objetivo: renderiza página de configurações com tema e segurança de sessões.
 * Entradas esperadas: estado do tema e callback para alternância.
 */
import { Package } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { YesNoSegmentedControl } from "@/components/Form";
import {
  SecuritySessionsCard,
  ThemeSettingsCard,
  type ActiveSession,
} from "@/components/SettingsPage";
import { Toast } from "@/hooks/Dialog";
import PageLayout from "@/layout/PageLayout";
import { sessionService } from "@/services/api/sessionService";
import {
  getSellWithoutStockEnabled,
  setSellWithoutStockEnabled,
} from "@/utils/pdvPreferences";

type ThemeMode = "light" | "dark";

type SettingsPageProps = {
  themeMode: ThemeMode;
  onToggleTheme: () => void;
};

export default function SettingsPage({
  themeMode,
  onToggleTheme,
}: SettingsPageProps) {
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [isLoading] = useState(false);
  const [sellWithoutStockEnabled, setSellWithoutStockEnabledState] = useState(() =>
    getSellWithoutStockEnabled(),
  );

  useEffect(() => {
    sessionService.list().then(setSessions).catch(() => setSessions([]));
  }, []);

  const hasOtherSessions = useMemo(
    () => sessions.some((session) => !session.current),
    [sessions],
  );

  const handleTerminateSession = async (sessionId: string) => {
    try {
      const updated = await sessionService.terminate(sessionId);
      setSessions(updated);
      Toast.success("Sessão encerrada com sucesso.");
    } catch (error) {
      Toast.error(error instanceof Error ? error.message : "Erro ao encerrar sessão.");
    }
  };

  const handleTerminateOtherSessions = async () => {
    if (!hasOtherSessions) return;
    try {
      const updated = await sessionService.terminateOthers();
      setSessions(updated);
      Toast.success("Outras sessões encerradas com sucesso.");
    } catch (error) {
      Toast.error(error instanceof Error ? error.message : "Erro ao encerrar sessões.");
    }
  };

  const handleChangeSellWithoutStock = (enabled: boolean) => {
    setSellWithoutStockEnabledState(enabled);
    setSellWithoutStockEnabled(enabled);
    Toast.success(
      enabled
        ? "Venda de produto sem estoque foi liberada."
        : "Venda de produto sem estoque foi bloqueada.",
    );
  };

  return (
    <div className="flex-1 py-4 md:py-6 lg:py-8">
      <PageLayout>
        <div className="card overflow-hidden">
          <div className="border-b border-border-primary bg-gradient-to-r from-secondary/8 via-bg-light to-accent/8 px-6 py-5">
            <h2 className="text-2xl font-semibold text-text-primary">Configurações</h2>
            <p className="mt-1 text-sm text-text-secondary">
              Personalize preferências visuais da sua experiência no sistema.
            </p>
          </div>

          <div className="space-y-4 px-6 py-6">
            <ThemeSettingsCard themeMode={themeMode} onToggleTheme={onToggleTheme} />
            <div className="rounded-xl border border-border-primary bg-bg-primary p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div className="flex gap-3">
                  <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
                    <Package size={18} />
                  </span>
                  <div>
                    <p className="text-base font-semibold text-text-primary">Vender sem estoque</p>
                    <p className="mt-1 text-sm text-text-secondary">
                      Permite colocar no cupom produtos que estão com quantidade zero. O estoque permanece em zero.
                    </p>
                  </div>
                </div>
                <YesNoSegmentedControl
                  value={sellWithoutStockEnabled}
                  onChange={handleChangeSellWithoutStock}
                  ariaLabel="Permitir vender produtos sem estoque"
                />
              </div>
            </div>
            <SecuritySessionsCard
              sessions={sessions}
              isLoading={isLoading}
              onTerminateSession={handleTerminateSession}
              onTerminateOtherSessions={handleTerminateOtherSessions}
            />
          </div>
        </div>
      </PageLayout>
    </div>
  );
}
