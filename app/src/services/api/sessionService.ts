import type { ActiveSession } from "@/components/SettingsPage";
import { supabase } from "@/lib/supabase";

export const sessionService = {
  async list() {
    const { data, error } = await supabase.auth.getUser();
    if (error) throw error;
    if (!data.user) throw new Error("Entre novamente para consultar sua sessão.");
    const mobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
    return [{
      id: data.user.id,
      device: window.caixaUpDesktop ? "CaixaUp neste computador" : mobile ? "Este celular ou tablet" : "Este navegador",
      lastActive: "Agora",
      current: true,
      platform: mobile ? "mobile" : "desktop",
    }] as ActiveSession[];
  },
  async terminateOthers() {
    const { error } = await supabase.auth.signOut({ scope: "others" });
    if (error) throw error;
  },
};
