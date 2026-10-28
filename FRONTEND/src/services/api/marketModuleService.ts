import type {
  MarketModuleConfig,
  MarketModuleRecordPayload,
} from "@/components/Admin/MarketModulePage";
import { supabase, currentCompanyId } from '@/lib/supabase';

const moduleNames: Record<string, { title: string; description: string; records: string }> = {
  compras: {
    title: "Compras e reposição",
    description: "Acompanhe pedidos de compra e reposições do estabelecimento.",
    records: "Pedidos de compra",
  },
  devolucoes: {
    title: "Trocas e devoluções",
    description: "Organize ocorrências de troca e devolução de mercadorias.",
    records: "Ocorrências registradas",
  },
  "crm-fidelidade": {
    title: "CRM e fidelidade",
    description: "Acompanhe ações de relacionamento e fidelização de clientes.",
    records: "Ações de relacionamento",
  },
  omnichannel: {
    title: "Canais e integrações",
    description: "Consulte integrações e canais conectados à operação.",
    records: "Integrações cadastradas",
  },
};

function emptyConfig(id: string): MarketModuleConfig {
  const module = moduleNames[id] ?? {
    title: "Módulo operacional",
    description: "Área operacional do CaixaUp.",
    records: "Registros",
  };
  return {
    id,
    title: module.title,
    description: module.description,
    primaryAction: "Novo registro",
    statusLabel: "Situação",
    statusValue: "Nenhum registro",
    kpis: [
      { label: "Total", value: "0", hint: "registros cadastrados", tone: "secondary" },
      { label: "Pendentes", value: "0", hint: "aguardando ação", tone: "accent" },
      { label: "Concluídos", value: "0", hint: "finalizados", tone: "success" },
      { label: "Alertas", value: "0", hint: "exigem atenção", tone: "primary" },
    ],
    recordsTitle: module.records,
    records: [],
    workflowTitle: "Como usar este módulo",
    workflow: [
      "Cadastre um registro pela ação principal.",
      "Acompanhe o andamento e mantenha o status atualizado.",
      "Revise os registros concluídos periodicamente.",
    ],
    alerts: ["Nenhum alerta operacional no momento."],
  };
}

export const marketModuleService = {
  async get(id: string) {
    const { data, error } = await supabase.from('registros_operacionais').select('id, dados').eq('modulo', id).order('created_at', { ascending: false });
    if (error) throw error;
    const config = emptyConfig(id);
    config.records = (data ?? []).map(row => ({ ...row.dados, id: row.id }));
    config.kpis[0].value = String(config.records.length);
    config.statusValue = config.records.length ? 'Em operação' : 'Nenhum registro';
    return config;
  },
  async createRecord(id: string, payload: MarketModuleRecordPayload) {
    const empresaId = await currentCompanyId();
    if (!empresaId) throw new Error('Nenhuma empresa vinculada.');
    const { error } = await supabase.from('registros_operacionais').insert({ empresa_id: empresaId, modulo: id, dados: payload });
    if (error) throw error;
    return this.get(id);
  },
  async updateRecord(id: string, recordId: string, payload: MarketModuleRecordPayload) {
    const { error } = await supabase.from('registros_operacionais').update({ dados: payload }).eq('id', recordId).eq('modulo', id).select('id').single();
    if (error) throw error;
    return this.get(id);
  },
  async removeRecord(id: string, recordId: string) {
    const { error } = await supabase.from('registros_operacionais').delete().eq('id', recordId).eq('modulo', id);
    if (error) throw error;
    return this.get(id);
  },
};
