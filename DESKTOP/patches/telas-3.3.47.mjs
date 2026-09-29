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
  for (const [label, from, to, minAll] of replacements) {
    const count = code.split(from).length - 1;
    if (minAll ? count < minAll : count !== 1) throw new Error(`${path.basename(file)}: trecho "${label}" encontrado ${count} vez(es).`);
    code = minAll ? code.split(from).join(to) : code.replace(from, () => to);
  }
  fs.writeFileSync(file, `${MARK}${code}`);
  console.log(`+ ${path.basename(file)}: ${replacements.map(([label]) => label).join(", ")}`);
}

/* 1. Catálogo do caixa atualizado sozinho ------------------------------------
 * O PDV carregava produtos só ao abrir. Com mais de um computador, preço e
 * estoque ficavam velhos e a venda era recusada ao finalizar. Recarrega em
 * silêncio a cada 30 s e ao voltar para a janela, sem mostrar erro passageiro.
 * Ao abrir, mostra o catálogo guardado na hora (item 5) e já busca o atual. */
const productsFile = fs.readFileSync(chunk("usePdvProducts"), "utf8");
const mapping = productsFile.match(/n\.list\(\)\.then\(e=>\{(t\(e\.map\(e=>\(\{id:e\.id,name:e\.productName[\s\S]*?\}\)\)\))\}\)\.catch\(/);
if (!mapping && !productsFile.includes(MARK)) throw new Error("usePdvProducts: mapeamento do catálogo não encontrado.");
patch("usePdvProducts", [[
  "atualização periódica do catálogo",
  "(0,i.useEffect)(()=>{y()},[y]);",
  `(0,i.useEffect)(()=>{y();let cxBusy=!1,cxRefresh=()=>{if(cxBusy||document.visibilityState===\`hidden\`)return;cxBusy=!0;(globalThis.cxFresh||(e=>e()))(()=>n.list()).then(e=>{${mapping?.[1]}}).catch(()=>{}).finally(()=>{cxBusy=!1})},cxTimer=window.setInterval(cxRefresh,3e4);cxRefresh();return window.addEventListener(\`focus\`,cxRefresh),window.addEventListener(\`online\`,cxRefresh),()=>{window.clearInterval(cxTimer),window.removeEventListener(\`focus\`,cxRefresh),window.removeEventListener(\`online\`,cxRefresh)}},[y]);`,
]]);

/* 2. Rascunho local cheio não impede a venda ----------------------------------
 * Antes de enviar, o PDV grava um rascunho no localStorage. Em computadores
 * com o armazenamento cheio isso falhava e a venda nem era enviada. A venda
 * tem identificador próprio no servidor, então segue mesmo sem o rascunho. */
patch("SalesStartPage", [[
  "rascunho não bloqueia a venda",
  "if(!C.persist(e.customerId||``))throw Error(`Não foi possível salvar a recuperação local. Libere espaço antes de finalizar.`);",
  "C.persist(e.customerId||``)||console.warn(`[CaixaUp] Rascunho local não foi salvo (armazenamento cheio); a venda segue.`);",
], [
  // Depois de "Venda finalizada", a animação "Preparando nova venda" segurava
  // o teclado por 1,15 s antes de liberar o próximo cliente.
  "nova venda sem espera",
  "window.matchMedia(`(prefers-reduced-motion: reduce)`).matches?80:1150",
  "0",
]]);

/* 3 e 4. Rede: tempo limite nas gravações, nova tentativa nas leituras e
 * mensagem com o motivo real no lugar de "Failed to fetch" (API e login). */
const networkHelpers = `function cxDescribeNetwork(e,t){let n=t||\`o servidor\`;return/ERR_CERT_DATE_INVALID|ERR_CERT_VALIDITY_TOO_LONG/.test(e)?\`A data ou a hora deste computador está errada. Acerte o relógio do Windows (data, hora e fuso de Brasília) e abra o CaixaUp de novo.\`:/ERR_CERT_|ERR_SSL_|ERR_BAD_SSL|ERR_TLS/.test(e)?\`A conexão segura com \${n} foi recusada neste computador (\${e}). Confira a data e a hora do Windows e, se houver antivírus com "proteção web/HTTPS", libere o CaixaUp nele.\`:/ERR_NAME_NOT_RESOLVED|ERR_NAME_RESOLUTION_FAILED|ERR_DNS_/.test(e)?\`Este computador não encontrou o endereço \${n} (DNS). Verifique a internet ou troque o DNS da rede (ex.: 8.8.8.8 / 1.1.1.1).\`:/ERR_INTERNET_DISCONNECTED|ERR_NETWORK_CHANGED|ERR_ADDRESS_UNREACHABLE/.test(e)?\`Sem conexão com a internet neste computador. Verifique o cabo ou o Wi-Fi e tente de novo.\`:/ERR_PROXY|ERR_TUNNEL_CONNECTION_FAILED/.test(e)?\`O proxy configurado no Windows está bloqueando o acesso a \${n} (\${e}). Desative o proxy em Configurações > Rede e Internet > Proxy.\`:/ERR_BLOCKED_BY|ERR_ACCESS_DENIED|ERR_NETWORK_ACCESS_DENIED/.test(e)?\`O acesso a \${n} foi bloqueado neste computador (\${e}). Libere o CaixaUp no firewall/antivírus.\`:/ERR_CONNECTION_|ERR_TIMED_OUT|ERR_EMPTY_RESPONSE/.test(e)?\`Não foi possível conectar a \${n} (\${e}). Um firewall, antivírus ou a rede pode estar bloqueando. Tente de novo em instantes.\`:\`Não foi possível conectar a \${n}\${e?\` (\${e})\`:\`\`}. Verifique a internet, o firewall/antivírus e a data e hora do Windows.\`}async function cxExplainNetwork(e,t){let n=\`\`;try{n=new URL(String(t),location.href).host}catch{}if(typeof navigator<\`u\`&&navigator.onLine===!1)return new TypeError(cxDescribeNetwork(\`ERR_INTERNET_DISCONNECTED\`,n));let r=null;try{r=await window.caixaUpDesktop?.getNetworkFailure?.(n)}catch{}let i=new TypeError(cxDescribeNetwork(String(r?.error||\`\`).replace(/^net::/,\`\`),r?.host||n));return i.cause=e,i}globalThis.cxFetch=async(e,t={})=>{let n=String(t?.method||(e instanceof Request?e.method:\`GET\`)).toUpperCase(),r=n===\`GET\`||n===\`HEAD\`,i=typeof e==\`string\`?e:e instanceof URL?e.href:e.url;for(let a=0;;a++)try{return await fetch(e,t)}catch(o){if(t?.signal?.aborted||!(o instanceof TypeError))throw o;if(r&&a===0){await new Promise(e=>setTimeout(e,1200));if(!t?.signal?.aborted)continue}throw await cxExplainNetwork(o,i)}};`;

/* 5. Telas abrem na hora ------------------------------------------------------
 * Toda tela esperava o servidor antes de aparecer. Agora a leitura (GET) que
 * já foi feita é mostrada na hora e conferida em segundo plano; se veio
 * diferente e ninguém mexeu na tela ainda, a tela é remontada com o dado novo.
 * Qualquer gravação (venda, cadastro...) marca o guardado como velho: ele é
 * recarregado em segundo plano e, até lá, a tela espera o servidor, para
 * nunca mostrar dado anterior ao que o próprio operador acabou de fazer.
 * O status do caixa sempre vai ao servidor. Ao entrar, os dados e o código
 * das telas principais são pré-carregados. */
// Na primeira abertura de cada tela o React esperava o código dela carregar e
// segurava a exibição por no mínimo ~300 ms. As telas são criadas por cxLazy e
// ficam prontas logo depois do login.
const cacheHelpers = `function cxLazy(e){let t=O.lazy(e);(globalThis.cxLazies||=[]).push(t);return t}var cxMem=new Map,cxBypass=0,cxGen=0,cxPageV=0,cxPageSubs=new Set,cxLastInput=0,cxWarmKey=\`\`,cxRefreshTimer=0;globalThis.cxPageSub=e=>(cxPageSubs.add(e),()=>{cxPageSubs.delete(e)});globalThis.cxPageVer=()=>cxPageV;globalThis.cxFresh=e=>{cxBypass++;try{return e()}finally{cxBypass--}};typeof window<\`u\`&&[\`keydown\`,\`pointerdown\`,\`input\`,\`wheel\`].forEach(e=>window.addEventListener(e,()=>{cxLastInput=Date.now()},{capture:!0,passive:!0}));function cxKey(e){if(/^\\/cash\\/status/.test(e))return null;let t=U();return t?.companyId&&t.id?\`\${t.companyId}:\${t.id}:\${e}\`:null}function cxStore(e,t,n,r){let i=cxMem.get(e),a=JSON.stringify(n);cxMem.set(e,{path:t,data:n,json:a,at:Date.now(),used:i?.used||0,servedAt:i?.servedAt||0,dirty:r!==cxGen,busy:!1});cxWarm()}function cxDirtyAll(){cxGen++;cxMem.forEach(e=>{e.dirty=!0})}function cxRevalidate(e,t){if(t.busy)return;t.busy=!0;let n=t.servedAt;globalThis.cxFresh(()=>Y(e)).then(e=>{JSON.stringify(e)!==t.json&&Date.now()-n<15e3&&cxLastInput<n&&(cxPageV++,cxPageSubs.forEach(e=>e()))}).catch(()=>{}).finally(()=>{t.busy=!1})}function cxAfterWrite(){cxDirtyAll();clearTimeout(cxRefreshTimer);cxRefreshTimer=setTimeout(()=>{if(document.visibilityState===\`hidden\`)return;for(let[,e]of cxMem)e.dirty&&e.json.length<=2e5&&(e.used===0||Date.now()-e.used<6e5)&&globalThis.cxFresh(()=>Y(e.path)).catch(()=>{})},250)}function cxWarm(){let e=U();if(!e?.companyId||!e.id)return;let t=\`\${e.companyId}:\${e.id}\`;cxWarmKey!==t&&(cxWarmKey=t,setTimeout(async()=>{for(let e of globalThis.cxLazies||[])try{e._init(e._payload)}catch{}for(let e of[\`/products?includeInactive=false\`,\`/products?includeInactive=true\`,\`/dashboard\`,\`/customers\`,\`/credit-debts\`,\`/suspended-sales\`,\`/sales\`])if(!cxMem.has(\`\${t}:\${e}\`))try{await Y(e)}catch{}},1500))}`;

const apiStart = "async function Y(e,t={}){if(!Gt)throw Error(`A API segura do CaixaUp ainda não foi configurada.`);";

patch("index", [[
  "telas abrem na hora (leitura guardada)",
  apiStart,
  `${cacheHelpers}${apiStart}let cxA=Object.keys(t).length===0,cxK=cxA?cxKey(e):null,cxG=cxGen;if(cxK&&cxBypass===0){let h=cxMem.get(cxK);if(h&&(!h.dirty||h.json.length>2e5&&!h.busy)){h.used=h.servedAt=Date.now();(h.dirty||Date.now()-h.at>2e3)&&cxRevalidate(e,h);return structuredClone(h.data)}}(t.method||\`GET\`).toUpperCase()!==\`GET\`&&cxDirtyAll();`,
], [
  "telas abrem na hora (guardar leitura)",
  "if(!a)try{return await c()}finally{i!==`GET`&&J.clear()}let l=c();J.set(o,l);try{return structuredClone(await l)}finally{J.get(o)===l&&J.delete(o)}}",
  "if(!a)try{return await c()}finally{i!==`GET`&&(J.clear(),cxAfterWrite())}let l=c();J.set(o,l);try{let cxD=await l;cxK&&cxStore(cxK,e,cxD,cxG);return structuredClone(cxD)}finally{J.get(o)===l&&J.delete(o)}}",
], [
  "tela remontada com dado novo",
  "let[p,m]=(0,O.useState)(()=>`home`);",
  "let[p,m]=(0,O.useState)(()=>`home`),cxPv=(0,O.useSyncExternalStore)(globalThis.cxPageSub,globalThis.cxPageVer);",
], [
  "tela remontada com dado novo (chave)",
  "(0,k.jsx)(`div`,{className:`system-stage page-enter min-h-full`,children:",
  "(0,k.jsx)(`div`,{key:`${p}:${cxPv}`,className:`system-stage page-enter min-h-full`,children:",
], [
  "telas prontas depois do login",
  "(0,O.lazy)(",
  "cxLazy(",
  20,
], [
  // Janelas esperavam 220 ms (animação de saída) antes de fechar.
  "janelas fecham na hora",
  "function Ke(e,t=220){",
  "function Ke(e,t=0){",
], [
  "rede da API",
  "async function Xt(e,t,n={}){let r=new Headers(n.headers);r.set(`Content-Type`,`application/json`),r.set(`Authorization`,`Bearer ${t}`);let i=(n.method||`GET`).toUpperCase()===`GET`?AbortSignal.timeout(2e4):void 0,a=i&&n.signal?AbortSignal.any([i,n.signal]):i||n.signal;try{return await fetch(`${Gt}${e}`,{...n,headers:r,signal:a})}catch(e){throw i?.aborted&&!n.signal?.aborted?Error(`O servidor demorou para responder. Tente atualizar a tela.`):e}}",
  `${networkHelpers}async function Xt(e,t,n={}){let r=new Headers(n.headers);r.set(\`Content-Type\`,\`application/json\`),r.set(\`Authorization\`,\`Bearer \${t}\`);let cxRead=(n.method||\`GET\`).toUpperCase()===\`GET\`,i=AbortSignal.timeout(cxRead?2e4:6e4),a=n.signal?AbortSignal.any([i,n.signal]):i;try{return await globalThis.cxFetch(\`\${Gt}\${e}\`,{...n,headers:r,signal:a})}catch(e){throw i.aborted&&!n.signal?.aborted?Error(cxRead?\`O servidor demorou para responder. Tente atualizar a tela.\`:\`O servidor não respondeu a tempo. Confira o histórico antes de repetir a operação.\`):e}}`,
]]);

patch("supabase", [[
  "rede do login",
  "{auth:{detectSessionInUrl:!0,flowType:`pkce`,persistSession:!0,autoRefreshToken:!0}}",
  "{auth:{detectSessionInUrl:!0,flowType:`pkce`,persistSession:!0,autoRefreshToken:!0},global:{fetch:(...e)=>(globalThis.cxFetch||fetch)(...e)}}",
]]);

/* 6. Sem animações de espera ---------------------------------------------------
 * Páginas, cartões e janelas entravam com animação (até 0,5 s). As telas já
 * têm regras para o "reduzir movimento" do Windows; elas passam a valer
 * sempre na janela principal. O vídeo de abertura (opening-motion.html) não
 * usa estes arquivos e continua igual. Indicadores de carregamento seguem
 * animados. */
const LOADERS = [".animate-spin", ".animate-pulse", ".loading-bar-line", ".splash-orbit", ".splash-track-fill", ".splash-dots span"];
function reducedMotionAlways(css) {
  const blocks = [];
  const head = "@media (prefers-reduced-motion:reduce){";
  for (let start = css.indexOf(head); start >= 0; start = css.indexOf(head, start + 1)) {
    let depth = 0;
    let end = start + head.length - 1;
    for (; end < css.length; end++) {
      if (css[end] === "{") depth++;
      else if (css[end] === "}" && --depth === 0) break;
    }
    blocks.push(css.slice(start + head.length, end));
  }
  return blocks;
}
let cssBlocks = 0;
for (const name of fs.readdirSync(assets).filter((file) => file.endsWith(".css"))) {
  const file = path.join(assets, name);
  const css = fs.readFileSync(file, "utf8");
  if (css.includes(MARK)) continue;
  const blocks = reducedMotionAlways(css);
  if (!blocks.length) continue;
  const loaders = LOADERS.flatMap((selector) => {
    const rule = css.match(new RegExp(`(?:^|})${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\{[^}]*?animation:([^;}]+)`));
    return rule && !/^none/.test(rule[1]) ? [`${selector}{animation:${rule[1]}!important}`] : [];
  });
  fs.writeFileSync(file, `${css}\n${MARK}${blocks.join("")}${loaders.join("")}`);
  cssBlocks += blocks.length;
  console.log(`+ ${name}: ${blocks.length} regras sem animação, ${loaders.length} indicadores mantidos`);
}
if (!cssBlocks) throw new Error("Nenhuma regra de reduzir movimento encontrada no CSS.");

console.log("Correções das telas aplicadas.");
