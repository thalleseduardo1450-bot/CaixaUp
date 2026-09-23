import { BadgeCheck, Code2, Rocket, ShieldCheck } from "lucide-react";
import PageHeader from "@/components/Admin/PageHeader";
import PageLayout from "@/layout/PageLayout";

const GITHUB_URL = "https://github.com/thalleseduardo1450-bot/CaixaUp";

export default function AboutPdvPage() {
  return (
    <PageLayout>
      <PageHeader
        title="Sobre o CaixaUp"
        description="Informações do sistema, autoria e modelo de licenciamento."
      />

      <section className="card overflow-hidden">
        <div className="border-b border-border-primary bg-gradient-to-r from-secondary/8 via-bg-light to-accent/8 px-5 py-5">
          <h2 className="text-xl font-bold text-text-primary">CaixaUp PDV</h2>
          <p className="mt-1 text-sm text-text-secondary">
            Sistema de caixa e gestão desenvolvido para uma operação simples, rápida e confiável.
          </p>
        </div>

        <div className="grid gap-4 p-5 md:grid-cols-2">
          <article className="rounded-xl border border-border-primary bg-bg-primary p-5">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-secondary/10 text-secondary">
              <BadgeCheck size={20} />
            </span>
            <h3 className="mt-3 font-bold text-text-primary">Desenvolvedor</h3>
            <p className="mt-1 text-sm text-text-secondary">Thalles Eduardo</p>
          </article>

          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            className="rounded-xl border border-border-primary bg-bg-primary p-5 transition hover:border-accent hover:bg-hover-light"
          >
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 text-accent">
              <Code2 size={20} />
            </span>
            <h3 className="mt-3 font-bold text-text-primary">GitHub — Thalles Eduardo</h3>
            <p className="mt-1 break-all text-sm text-accent">{GITHUB_URL}</p>
          </a>

          <article className="rounded-xl border border-border-primary bg-bg-primary p-5">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-success/10 text-success">
              <ShieldCheck size={20} />
            </span>
            <h3 className="mt-3 font-bold text-text-primary">Licenciamento</h3>
            <p className="mt-1 text-sm text-text-secondary">
              Software proprietário. Todos os direitos reservados.
            </p>
          </article>

          <article className="rounded-xl border border-border-primary bg-bg-primary p-5">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Rocket size={20} />
            </span>
            <h3 className="mt-3 font-bold text-text-primary">Evolução contínua</h3>
            <p className="mt-1 text-sm text-text-secondary">
              Atualizações são distribuídas pelo aplicativo para melhorar estabilidade, segurança e operação.
            </p>
          </article>
        </div>
      </section>
    </PageLayout>
  );
}
