export {};

declare global {
  type DesktopPreferenceKey =
    | "startWithWindows"
    | "globalShortcuts"
    | "automaticUpdates"
    | "fitSmallScreens"
    | "alwaysAnimate";

  type DesktopPreferences = Record<DesktopPreferenceKey, boolean>;

  type DesktopUpdateStatus = {
    status: "idle" | "checking" | "downloading" | "installing" | "updated" | "error" | "development";
    message: string;
    version?: string;
    percent?: number;
  };

  type DesktopInstalledUpdate = {
    version: string;
    notes: string;
  };

  interface Window {
    caixaUpDesktop?: {
      /** A janela do caixa ainda vai aparecer, depois da abertura animada. */
      aberturaPendente?: boolean;
      /** Chama quando a janela do caixa aparece (na hora, se já apareceu). */
      onJanelaExibida?: (callback: () => void) => () => void;
      getPreferences: () => Promise<DesktopPreferences>;
      setPreference: (
        key: DesktopPreferenceKey,
        value: boolean,
      ) => Promise<DesktopPreferences>;
      getAppInfo: () => Promise<{ version: string; packaged: boolean }>;
      getUpdateStatus: () => Promise<DesktopUpdateStatus>;
      checkForUpdates: () => Promise<DesktopUpdateStatus>;
      onUpdateStatus: (callback: (status: DesktopUpdateStatus) => void) => () => void;
      onUpdateInstalled: (callback: (update: DesktopInstalledUpdate) => void) => () => void;
    };
  }
}
