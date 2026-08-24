import { Check, Sparkles, X } from "lucide-react";

type InstalledUpdateModalProps = DesktopInstalledUpdate & {
  onClose: () => void;
};

export default function InstalledUpdateModal({
  version,
  notes,
  onClose,
}: InstalledUpdateModalProps) {
  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="installed-update-title"
        className="flex max-h-[min(680px,90vh)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border-primary bg-bg-light shadow-2xl"
      >
        <header className="flex items-start gap-4 border-b border-border-primary px-6 py-5">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent/12 text-accent">
            <Sparkles size={22} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="installed-update-title" className="text-2xl font-bold text-text-primary">
              Atualizado para v{version}
            </h2>
            <p className="mt-1 text-sm text-text-secondary">Confira o que mudou nesta versão.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border-primary text-text-secondary transition hover:bg-bg-gray-theme hover:text-text-primary"
            aria-label="Fechar novidades"
          >
            <X size={18} />
          </button>
        </header>

        <div className="overflow-y-auto px-6 py-5">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-success">
            <Check size={17} />
            Instalação concluída com sucesso
          </div>
          <div className="whitespace-pre-line rounded-xl border border-border-primary bg-bg-primary p-5 text-sm leading-7 text-text-primary">
            {notes}
          </div>
        </div>

        <footer className="flex justify-end border-t border-border-primary px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-lg bg-accent px-6 font-semibold text-white transition hover:bg-accent/90"
          >
            Entendi
          </button>
        </footer>
      </section>
    </div>
  );
}
