/**
 * Arquivo: src/services/api/productService.ts
 * Objetivo: CRUD de produtos direto no Supabase (tabela produtos).
 * Mantém o contrato dos DTOs usados pelas telas (ProductDto).
 */
import { supabase, currentCompanyId } from "@/lib/supabase";

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
  productActive?: boolean;
};

export type ProductPayload = Omit<ProductDto, "id">;

const PRODUCT_PAGE_SIZE = 1000;

/** numeric(12,2) -> "9,99" (texto pt-BR que o frontend já espera) */
function reaisToText(value: number | string | null | undefined): string {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return "0,00";
  return num.toFixed(2).replace(".", ",");
}

/** "9,99" ou 12.34 -> number */
function parseReais(value: string | number | null | undefined): number {
  const text = String(value ?? "").trim();
  const num = typeof value === "number" ? value : Number(text.replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(num) || num < 0 || num > 9999999999.99) {
    throw new Error("Informe um preço válido entre 0 e 9.999.999.999,99.");
  }
  return num;
}

function productFields(payload: ProductPayload) {
  const nome = payload.productName.trim();
  const codigo = payload.productCode.trim();
  if (nome.length < 3 || !codigo || !String(payload.productSalePrice ?? "").trim()) {
    throw new Error("Informe nome com pelo menos 3 caracteres, código e preço de venda.");
  }
  const quantityText = String(payload.productQnt ?? "").trim().replace(",", ".");
  const quantity = Number(quantityText);
  if (!Number.isFinite(quantity) || quantity < 0 || quantity > 999999999.999) {
    throw new Error("Informe uma quantidade válida e não negativa.");
  }
  return {
    nome,
    descricao: payload.productDescription?.trim() ?? "",
    codigo_barras: codigo,
    sku: payload.productAlternateCode?.trim() || codigo,
    preco_venda: parseReais(payload.productSalePrice),
    preco_custo: parseReais(payload.productUnitPrice),
    ...(quantityText ? { estoque_atual: quantity } : {}),
  };
}

function saveError(error: { code?: string; message?: string }): Error {
  if (error.code === "23505") return new Error("Já existe um produto com este código, inclusive entre os inativos. Use outro código ou edite o produto existente.");
  if (error.code === "42501") return new Error("Sua conta não tem permissão para salvar produtos nesta empresa.");
  if (error.code === "PGRST116") return new Error("Não foi possível confirmar o produto salvo. Atualize a lista antes de tentar novamente.");
  if (["23502", "23503", "23514", "22003", "22P02"].includes(error.code ?? "")) return new Error("O banco rejeitou os dados do produto. Verifique código, preços e quantidade.");
  if (/fetch|network|timeout/i.test(error.message ?? "")) return new Error("Falha de conexão ao salvar. Atualize a lista para verificar se o produto foi registrado antes de tentar novamente.");
  return new Error("Não foi possível salvar o produto. Verifique sua sessão e a conexão e atualize a lista antes de tentar novamente.");
}

export const productService = {
  async list(options: { includeInactive?: boolean } = {}) {
    const empresaId = await currentCompanyId();
    if (!empresaId) return [];

    const rows: any[] = [];
    for (let from = 0; ; from += PRODUCT_PAGE_SIZE) {
      let query = supabase
        .from("produtos")
        .select("id, nome, descricao, codigo_barras, sku, preco_venda, preco_custo, estoque_atual, estoque_minimo, unidade, ativo, categorias(nome)")
        .eq("empresa_id", empresaId);
      if (!options.includeInactive) query = query.eq("ativo", true);
      const { data, error } = await query
        .order("nome")
        .order("id")
        .range(from, from + PRODUCT_PAGE_SIZE - 1);
      if (error) throw error;
      rows.push(...(data ?? []));
      if ((data?.length ?? 0) < PRODUCT_PAGE_SIZE) break;
    }

    return rows.map((p: any) => ({
      id: p.id,
      productImageUrl: "",
      productImageName: "",
      productName: p.nome ?? "",
      productCode: p.codigo_barras || p.sku || "",
      productAlternateCode: p.sku || "",
      productSupplier: p.categorias?.nome ?? "",
      productDescription: p.descricao ?? "",
      productQnt: String(p.estoque_atual ?? 0),
      productUnitPrice: reaisToText(p.preco_custo),
      productSalePrice: reaisToText(p.preco_venda),
      totalPriceOnProduct: reaisToText(p.preco_venda),
      productActive: p.ativo !== false,
    }));
  },

  async create(payload: ProductPayload) {
    const fields = productFields(payload);
    const empresaId = await currentCompanyId();
    if (!empresaId) throw new Error("Nenhuma empresa vinculada ao seu usuário.");

    // Categoria pelo nome (productSupplier é usado como categoria no PDV)
    let categoriaId: string | null = null;
    if (payload.productSupplier?.trim()) {
      const { data: cat, error: categoryError } = await supabase
        .from("categorias")
        .select("id")
        .eq("empresa_id", empresaId)
        .eq("nome", payload.productSupplier.trim())
        .maybeSingle();
      if (categoryError) throw saveError(categoryError);
      if (cat) categoriaId = cat.id;
    }

    const { data, error } = await supabase
      .from("produtos")
      .insert({
        empresa_id: empresaId,
        estoque_atual: 0,
        ...fields,
        unidade: "un",
        ativo: true,
        categoria_id: categoriaId,
      })
      .select()
      .single();
    if (error) throw saveError(error);

    const p = data;
    return {
      id: p.id,
      productImageUrl: "",
      productImageName: "",
      productName: p.nome,
      productCode: p.codigo_barras || p.sku || "",
      productAlternateCode: p.sku || "",
      productSupplier: payload.productSupplier ?? "",
      productDescription: p.descricao ?? "",
      productQnt: String(p.estoque_atual ?? 0),
      productUnitPrice: reaisToText(p.preco_custo),
      productSalePrice: reaisToText(p.preco_venda),
      totalPriceOnProduct: reaisToText(p.preco_venda),
      productActive: p.ativo !== false,
    };
  },

  async update(id: string, payload: ProductPayload) {
    const fields = productFields(payload);
    const empresaId = await currentCompanyId();
    if (!empresaId) throw new Error("Nenhuma empresa vinculada ao seu usuário.");
    const { data, error } = await supabase
      .from("produtos")
      .update({ ...fields, ativo: true })
      .eq("id", id)
      .eq("empresa_id", empresaId)
      .select()
      .single();
    if (error) throw saveError(error);

    const p = data;
    return {
      id: p.id,
      productImageUrl: "",
      productImageName: "",
      productName: p.nome,
      productCode: p.codigo_barras || p.sku || "",
      productAlternateCode: p.sku || "",
      productSupplier: payload.productSupplier ?? "",
      productDescription: p.descricao ?? "",
      productQnt: String(p.estoque_atual ?? 0),
      productUnitPrice: reaisToText(p.preco_custo),
      productSalePrice: reaisToText(p.preco_venda),
      totalPriceOnProduct: reaisToText(p.preco_venda),
      productActive: p.ativo !== false,
    };
  },

  async restore(id: string) {
    const empresaId = await currentCompanyId();
    if (!empresaId) throw new Error("Nenhuma empresa vinculada ao seu usuário.");
    const { error } = await supabase
      .from("produtos")
      .update({ ativo: true })
      .eq("id", id)
      .eq("empresa_id", empresaId);
    if (error) throw saveError(error);
  },

  async remove(id: string) {
    const empresaId = await currentCompanyId();
    if (!empresaId) throw new Error("Nenhuma empresa vinculada ao seu usuário.");
    const { error } = await supabase
      .from("produtos")
      .update({ ativo: false })
      .eq("id", id)
      .eq("empresa_id", empresaId);
    if (error) throw saveError(error);
  },
};
