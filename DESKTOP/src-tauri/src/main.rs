//! CaixaUp desktop (Tauri/Rust). Substitui o antigo processo principal do Electron.
//!
//! Não existe banco local: as telas (FRONTEND/dist, servidas pelo próprio Tauri) falam
//! direto com o Supabase. Aqui ficam só as coisas do Windows: abertura animada, janela
//! sem barra, arrastar, preferências, atalho global, iniciar com o Windows e a
//! atualização automática pelos releases do GitHub.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::PathBuf,
    sync::Mutex,
    thread,
    time::{Duration, Instant},
};
use tauri::{
    webview::PageLoadEvent, AppHandle, Manager, State, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder, WindowEvent,
};
use tauri_plugin_autostart::ManagerExt as _;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_updater::UpdaterExt;

const JANELA_CAIXA: &str = "caixa";
const JANELA_ABERTURA: &str = "abertura";
/// A abertura animada (splash.html) dura 7 s; a janela do caixa só aparece depois dela.
const DURACAO_ABERTURA: Duration = Duration::from_millis(7000);
const ATALHO_MOSTRAR: &str = "CommandOrControl+Shift+C";
const EMPACOTADO: bool = !cfg!(debug_assertions);

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct Preferencias {
    start_with_windows: bool,
    global_shortcuts: bool,
    automatic_updates: bool,
    fit_small_screens: bool,
    always_animate: bool,
}

impl Default for Preferencias {
    fn default() -> Self {
        Self {
            start_with_windows: false,
            global_shortcuts: true,
            automatic_updates: true,
            fit_small_screens: true,
            always_animate: true,
        }
    }
}

#[derive(Clone, Serialize, Default)]
struct StatusAtualizacao {
    status: String,
    message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    percent: Option<u32>,
}

#[derive(Serialize, Deserialize)]
struct AtualizacaoPendente {
    version: String,
    notes: String,
}

struct Estado {
    preferencias: Mutex<Preferencias>,
    atualizacao: Mutex<StatusAtualizacao>,
    ultima_busca: Mutex<Instant>,
    abertura_iniciada: Mutex<Option<Instant>>,
    janela_exibida: Mutex<bool>,
}

// ------------------------------------------------------------ arquivos ---

fn pasta_dados(app: &AppHandle) -> PathBuf {
    let pasta = app
        .path()
        .app_config_dir()
        .unwrap_or_else(|_| std::env::temp_dir().join("CaixaUp"));
    let _ = fs::create_dir_all(&pasta);
    pasta
}

fn arquivo_preferencias(app: &AppHandle) -> PathBuf {
    pasta_dados(app).join("caixaup-preferences.json")
}

fn arquivo_atualizacao(app: &AppHandle) -> PathBuf {
    pasta_dados(app).join("caixaup-update.json")
}

fn carregar_preferencias(app: &AppHandle) -> Preferencias {
    let mut arquivo = arquivo_preferencias(app);
    // Primeira vez na versão Tauri: aproveita as preferências da versão Electron.
    if !arquivo.exists() {
        if let Ok(config) = app.path().config_dir() {
            let antigo = config.join("CaixaUp").join("caixaup-preferences.json");
            if antigo.exists() {
                arquivo = antigo;
            }
        }
    }
    fs::read_to_string(arquivo)
        .ok()
        .and_then(|texto| serde_json::from_str(&texto).ok())
        .unwrap_or_default()
}

fn salvar_preferencias(app: &AppHandle, preferencias: &Preferencias) -> Result<(), String> {
    let texto = serde_json::to_string_pretty(preferencias).map_err(|e| e.to_string())?;
    fs::write(arquivo_preferencias(app), texto).map_err(|e| e.to_string())
}

// -------------------------------------------------------------- janelas ---

fn mostrar_caixa(app: &AppHandle) {
    if let Some(janela) = app.get_webview_window(JANELA_CAIXA) {
        let _ = janela.unminimize();
        let _ = janela.show();
        let _ = janela.set_focus();
    }
}

/// Escala da abertura: a mesma conta da versão Electron (tela de referência 1440x810).
fn zoom_da_tela(app: &AppHandle, preferencias: &Preferencias) -> f64 {
    let Ok(Some(monitor)) = app.primary_monitor() else {
        return 1.0;
    };
    let escala = monitor.scale_factor();
    let area = monitor.work_area().size;
    let (w, h) = (area.width as f64 / escala, area.height as f64 / escala);
    let arredondar = |z: f64| (z * 20.0).round() / 20.0;
    if !preferencias.fit_small_screens {
        return arredondar((w / 1440.0).min(h / 810.0)).clamp(1.0, 1.5);
    }
    let alvo = (w / 1440.0).min(h / 810.0);
    let teto = (w / 1024.0).min(h / 620.0);
    arredondar(alvo.min(teto).min(1.5)).max(0.7)
}

fn tamanho_da_tela(app: &AppHandle) -> (f64, f64) {
    match app.primary_monitor() {
        Ok(Some(monitor)) => {
            let escala = monitor.scale_factor();
            let area = monitor.work_area().size;
            (area.width as f64 / escala, area.height as f64 / escala)
        }
        _ => (1440.0, 900.0),
    }
}

/// Animações sempre ligadas: a abertura e as entradas de tela tocam mesmo com as
/// animações do Windows desligadas (comum em PC de caixa ou acesso remoto).
#[cfg(windows)]
fn argumentos_webview(preferencias: &Preferencias) -> String {
    // Os três primeiros são os padrões do Tauri; precisam continuar aqui.
    let mut args =
        String::from("--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection");
    if preferencias.always_animate {
        args.push_str(" --force-prefers-no-reduced-motion");
    }
    args
}

fn criar_abertura(app: &AppHandle, preferencias: &Preferencias) -> tauri::Result<()> {
    let zoom = zoom_da_tela(app, preferencias);
    let construtor = WebviewWindowBuilder::new(app, JANELA_ABERTURA, WebviewUrl::App("splash.html".into()))
        .title("CaixaUp")
        .inner_size(640.0 * zoom, 360.0 * zoom)
        .decorations(false)
        .resizable(false)
        .center()
        .skip_taskbar(true)
        .on_page_load(|janela, carga| {
            if carga.event() == PageLoadEvent::Finished {
                let estado = janela.state::<Estado>();
                *estado.abertura_iniciada.lock().unwrap() = Some(Instant::now());
            }
        });
    #[cfg(windows)]
    let construtor = construtor.additional_browser_args(&argumentos_webview(preferencias));
    let abertura = construtor.build()?;
    let _ = abertura.set_zoom(zoom);
    Ok(())
}

#[cfg_attr(not(windows), allow(unused_variables))]
fn criar_caixa(app: &AppHandle, preferencias: &Preferencias) -> tauri::Result<()> {
    let (w, h) = tamanho_da_tela(app);
    let construtor = WebviewWindowBuilder::new(app, JANELA_CAIXA, WebviewUrl::App("index.html".into()))
        .title("CaixaUp")
        .inner_size(1440f64.min(w), 900f64.min(h))
        .min_inner_size(1024f64.min(w), 700f64.min(h))
        .decorations(false)
        .visible(false)
        .center()
        .initialization_script(include_str!("ponte.js"))
        .on_page_load(|janela, carga| {
            if carga.event() == PageLoadEvent::Finished {
                exibir_caixa(janela.app_handle().clone());
            }
        });
    #[cfg(windows)]
    let construtor = construtor.additional_browser_args(&argumentos_webview(preferencias));
    construtor.build()?;

    // Se a tela demorar demais para carregar, mostra assim mesmo.
    let app = app.clone();
    thread::spawn(move || {
        thread::sleep(Duration::from_secs(20));
        exibir_caixa(app);
    });
    Ok(())
}

/// Mostra a janela do caixa quando a abertura animada termina e fecha a abertura.
fn exibir_caixa(app: AppHandle) {
    thread::spawn(move || {
        let estado = app.state::<Estado>();
        // Espera a abertura terminar (ou começar, se ainda não carregou: no máximo 3 s).
        let inicio_espera = Instant::now();
        loop {
            let falta = match *estado.abertura_iniciada.lock().unwrap() {
                Some(inicio) => DURACAO_ABERTURA.saturating_sub(inicio.elapsed()),
                None if app.get_webview_window(JANELA_ABERTURA).is_some()
                    && inicio_espera.elapsed() < Duration::from_secs(3) =>
                {
                    Duration::from_millis(100)
                }
                None => Duration::ZERO,
            };
            if falta.is_zero() {
                break;
            }
            thread::sleep(falta.min(Duration::from_millis(250)));
        }
        {
            let mut exibida = estado.janela_exibida.lock().unwrap();
            if *exibida {
                return;
            }
            *exibida = true;
        }
        let Some(caixa) = app.get_webview_window(JANELA_CAIXA) else {
            return;
        };
        let _ = caixa.maximize();
        let _ = caixa.show();
        let _ = caixa.set_focus();
        // A tela começa a entrada suave (menu, conteúdo e cartões) agora.
        let _ = caixa.eval("window.__cxJanelaExibida && window.__cxJanelaExibida()");
        // A abertura termina no mesmo fundo claro do app; fecha logo depois.
        thread::sleep(Duration::from_millis(350));
        if let Some(abertura) = app.get_webview_window(JANELA_ABERTURA) {
            let _ = abertura.destroy();
        }
        thread::sleep(Duration::from_millis(2200));
        mostrar_atualizacao_instalada(&app);
    });
}

// ---------------------------------------------------------- preferências ---

fn aplicar_preferencias(app: &AppHandle, preferencias: &Preferencias) {
    if EMPACOTADO {
        let autostart = app.autolaunch();
        let _ = if preferencias.start_with_windows {
            autostart.enable()
        } else {
            autostart.disable()
        };
    }
    let atalhos = app.global_shortcut();
    let _ = atalhos.unregister_all();
    if preferencias.global_shortcuts {
        let _ = atalhos.register(ATALHO_MOSTRAR);
    }
}

// ----------------------------------------------------------- atualização ---

fn enviar_status(app: &AppHandle, mudar: impl FnOnce(&mut StatusAtualizacao)) {
    let estado = app.state::<Estado>();
    let status = {
        let mut atual = estado.atualizacao.lock().unwrap();
        mudar(&mut atual);
        atual.clone()
    };
    if let (Some(janela), Ok(json)) = (
        app.get_webview_window(JANELA_CAIXA),
        serde_json::to_string(&status),
    ) {
        let _ = janela.eval(&format!(
            "window.__cxStatusAtualizacao && window.__cxStatusAtualizacao({json})"
        ));
    }
}

fn definir_status(app: &AppHandle, status: &str, mensagem: String, versao: Option<String>, percent: Option<u32>) {
    enviar_status(app, |s| {
        s.status = status.into();
        s.message = mensagem;
        if versao.is_some() {
            s.version = versao;
        }
        s.percent = percent;
    });
}

/// Procura versão nova no GitHub; se houver, baixa, instala e reabre o CaixaUp.
fn procurar_atualizacao(app: &AppHandle) {
    if !EMPACOTADO || !app.state::<Estado>().preferencias.lock().unwrap().automatic_updates {
        return;
    }
    {
        let estado = app.state::<Estado>();
        let atual = estado.atualizacao.lock().unwrap().status.clone();
        if ["checking", "downloading", "installing"].contains(&atual.as_str()) {
            return;
        }
        *estado.ultima_busca.lock().unwrap() = Instant::now();
    }
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        definir_status(&app, "checking", "Procurando atualizações".into(), None, None);
        let resultado = async {
            let atualizacao = app.updater()?.check().await?;
            let Some(atualizacao) = atualizacao else {
                definir_status(&app, "updated", "CaixaUp está atualizado".into(), None, Some(100));
                return Ok(());
            };
            let versao = atualizacao.version.clone();
            definir_status(&app, "downloading", format!("Baixando a versão {versao}"), Some(versao.clone()), Some(0));
            let pendente = AtualizacaoPendente {
                version: versao.clone(),
                notes: atualizacao.body.clone().unwrap_or_default().chars().take(1800).collect(),
            };
            let _ = fs::write(
                arquivo_atualizacao(&app),
                serde_json::to_string(&pendente).unwrap_or_default(),
            );
            let mut baixado: u64 = 0;
            let mut ultimo = u32::MAX;
            let app_progresso = app.clone();
            let app_fim = app.clone();
            let versao_fim = versao.clone();
            atualizacao
                .download_and_install(
                    move |pedaco, total| {
                        baixado += pedaco as u64;
                        let percent = total
                            .filter(|t| *t > 0)
                            .map(|t| ((baixado * 100) / t).min(100) as u32)
                            .unwrap_or(0);
                        if percent != ultimo {
                            ultimo = percent;
                            definir_status(
                                &app_progresso,
                                "downloading",
                                format!("Baixando atualização: {percent}%"),
                                None,
                                Some(percent),
                            );
                        }
                    },
                    move || {
                        definir_status(
                            &app_fim,
                            "installing",
                            format!("Instalando a versão {versao_fim}"),
                            None,
                            Some(100),
                        );
                    },
                )
                .await?;
            app.restart();
        }
        .await;
        if let Err(erro) = resultado {
            let erro: tauri_plugin_updater::Error = erro;
            definir_status(&app, "error", format!("Falha na atualização: {erro}"), None, None);
        }
    });
}

/// Depois de atualizar, mostra na tela o que mudou na versão nova (uma vez).
fn mostrar_atualizacao_instalada(app: &AppHandle) {
    let arquivo = arquivo_atualizacao(app);
    let Some(pendente) = fs::read_to_string(&arquivo)
        .ok()
        .and_then(|t| serde_json::from_str::<AtualizacaoPendente>(&t).ok())
    else {
        return;
    };
    if pendente.version != app.package_info().version.to_string() {
        return;
    }
    let _ = fs::remove_file(arquivo);
    let notas = if pendente.notes.trim().is_empty() {
        "A nova versão foi instalada com sucesso.".to_string()
    } else {
        pendente.notes
    };
    let info = serde_json::json!({ "version": pendente.version, "notes": notas });
    if let Some(janela) = app.get_webview_window(JANELA_CAIXA) {
        let _ = janela.eval(&format!(
            "window.__cxAtualizacaoInstalada && window.__cxAtualizacaoInstalada({info})"
        ));
    }
}

// -------------------------------------------------------------- comandos ---

#[tauri::command]
fn janela(janela: WebviewWindow, acao: String) {
    match acao.as_str() {
        "minimizar" => {
            let _ = janela.minimize();
        }
        "maximizar" => {
            let _ = if janela.is_maximized().unwrap_or(false) {
                janela.unmaximize()
            } else {
                janela.maximize()
            };
        }
        "tela-cheia" => {
            let cheia = janela.is_fullscreen().unwrap_or(false);
            let _ = janela.set_fullscreen(!cheia);
        }
        "fechar" => {
            let _ = janela.close();
        }
        _ => {}
    }
}

#[tauri::command]
fn tela_cheia(janela: WebviewWindow) -> bool {
    let cheia = !janela.is_fullscreen().unwrap_or(false);
    let _ = janela.set_fullscreen(cheia);
    cheia
}

/// Arrastar pelo Windows. Maximizada, o próprio Windows restaura ao puxar;
/// em tela cheia sai dela antes.
#[tauri::command]
fn arrastar(janela: WebviewWindow) {
    if janela.is_fullscreen().unwrap_or(false) {
        let _ = janela.set_fullscreen(false);
    }
    let _ = janela.start_dragging();
}

#[tauri::command]
fn preferencias(estado: State<Estado>) -> Preferencias {
    estado.preferencias.lock().unwrap().clone()
}

#[tauri::command]
fn definir_preferencia(app: AppHandle, estado: State<Estado>, key: String, value: bool) -> Result<Preferencias, String> {
    let novas = {
        let mut p = estado.preferencias.lock().unwrap();
        match key.as_str() {
            "startWithWindows" => p.start_with_windows = value,
            "globalShortcuts" => p.global_shortcuts = value,
            "automaticUpdates" => p.automatic_updates = value,
            "fitSmallScreens" => p.fit_small_screens = value,
            "alwaysAnimate" => p.always_animate = value,
            _ => return Err("Preferência inválida.".into()),
        }
        p.clone()
    };
    salvar_preferencias(&app, &novas)?;
    aplicar_preferencias(&app, &novas);
    Ok(novas)
}

#[tauri::command]
fn info_app(app: AppHandle) -> serde_json::Value {
    serde_json::json!({
        "version": app.package_info().version.to_string(),
        "packaged": EMPACOTADO,
    })
}

#[tauri::command]
fn status_atualizacao(estado: State<Estado>) -> StatusAtualizacao {
    estado.atualizacao.lock().unwrap().clone()
}

#[tauri::command]
fn procurar_atualizacao_cmd(app: AppHandle, estado: State<Estado>) -> StatusAtualizacao {
    if !EMPACOTADO {
        return StatusAtualizacao {
            status: "development".into(),
            message: "Disponível somente no aplicativo instalado".into(),
            ..Default::default()
        };
    }
    procurar_atualizacao(&app);
    estado.atualizacao.lock().unwrap().clone()
}

#[tauri::command]
fn abrir_link(app: AppHandle, url: String) -> Result<(), String> {
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| e.to_string())
}

// ------------------------------------------------------------------ main ---

fn main() {
    tauri::Builder::default()
        // Uma só cópia aberta: abrir de novo traz a janela que já existe.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            mostrar_caixa(app);
        }))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _atalho, evento| {
                    if evento.state() == ShortcutState::Pressed {
                        mostrar_caixa(app);
                    }
                })
                .build(),
        )
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            janela,
            tela_cheia,
            arrastar,
            preferencias,
            definir_preferencia,
            info_app,
            status_atualizacao,
            procurar_atualizacao_cmd,
            abrir_link
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            let prefs = carregar_preferencias(&handle);
            app.manage(Estado {
                preferencias: Mutex::new(prefs.clone()),
                atualizacao: Mutex::new(StatusAtualizacao {
                    status: "idle".into(),
                    message: "Atualizações automáticas ativas".into(),
                    ..Default::default()
                }),
                ultima_busca: Mutex::new(Instant::now()),
                abertura_iniciada: Mutex::new(None),
                janela_exibida: Mutex::new(false),
            });
            criar_abertura(&handle, &prefs)?;
            criar_caixa(&handle, &prefs)?;
            aplicar_preferencias(&handle, &prefs);

            // Procura versão nova 3 s depois de abrir e a cada 30 minutos (quem deixa
            // o caixa aberto o dia todo também recebe). A volta do foco procura também,
            // no máximo a cada 10 minutos.
            thread::spawn(move || {
                thread::sleep(Duration::from_secs(3));
                loop {
                    procurar_atualizacao(&handle);
                    thread::sleep(Duration::from_secs(30 * 60));
                }
            });
            Ok(())
        })
        .on_window_event(|janela, evento| match evento {
            WindowEvent::Focused(true) if janela.label() == JANELA_CAIXA => {
                let app = janela.app_handle();
                let passou = app.state::<Estado>().ultima_busca.lock().unwrap().elapsed();
                if passou >= Duration::from_secs(10 * 60) {
                    procurar_atualizacao(app);
                }
            }
            // Fechar o caixa fecha o programa inteiro (inclusive a abertura, se ainda estiver).
            WindowEvent::Destroyed if janela.label() == JANELA_CAIXA => {
                janela.app_handle().exit(0);
            }
            _ => {}
        })
        .run(tauri::generate_context!())
        .expect("CaixaUp: falha ao iniciar");
}
