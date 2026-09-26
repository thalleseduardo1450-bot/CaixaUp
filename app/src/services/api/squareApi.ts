import { supabase } from "@/lib/supabase";
import { getStoredAuthUser } from "@/utils/authStorage";
import { resilientFetch } from "@/utils/networkFetch";

/* ============================================================
   CONFIGURAÇÕES
============================================================ */

const API_URL = String(import.meta.env.VITE_SQUARE_API_URL || "").replace(/\/$/, "");

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PAGE_SIZE = 1000;
const MIGRATION_BATCH_SIZE = 100;

/**
 * Quantidade máxima de requisições simultâneas.
 *
 * 4 = seguro
 * 6 = rápido
 * 8 = agressivo
 */
const MAX_CONCURRENCY = 2;

/* ============================================================
   ESTADO DA MIGRAÇÃO
============================================================ */

let migrationPromise: Promise<void> | null = null;
let migrationOwner = "";
const pendingReads = new Map<string, Promise<unknown>>();

/* ============================================================
   API
============================================================ */

async function apiFetch(
  path: string,
  token: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);

  headers.set("Content-Type", "application/json");
  headers.set("Authorization", `Bearer ${token}`);
  const reading = (init.method || "GET").toUpperCase() === "GET";
  const timeout = reading ? AbortSignal.timeout(20000) : undefined;
  const signal = timeout && init.signal ? AbortSignal.any([timeout, init.signal]) : timeout || init.signal;
  try {
    return await resilientFetch(`${API_URL}${path}`, {
      ...init,
      headers,
      signal,
    });
  } catch (error) {
    if (timeout?.aborted && !init.signal?.aborted) {
      throw new Error("O servidor demorou para responder. Tente atualizar a tela.");
    }
    throw error;
  }
}

async function readResponseBody(response: Response) {
  if (response.status === 204) return undefined;

  try {
    return await response.json();
  } catch {
    throw new Error("Resposta inválida ou incompleta do servidor. Confira o histórico antes de repetir uma operação.");
  }
}

async function sendMigration(token: string, body: object) {
  const response = await apiFetch("/migration", token, {
    method: "POST",
    body: JSON.stringify(body),
  });

  if (response.ok) return;

  const error = await readResponseBody(response);

  throw new Error(
    error?.message || "Não foi possível migrar os dados antigos.",
  );
}

/* ============================================================
   UTILITÁRIOS
============================================================ */

function chunkArray<T>(items: T[], size = MIGRATION_BATCH_SIZE): T[][] {
  if (!items.length) return [];

  const result: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }

  return result;
}

/**
 * Executa várias tarefas em paralelo, mas limita a quantidade
 * simultânea para evitar sobrecarregar Supabase/API.
 */
async function runWithConcurrency<T>(
  items: T[],
  worker: (item: T, index: number) => Promise<void>,
  concurrency = MAX_CONCURRENCY,
): Promise<void> {
  if (!items.length) return;

  let nextIndex = 0;

  async function executeWorker() {
    while (true) {
      const index = nextIndex++;

      if (index >= items.length) return;

      await worker(items[index], index);
    }
  }

  const workers = Array.from(
    {
      length: Math.min(concurrency, items.length),
    },
    () => executeWorker(),
  );

  await Promise.all(workers);
}

/* ============================================================
   SUPABASE
============================================================ */

type LegacyTable = "produtos" | "clientes";

async function readPage(
  table: LegacyTable,
  companyId: string,
  from: number,
  to: number,
  count = false,
) {
  const columns =
    table === "produtos"
      ? "*, categorias(nome)"
      : "*";

  const query = supabase
    .from(table)
    .select(columns, count ? { count: "exact" } : undefined)
    .eq("empresa_id", companyId)
    .order("id")
    .range(from, to);

  const { data, error, count: totalCount } = await query;

  if (error) throw error;

  return {
    data: data || [],
    count: totalCount,
  };
}

/**
 * Antes:
 * página 1 -> espera
 * página 2 -> espera
 * página 3 -> espera
 *
 * Agora:
 * primeira página descobre quantidade total
 * e as restantes carregam simultaneamente.
 */
async function readAll(
  table: LegacyTable,
  companyId: string,
): Promise<any[]> {
  const firstPage = await readPage(
    table,
    companyId,
    0,
    PAGE_SIZE - 1,
    true,
  );

  const rows = [...firstPage.data];

  if (firstPage.data.length < PAGE_SIZE) {
    return rows;
  }

  const total =
    typeof firstPage.count === "number"
      ? firstPage.count
      : null;

  /*
   * Se por algum motivo o Supabase não retornar count,
   * usa paginação tradicional como fallback.
   */
  if (total === null) {
    let from = PAGE_SIZE;

    while (true) {
      const page = await readPage(
        table,
        companyId,
        from,
        from + PAGE_SIZE - 1,
      );

      rows.push(...page.data);

      if (page.data.length < PAGE_SIZE) break;

      from += PAGE_SIZE;
    }

    return rows;
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const pages = Array.from(
    {
      length: Math.max(0, totalPages - 1),
    },
    (_, index) => index + 1,
  );

  const results: any[][] = new Array(pages.length);

  await runWithConcurrency(
    pages,
    async (pageNumber, index) => {
      const from = pageNumber * PAGE_SIZE;

      const page = await readPage(
        table,
        companyId,
        from,
        from + PAGE_SIZE - 1,
      );

      results[index] = page.data;
    },
    MAX_CONCURRENCY,
  );

  for (const page of results) {
    if (page) {
      rows.push(...page);
    }
  }

  return rows;
}

/* ============================================================
   LOCAL STORAGE
============================================================ */

function safeJSON<T>(key: string, fallback: T): T {
  try {
    const value = window.localStorage.getItem(key);

    if (!value) return fallback;

    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function createMigrationMarker(
  companyId: string,
  userId: string,
) {
  return `caixaup.square-migrated.v1:${companyId}:${userId}`;
}

/* ============================================================
   CONVERSÃO DE DADOS
============================================================ */

function normalizeProducts(products: any[]) {
  return products.map((product) => ({
    id: product.id,

    productImageUrl: "",
    productImageName: "",

    productName: product.nome || "",

    productCode:
      product.codigo_barras ||
      product.sku ||
      "",

    productAlternateCode:
      product.sku || "",

    productSupplier:
      product.categorias?.nome || "",

    productDescription:
      product.descricao || "",

    productQnt:
      String(product.estoque_atual || 0),

    productUnitPrice:
      String(product.preco_custo || 0),

    productSalePrice:
      String(product.preco_venda || 0),

    totalPriceOnProduct:
      String(product.preco_venda || 0),

    productActive: true,
  }));
}

function normalizeCustomers(customers: any[]) {
  return customers.map((customer) => ({
    id: customer.id,

    customerName:
      customer.nome || "",

    document:
      customer.cpf_cnpj || "",

    birthDate:
      customer.data_nascimento || "",

    age: "",

    cep:
      customer.cep || "",

    city:
      customer.cidade || "",

    state:
      customer.estado || "",

    address:
      customer.logradouro ||
      customer.endereco ||
      "",

    neighborhood:
      customer.bairro || "",

    streetComplement:
      customer.complemento || "",

    number:
      customer.numero || "",

    referencePoint:
      customer.ponto_referencia || "",

    telephone:
      customer.telefone_fixo ||
      customer.telefone ||
      "",

    cellphone:
      customer.celular ||
      customer.telefone ||
      "",

    email:
      customer.email || "",
  }));
}

function normalizeSales(sales: any) {
  if (!Array.isArray(sales)) return [];

  return sales
    .filter((sale) =>
      UUID.test(String(sale?.id || "")),
    )
    .map((sale) => ({
      ...sale,

      items: Array.isArray(sale.items)
        ? sale.items.map((item: any) => ({
            ...item,

            productId: UUID.test(
              String(item?.productId || ""),
            )
              ? item.productId
              : null,
          }))
        : [],
    }));
}

function normalizeSuspendedSales(sales: any) {
  if (!Array.isArray(sales)) return [];

  return sales.filter(
    (sale) =>
      String(sale?.id || "").length > 0 &&
      Array.isArray(sale?.items) &&
      sale.items.length > 0 &&
      sale.items.every((item: any) =>
        UUID.test(String(item?.id || "")),
      ),
  );
}

/* ============================================================
   IDENTIDADE ESTÁVEL DOS REGISTROS ANTIGOS

   As vendas suspensas antigas usam identificadores locais
   ("susp-1699...-ab3cd") que a API recusa. Em vez de deixar o
   servidor sortear um id novo a cada envio — o que duplicava a
   venda quando a migração era repetida — derivamos sempre o
   MESMO uuid a partir da empresa + identificador antigo.
============================================================ */

function uuidFromBytes(bytes: Uint8Array) {
  const value = new Uint8Array(bytes.subarray(0, 16));

  value[6] = (value[6] & 0x0f) | 0x50;
  value[8] = (value[8] & 0x3f) | 0x80;

  const hex = Array.from(value, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Usado apenas quando `crypto.subtle` não está disponível. */
function fallbackDigest(name: string) {
  const bytes = new Uint8Array(16);
  const view = new DataView(bytes.buffer);

  let a = 0x811c9dc5;
  let b = 0x01000193;
  let c = 0x9e3779b9;
  let d = 0x85ebca6b;

  for (let index = 0; index < name.length; index++) {
    const code = name.charCodeAt(index);

    a = Math.imul(a ^ code, 16777619) >>> 0;
    b = Math.imul(b + code, 2246822519) >>> 0;
    c = Math.imul(c ^ (code + index), 3266489917) >>> 0;
    d = Math.imul(d + code * (index + 1), 668265263) >>> 0;
  }

  view.setUint32(0, a);
  view.setUint32(4, b);
  view.setUint32(8, c);
  view.setUint32(12, d);

  return bytes;
}

async function stableUuid(namespace: string, legacyId: string) {
  const name = `${namespace}:${legacyId}`;

  try {
    const digest = await window.crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(name),
    );

    return uuidFromBytes(new Uint8Array(digest));
  } catch {
    return uuidFromBytes(fallbackDigest(name));
  }
}

/* ============================================================
   ENVIO DA MIGRAÇÃO
============================================================ */

async function sendBatches(
  token: string,
  key: "products" | "customers" | "sales",
  data: any[],
) {
  const batches = chunkArray(data);

  await runWithConcurrency(
    batches,
    async (batch) => {
      await sendMigration(token, {
        [key]: batch,
      });
    },
    MAX_CONCURRENCY,
  );
}

async function migrateSuspendedSales(
  token: string,
  companyId: string,
  sales: any[],
) {
  await runWithConcurrency(
    sales,
    async (sale) => {
      const legacyId = String(sale.id);

      /*
       * Identidade estável: repetir o envio atinge sempre o
       * mesmo registro, em vez de criar uma venda nova.
       */
      const id = UUID.test(legacyId)
        ? legacyId
        : await stableUuid(companyId, legacyId);

      const claimToken = UUID.test(
        String(sale.claimToken || ""),
      )
        ? sale.claimToken
        : await stableUuid(
            `${companyId}:retomada`,
            legacyId,
          );

      const response = await apiFetch(
        "/suspended-sales",
        token,
        {
          method: "POST",

          body: JSON.stringify({
            id,
            claimToken,
            migration: true,
            label: sale.label,
            customerId: UUID.test(
              String(sale.customerId || ""),
            )
              ? sale.customerId
              : "",
            customerName: sale.customerName,
            operatorName: sale.operatorName,
            items: sale.items,
          }),
        },
      );

      if (!response.ok) {
        throw new Error(
          "Não foi possível migrar uma venda suspensa.",
        );
      }
    },
    MAX_CONCURRENCY,
  );
}

/* ============================================================
   MIGRAÇÃO PRINCIPAL
============================================================ */

async function migrateLegacyData(
  token: string,
): Promise<void> {
  const startedAt = performance.now();

  const user = getStoredAuthUser();

  if (!user?.companyId || !user.id) return;

  const marker = createMigrationMarker(
    user.companyId,
    user.id,
  );

  if (window.localStorage.getItem(marker) === "ok") {
    return;
  }

  /*
   * Produtos e clientes são buscados AO MESMO TEMPO.
   */
  const [
    oldProducts,
    oldCustomers,
  ] = await Promise.all([
    readAll("produtos", user.companyId),
    readAll("clientes", user.companyId),
  ]);

  const products =
    normalizeProducts(oldProducts);

  const customers =
    normalizeCustomers(oldCustomers);

  const localSalesKey =
    `caixaup.local-sales.v1:${user.companyId}:${user.id}`;

  const suspendedSalesKey =
    `horus-pdv-suspended:${user.companyId}:${user.id}`;

  const sales = normalizeSales(
    safeJSON(localSalesKey, []),
  );

  const suspended =
    normalizeSuspendedSales(
      safeJSON(suspendedSalesKey, []),
    );

  await sendBatches(token, "products", products);
  await sendBatches(token, "customers", customers);
  await sendBatches(token, "sales", sales);
  await migrateSuspendedSales(token, user.companyId, suspended);

  window.localStorage.setItem(
    marker,
    "ok",
  );

  const seconds =
    (performance.now() - startedAt) / 1000;

  console.info(
    `[CaixaUp] Migração concluída em ${seconds.toFixed(2)}s`,
  );
}

/* ============================================================
   MIGRAÇÃO EM SEGUNDO PLANO
============================================================ */

function scheduleLegacyMigration(
  token: string,
) {
  const user = getStoredAuthUser();

  if (!user?.companyId || !user.id) {
    return;
  }

  const owner =
    `${user.companyId}:${user.id}`;

  const marker = createMigrationMarker(
    user.companyId,
    user.id,
  );

  /*
   * Nem cria timer se já estiver migrado.
   */
  if (
    window.localStorage.getItem(marker) === "ok"
  ) {
    return;
  }

  /*
   * Usuário/empresa mudou.
   */
  if (owner !== migrationOwner) {
    migrationOwner = owner;
    migrationPromise = null;
  }

  /*
   * Já existe uma migração em andamento.
   */
  if (migrationPromise) {
    return;
  }

  /*
   * Sem espera nenhuma: começa agora. Continua em segundo plano — ninguém
   * dá await nesta promessa, então a tela não fica presa esperando.
   */
  migrationPromise = migrateLegacyData(token)
    .catch((error) => {
      console.warn(
        "[CaixaUp] Migração em segundo plano falhou.",
        error,
      );
    });
}

/* ============================================================
   SQUARE API
============================================================ */

export async function squareApi<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  if (!API_URL) {
    throw new Error(
      "A API segura do CaixaUp ainda não foi configurada.",
    );
  }

  const { data } =
    await supabase.auth.getSession();

  const token =
    data.session?.access_token;

  if (!token) {
    throw new Error(
      "Sua sessão expirou. Entre novamente.",
    );
  }

  /*
   * Essa é a operação importante para a tela.
   * A migração NÃO fica esperando aqui.
   */
  const method = (init.method || "GET").toUpperCase();
  if (method !== "GET") pendingReads.clear();
  const shareable = Object.keys(init).length === 0;
  const key = `${token}:${path}`;
  const existing = shareable ? pendingReads.get(key) : undefined;
  if (existing) return structuredClone(await existing) as T;

  const execute = async (): Promise<T> => {
    const response = await apiFetch(path, token, init);
    const body = await readResponseBody(response);
    if (!response.ok) {
      throw new Error(body?.message || "Não foi possível concluir a operação.");
    }
    scheduleLegacyMigration(token);
    return body as T;
  };
  if (!shareable) {
    try { return await execute(); }
    finally { if (method !== "GET") pendingReads.clear(); }
  }
  const request = execute();
  pendingReads.set(key, request);
  try {
    return structuredClone(await request);
  } finally {
    if (pendingReads.get(key) === request) pendingReads.delete(key);
  }
}
