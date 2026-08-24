/**
 * Arquivo: src/services/api/sessionService.ts
 * Objetivo: sessões ativas no Supabase. O schema atual não tem tabela de
 * sessões de dispositivo; mantemos o contrato retornando lista vazia.
 */
import type { ActiveSession } from "@/components/SettingsPage";

export const sessionService = {
  async list() {
    return [] as ActiveSession[];
  },
  async terminate(_sessionId: string) {
    return [] as ActiveSession[];
  },
  async terminateOthers() {
    return [] as ActiveSession[];
  },
};
