/**
 * Arquivo: src/services/api/productService.ts
 * Objetivo: CRUD de produtos direto no Supabase (tabela produtos).
 * Mantém o contrato dos DTOs usados pelas telas (ProductDto).
 *
 * LIMITE DE 1000 LINHAS
 * O Supabase devolve no máximo 1000 linhas por consulta e corta o resto em
 * silêncio. Com o cadastro do Nex importado, a loja passa disso fácil, e os
 * produtos do fim do alfabeto sumiam do caixa, do estoque e da conferência da
 * importação. Por isso a lista é lida em páginas até vir tudo.
 */
import { supabase, currentCompanyId } from "@/lib/supabase";
import { productCodeKeys } from "@/utils/productCode";

export type ProductDto = {
  id: string;
  productImageUrl: string;
  productImageName: string;
  productName: string;
  productCode: string;
  productAlternateCode?: string;
  productSupplier: string;
  productDescription: string;
  productQnt: string;
  productUnitPrice: string;
  productSalePrice: string;
  totalPriceOnProduct: string;
};

export type ProductPayload = Omit<ProductDto, "id">;

/** numeric(12,2) -> "9,99" (texto pt-BR que o frontend já espera) */
function reaisToText(value: number | string | null | undefined): string {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return "0,00";
  return num.toFixed(2).replace(".", ",");
}

/** "9,99" ou 12.34 -> number */
function parseReais(value: string | number | null | undefined): number {
  if (typeof value === "number") return value;
  const num = Number(String(value ?? "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(num) ? num : 0;
}

const PRODUCT_COLUMNS =
  "id, nome, descricao, codigo_barras, sku, preco_venda, preco_custo, estoque_atual, estoque_minimo, unidade, ativo, imagem_url, imagem_nome, fornecedor, categorias(nome)";

/** Tamanho de cada página. É o teto padrão do Supabase; pedir mais não adianta. */
const PAGE_SIZE = 1000;

function rowToDto(p: any): ProductDto {
  return {
    id: p.id,
    productImageUrl: p.imagem_url ?? "",
    productImageName: p.imagem_nome ?? "",
    productName: p.nome ?? "",
    productCode: p.codigo_barras || p.sku || "",
    productAlternateCode: p.sku || "",
    productSupplier: p.fornecedor || p.categorias?.nome || "",
    productDescription: p.descricao ?? "",
    productQnt: String(p.estoque_atual ?? 0),
    productUnitPrice: reaisToText(p.preco_custo),
    productSalePrice: reaisToText(p.preco_venda),
    totalPriceOnProduct: reaisToText(p.preco_venda),
  };
}

/**
 * Aviso entre janelas: o caixa (?pdv=1) costuma ficar aberto numa janela
 * enquanto o cadastro acontece em outra. Sem isto, o produto recém-cadastrado
 * só aparecia no caixa depois de fechar e abrir de novo.
 */
export const PRODUCTS_CHANGED_CHANNEL = "caixaup-produtos";

function notifyProductsChanged() {
  if (typeof BroadcastChannel === "undefined") return;
  try {
    const channel = new BroadcastChannel(PRODUCTS_CHANGED_CHANNEL);
    channel.postMessage({ at: Date.now() });
    channel.close();
  } catch {
    /* aviso é conveniência: o caixa também se atualiza sozinho de tempos em tempos */
  }
}

/** Variações do código para achar "0789..." quando o leitor manda "789..." e vice-versa. */
function codeVariants(term: string): string[] {
  const variants = new Set<string>();
  const trimmed = term.trim();
  if (trimmed) variants.add(trimmed);
  for (const key of productCodeKeys(trimmed)) {
    variants.add(key);
    variants.add(key.toUpperCase());
    if (/^\d+$/.test(key)) {
      for (const size of [8, 12, 13, 14]) {
        if (key.length < size) variants.add(key.padStart(size, "0"));
      }
    }
  }
  return [...variants].filter((value) => value.length <= 64).slice(0, 20);
}

/**
 * Cada letra vira uma classe com as versões acentuadas, para "acucar" achar
 * "AÇÚCAR" no servidor sem depender de extensão do banco (unaccent).
 */
const ACCENT_CLASSES: Record<string, string> = {
  a: "a\u00e0\u00e1\u00e2\u00e3\u00e4\u00c0\u00c1\u00c2\u00c3\u00c4",
  e: "e\u00e8\u00e9\u00ea\u00eb\u00c8\u00c9\u00ca\u00cb",
  i: "i\u00ec\u00ed\u00ee\u00ef\u00cc\u00cd\u00ce\u00cf",
  o: "o\u00f2\u00f3\u00f4\u00f5\u00f6\u00d2\u00d3\u00d4\u00d5\u00d6",
  u: "u\u00f9\u00fa\u00fb\u00fc\u00d9\u00da\u00db\u00dc",
  c: "c\u00e7\u00c7",
  n: "n\u00f1\u00d1",
};

function accentInsensitivePattern(token: string): string {
  return Array.from(token)
    .map((char) => {
      const group = ACCENT_CLASSES[char];
      if (group) return `[${group}]`;
      return char.replace(/[\\^$.*+?()[\]{}|-]/g, "\\$&");
    })
    .join("");
}

function searchTokens(term: string): string[] {
  return term
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .slice(0, 6);
}

export const productService = {
  async list(): Promise<ProductDto[]> {
    const empresaId = await currentCompanyId();
    if (!empresaId) return [];

    // Ordena por nome e id: com nome repetido, a ordem precisa ser estável
    // entre as páginas, senão um produto cai em duas páginas e outro em nenhuma.
    const page = (from: number, withCount: boolean) =>
      supabase
        .from("produtos")
        .select(PRODUCT_COLUMNS, withCount ? { count: "exact" } : undefined)
        .eq("empresa_id", empresaId)
        .eq("ativo", true)
        .order("nome")
        .order("id")
        .range(from, from + PAGE_SIZE - 1);

    const first = await page(0, true);
    if (first.error) throw first.error;
    const rows: unknown[] = [...(first.data ?? [])];
    const total = typeof first.count === "number" ? first.count : null;

    if (total !== null) {
      // Com o total em mãos, as outras páginas vão juntas (4 por vez) em vez de
      // uma depois da outra: com milhares de produtos o caixa abre bem mais rápido.
      const starts: number[] = [];
      for (let from = PAGE_SIZE; from < total && starts.length < 199; from += PAGE_SIZE) {
        starts.push(from);
      }
      for (let i = 0; i < starts.length; i += 4) {
        const results = await Promise.all(starts.slice(i, i + 4).map((from) => page(from, false)));
        for (const result of results) {
          if (result.error) throw result.error;
          rows.push(...(result.data ?? []));
        }
      }
      return rows.map(rowToDto);
    }

    // Sem o total: página por página até vir uma incompleta.
    for (let n = 1; n < 200 && rows.length % PAGE_SIZE === 0 && rows.length > 0; n += 1) {
      const result = await page(rows.length, false);
      if (result.error) throw result.error;
      const batch = result.data ?? [];
      if (batch.length === 0) break;
      rows.push(...batch);
      if (batch.length < PAGE_SIZE) break;
    }

    return rows.map(rowToDto);
  },

  /**
   * Procura direto no banco. É a rede de segurança do caixa: quando a busca
   * na lista da tela não acha nada, pergunta ao servidor antes de dizer
   * "nenhum produto encontrado" (produto cadastrado em outro computador, por
   * exemplo).
   */
  async search(term: string, limit = 40): Promise<ProductDto[]> {
    const trimmed = term.trim();
    if (!trimmed) return [];

    const empresaId = await currentCompanyId();
    if (!empresaId) return [];

    const base = () =>
      supabase
        .from("produtos")
        .select(PRODUCT_COLUMNS)
        .eq("empresa_id", empresaId)
        .eq("ativo", true);

    const codes = codeVariants(trimmed);
    const tokens = searchTokens(trimmed);
    const requests = [
      codes.length ? base().in("codigo_barras", codes).limit(limit) : null,
      codes.length ? base().in("sku", codes).limit(limit) : null,
      tokens.length
        ? base()
            .filter(
              "nome",
              "imatch",
              `^${tokens.map((token) => `(?=.*${accentInsensitivePattern(token)})`).join("")}`,
            )
            .order("nome")
            .limit(limit)
        : null,
    ].filter((request): request is NonNullable<typeof request> => request !== null);

    const results = await Promise.all(requests);
    const byId = new Map<string, ProductDto>();
    let firstError: unknown = null;
    for (const { data, error } of results) {
      if (error) {
        firstError ??= error;
        continue;
      }
      for (const row of data ?? []) {
        if (!byId.has(row.id)) byId.set(row.id, rowToDto(row));
      }
    }
    if (byId.size === 0 && firstError) throw firstError;
    return [...byId.values()];
  },

  async create(payload: ProductPayload) {
    const empresaId = await currentCompanyId();
    if (!empresaId) throw new Error("Nenhuma empresa vinculada ao seu usuário.");

    // Categoria pelo nome (productSupplier é usado como categoria no PDV)
    let categoriaId: string | null = null;
    if (payload.productSupplier?.trim()) {
      const { data: cat } = await supabase
        .from("categorias")
        .select("id")
        .eq("empresa_id", empresaId)
        .eq("nome", payload.productSupplier.trim())
        .maybeSingle();
      if (cat) categoriaId = cat.id;
    }

    const { data, error } = await supabase
      .from("produtos")
      .insert({
        empresa_id: empresaId,
        imagem_url: payload.productImageUrl ?? "",
        imagem_nome: payload.productImageName ?? "",
        fornecedor: payload.productSupplier ?? "",
        nome: payload.productName,
        descricao: payload.productDescription ?? "",
        codigo_barras: payload.productCode ?? "",
        sku: payload.productAlternateCode || payload.productCode || "",
        preco_venda: parseReais(payload.productSalePrice),
        preco_custo: parseReais(payload.productUnitPrice),
        estoque_atual: Number(payload.productQnt ?? 0),
        unidade: "un",
        ativo: true,
        categoria_id: categoriaId,
      })
      .select()
      .single();
    if (error) throw error;
    notifyProductsChanged();

    const p = data as any;
    return {
      id: p.id,
      productImageUrl: p.imagem_url ?? "",
      productImageName: p.imagem_nome ?? "",
      productName: p.nome,
      productCode: p.codigo_barras || p.sku || "",
      productAlternateCode: p.sku || "",
      productSupplier: payload.productSupplier ?? "",
      productDescription: p.descricao ?? "",
      productQnt: String(p.estoque_atual ?? 0),
      productUnitPrice: reaisToText(p.preco_custo),
      productSalePrice: reaisToText(p.preco_venda),
      totalPriceOnProduct: reaisToText(p.preco_venda),
    };
  },

  async update(id: string, payload: ProductPayload) {
    const { data, error } = await supabase
      .from("produtos")
      .update({
        imagem_url: payload.productImageUrl ?? "",
        imagem_nome: payload.productImageName ?? "",
        fornecedor: payload.productSupplier ?? "",
        nome: payload.productName,
        descricao: payload.productDescription ?? "",
        codigo_barras: payload.productCode ?? "",
        sku: payload.productAlternateCode || payload.productCode || "",
        preco_venda: parseReais(payload.productSalePrice),
        preco_custo: parseReais(payload.productUnitPrice),
        estoque_atual: Number(payload.productQnt ?? 0),
      })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    notifyProductsChanged();

    const p = data as any;
    return {
      id: p.id,
      productImageUrl: p.imagem_url ?? "",
      productImageName: p.imagem_nome ?? "",
      productName: p.nome,
      productCode: p.codigo_barras || p.sku || "",
      productAlternateCode: p.sku || "",
      productSupplier: payload.productSupplier ?? "",
      productDescription: p.descricao ?? "",
      productQnt: String(p.estoque_atual ?? 0),
      productUnitPrice: reaisToText(p.preco_custo),
      productSalePrice: reaisToText(p.preco_venda),
      totalPriceOnProduct: reaisToText(p.preco_venda),
    };
  },

  async remove(id: string) {
    const { error } = await supabase
      .from("produtos")
      .update({ ativo: false })
      .eq("id", id);
    if (error) throw error;
    notifyProductsChanged();
  },
};
