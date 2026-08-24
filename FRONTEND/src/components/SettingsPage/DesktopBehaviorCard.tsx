import {
  Download,
  Keyboard,
  PanelTopClose,
  Power,
  RefreshCw,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Toast } from "@/hooks/Dialog";

const DEFAULT_PREFERENCES: DesktopPreferences = {
  startWithWindows: false,
  closeToTray: false,
  globalShortcuts: false,
  automaticUpdates: true,
};

type PreferenceRowProps = {
  title: string;
  description: string;
  icon: ReactNode;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
};

function PreferenceRow({
  title,
  description,
  icon,
  checked,
  disabled = false,
  onChange,
}: PreferenceRowProps) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border-primary py-4 last:border-b-0">
      <div className="flex min-w-0 items-start gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
          {icon}
        </span>
        <div>
          <p className="font-semibold text-text-primary">{title}</p>
          <p className="mt-0.5 text-sm text-text-secondary">{description}</p>
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full border transition disabled:cursor-not-allowed disabled:opacity-50 ${
          checked
            ? "border-success bg-success"
            : "border-border-secondary bg-bg-gray-theme"
        }`}
        aria-label={title}
      >
        <span
          className={`absolute left-1 h-6 w-6 rounded-full bg-white shadow-sm transition-transform ${
            checked ? "translate-x-6" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}

export default function DesktopBehaviorCard() {
  const desktop = window.caixaUpDesktop;
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);
  const [version, setVersion] = useState("");
  const [updateStatus, setUpdateStatus] = useState<DesktopUpdateStatus>({
    status: "idle",
    message: desktop ? "Atualizações automáticas ativas" : "Abra pelo aplicativo instalado",
  });

  useEffect(() => {
    if (!desktop) return;
    void desktop.getPreferences().then(setPreferences);
    void desktop.getAppInfo().then((info) => setVersion(info.version));
    void desktop.getUpdateStatus().then(setUpdateStatus);
    return desktop.onUpdateStatus(setUpdateStatus);
  }, [desktop]);

  const changePreference = async (key: DesktopPreferenceKey, value: boolean) => {
    if (!desktop) return;
    try {
      const next = await desktop.setPreference(key, value);
      setPreferences(next);
      Toast.success("Preferência salva.");
    } catch (error) {
      Toast.error(error instanceof Error ? error.message : "Não foi possível salvar.");
    }
  };

  const checkForUpdates = async () => {
    if (!desktop) return;
    try {
      setUpdateStatus(await desktop.checkForUpdates());
    } catch {
      Toast.error("Não foi possível verificar atualizações.");
    }
  };

  return (
    <section className="rounded-xl border border-border-primary bg-bg-primary px-4">
      <div className="border-b border-border-primary py-4">
        <h3 className="text-lg font-semibold text-text-primary">Comportamento do aplicativo</h3>
        <p className="mt-1 text-sm text-text-secondary">
          Defina como o CaixaUp inicia, fecha e recebe novas versões.
        </p>
      </div>

      <PreferenceRow
        title="Iniciar com o Windows"
        description="Abre o CaixaUp automaticamente ao ligar o computador."
        icon={<Power size={19} />}
        checked={preferences.startWithWindows}
        disabled={!desktop}
        onChange={(value) => void changePreference("startWithWindows", value)}
      />
      <PreferenceRow
        title="Fechar para a bandeja"
        description="O botão fechar mantém o CaixaUp ao lado do relógio."
        icon={<PanelTopClose size={19} />}
        checked={preferences.closeToTray}
        disabled={!desktop}
        onChange={(value) => void changePreference("closeToTray", value)}
      />
      <PreferenceRow
        title="Atalho global"
        description="Use Ctrl + Shift + C para abrir o CaixaUp de qualquer tela."
        icon={<Keyboard size={19} />}
        checked={preferences.globalShortcuts}
        disabled={!desktop}
        onChange={(value) => void changePreference("globalShortcuts", value)}
      />
      <PreferenceRow
        title="Atualizações automáticas"
        description="Ao abrir, baixa e instala sozinho a versão publicada no GitHub."
        icon={<Download size={19} />}
        checked={preferences.automaticUpdates}
        disabled={!desktop}
        onChange={(value) => void changePreference("automaticUpdates", value)}
      />

      <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-text-primary">
            {updateStatus.message}
          </p>
          <p className="mt-0.5 text-xs text-text-secondary">
            {version ? `Versão instalada: ${version}` : "Controle disponível no app para Windows"}
          </p>
          {updateStatus.status === "downloading" ? (
            <div className="mt-2 h-2 w-56 max-w-full overflow-hidden rounded-full bg-border-primary">
              <div
                className="h-full rounded-full bg-accent transition-all"
                style={{ width: `${updateStatus.percent ?? 0}%` }}
              />
            </div>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => void checkForUpdates()}
          disabled={!desktop || updateStatus.status === "checking" || updateStatus.status === "downloading"}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border-secondary bg-bg-light px-4 font-semibold text-text-primary transition hover:bg-accent/5 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw size={17} className={updateStatus.status === "checking" ? "animate-spin" : ""} />
          Verificar agora
        </button>
      </div>
    </section>
  );
}
