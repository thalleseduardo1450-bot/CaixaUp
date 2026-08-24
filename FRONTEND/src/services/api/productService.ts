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

export const productService = {
  async list() {
    const empresaId = await currentCompanyId();
    if (!empresaId) return [];

    const { data, error } = await supabase
      .from("produtos")
      .select("id, nome, descricao, codigo_barras, sku, preco_venda, preco_custo, estoque_atual, estoque_minimo, unidade, ativo, categorias(nome)")
      .eq("empresa_id", empresaId)
      .eq("ativo", true)
      .order("nome");
    if (error) throw error;

    return (data ?? []).map((p: any) => ({
      id: p.id,
      productImageUrl: "",
      productImageName: "",
      productName: p.nome ?? "",
      productCode: p.codigo_barras || p.sku || "",
      productSupplier: p.categorias?.nome ?? "",
      productDescription: p.descricao ?? "",
      productQnt: String(p.estoque_atual ?? 0),
      productUnitPrice: reaisToText(p.preco_custo),
      productSalePrice: reaisToText(p.preco_venda),
      totalPriceOnProduct: reaisToText(p.preco_venda),
    }));
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
        nome: payload.productName,
        descricao: payload.productDescription ?? "",
        codigo_barras: payload.productCode ?? "",
        sku: payload.productCode ?? "",
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

    const p = data as any;
    return {
      id: p.id,
      productImageUrl: "",
      productImageName: "",
      productName: p.nome,
      productCode: p.codigo_barras || p.sku || "",
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
        nome: payload.productName,
        descricao: payload.productDescription ?? "",
        codigo_barras: payload.productCode ?? "",
        sku: payload.productCode ?? "",
        preco_venda: parseReais(payload.productSalePrice),
        preco_custo: parseReais(payload.productUnitPrice),
        estoque_atual: Number(payload.productQnt ?? 0),
      })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;

    const p = data as any;
    return {
      id: p.id,
      productImageUrl: "",
      productImageName: "",
      productName: p.nome,
      productCode: p.codigo_barras || p.sku || "",
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
  },
};
