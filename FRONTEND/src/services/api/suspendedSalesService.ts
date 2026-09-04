import { supabase } from "@/lib/supabase";
import type { PdvCartItem, PdvSuspendedSale } from "@/types/pdv";

export const suspendedSalesService = {
  async list(search = "", page = 0): Promise<PdvSuspendedSale[]> {
    const { data, error } = await supabase.rpc("listar_vendas_suspensas", { p_busca: search, p_pagina: page });
    if (error) throw error;
    return data ?? [];
  },
  async suspend(id: string, items: PdvCartItem[], label: string, customerId = "", token?: string) {
    const { error } = await supabase.rpc("suspender_venda", {
      p_id: id, p_itens: items.map((item) => ({ productId: item.id, quantity: item.quantity })),
      p_label: label, p_cliente: customerId || null, p_token: token || null,
    });
    if (error) throw error;
  },
  async resume(id: string): Promise<PdvSuspendedSale> {
    const { data, error } = await supabase.rpc("retomar_venda", { p_id: id });
    if (error) throw error;
    return data;
  },
  async discard(id: string) {
    const { error } = await supabase.rpc("descartar_venda_suspensa", { p_id: id });
    if (error) throw error;
  },
};
