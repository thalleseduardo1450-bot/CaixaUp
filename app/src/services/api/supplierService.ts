/**
 * Arquivo: src/services/api/supplierService.ts
 * Objetivo: fornecedores no Supabase. O schema atual não tem tabela própria
 * de fornecedores; mantemos o contrato retornando lista vazia para não quebrar
 * a tela, com mensagem clara quando tentar gravar.
 */
import { currentCompanyId } from "@/lib/supabase";

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
    // Sem tabela de fornecedores no schema atual — lista vazia.
    return [] as SupplierDto[];
  },
  async create(_payload: SupplierPayload): Promise<SupplierDto> {
    const empresaId = await currentCompanyId();
    if (!empresaId) throw new Error("Nenhuma empresa vinculada ao seu usuário.");
    throw new Error("Cadastro de fornecedores disponível em breve nesta versão.");
  },
  async update(_id: string, _payload: SupplierPayload): Promise<SupplierDto> {
    throw new Error("Cadastro de fornecedores disponível em breve nesta versão.");
  },
  async remove(_id: string): Promise<void> {
    throw new Error("Cadastro de fornecedores disponível em breve nesta versão.");
  },
};
