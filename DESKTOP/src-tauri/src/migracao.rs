//! Passagem da versão Electron (4.0.x) para a versão Tauri sem sair da conta.
//!
//! A versão Electron guardava o login do Supabase e os rascunhos do caixa no localStorage
//! do Chromium (pasta "Local Storage\leveldb" dentro de %APPDATA%\CaixaUp). A versão Tauri
//! usa outro navegador (WebView2), que começa vazio. Na primeira abertura lemos aquele banco
//! e devolvemos um script que grava os mesmos valores antes de a tela carregar.

use std::{
    collections::BTreeMap,
    fs,
    path::{Path, PathBuf},
};

use rusty_leveldb::LdbIterator;

/// Endereço onde a versão Electron servia as telas.
const ORIGEM_ELECTRON: &str = "http://127.0.0.1:4173";
/// Marca no localStorage novo: os dados antigos entram uma vez só.
const MARCA_JS: &str = "cx-migrado-electron";

/// Lê o localStorage da versão Electron (chave -> valor) a partir da pasta leveldb.
pub fn ler_local_storage(pasta_leveldb: &Path) -> Result<BTreeMap<String, String>, String> {
    // Trabalha numa cópia: abrir o banco grava arquivos e o original fica como estava.
    let copia = std::env::temp_dir().join(format!("caixaup-migracao-{}", std::process::id()));
    let _ = fs::remove_dir_all(&copia);
    copiar_pasta(pasta_leveldb, &copia).map_err(|e| format!("copiar: {e}"))?;
    let resultado = ler_copia(&copia);
    let _ = fs::remove_dir_all(&copia);
    resultado
}

fn copiar_pasta(origem: &Path, destino: &PathBuf) -> std::io::Result<()> {
    fs::create_dir_all(destino)?;
    for entrada in fs::read_dir(origem)? {
        let entrada = entrada?;
        if !entrada.file_type()?.is_file() || entrada.file_name() == "LOCK" {
            continue;
        }
        fs::copy(entrada.path(), destino.join(entrada.file_name()))?;
    }
    Ok(())
}

fn ler_copia(pasta: &Path) -> Result<BTreeMap<String, String>, String> {
    let mut opcoes = rusty_leveldb::Options::default();
    opcoes.create_if_missing = false;
    let mut banco = rusty_leveldb::DB::open(pasta, opcoes).map_err(|e| format!("abrir: {e}"))?;
    let mut iterador = banco.new_iter().map_err(|e| format!("ler: {e}"))?;
    iterador.seek_to_first();
    let mut dados = BTreeMap::new();
    while let Some((chave, valor)) = iterador.next() {
        if let Some((chave, valor)) = decodificar(&chave, &valor) {
            dados.insert(chave, valor);
        }
    }
    Ok(dados)
}

/// Formato do Chromium: chave = "_" + origem + "\0" + nome; nome e valor começam com um byte
/// que diz a codificação (0 = UTF-16LE, 1 = Latin-1).
fn decodificar(chave: &[u8], valor: &[u8]) -> Option<(String, String)> {
    let resto = chave.strip_prefix(b"_")?;
    let separador = resto.iter().position(|b| *b == 0)?;
    let origem = std::str::from_utf8(&resto[..separador]).ok()?;
    if origem.trim_end_matches('/') != ORIGEM_ELECTRON {
        return None;
    }
    Some((texto(&resto[separador + 1..])?, texto(valor)?))
}

fn texto(bytes: &[u8]) -> Option<String> {
    let (formato, corpo) = bytes.split_first()?;
    match formato {
        0 if corpo.len() % 2 == 0 => {
            let unidades: Vec<u16> = corpo
                .chunks_exact(2)
                .map(|par| u16::from_le_bytes([par[0], par[1]]))
                .collect();
            String::from_utf16(&unidades).ok()
        }
        1 => Some(corpo.iter().map(|&b| b as char).collect()),
        _ => None,
    }
}

/// Script que grava os dados antigos no localStorage novo, uma vez só e sem apagar nada
/// que já exista. Vazio quando não há o que trazer.
pub fn script(dados: &BTreeMap<String, String>) -> Option<String> {
    if dados.is_empty() {
        return None;
    }
    let json = serde_json::to_string(dados).ok()?;
    Some(format!(
        "(() => {{ try {{ if (localStorage.getItem({marca})) return; const dados = {json}; \
         for (const [chave, valor] of Object.entries(dados)) {{ if (localStorage.getItem(chave) === null) localStorage.setItem(chave, valor); }} \
         localStorage.setItem({marca}, \"1\"); }} catch (erro) {{}} }})();",
        marca = serde_json::to_string(MARCA_JS).unwrap_or_default(),
    ))
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn decodifica_latin1_e_utf16() {
        let mut chave = b"_http://127.0.0.1:4173\x00\x01".to_vec();
        chave.extend_from_slice(b"nome");
        let mut valor = vec![0u8];
        for unidade in "ação €".encode_utf16() {
            valor.extend_from_slice(&unidade.to_le_bytes());
        }
        assert_eq!(
            decodificar(&chave, &valor),
            Some(("nome".to_string(), "ação €".to_string()))
        );
        assert_eq!(decodificar(b"_file://\x00\x01x", b"\x01y"), None);
        assert_eq!(decodificar(b"META:http://127.0.0.1:4173", b"x"), None);
    }

    /// Lê um banco gerado por um Chromium de verdade (variável CAIXAUP_LEVELDB_TESTE).
    #[test]
    fn le_banco_do_chromium() {
        let Ok(pasta) = std::env::var("CAIXAUP_LEVELDB_TESTE") else {
            return;
        };
        let dados = ler_local_storage(Path::new(&pasta)).expect("ler");
        println!("{dados:#?}");
        assert_eq!(dados.get("teste-latin1").map(String::as_str), Some("ação café"));
        assert_eq!(dados.get("teste-utf16").map(String::as_str), Some("€ 😀 ok"));
        assert!(dados.get("teste-grande").map_or(0, |v| v.len()) > 5000);
        assert!(script(&dados).is_some());
    }
}
