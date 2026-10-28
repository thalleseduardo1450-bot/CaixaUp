/**
 * Arquivo: src/services/api/supplierService.ts
 * Objetivo: fornecedores no Supabase. O schema atual não tem tabela própria
 * de fornecedores; mantemos o contrato retornando lista vazia para não quebrar
 * a tela, com mensagem clara quando tentar gravar.
 */
import { supabase, currentCompanyId } from "@/lib/supabase";

export type SupplierDto = {
  id: string;
  companyName: string;
  fantasyName: string;
  cnpj: string;
  cep: string;
  city: string;
  state: string;
  address: string;
  neighborhood: string;
  streetComplement: string;
  number: string;
  referencePoint: string;
  telephone: string;
  cellphone: string;
  email: string;
};

export type SupplierPayload = Omit<SupplierDto, "id">;

export const supplierService = {
  async list() {
    const { data, error } = await supabase.from('fornecedores').select('id, dados').order('created_at');
    if (error) throw error;
    return (data ?? []).map(row => ({ ...row.dados, id: row.id })) as SupplierDto[];
  },
  async create(payload: SupplierPayload): Promise<SupplierDto> {
    const empresaId = await currentCompanyId();
    if (!empresaId) throw new Error("Nenhuma empresa vinculada ao seu usuário.");
    const { data, error } = await supabase.from('fornecedores').insert({ empresa_id: empresaId, dados: payload }).select('id').single();
    if (error) throw error;
    return { ...payload, id: data.id };
  },
  async update(id: string, payload: SupplierPayload): Promise<SupplierDto> {
    const { error } = await supabase.from('fornecedores').update({ dados: payload }).eq('id', id).select('id').single();
    if (error) throw error;
    return { ...payload, id };
  },
  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('fornecedores').delete().eq('id', id);
    if (error) throw error;
  },
};
