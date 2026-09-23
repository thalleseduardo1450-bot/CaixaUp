/**
 * Arquivo: src/services/api/customerService.ts
 * Objetivo: CRUD de clientes direto no Supabase (tabela clientes).
 * Mantém o contrato dos DTOs usados pelas telas (CustomerDto).
 */
import { supabase, currentCompanyId } from "@/lib/supabase";

export type CustomerDto = {
  id: string;
  customerName: string;
  document: string;
  birthDate: string;
  age: string;
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

export type CustomerPayload = Omit<CustomerDto, "id">;

const CUSTOMER_COLUMNS =
  "id, nome, cpf_cnpj, data_nascimento, cep, cidade, estado, logradouro, bairro, complemento, numero, ponto_referencia, telefone_fixo, celular, telefone, email, endereco";

function ageFromDate(value: string) {
  if (!value) return "";
  const birthDate = new Date(`${value}T00:00:00`);
  if (Number.isNaN(birthDate.getTime())) return "";
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const beforeBirthday =
    today.getMonth() < birthDate.getMonth() ||
    (today.getMonth() === birthDate.getMonth() && today.getDate() < birthDate.getDate());
  if (beforeBirthday) age -= 1;
  return age >= 0 ? String(age) : "";
}

function toCustomerDto(customer: any): CustomerDto {
  return {
    id: customer.id,
    customerName: customer.nome ?? "",
    document: customer.cpf_cnpj ?? "",
    birthDate: customer.data_nascimento ?? "",
    age: ageFromDate(customer.data_nascimento ?? ""),
    cep: customer.cep ?? "",
    city: customer.cidade ?? "",
    state: customer.estado ?? "",
    address: customer.logradouro || customer.endereco || "",
    neighborhood: customer.bairro ?? "",
    streetComplement: customer.complemento ?? "",
    number: customer.numero ?? "",
    referencePoint: customer.ponto_referencia ?? "",
    telephone: customer.telefone_fixo || customer.telefone || "",
    cellphone: customer.celular || customer.telefone || "",
    email: customer.email ?? "",
  };
}

function toCustomerRow(empresaId: string, payload: CustomerPayload) {
  return {
    empresa_id: empresaId,
    nome: payload.customerName,
    cpf_cnpj: payload.document ?? "",
    data_nascimento: payload.birthDate || null,
    cep: payload.cep ?? "",
    cidade: payload.city ?? "",
    estado: payload.state ?? "",
    logradouro: payload.address ?? "",
    bairro: payload.neighborhood ?? "",
    complemento: payload.streetComplement ?? "",
    numero: payload.number ?? "",
    ponto_referencia: payload.referencePoint ?? "",
    telefone_fixo: payload.telephone ?? "",
    celular: payload.cellphone ?? "",
    telefone: payload.cellphone || payload.telephone || "",
    email: payload.email ?? "",
    endereco: [
      payload.address,
      payload.number,
      payload.neighborhood,
      payload.city,
      payload.state,
    ]
      .filter(Boolean)
      .join(", "),
  };
}

export const customerService = {
  async list() {
    const empresaId = await currentCompanyId();
    if (!empresaId) return [];

    const { data } = await supabase
      .from("clientes")
      .select(CUSTOMER_COLUMNS)
      .eq("empresa_id", empresaId)
      .order("nome");

    return (data ?? []).map(toCustomerDto);
  },

  async create(payload: CustomerPayload) {
    const empresaId = await currentCompanyId();
    if (!empresaId) throw new Error("Nenhuma empresa vinculada ao seu usuário.");

    const { data, error } = await supabase
      .from("clientes")
      .insert(toCustomerRow(empresaId, payload))
      .select(CUSTOMER_COLUMNS)
      .single();
    if (error) throw error;
    return toCustomerDto(data);
  },

  async update(id: string, payload: CustomerPayload) {
    const empresaId = await currentCompanyId();
    if (!empresaId) throw new Error("Nenhuma empresa vinculada ao seu usuário.");

    const { data, error } = await supabase
      .from("clientes")
      .update(toCustomerRow(empresaId, payload))
      .eq("id", id)
      .select(CUSTOMER_COLUMNS)
      .single();
    if (error) throw error;
    return toCustomerDto(data);
  },

  async remove(id: string) {
    const { error } = await supabase.from("clientes").delete().eq("id", id);
    if (error) throw error;
  },
};
