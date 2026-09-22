/**
 * Arquivo: src/services/api/companyService.ts
 * Objetivo: dados da empresa direto no Supabase (tabela empresas).
 * A empresa é a do perfil do usuário logado.
 */
import { supabase, currentCompanyId } from "@/lib/supabase";
import { squareApi } from "@/services/api/squareApi";

export type CompanyDto = {
  fantasyName: string;
  corporateName: string;
  cnpj: string;
  stateRegistration: string;
  website: string;
  email: string;
  sacPhone: string;
  phone: string;
  mobile: string;
  cep: string;
  address: string;
  number: string;
  neighborhood: string;
  city: string;
  uf: string;
  complement: string;
};

type EmpresaRow = Partial<Record<
  "nome" | "nome_fantasia" | "documento" | "email" | "telefone" | "cep" | "endereco" | "numero" | "bairro" | "cidade" | "uf",
  string | null
>>;

function toCompanyDto(e: EmpresaRow): CompanyDto {
  return {
    fantasyName: e.nome_fantasia || e.nome || "",
    corporateName: e.nome || "",
    cnpj: e.documento || "",
    stateRegistration: "",
    website: "",
    email: e.email || "",
    sacPhone: e.telefone || "",
    phone: e.telefone || "",
    mobile: e.telefone || "",
    cep: e.cep || "",
    address: e.endereco || "",
    number: e.numero || "",
    neighborhood: e.bairro || "",
    city: e.cidade || "",
    uf: e.uf || "",
    complement: "",
  };
}

export const companyService = {
  /**
   * Logo da empresa, compartilhada por todos os usuários dela. Fica no banco do
   * Square Cloud, servida pela API (não mais no Supabase nem no navegador).
   * `undefined` = não deu para saber (sem rede); quem chama mantém o que tinha.
   */
  async getLogo(): Promise<string | null | undefined> {
    try {
      const { logo } = await squareApi<{ logo: string | null }>("/company/logo");
      return logo ?? null;
    } catch {
      return undefined;
    }
  },

  /** Grava a logo (data URL) ou remove com `null`. A API limita a proprietário/administrador. */
  async saveLogo(logo: string | null) {
    await squareApi("/company/logo", { method: "PUT", body: JSON.stringify({ logo }) });
  },

  async get() {
    const empresaId = await currentCompanyId();
    if (!empresaId) return null;

    const { data } = await supabase.from("empresas").select("*").eq("id", empresaId).maybeSingle();
    if (!data) return null;
    return toCompanyDto(data);
  },

  async update(payload: CompanyDto) {
    const empresaId = await currentCompanyId();
    if (!empresaId) throw new Error("Nenhuma empresa vinculada ao seu usuário.");

    const { data, error } = await supabase
      .from("empresas")
      .update({
        nome: payload.corporateName || payload.fantasyName,
        nome_fantasia: payload.fantasyName,
        documento: payload.cnpj || "",
        email: payload.email || "",
        telefone: payload.phone || payload.mobile || "",
        endereco: payload.address || "",
        numero: payload.number || "",
        bairro: payload.neighborhood || "",
        cidade: payload.city || "",
        uf: payload.uf || "",
        cep: payload.cep || "",
      })
      .eq("id", empresaId)
      .select()
      .single();
    if (error) throw error;
    return toCompanyDto(data);
  },
};
