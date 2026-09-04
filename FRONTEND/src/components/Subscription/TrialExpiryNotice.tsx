import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { supabase } from "@/lib/supabase";

type Subscription = { companyId: string; status: "trial" | "active" | "free"; expiresAt: string | null; serverNow: string };

export default function TrialExpiryNotice() {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    let active = true;
    void supabase.rpc("minha_assinatura").then(({ data, error }) => {
      if (!active || error || !data || typeof data !== "object") return;
      const value = data as Subscription;
      const expires = Date.parse(value.expiresAt || "");
      const now = Date.parse(value.serverNow || "");
      const remaining = expires - now;
      const key = `caixaup.trial-notice:${value.companyId}:${value.expiresAt}`;
      if (value.status === "trial" && Number.isFinite(remaining) && remaining > 0 && remaining <= 3 * 86400000 && !localStorage.getItem(key)) {
        setSubscription(value); setDismissed(false);
      }
    });
    return () => { active = false; };
  }, []);

  if (!subscription || dismissed) return null;
  const expiry = new Date(subscription.expiresAt || "").toLocaleDateString("pt-BR");
  const close = () => {
    localStorage.setItem(`caixaup.trial-notice:${subscription.companyId}:${subscription.expiresAt}`, "1");
    setDismissed(true);
  };
  return <section role="status" className="fixed left-1/2 top-4 z-layer-dialog w-[min(92vw,560px)] -translate-x-1/2 rounded-xl border border-accent/30 bg-bg-light p-4 shadow-xl">
    <button type="button" onClick={close} aria-label="Fechar aviso do teste" className="float-right rounded p-1 text-text-secondary hover:bg-hover-light"><X size={18} /></button>
    <h2 className="font-bold">Seu teste termina em até 3 dias</h2>
    <p className="mt-1 pr-8 text-sm text-text-secondary">Em {expiry}, a conta volta automaticamente ao plano Grátis. Seus dados ficam guardados, mas recursos pagos voltam a ficar limitados.</p>
    <div className="mt-3 flex gap-2"><button type="button" className="btn-primary" onClick={() => { close(); window.dispatchEvent(new Event("caixaup-open-subscription")); }}>Ver planos</button><button type="button" className="btn-outline-secondary" onClick={close}>Continuar no Grátis</button></div>
  </section>;
}
