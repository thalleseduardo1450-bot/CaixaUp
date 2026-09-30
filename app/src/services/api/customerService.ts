import { squareApi } from "@/services/api/squareApi";

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

export const customerService = {
  list() {
    return squareApi<CustomerDto[]>("/customers");
  },
  create(payload: CustomerPayload) {
    return squareApi<CustomerDto>("/customers", { method: "POST", body: JSON.stringify(payload) });
  },
  update(id: string, payload: CustomerPayload) {
    return squareApi<CustomerDto>(`/customers/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(payload) });
  },
  remove(id: string) {
    return squareApi<void>(`/customers/${encodeURIComponent(id)}`, { method: "DELETE" });
  },
};
