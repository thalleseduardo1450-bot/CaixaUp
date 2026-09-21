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
const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (process.platform === "win32") app.setAsDefaultProtocolClient("caixaup");

if (!hasSingleInstanceLock) {
  app.quit();
}

const packaged = app.isPackaged;
const webDir = packaged
  ? path.join(process.resourcesPath, "web")
  : path.join(__dirname, "..", "FRONTEND", "dist");

let webServer = null;
let splash = null;
let splashFinished = Promise.resolve();
let mainWindow = null;
let updatePromptShown = false;
let appIsQuitting = false;
let updateStatus = { status: "idle", message: "Atualizações automáticas ativas" };
let pendingAuthCallback = null;

const DEFAULT_DESKTOP_PREFERENCES = {
  startWithWindows: false,
  globalShortcuts: true,
  automaticUpdates: true,
  fitSmallScreens: true,
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
  ".mp4": "video/mp4",
  ".webm": "video/webm",
};

function isContainedPath(root, target) {
  const relative = path.relative(root, target);
  return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function isTrustedUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" && url.origin === WEB_ORIGIN && !url.username && !url.password;
  } catch {
    return false;
  }
}

function openExternalLink(value) {
  try {
    if (typeof value !== "string" || /[\s\u0000-\u001f\u007f\\]/.test(value)) return;
    const url = new URL(value);
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password) return;
    void shell.openExternal(url.href).catch((error) => {
      console.log(`[rede] nao foi possivel abrir link: ${error.message || error}`);
    });
  } catch {
    return;
  }
}

function acceptAuthCallback(value) {
  if (typeof value !== "string" || !value.startsWith("caixaup://auth/callback")) return;
  try {
    const url = new URL(value);
    if (url.searchParams.has("code") || url.hash.includes("access_token")) {
      pendingAuthCallback = value;
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("desktop:auth:callback", value);
    }
  } catch {
    return;
  }
}

for (const argument of process.argv) acceptAuthCallback(argument);
app.on("second-instance", (_event, commandLine) => {
  for (const argument of commandLine) acceptAuthCallback(argument);
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

function startWebServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      res.setHeader("X-Content-Type-Options", "nosniff");
      const isOpeningMotion = req.url?.split("?")[0] === "/opening-motion.html";
      res.setHeader("X-Frame-Options", isOpeningMotion ? "SAMEORIGIN" : "DENY");
      res.setHeader("Referrer-Policy", "no-referrer");
      res.setHeader(
        "Content-Security-Policy",
        `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https://*.supabase.co https://caixaup-api.squareweb.app https://viacep.com.br https://brasilapi.com.br https://opencep.com https://world.openfoodfacts.org; frame-src ${WEB_ORIGIN}/opening-motion.html; base-uri 'self'; object-src 'none'; frame-ancestors ${isOpeningMotion ? "'self'" : "'none'"}; form-action 'self'`,
      );
      res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
      res.setHeader("Cache-Control", "no-store");
      if (req.headers.host !== `127.0.0.1:${WEB_PORT}`) {
        res.writeHead(403).end("Forbidden");
        return;
      }
      if (req.method !== "GET" && req.method !== "HEAD") {
        res.writeHead(405, { Allow: "GET, HEAD" }).end("Method not allowed");
        return;
      }
      let urlPath;
      try {
        if (!req.url || !req.url.startsWith("/") || req.url.startsWith("//")) throw new Error("Invalid URL");
        const url = new URL(req.url, WEB_ORIGIN);
        if (!isTrustedUrl(url.href)) throw new Error("Invalid URL");
        if (url.pathname === "/auth/callback/" && url.searchParams.has("code")) {
          const callback = new URL("caixaup://auth/callback/");
          callback.search = url.search;
          acceptAuthCallback(callback.toString());
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
          res.end("<!doctype html><title>CaixaUp</title><p>Login recebido. Volte para o CaixaUp.</p>");
          return;
        }
        urlPath = decodeURIComponent(req.url.split("?")[0]);
        if (/[\u0000-\u001f\u007f\\:#]/.test(urlPath)) throw new Error("Invalid path");
      } catch {
        res.writeHead(400).end("Bad request");
        return;
      }
      let filePath = path.resolve(webDir, `.${urlPath}`);
      if (path.extname(filePath).toLowerCase() === ".map") {
        res.writeHead(404).end("Not found");
        return;
      }
      if (!isContainedPath(webDir, filePath)) {
        res.writeHead(403).end("Forbidden");
        return;
      }
      try {
        let stat;
        try {
          stat = await fs.promises.stat(filePath);
        } catch (error) {
          if (error.code !== "ENOENT" && error.code !== "ENOTDIR") throw error;
        }
        if (!stat || stat.isDirectory()) {
          filePath = path.join(webDir, "index.html");
        }
        const root = await fs.promises.realpath(webDir);
        filePath = await fs.promises.realpath(filePath);
        if (!isContainedPath(root, filePath)) {
          res.writeHead(403).end("Forbidden");
          return;
        }
        const data = await fs.promises.readFile(filePath);
        res.writeHead(200, {
          "Content-Type": MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream",
        });
        res.end(req.method === "HEAD" ? undefined : data);
      } catch {
        res.writeHead(404).end("Not found");
      }
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

const REF_W = 1280;
const REF_H = 720;
const ZOOM_MIN = 0.8;
const ZOOM_MAX = 1;

let zoomAtual = 1;

function computeZoom() {
  const window = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
  const display = window ? screen.getDisplayMatching(window.getBounds()) : screen.getPrimaryDisplay();
  const available = window && window.isFullScreen() ? display.bounds : display.workArea;
  const content = window ? window.getContentBounds() : available;
  const width = Math.min(content.width, available.width);
  const height = Math.min(content.height, available.height);
  if (!desktopPreferences.fitSmallScreens) return 1;
  const alvo = Math.min(width / REF_W, height / REF_H);
  const z = Math.min(alvo, ZOOM_MAX);
  const zoom = Math.max(ZOOM_MIN, Math.round(z * 20) / 20);
  console.log(`[janela] area util ${width}x${height} (escala do Windows ${display.scaleFactor}x) -> zoom ${zoom}`);
  return zoom;
}

function applyWindowZoom() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  zoomAtual = computeZoom();
  mainWindow.webContents.setZoomFactor(zoomAtual);
}

function createSplash() {
  const zoom = computeZoom();
  let finishSplash = () => {};
  splash = new BrowserWindow({
    width: Math.round(760 * zoom),
    height: Math.round(428 * zoom),
    frame: false,
    resizable: false,
    center: true,
    show: false,
    backgroundColor: "#ffffff",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      zoomFactor: zoom,
      backgroundThrottling: false,
      autoplayPolicy: "no-user-gesture-required",
      preload: path.join(__dirname, "splash-preload.js"),
    },
  });
  splashFinished = new Promise((resolve) => {
    let completed = false;
    let finishTimer = null;
    const finish = () => {
      if (completed) return;
      completed = true;
      clearTimeout(fallback);
      clearTimeout(finishTimer);
      ipcMain.removeListener("desktop:splash:state", onPlaybackState);
      resolve();
    };
    finishSplash = finish;
    const onPlaybackState = (event, state) => {
      if (!splash || splash.isDestroyed() || event.sender !== splash.webContents) return;
      if (state === "finished" || state === "skipped" || state === "dismissed") finish();
      if (state === "failed") finishTimer = setTimeout(finish, 500);
    };
    const fallback = setTimeout(finish, 15000);
    ipcMain.on("desktop:splash:state", onPlaybackState);
    splash.once("ready-to-show", () => {
      if (!splash || splash.isDestroyed()) return;
      splash.show();
      splash.webContents.send("desktop:splash:play");
    });
  });
  splash.webContents.on("will-navigate", (event) => event.preventDefault());
  splash.webContents.on("will-frame-navigate", (event) => event.preventDefault());
  splash.webContents.on("will-redirect", (event) => event.preventDefault());
  splash.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  splash.loadFile(path.join(webDir, "opening-motion.html")).catch(() => {
    if (!splash || splash.isDestroyed()) return;
    splash.loadFile(path.join(__dirname, "splash.html"));
    setTimeout(finishSplash, 1200);
  });
}

function createMainWindow() {
  zoomAtual = computeZoom();
  const wa = screen.getPrimaryDisplay().workArea;
  const width = Math.min(1280, Math.floor(wa.width * 0.9));
  const height = Math.min(800, Math.floor(wa.height * 0.9));

  mainWindow = new BrowserWindow({
    x: wa.x + Math.floor((wa.width - width) / 2),
    y: wa.y + Math.floor((wa.height - height) / 2),
    width,
    height,
    minWidth: Math.min(800, width),
    minHeight: Math.min(600, height),
    show: false,
    backgroundColor: "#f8fafc",
    autoHideMenuBar: true,
    frame: false,
    roundedCorners: false,
    icon: path.join(__dirname, "build", "icon.png"),
    title: "CaixaUp",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "preload.js"),
      zoomFactor: zoomAtual,
    },
  });

  mainWindow.setMenuBarVisibility(false);
  const blockExternalNavigation = (event, url) => {
    if (!isTrustedUrl(url || event.url)) event.preventDefault();
  };
  mainWindow.webContents.on("will-navigate", blockExternalNavigation);
  mainWindow.webContents.on("will-frame-navigate", (event) => blockExternalNavigation(event, event.url));
  mainWindow.webContents.on("will-redirect", blockExternalNavigation);
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternalLink(url);
    return { action: "deny" };
  });
  mainWindow.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  mainWindow.webContents.session.setPermissionCheckHandler(() => false);

  mainWindow.webContents.on("console-message", (_e, nivel, mensagem, linha, origem) => {
    if (nivel < 2) return;
    console.log(`[tela] ${mensagem}${origem ? ` (${origem}:${linha})` : ""}`);
  });
  mainWindow.webContents.on("did-fail-load", (_e, cod, desc, url) => {
    console.log(`[tela] falha ao carregar ${url}: ${desc} (${cod})`);
  });

  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    try {
      fs.appendFileSync(path.join(app.getPath("userData"), "caixaup-stability.log"), `${new Date().toISOString()} renderer=${details.reason} exit=${details.exitCode}\n`);
    } catch {}
  });
  mainWindow.on("unresponsive", () => {
    try {
      fs.appendFileSync(path.join(app.getPath("userData"), "caixaup-stability.log"), `${new Date().toISOString()} unresponsive\n`);
    } catch {}
  });

  mainWindow.loadURL(WEB_ORIGIN);

  let janelaExibida = false;
  const exibirJanela = async (origem) => {
    if (janelaExibida) return;
    if (!mainWindow || mainWindow.isDestroyed()) return;
    janelaExibida = true;
    // A abertura toca inteira; quem atalha é o botão Pular do canto.
    await splashFinished;
    if (!mainWindow || mainWindow.isDestroyed()) return;
    console.log(`[janela] exibindo (disparado por: ${origem})`);
    if (splash && !splash.isDestroyed()) splash.destroy();
    mainWindow.maximize();
    mainWindow.show();
  };

  mainWindow.once("ready-to-show", () => exibirJanela("ready-to-show"));
  mainWindow.webContents.once("did-finish-load", () => exibirJanela("did-finish-load"));
  setTimeout(() => exibirJanela("prazo maximo"), 20000);

  mainWindow.webContents.on("did-finish-load", () => {
    applyWindowZoom();
    mainWindow.webContents.setVisualZoomLevelLimits(1, 1);
    sendWindowState();
  });

  let resizeTimer = null;
  const scheduleZoom = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(applyWindowZoom, 120);
  };
  mainWindow.on("resize", scheduleZoom);
  mainWindow.on("move", scheduleZoom);
  screen.on("display-metrics-changed", scheduleZoom);
  for (const eventName of ["maximize", "unmaximize", "enter-full-screen", "leave-full-screen"]) {
    mainWindow.on(eventName, () => {
      sendWindowState();
      scheduleZoom();
    });
  }
  mainWindow.on("closed", () => {
    clearTimeout(resizeTimer);
    screen.removeListener("display-metrics-changed", scheduleZoom);
  });

  mainWindow.on("close", () => {
    appIsQuitting = true;
    BrowserWindow.getAllWindows().forEach((window) => {
      if (window !== mainWindow && !window.isDestroyed()) window.destroy();
    });
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

function getUpdateLogPath() {
  return path.join(app.getPath("userData"), "caixaup-updater.log");
}

function logUpdate(message, error) {
  const detail = error ? `: ${error.message || error}` : "";
  const line = `[${new Date().toISOString()}] ${message}${detail}`;
  console.log(`[atualizacao] ${message}${detail}`);
  try {
    fs.appendFileSync(getUpdateLogPath(), `${line}\n`, "utf8");
  } catch {
    // O log é auxiliar e não pode interromper o aplicativo.
  }
}

function getDesktopPreferencesPath() {
  return path.join(app.getPath("userData"), "caixaup-preferences.json");
}

function loadDesktopPreferences() {
  try {
    const preferencesPath = getDesktopPreferencesPath();
    if (!fs.existsSync(preferencesPath)) return;
    const preferences = JSON.parse(fs.readFileSync(preferencesPath, "utf8"));
    if (!preferences || typeof preferences !== "object" || Array.isArray(preferences)) return;
    for (const key of Object.keys(DEFAULT_DESKTOP_PREFERENCES)) {
      if (Object.hasOwn(preferences, key) && typeof preferences[key] === "boolean") {
        desktopPreferences[key] = preferences[key];
      }
    }
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

async function showMainWindow() {
  await splashFinished;
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

app.on("second-instance", showMainWindow);

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
  configureGlobalShortcuts();
  if (mainWindow && !mainWindow.isDestroyed()) {
    applyWindowZoom();
  }
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
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowPrerelease = false;
  autoUpdater.fullChangelog = true;

  autoUpdater.on("error", (error) => {
    logUpdate("Falha no atualizador", error);
    sendUpdateStatus({
      status: "error",
      message: `Falha na atualização: ${error.message || error}`,
    });
  });

  autoUpdater.on("before-quit-for-update", () => {
    appIsQuitting = true;
  });

  autoUpdater.on("update-available", (info) => {
    logUpdate(`Versão ${info.version} encontrada; iniciando download`);
    sendUpdateStatus({
      status: "downloading",
      version: info.version,
      percent: 0,
      message: `Baixando a versão ${info.version}`,
    });
  });

  autoUpdater.on("update-not-available", () => {
    logUpdate("CaixaUp já está atualizado");
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
    logUpdate(`Versão ${info.version} baixada; encerrando para instalar`);
    appIsQuitting = true;
    setTimeout(() => {
      logUpdate(`Executando instalador da versão ${info.version}`);
      autoUpdater.quitAndInstall(true, true);
    }, 700);
  });

  const checkForUpdates = () => {
    if (!desktopPreferences.automaticUpdates) return;
    sendUpdateStatus({ status: "checking", message: "Procurando atualizações" });
    autoUpdater.checkForUpdates().catch((error) => {
      logUpdate("Não foi possível verificar atualizações", error);
    });
  };

  setTimeout(checkForUpdates, 3000);
}

function getWindowState() {
  return {
    maximized: !!mainWindow && !mainWindow.isDestroyed() && mainWindow.isMaximized(),
    fullscreen: !!mainWindow && !mainWindow.isDestroyed() && mainWindow.isFullScreen(),
  };
}

function sendWindowState() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("desktop:window:state", getWindowState());
  }
}

function handleDesktopIpc(channel, handler) {
  ipcMain.handle(channel, (event, ...args) => {
    if (
      !mainWindow || mainWindow.isDestroyed() ||
      event.sender !== mainWindow.webContents ||
      !event.senderFrame || event.senderFrame !== mainWindow.webContents.mainFrame ||
      !isTrustedUrl(event.senderFrame.url)
    ) {
      throw new Error("Origem IPC não autorizada.");
    }
    return handler(...args);
  });
}

function configureDesktopIpc() {
  handleDesktopIpc("desktop:open-external", (value) => {
    if (typeof value !== "string") return false;
    openExternalLink(value);
    return /^https:\/\//.test(value);
  });
  handleDesktopIpc("desktop:auth:pending", () => {
    const callback = pendingAuthCallback;
    pendingAuthCallback = null;
    return callback;
  });
  handleDesktopIpc("desktop:window:state", getWindowState);
  handleDesktopIpc("desktop:window:minimize", () => {
    if (!mainWindow || mainWindow.isDestroyed()) return false;
    mainWindow.minimize();
    return true;
  });
  handleDesktopIpc("desktop:window:toggle-maximize", () => {
    if (!mainWindow || mainWindow.isDestroyed()) return false;
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
    return mainWindow.isMaximized();
  });
  handleDesktopIpc("desktop:window:close", () => {
    if (!mainWindow || mainWindow.isDestroyed()) return false;
    mainWindow.close();
    return true;
  });
  handleDesktopIpc("desktop:preferences:get", () => ({ ...desktopPreferences }));
  handleDesktopIpc("desktop:preferences:set", (preferences) => {
    if (
      !preferences || typeof preferences !== "object" || Array.isArray(preferences) ||
      !Object.hasOwn(preferences, "key") || !Object.hasOwn(preferences, "value") ||
      typeof preferences.key !== "string" ||
      !Object.hasOwn(DEFAULT_DESKTOP_PREFERENCES, preferences.key) ||
      typeof preferences.value !== "boolean"
    ) {
      throw new Error("Preferência inválida.");
    }
    const { key, value } = preferences;
    desktopPreferences[key] = value;
    saveDesktopPreferences();
    applyDesktopPreferences();
    return { ...desktopPreferences };
  });
  handleDesktopIpc("desktop:app-info", () => ({
    version: app.getVersion(),
    packaged,
  }));
  handleDesktopIpc("desktop:update-status", () => updateStatus);
  handleDesktopIpc("desktop:update-check", async () => {
    if (!packaged) {
      return { status: "development", message: "Disponível somente no aplicativo instalado" };
    }
    sendUpdateStatus({ status: "checking", message: "Procurando atualizações" });
    await autoUpdater.checkForUpdates();
    return updateStatus;
  });
}

app.whenReady().then(async () => {
  if (!hasSingleInstanceLock) return;
  sanitizarUserAgent();
  loadDesktopPreferences();
  configureDesktopIpc();
  createSplash();
  try {
    webServer = await startWebServer();
    createMainWindow();
    if (pendingAuthCallback) {
      mainWindow.webContents.once("did-finish-load", () => {
        if (pendingAuthCallback) mainWindow.webContents.send("desktop:auth:callback", pendingAuthCallback);
      });
    }
    applyDesktopPreferences();
    configureAutoUpdater();
    void splashFinished.then(() => showInstalledUpdate());
  } catch (err) {
    if (splash && !splash.isDestroyed()) splash.destroy();
    dialog.showErrorBox("CaixaUp - falha ao iniciar", String(err.message || err));
    app.quit();
  }
});

app.on("window-all-closed", () => {
  if (webServer) webServer.close();
  app.quit();
});

app.on("before-quit", () => {
  appIsQuitting = true;
  globalShortcut.unregisterAll();
  if (webServer) webServer.close();
});
