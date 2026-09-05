/**
 * Arquivo: src/hooks/Dialog/useStatusDialog.tsx
 * Objetivo: centraliza diálogos de sucesso, erro, carregamento e confirmação.
 * Entradas esperadas: mensagem opcional para cada tipo exibido.
 */
import { useCallback, useEffect, useId, useRef, useState, type JSX } from "react";
import { createPortal } from "react-dom";
import { CircleAlert, CircleCheck, CircleX, LoaderCircle, X } from "lucide-react";

type DialogType = "success" | "error" | "loading" | "confirm";
type ConfirmIntent = "warning" | "success";

type DialogConfig = {
  type: DialogType;
  message?: string;
  confirmIntent?: ConfirmIntent;
  cancelLabel?: string;
  confirmLabel?: string;
};

export function useStatusDialog() {
  const resolver = useRef<((value?: boolean) => void) | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const messageId = useId();
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState<DialogConfig>({
    type: "success",
    message: "",
    confirmIntent: "warning",
    cancelLabel: "Não",
    confirmLabel: "Sim",
  });

  const show = useCallback(
    (
      type: DialogType,
      message?: string,
      options?: { confirmIntent?: ConfirmIntent; cancelLabel?: string; confirmLabel?: string },
    ) => {
      resolver.current?.(false);
      setConfig({
        type,
        message,
        confirmIntent: options?.confirmIntent ?? "warning",
        cancelLabel: options?.cancelLabel ?? "Não",
        confirmLabel: options?.confirmLabel ?? "Sim",
      });
      setOpen(true);

      return new Promise<boolean | void>((resolve) => {
        resolver.current = resolve;
      });
    },
    [],
  );

  const handleClose = useCallback((value?: boolean) => {
    dialogRef.current?.close();
    setOpen(false);
    resolver.current?.(value);
    resolver.current = null;
  }, []);

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, [open]);

  useEffect(() => () => {
    resolver.current?.(false);
    resolver.current = null;
  }, []);

  const iconByType: Record<DialogType, JSX.Element> = {
    success: <CircleCheck className="h-8 w-8 text-success" />,
    error: <CircleX className="h-8 w-8 text-primary" />,
    loading: <LoaderCircle className="h-8 w-8 animate-spin text-secondary" />,
    confirm:
      config.confirmIntent === "success" ? (
        <CircleCheck className="h-8 w-8 text-success" />
      ) : (
        <CircleAlert className="h-8 w-8 text-accent" />
      ),
  };

  const dialogMessage = config.message || "Operação concluída.";

  const Dialog = open ? createPortal(
    <dialog
      ref={dialogRef}
      aria-labelledby={messageId}
      aria-busy={config.type === "loading"}
      className="status-dialog modal-panel-in bg-bg-light text-text-primary rounded-2xl p-0 shadow-xl"
      onCancel={(event) => {
        event.preventDefault();
        if (config.type !== "loading") handleClose(false);
      }}
    >
      <div className="relative flex w-full min-w-0 flex-col items-center gap-4 p-6">
        {config.type !== "loading" && config.type !== "confirm" && (
          <button
            type="button"
            onClick={() => handleClose()}
            className="absolute top-4 right-4 rounded-md p-1 text-text-secondary transition hover:bg-hover-light hover:text-text-primary"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        )}

        {iconByType[config.type]}
        <p id={messageId} className="text-text-primary text-center break-words w-full">{dialogMessage}</p>

        {config.type === "loading" && (
          <p className="text-text-secondary mt-1 text-sm">
            Aguarde, isso pode levar alguns segundos...
          </p>
        )}

        {config.type === "success" && (
          <button
            type="button"
            onClick={() => handleClose()}
            className="btn-success mt-4 w-full"
          >
            OK
          </button>
        )}

        {config.type === "error" && (
          <button
            type="button"
            onClick={() => handleClose()}
            className="btn-cancel mt-4 w-full"
          >
            OK
          </button>
        )}

        {config.type === "confirm" && (
          <div className="status-dialog-actions mt-4 grid w-full grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handleClose(false)}
              className="btn-outline-secondary min-w-0"
            >
              {config.cancelLabel ?? "Não"}
            </button>
            <button
              type="button"
              onClick={() => handleClose(true)}
              className="btn-success flex-1"
            >
              {config.confirmLabel ?? "Sim"}
            </button>
          </div>
        )}
      </div>
    </dialog>,
    document.body,
  ) : null;

  return {
    show,
    success: (msg?: string) => show("success", msg),
    error: (msg?: string) => show("error", msg),
    loading: (msg?: string) => show("loading", msg),
    confirm: (
      msg?: string,
      options?: { confirmIntent?: ConfirmIntent; cancelLabel?: string; confirmLabel?: string },
    ) =>
      show("confirm", msg || "Tem certeza?", options),
    close: () => handleClose(),
    Dialog,
  };
}
