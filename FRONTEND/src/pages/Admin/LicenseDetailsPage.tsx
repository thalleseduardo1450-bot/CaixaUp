import { Copyright, FileLock2, ShieldCheck } from "lucide-react";
import PageHeader from "@/components/Admin/PageHeader";
import PageLayout from "@/layout/PageLayout";

export default function LicenseDetailsPage() {
  return (
    <PageLayout>
      <PageHeader
        title="Detalhes da licença"
        description="Condições de uso desta instalação do CaixaUp."
      />

      <section className="card overflow-hidden">
        <div className="border-b border-border-primary bg-gradient-to-r from-secondary/8 via-bg-light to-accent/8 px-5 py-5">
          <h2 className="text-xl font-bold text-text-primary">Licença proprietária</h2>
          <p className="mt-1 text-sm text-text-secondary">
            Esta cópia é destinada exclusivamente ao uso autorizado do estabelecimento.
          </p>
        </div>

        <div className="space-y-4 p-5">
          <article className="rounded-xl border border-success/25 bg-success/10 p-4">
            <p className="inline-flex items-center gap-2 font-bold text-success">
              <ShieldCheck size={18} />
              Software proprietário. Todos os direitos reservados.
            </p>
          </article>

          <article className="rounded-xl border border-border-primary bg-bg-primary p-4">
            <p className="inline-flex items-center gap-2 font-bold text-text-primary">
              <Copyright size={18} className="text-accent" />
              Titularidade
            </p>
            <p className="mt-2 text-sm text-text-secondary">
              Desenvolvido e mantido por Thalles Eduardo. A autorização de uso não transfere a propriedade intelectual do sistema.
            </p>
          </article>

          <article className="rounded-xl border border-border-primary bg-bg-primary p-4">
            <p className="inline-flex items-center gap-2 font-bold text-text-primary">
              <FileLock2 size={18} className="text-accent" />
              Uso autorizado
            </p>
            <p className="mt-2 text-sm text-text-secondary">
              Não é permitida a cópia, redistribuição, publicação ou comercialização sem autorização expressa do titular.
            </p>
          </article>
        </div>
      </section>
    </PageLayout>
  );
}
