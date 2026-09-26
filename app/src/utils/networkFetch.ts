/**
 * Arquivo: src/utils/networkFetch.ts
 * Objetivo: fetch usado pela API e pelo Supabase. Repete uma vez as leituras
 * que falham por rede e troca o "Failed to fetch" do navegador por uma
 * mensagem que diz o motivo real (relógio errado, certificado, DNS, antivírus,
 * proxy...), lido do processo principal do Electron.
 */

const RETRY_DELAY_MS = 1200;

type NetworkFailure = { error: string; host: string } | null;

function isNetworkFailure(error: unknown) {
  return error instanceof TypeError && !(error instanceof DOMException);
}

function requestMethod(input: RequestInfo | URL, init?: RequestInit) {
  if (init?.method) return init.method.toUpperCase();
  if (typeof Request !== "undefined" && input instanceof Request) return input.method.toUpperCase();
  return "GET";
}

function requestHost(input: RequestInfo | URL) {
  try {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    return new URL(url, window.location.href).host;
  } catch {
    return "";
  }
}

function wait(ms: number, signal?: AbortSignal | null) {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}

export function describeNetworkError(code: string, host: string) {
  const server = host || "o servidor";
  if (/ERR_CERT_DATE_INVALID|ERR_CERT_VALIDITY_TOO_LONG/.test(code)) {
    return "A data ou a hora deste computador está errada. Acerte o relógio do Windows (data, hora e fuso de Brasília) e abra o CaixaUp de novo.";
  }
  if (/ERR_CERT_|ERR_SSL_|ERR_BAD_SSL|ERR_TLS/.test(code)) {
    return `A conexão segura com ${server} foi recusada neste computador (${code}). Confira a data e a hora do Windows e, se houver antivírus com "proteção web/HTTPS", libere o CaixaUp nele.`;
  }
  if (/ERR_NAME_NOT_RESOLVED|ERR_NAME_RESOLUTION_FAILED|ERR_DNS_/.test(code)) {
    return `Este computador não encontrou o endereço ${server} (DNS). Verifique a internet ou troque o DNS da rede (ex.: 8.8.8.8 / 1.1.1.1).`;
  }
  if (/ERR_INTERNET_DISCONNECTED|ERR_NETWORK_CHANGED|ERR_ADDRESS_UNREACHABLE/.test(code)) {
    return "Sem conexão com a internet neste computador. Verifique o cabo ou o Wi-Fi e tente de novo.";
  }
  if (/ERR_PROXY|ERR_TUNNEL_CONNECTION_FAILED/.test(code)) {
    return `O proxy configurado no Windows está bloqueando o acesso a ${server} (${code}). Desative o proxy em Configurações > Rede e Internet > Proxy.`;
  }
  if (/ERR_BLOCKED_BY|ERR_ACCESS_DENIED|ERR_NETWORK_ACCESS_DENIED/.test(code)) {
    return `O acesso a ${server} foi bloqueado neste computador (${code}). Libere o CaixaUp no firewall/antivírus.`;
  }
  if (/ERR_CONNECTION_|ERR_TIMED_OUT|ERR_EMPTY_RESPONSE/.test(code)) {
    return `Não foi possível conectar a ${server} (${code}). Um firewall, antivírus ou a rede pode estar bloqueando. Tente de novo em instantes.`;
  }
  return `Não foi possível conectar a ${server}${code ? ` (${code})` : ""}. Verifique a internet, o firewall/antivírus e a data e hora do Windows.`;
}

async function readDesktopFailure(host: string): Promise<NetworkFailure> {
  try {
    return (await window.caixaUpDesktop?.getNetworkFailure?.(host)) ?? null;
  } catch {
    return null;
  }
}

async function explainFailure(error: unknown, host: string): Promise<unknown> {
  if (!isNetworkFailure(error)) return error;
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return new TypeError(describeNetworkError("ERR_INTERNET_DISCONNECTED", host));
  }
  const failure = await readDesktopFailure(host);
  const message = describeNetworkError(failure?.error?.replace(/^net::/, "") ?? "", failure?.host || host);
  const friendly = new TypeError(message);
  (friendly as TypeError & { cause?: unknown }).cause = error;
  return friendly;
}

export async function resilientFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const method = requestMethod(input, init);
  const retryable = method === "GET" || method === "HEAD";
  const host = requestHost(input);
  try {
    return await fetch(input, init);
  } catch (error) {
    if (!isNetworkFailure(error) || init?.signal?.aborted) throw error;
    if (retryable) {
      await wait(RETRY_DELAY_MS, init?.signal);
      if (!init?.signal?.aborted) {
        try {
          return await fetch(input, init);
        } catch (retryError) {
          throw await explainFailure(retryError, host);
        }
      }
    }
    throw await explainFailure(error, host);
  }
}
