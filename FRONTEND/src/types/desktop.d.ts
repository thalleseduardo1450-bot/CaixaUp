export {};

declare global {
  type DesktopPreferenceKey =
    | "startWithWindows"
    | "closeToTray"
    | "globalShortcuts"
    | "automaticUpdates"
    | "fitSmallScreens";

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
