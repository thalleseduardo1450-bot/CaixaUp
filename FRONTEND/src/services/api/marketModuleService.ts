import type {
  MarketModuleConfig,
  MarketModuleRecordPayload,
} from "@/components/Admin/MarketModulePage";

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
    return emptyConfig(id);
  },
  async createRecord(id: string, _payload: MarketModuleRecordPayload) {
    return emptyConfig(id);
  },
  async updateRecord(id: string, _recordId: string, _payload: MarketModuleRecordPayload) {
    return emptyConfig(id);
  },
  async removeRecord(id: string, _recordId: string) {
    return emptyConfig(id);
  },
};
