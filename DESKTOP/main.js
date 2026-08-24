/**
 * Arquivo: DESKTOP/main.js
 * Objetivo: processo principal do Electron do CaixaUp (frente de caixa).
 *
 * NÃO existe mais banco local nem API .NET: o frontend compilado fala direto
 * com o Supabase (nuvem), protegido pelo RLS. O app só precisa de internet.
 * Serve o frontend em 127.0.0.1:4173 e abre a janela do PDV.
 */
const {
  app,
  BrowserWindow,
  Menu,
  Tray,
  dialog,
  globalShortcut,
  ipcMain,
  screen,
  shell,
} = require("electron");
const { autoUpdater } = require("electron-updater");
const http = require("http");
const fs = require("fs");
const path = require("path");

const WEB_PORT = 4173;
const WEB_ORIGIN = `http://127.0.0.1:${WEB_PORT}`;

const packaged = app.isPackaged;
const webDir = packaged
  ? path.join(process.resourcesPath, "web")
  : path.join(__dirname, "..", "FRONTEND", "dist");

let webServer = null;
let splash = null;
let mainWindow = null;
let updatePromptShown = false;
let tray = null;
let appIsQuitting = false;
let updateStatus = { status: "idle", message: "Atualizações automáticas ativas" };

const DEFAULT_DESKTOP_PREFERENCES = {
  startWithWindows: false,
  closeToTray: true,
  globalShortcuts: true,
  automaticUpdates: true,
};

let desktopPreferences = { ...DEFAULT_DESKTOP_PREFERENCES };

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json; charset=utf-8",
};

function startWebServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
      let filePath = path.join(webDir, urlPath);

      if (!filePath.startsWith(webDir)) {
        res.writeHead(403).end("Forbidden");
        return;
      }
      // SPA: qualquer rota desconhecida cai no index.html
      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        filePath = path.join(webDir, "index.html");
      }
      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404).end("Not found");
          return;
        }
        res.writeHead(200, {
          "Content-Type": MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream",
          "Cache-Control": "no-cache",
        });
        res.end(data);
      });
    });

    server.on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        reject(
          new Error(
            "Outra versão do CaixaUp ainda está aberta. Feche todas as janelas do CaixaUp e tente novamente.",
          ),
        );
      } else reject(err);
    });

    server.listen(WEB_PORT, "127.0.0.1", () => {
      console.log(`[web] servindo ${webDir} em ${WEB_ORIGIN}`);
      resolve(server);
    });
  });
}

// ----------------------------------------------------------------- janela ---

const REF_W = 1440;
const REF_H = 810;
const MIN_CSS_W = 1024;
const MIN_CSS_H = 620;
const ZOOM_MIN = 1.0;
const ZOOM_MAX = 1.5;

let zoomAtual = 1;

function computeZoom() {
  const display = screen.getPrimaryDisplay();
  const { width: w, height: h } = display.workAreaSize;
  const alvo = Math.min(w / REF_W, h / REF_H);
  const teto = Math.min(w / MIN_CSS_W, h / MIN_CSS_H);
  const z = Math.min(alvo, teto, ZOOM_MAX);
  const zoom = Math.max(ZOOM_MIN, Math.round(z * 20) / 20);
  console.log(`[janela] area util ${w}x${h} (escala do Windows ${display.scaleFactor}x) -> zoom ${zoom}`);
  return zoom;
}

function createSplash() {
  const zoom = computeZoom();
  splash = new BrowserWindow({
    width: Math.round(460 * zoom),
    height: Math.round(300 * zoom),
    frame: false,
    resizable: false,
    center: true,
    show: true,
    backgroundColor: "#2563EB",
    webPreferences: { contextIsolation: true, nodeIntegration: false, zoomFactor: zoom },
  });
  splash.loadFile(path.join(__dirname, "splash.html"));
}

function createMainWindow() {
  zoomAtual = computeZoom();
  const wa = screen.getPrimaryDisplay().workAreaSize;

  mainWindow = new BrowserWindow({
    width: Math.min(1440, wa.width),
    height: Math.min(900, wa.height),
    minWidth: Math.min(1024, wa.width),
    minHeight: Math.min(700, wa.height),
    show: false,
    backgroundColor: "#f8fafc",
    autoHideMenuBar: true,
    icon: path.join(__dirname, "build", "icon.png"),
    title: "CaixaUp",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js"),
      zoomFactor: zoomAtual,
    },
  });

  mainWindow.setMenuBarVisibility(false);

  mainWindow.webContents.on("console-message", (_e, nivel, mensagem, linha, origem) => {
    if (nivel < 2) return;
    console.log(`[tela] ${mensagem}${origem ? ` (${origem}:${linha})` : ""}`);
  });
  mainWindow.webContents.on("did-fail-load", (_e, cod, desc, url) => {
    console.log(`[tela] falha ao carregar ${url}: ${desc} (${cod})`);
  });

  mainWindow.loadURL(WEB_ORIGIN);

  let janelaExibida = false;
  const exibirJanela = (origem) => {
    if (janelaExibida) return;
    if (!mainWindow || mainWindow.isDestroyed()) return;
    janelaExibida = true;
    console.log(`[janela] exibindo (disparado por: ${origem})`);
    if (splash && !splash.isDestroyed()) splash.destroy();
    mainWindow.maximize();
    mainWindow.show();
  };

  mainWindow.once("ready-to-show", () => exibirJanela("ready-to-show"));
  mainWindow.webContents.once("did-finish-load", () => exibirJanela("did-finish-load"));
  setTimeout(() => exibirJanela("prazo maximo"), 20000);

  mainWindow.webContents.on("did-finish-load", () => {
    mainWindow.webContents.setZoomFactor(zoomAtual);
    mainWindow.webContents.setVisualZoomLevelLimits(1, 1);
  });

  screen.on("display-metrics-changed", () => {
    const novo = computeZoom();
    if (novo === zoomAtual) return;
    zoomAtual = novo;
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.setZoomFactor(novo);
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("close", (event) => {
    if (!desktopPreferences.closeToTray || appIsQuitting) return;
    event.preventDefault();
    mainWindow.hide();
  });
}

function sanitizarUserAgent() {
  const original = app.userAgentFallback || "";
  const limpo = original.replace(/[^\x20-\x7E]/g, "");
  if (limpo !== original) {
    app.userAgentFallback = limpo;
    console.log(`[rede] User-Agent sem caracteres nao-ASCII: ${limpo}`);
  }
}

function getUpdateStatePath() {
  return path.join(app.getPath("userData"), "caixaup-update.json");
}

function getDesktopPreferencesPath() {
  return path.join(app.getPath("userData"), "caixaup-preferences.json");
}

function loadDesktopPreferences() {
  try {
    const preferencesPath = getDesktopPreferencesPath();
    if (!fs.existsSync(preferencesPath)) return;
    desktopPreferences = {
      ...DEFAULT_DESKTOP_PREFERENCES,
      ...JSON.parse(fs.readFileSync(preferencesPath, "utf8")),
    };
  } catch (error) {
    console.log(`[preferencias] nao foi possivel carregar: ${error.message || error}`);
  }
}

function saveDesktopPreferences() {
  fs.writeFileSync(
    getDesktopPreferencesPath(),
    JSON.stringify(desktopPreferences, null, 2),
    "utf8",
  );
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function configureTray() {
  if (!desktopPreferences.closeToTray) {
    if (tray) tray.destroy();
    tray = null;
    return;
  }
  if (tray) return;
  tray = new Tray(path.join(__dirname, "build", "icon.png"));
  tray.setToolTip("CaixaUp");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Abrir CaixaUp", click: showMainWindow },
      { type: "separator" },
      {
        label: "Sair",
        click: () => {
          appIsQuitting = true;
          app.quit();
        },
      },
    ]),
  );
  tray.on("double-click", showMainWindow);
}

function configureGlobalShortcuts() {
  globalShortcut.unregisterAll();
  if (!desktopPreferences.globalShortcuts) return;
  globalShortcut.register("CommandOrControl+Shift+C", showMainWindow);
}

function applyDesktopPreferences() {
  if (packaged) {
    app.setLoginItemSettings({
      openAtLogin: desktopPreferences.startWithWindows,
      path: process.execPath,
    });
  }
  configureTray();
  configureGlobalShortcuts();
}

function sendUpdateStatus(nextStatus) {
  updateStatus = { ...updateStatus, ...nextStatus };
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("desktop:update-status", updateStatus);
  }
}

function formatReleaseNotes(releaseNotes) {
  const text = Array.isArray(releaseNotes)
    ? releaseNotes
        .map((entry) => `${entry.version ? `Versão ${entry.version}\n` : ""}${entry.note || ""}`)
        .join("\n\n")
    : String(releaseNotes || "");
  return text
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 1800);
}

function savePendingUpdate(info) {
  try {
    fs.writeFileSync(
      getUpdateStatePath(),
      JSON.stringify({ version: info.version, notes: formatReleaseNotes(info.releaseNotes) }),
      "utf8",
    );
  } catch (error) {
    console.log(`[atualizacao] nao foi possivel salvar o resumo: ${error.message || error}`);
  }
}

async function showInstalledUpdate() {
  try {
    const statePath = getUpdateStatePath();
    if (!fs.existsSync(statePath)) return;
    const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
    if (state.version !== app.getVersion()) return;
    fs.unlinkSync(statePath);
    mainWindow.webContents.send("desktop:update-installed", {
      version: state.version,
      notes: state.notes || "A nova versão foi instalada com sucesso.",
    });
  } catch (error) {
    console.log(`[atualizacao] nao foi possivel mostrar o resumo: ${error.message || error}`);
  }
}

function configureAutoUpdater() {
  if (!packaged) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;
  autoUpdater.fullChangelog = true;

  autoUpdater.on("error", (error) => {
    console.log(`[atualizacao] falha: ${error.message || error}`);
    sendUpdateStatus({ status: "error", message: "Não foi possível verificar atualizações" });
  });

  autoUpdater.on("update-available", (info) => {
    console.log(`[atualizacao] versao ${info.version} encontrada; baixando`);
    sendUpdateStatus({
      status: "downloading",
      version: info.version,
      percent: 0,
      message: `Baixando a versão ${info.version}`,
    });
  });

  autoUpdater.on("update-not-available", () => {
    console.log("[atualizacao] CaixaUp ja esta atualizado");
    sendUpdateStatus({ status: "updated", message: "CaixaUp está atualizado", percent: 100 });
  });

  autoUpdater.on("download-progress", (progress) => {
    sendUpdateStatus({
      status: "downloading",
      percent: Math.round(progress.percent),
      message: `Baixando atualização: ${Math.round(progress.percent)}%`,
    });
  });

  autoUpdater.on("update-downloaded", async (info) => {
    if (updatePromptShown) return;
    updatePromptShown = true;
    savePendingUpdate(info);

    sendUpdateStatus({
      status: "installing",
      version: info.version,
      percent: 100,
      message: `Instalando a versão ${info.version}`,
    });
    setTimeout(() => autoUpdater.quitAndInstall(false, true), 1800);
  });

  const checkForUpdates = () => {
    if (!desktopPreferences.automaticUpdates) return;
    sendUpdateStatus({ status: "checking", message: "Procurando atualizações" });
    autoUpdater.checkForUpdates().catch((error) => {
      console.log(`[atualizacao] nao foi possivel verificar: ${error.message || error}`);
    });
  };

  setTimeout(checkForUpdates, 3000);
}

function configureDesktopIpc() {
  ipcMain.handle("desktop:preferences:get", () => ({ ...desktopPreferences }));
  ipcMain.handle("desktop:preferences:set", (_event, { key, value }) => {
    if (!Object.hasOwn(DEFAULT_DESKTOP_PREFERENCES, key) || typeof value !== "boolean") {
      throw new Error("Preferência inválida.");
    }
    desktopPreferences[key] = value;
    saveDesktopPreferences();
    applyDesktopPreferences();
    return { ...desktopPreferences };
  });
  ipcMain.handle("desktop:app-info", () => ({
    version: app.getVersion(),
    packaged,
  }));
  ipcMain.handle("desktop:update-status", () => updateStatus);
  ipcMain.handle("desktop:update-check", async () => {
    if (!packaged) {
      return { status: "development", message: "Disponível somente no aplicativo instalado" };
    }
    sendUpdateStatus({ status: "checking", message: "Procurando atualizações" });
    await autoUpdater.checkForUpdates();
    return updateStatus;
  });
}

app.whenReady().then(async () => {
  sanitizarUserAgent();
  loadDesktopPreferences();
  configureDesktopIpc();
  createSplash();
  try {
    webServer = await startWebServer();
    createMainWindow();
    applyDesktopPreferences();
    configureAutoUpdater();
    setTimeout(() => void showInstalledUpdate(), 2500);
  } catch (err) {
    if (splash && !splash.isDestroyed()) splash.destroy();
    dialog.showErrorBox("CaixaUp - falha ao iniciar", String(err.message || err));
    app.quit();
  }
});

app.on("window-all-closed", () => {
  if (desktopPreferences.closeToTray && !appIsQuitting) return;
  if (webServer) webServer.close();
  app.quit();
});

app.on("before-quit", () => {
  appIsQuitting = true;
  globalShortcut.unregisterAll();
  if (webServer) webServer.close();
});
