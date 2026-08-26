/**
 * Arquivo: src/types/pdv.ts
 * Objetivo: tipos compartilhados da frente de caixa.
 * Entradas esperadas: nenhum; apenas declarações usadas pelos componentes e hooks do PDV.
 *
 * Todo valor monetário aqui é INTEIRO DE CENTAVOS (ver src/utils/pdvMoney.ts).
 * O sufixo "Cents" no nome é intencional: evita que alguém some reais com centavos.
 */
import type { PaymentType } from "@/components/Admin/ReceiptPreviewModal";

/** Produto já normalizado para uso no PDV (preço em centavos). */
export type PdvProduct = {
  id: string;
  name: string;
  code: string;
  alternateCodes?: string[];
  /** Estoque disponível. Pode ser fracionado no cadastro, por isso number. */
  stock: number;
  unitPriceCents: number;
  imageUrl?: string;
  /** Descrição curta usada na busca aproximada. */
  description?: string;
  supplier?: string;
};

/** Item lançado no cupom. */
export type PdvCartItem = {
  /** Id do produto. Também é a chave de agrupamento no carrinho. */
  id: string;
  code: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
  imageUrl?: string;
  /** Momento do lançamento — mantém a ordem de leitura do scanner. */
  addedAt: number;
};

/** Uma linha de pagamento dentro do checkout (permite dividir a venda). */
export type PdvPaymentLine = {
  id: string;
  type: PaymentType;
  amountCents: number;
};

/** Modos de exibição da grade de produtos. */
export type PdvProductViewMode = "grade" | "lista" | "favoritos" | "mais-vendidos";

/** Densidade visual, para caber mais item em terminal pequeno. */
export type PdvDensity = "confortavel" | "compacta";

/** Venda suspensa: o operador guardou o carrinho para atender outro cliente. */
export type PdvSuspendedSale = {
  id: string;
  /** Rótulo curto que o operador reconhece ("Cliente de boné", "Mesa 4"). */
  label: string;
  items: PdvCartItem[];
  customerId: string;
  customerName: string;
  operatorName: string;
  suspendedAt: number;
  totalCents: number;
};

/** Rascunho da venda em andamento, salvo para sobreviver a queda de energia. */
export type PdvDraft = {
  items: PdvCartItem[];
  customerId: string;
  savedAt: number;
};

/** Estado operacional da tela, usado para escolher o que renderizar. */
export type PdvScreenState =
  | "carregando"
  | "caixa-fechado"
  | "pronto"
  | "erro-carregamento";
