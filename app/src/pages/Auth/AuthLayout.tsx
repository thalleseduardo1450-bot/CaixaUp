/**
 * Arquivo: src/pages/Auth/AuthLayout.tsx
 * Objetivo: padroniza o layout visual das telas públicas de login, cadastro e recuperação de senha.
 * Entradas esperadas: recebe conteúdo filho e textos de apoio exibidos no painel institucional.
 */
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import CaixaUpLogo from "@/components/Brand/CaixaUpLogo";
import { SUPPORT_EMAIL } from "@/config/brand";

type AuthLayoutProps = {
  title: string;
  description: string;
  children: ReactNode;
  onBackToLogin?: () => void;
};

export default function AuthLayout({
  title,
  description,
  children,
  onBackToLogin,
}: AuthLayoutProps) {
  return (
    <main className="min-h-screen bg-white px-4 py-8 text-text-primary sm:px-6">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-md items-center justify-center">
        <section className="w-full">
          <div className="p-6 sm:p-8">
            <div className="mx-auto w-full max-w-md">
              <div className="mb-8 flex justify-center">
                <CaixaUpLogo markHeight={44} />
              </div>

              {onBackToLogin ? (
                <button
                  type="button"
                  onClick={onBackToLogin}
                  className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-text-secondary hover:text-secondary"
                >
                  <ArrowLeft size={16} />
                  Voltar ao login
                </button>
              ) : null}

              <h2 className="auth-login-reveal-2 text-2xl font-bold text-text-primary">
                {title}
              </h2>
              <p className="auth-login-reveal-3 mt-1 text-sm text-text-secondary">
                {description}
              </p>

              <div className="auth-login-reveal-3 mt-6 space-y-4">{children}</div>

              <p className="mt-6 text-center text-xs text-text-tertiary">
                Precisa de ajuda?{" "}
                <a
                  href={`mailto:${SUPPORT_EMAIL}`}
                  className="font-semibold text-secondary hover:text-hover-secondary"
                >
                  {SUPPORT_EMAIL}
                </a>
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
