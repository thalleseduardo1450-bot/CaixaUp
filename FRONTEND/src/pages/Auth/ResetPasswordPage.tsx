/**
 * Arquivo: src/pages/Auth/ResetPasswordPage.tsx
 * Objetivo: renderiza definição de nova senha a partir do token de recuperação.
 * Entradas esperadas: recebe callback para retorno ao login; lê o token da URL e envia a nova senha para a API.
 */
import { KeyRound } from "lucide-react";
import { useState } from "react";
import LoadingButton from "@/components/Loading/LoadingButton";
import useRecaptchaV3 from "@/hooks/Security/useRecaptchaV3";
import AuthLayout from "./AuthLayout";
import { FeedbackMessage, PasswordField } from "./AuthFields";
import type { AuthActionResult } from "./types";

type ResetPasswordPageProps = {
  initialToken: string;
  onResetPassword: (
    token: string,
    nextPassword: string,
    confirmPassword: string,
    recaptchaToken?: string,
  ) => Promise<AuthActionResult>;
  onOpenLogin: () => void;
  closeAfterSuccess?: boolean;
};

export default function ResetPasswordPage({
  initialToken,
  onResetPassword,
  onOpenLogin,
  closeAfterSuccess = false,
}: ResetPasswordPageProps) {
  const { executeRecaptcha, isRecaptchaConfigured } = useRecaptchaV3();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<AuthActionResult | null>(null);

  const handleSubmit = async () => {
    if (password.length < 8) {
      setFeedback({
        success: false,
        message: "A nova senha deve ter pelo menos 8 caracteres.",
      });
      return;
    }
    if (password !== confirmPassword) {
      setFeedback({ success: false, message: "A confirmação de senha não confere." });
      return;
    }

    setIsSubmitting(true);
    try {
      const recaptchaToken = isRecaptchaConfigured
        ? await executeRecaptcha("password_reset")
        : "";
      const result = await onResetPassword(initialToken, password, confirmPassword, recaptchaToken);
      setFeedback(result);
      if (result.success) {
        setPassword("");
        setConfirmPassword("");
        if (closeAfterSuccess) {
          setFeedback({
            success: true,
            message: "Senha redefinida com sucesso. Fechando esta página...",
          });
          window.setTimeout(() => {
            window.open("", "_self");
            window.close();
            window.setTimeout(() => window.location.replace("about:blank"), 300);
          }, 700);
          return;
        }
        onOpenLogin();
      }
    } catch (error) {
      setFeedback(toErrorResult(error, "Não foi possível redefinir a senha."));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Redefinir senha"
      description="Crie uma nova senha para voltar ao painel."
      onBackToLogin={onOpenLogin}
    >
      <PasswordField
        label="Nova senha"
        value={password}
        show={showPassword}
        onChange={setPassword}
        onToggle={() => setShowPassword((current) => !current)}
        onEnter={handleSubmit}
      />
      <PasswordField
        label="Confirmar senha"
        value={confirmPassword}
        show={showPassword}
        onChange={setConfirmPassword}
        onToggle={() => setShowPassword((current) => !current)}
        onEnter={handleSubmit}
      />

      <LoadingButton
        type="button"
        onClick={handleSubmit}
        isLoading={isSubmitting}
        loadingLabel="Salvando..."
        className="btn-primary inline-flex min-h-11 w-full items-center justify-center gap-2"
      >
        <KeyRound size={16} />
        Redefinir senha
      </LoadingButton>

      <FeedbackMessage result={feedback} />
    </AuthLayout>
  );
}

function toErrorResult(error: unknown, fallback: string): AuthActionResult {
  return {
    success: false,
    message: error instanceof Error ? error.message : fallback,
  };
}
