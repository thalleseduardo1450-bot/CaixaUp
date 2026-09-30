import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { subscriptionService } from "@/services/api/subscriptionService";

type Subscription = { companyId: string; status: "trial" | "active" | "free"; expiresAt: string | null; serverNow: string; plan?: string };

export default function TrialExpiryNotice() {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    let active = true;
    void subscriptionService.mine().then((data) => {
      if (!active || !data || typeof data !== "object") return;
      const value = data as Subscription;
      const expires = Date.parse(value.expiresAt || "");
      const now = Date.parse(value.serverNow || "");
      const remaining = expires - now;
      const expiredTrial = value.status === "free" && Number.isFinite(remaining) && remaining <= 0;
      const endingTrial = value.status === "trial" && Number.isFinite(remaining) && remaining > 0 && remaining <= 3 * 86400000;
      const kind = expiredTrial ? "downgraded" : "trial";
      const key = `caixaup.trial-notice:${kind}:${value.companyId}:${new Date().toISOString().slice(0, 10)}`;
      if ((endingTrial || expiredTrial) && !localStorage.getItem(key)) {
        setSubscription(value); setDismissed(false);
      }
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  if (!subscription || dismissed) return null;
  const expired = subscription.status === "free";
  const expiry = subscription.expiresAt ? new Date(subscription.expiresAt).toLocaleDateString("pt-BR") : "o fim do período";
  const close = () => {
    localStorage.setItem(`caixaup.trial-notice:${expired ? "downgraded" : "trial"}:${subscription.companyId}:${new Date().toISOString().slice(0, 10)}`, "1");
    setDismissed(true);
  };
  return <section role="status" className="fixed left-1/2 top-4 z-layer-dialog w-[min(92vw,560px)] -translate-x-1/2 rounded-xl border border-accent/30 bg-bg-light p-4 shadow-xl">
    <button type="button" onClick={close} aria-label="Fechar aviso do teste" className="float-right rounded p-1 text-text-secondary hover:bg-hover-light"><X size={18} /></button>
    <h2 className="font-bold">{expired ? "Sua conta voltou ao plano Grátis" : "Seu teste termina em até 3 dias"}</h2>
    <p className="mt-1 pr-8 text-sm text-text-secondary">{expired ? "Os dados foram preservados. Recursos pagos, como relatórios completos, múltiplos pagamentos e cadastros avançados, estão limitados até uma renovação." : `Em ${expiry}, a conta volta automaticamente ao plano Grátis. Seus dados ficam guardados, mas recursos pagos voltam a ficar limitados.`}</p>
    <div className="mt-3 flex gap-2"><button type="button" className="btn-primary" onClick={() => { close(); window.dispatchEvent(new Event("caixaup-open-subscription")); }}>Ver planos</button><button type="button" className="btn-outline-secondary" onClick={close}>Continuar no Grátis</button></div>
  </section>;
}
