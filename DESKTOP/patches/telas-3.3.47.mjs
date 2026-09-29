/**
 * Correções aplicadas às telas prontas da 3.3.47 (usadas enquanto o código
 * mais novo das telas não está no repositório — ver DESKTOP/telas-do-release.txt).
 *
 * Uso: node DESKTOP/patches/telas-3.3.47.mjs <pasta app/dist>
 *
 * Cada troca precisa achar o trecho exatamente uma vez; se o código mudar,
 * o script para com erro em vez de publicar algo pela metade.
 */
import fs from "node:fs";
import path from "node:path";

const dist = process.argv[2];
if (!dist) throw new Error("Informe a pasta app/dist.");
const assets = path.join(dist, "assets");
const MARK = "/*caixaup-manutencao-3.3.52*/";

function chunk(prefix) {
  const matches = fs.readdirSync(assets).filter((name) => name.startsWith(`${prefix}-`) && name.endsWith(".js"));
  if (matches.length !== 1) throw new Error(`Esperado 1 arquivo ${prefix}-*.js, achei ${matches.length}.`);
  return path.join(assets, matches[0]);
}

function patch(prefix, replacements) {
  const file = chunk(prefix);
  let code = fs.readFileSync(file, "utf8");
  if (code.includes(MARK)) {
    console.log(`= ${path.basename(file)} já corrigido`);
    return;
  }
  for (const [label, from, to] of replacements) {
    const count = code.split(from).length - 1;
    if (count !== 1) throw new Error(`${path.basename(file)}: trecho "${label}" encontrado ${count} vez(es).`);
    code = code.replace(from, () => to);
  }
  fs.writeFileSync(file, `${MARK}${code}`);
  console.log(`+ ${path.basename(file)}: ${replacements.map(([label]) => label).join(", ")}`);
}

/* 1. Catálogo do caixa atualizado sozinho ------------------------------------
 * O PDV carregava produtos só ao abrir. Com mais de um computador, preço e
 * estoque ficavam velhos e a venda era recusada ao finalizar. Recarrega em
 * silêncio a cada 30 s e ao voltar para a janela, sem mostrar erro passageiro. */
const productsFile = fs.readFileSync(chunk("usePdvProducts"), "utf8");
const mapping = productsFile.match(/n\.list\(\)\.then\(e=>\{(t\(e\.map\(e=>\(\{id:e\.id,name:e\.productName[\s\S]*?\}\)\)\))\}\)\.catch\(/);
if (!mapping && !productsFile.includes(MARK)) throw new Error("usePdvProducts: mapeamento do catálogo não encontrado.");
patch("usePdvProducts", [[
  "atualização periódica do catálogo",
  "(0,i.useEffect)(()=>{y()},[y]);",
  `(0,i.useEffect)(()=>{y();let cxBusy=!1,cxRefresh=()=>{if(cxBusy||document.visibilityState===\`hidden\`)return;cxBusy=!0;n.list().then(e=>{${mapping?.[1]}}).catch(()=>{}).finally(()=>{cxBusy=!1})},cxTimer=window.setInterval(cxRefresh,3e4);return window.addEventListener(\`focus\`,cxRefresh),window.addEventListener(\`online\`,cxRefresh),()=>{window.clearInterval(cxTimer),window.removeEventListener(\`focus\`,cxRefresh),window.removeEventListener(\`online\`,cxRefresh)}},[y]);`,
]]);

/* 2. Rascunho local cheio não impede a venda ----------------------------------
 * Antes de enviar, o PDV grava um rascunho no localStorage. Em computadores
 * com o armazenamento cheio isso falhava e a venda nem era enviada. A venda
 * tem identificador próprio no servidor, então segue mesmo sem o rascunho. */
patch("SalesStartPage", [[
  "rascunho não bloqueia a venda",
  "if(!C.persist(e.customerId||``))throw Error(`Não foi possível salvar a recuperação local. Libere espaço antes de finalizar.`);",
  "C.persist(e.customerId||``)||console.warn(`[CaixaUp] Rascunho local não foi salvo (armazenamento cheio); a venda segue.`);",
]]);

/* 3 e 4. Rede: tempo limite nas gravações, nova tentativa nas leituras e
 * mensagem com o motivo real no lugar de "Failed to fetch" (API e login). */
const networkHelpers = `function cxDescribeNetwork(e,t){let n=t||\`o servidor\`;return/ERR_CERT_DATE_INVALID|ERR_CERT_VALIDITY_TOO_LONG/.test(e)?\`A data ou a hora deste computador está errada. Acerte o relógio do Windows (data, hora e fuso de Brasília) e abra o CaixaUp de novo.\`:/ERR_CERT_|ERR_SSL_|ERR_BAD_SSL|ERR_TLS/.test(e)?\`A conexão segura com \${n} foi recusada neste computador (\${e}). Confira a data e a hora do Windows e, se houver antivírus com "proteção web/HTTPS", libere o CaixaUp nele.\`:/ERR_NAME_NOT_RESOLVED|ERR_NAME_RESOLUTION_FAILED|ERR_DNS_/.test(e)?\`Este computador não encontrou o endereço \${n} (DNS). Verifique a internet ou troque o DNS da rede (ex.: 8.8.8.8 / 1.1.1.1).\`:/ERR_INTERNET_DISCONNECTED|ERR_NETWORK_CHANGED|ERR_ADDRESS_UNREACHABLE/.test(e)?\`Sem conexão com a internet neste computador. Verifique o cabo ou o Wi-Fi e tente de novo.\`:/ERR_PROXY|ERR_TUNNEL_CONNECTION_FAILED/.test(e)?\`O proxy configurado no Windows está bloqueando o acesso a \${n} (\${e}). Desative o proxy em Configurações > Rede e Internet > Proxy.\`:/ERR_BLOCKED_BY|ERR_ACCESS_DENIED|ERR_NETWORK_ACCESS_DENIED/.test(e)?\`O acesso a \${n} foi bloqueado neste computador (\${e}). Libere o CaixaUp no firewall/antivírus.\`:/ERR_CONNECTION_|ERR_TIMED_OUT|ERR_EMPTY_RESPONSE/.test(e)?\`Não foi possível conectar a \${n} (\${e}). Um firewall, antivírus ou a rede pode estar bloqueando. Tente de novo em instantes.\`:\`Não foi possível conectar a \${n}\${e?\` (\${e})\`:\`\`}. Verifique a internet, o firewall/antivírus e a data e hora do Windows.\`}async function cxExplainNetwork(e,t){let n=\`\`;try{n=new URL(String(t),location.href).host}catch{}if(typeof navigator<\`u\`&&navigator.onLine===!1)return new TypeError(cxDescribeNetwork(\`ERR_INTERNET_DISCONNECTED\`,n));let r=null;try{r=await window.caixaUpDesktop?.getNetworkFailure?.(n)}catch{}let i=new TypeError(cxDescribeNetwork(String(r?.error||\`\`).replace(/^net::/,\`\`),r?.host||n));return i.cause=e,i}globalThis.cxFetch=async(e,t={})=>{let n=String(t?.method||(e instanceof Request?e.method:\`GET\`)).toUpperCase(),r=n===\`GET\`||n===\`HEAD\`,i=typeof e==\`string\`?e:e instanceof URL?e.href:e.url;for(let a=0;;a++)try{return await fetch(e,t)}catch(o){if(t?.signal?.aborted||!(o instanceof TypeError))throw o;if(r&&a===0){await new Promise(e=>setTimeout(e,1200));if(!t?.signal?.aborted)continue}throw await cxExplainNetwork(o,i)}};`;

patch("index", [[
  "rede da API",
  "async function Xt(e,t,n={}){let r=new Headers(n.headers);r.set(`Content-Type`,`application/json`),r.set(`Authorization`,`Bearer ${t}`);let i=(n.method||`GET`).toUpperCase()===`GET`?AbortSignal.timeout(2e4):void 0,a=i&&n.signal?AbortSignal.any([i,n.signal]):i||n.signal;try{return await fetch(`${Gt}${e}`,{...n,headers:r,signal:a})}catch(e){throw i?.aborted&&!n.signal?.aborted?Error(`O servidor demorou para responder. Tente atualizar a tela.`):e}}",
  `${networkHelpers}async function Xt(e,t,n={}){let r=new Headers(n.headers);r.set(\`Content-Type\`,\`application/json\`),r.set(\`Authorization\`,\`Bearer \${t}\`);let cxRead=(n.method||\`GET\`).toUpperCase()===\`GET\`,i=AbortSignal.timeout(cxRead?2e4:6e4),a=n.signal?AbortSignal.any([i,n.signal]):i;try{return await globalThis.cxFetch(\`\${Gt}\${e}\`,{...n,headers:r,signal:a})}catch(e){throw i.aborted&&!n.signal?.aborted?Error(cxRead?\`O servidor demorou para responder. Tente atualizar a tela.\`:\`O servidor não respondeu a tempo. Confira o histórico antes de repetir a operação.\`):e}}`,
]]);

patch("supabase", [[
  "rede do login",
  "{auth:{detectSessionInUrl:!0,flowType:`pkce`,persistSession:!0,autoRefreshToken:!0}}",
  "{auth:{detectSessionInUrl:!0,flowType:`pkce`,persistSession:!0,autoRefreshToken:!0},global:{fetch:(...e)=>(globalThis.cxFetch||fetch)(...e)}}",
]]);

console.log("Correções das telas aplicadas.");
