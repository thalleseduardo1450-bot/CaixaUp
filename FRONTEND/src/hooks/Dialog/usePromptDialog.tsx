/**
 * Arquivo: src/hooks/Dialog/usePromptDialog.tsx
 * Objetivo: disponibiliza diálogo de entrada textual com retorno em Promise.
 * Entradas esperadas: título do diálogo e placeholder opcional.
 */
import { useCallback, useState } from "react";
import { X } from "lucide-react";

type PromptConfig = {
  title: string;
  placeholder?: string;
};

let resolver: ((value: string | null) => void) | null = null;

export function usePromptDialog() {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [config, setConfig] = useState<PromptConfig>({ title: "", placeholder: "" });

  const prompt = useCallback((title: string, placeholder?: string) => {
    setConfig({ title, placeholder });
    setValue("");
    setOpen(true);

    return new Promise<string | null>((resolve) => {
      resolver = resolve;
    });
  }, []);

  const handleSave = useCallback(() => {
    if (!value.trim()) return;

    const formatted = value.trim().replace(/\b\w/g, (char) => char.toUpperCase());
    resolver?.(formatted);
    resolver = null;
    setOpen(false);
  }, [value]);

  const handleCancel = useCallback(() => {
    resolver?.(null);
    resolver = null;
    setOpen(false);
  }, []);

  const PromptDialog = open ? (
    <div className="fixed inset-0 z-layer-dialog flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-bg-light relative w-full max-w-md rounded-2xl p-6 shadow-xl">
        <button
          type="button"
          onClick={handleCancel}
          className="absolute top-4 right-4 rounded-md p-1 text-text-secondary transition hover:bg-hover-light hover:text-text-primary"
          aria-label="Fechar"
        >
          <X className="h-5 w-5" />
        </button>

        <h2 className="text-text-primary text-lg font-semibold">{config.title}</h2>

        <input
          type="text"
          placeholder={config.placeholder}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") handleSave();
            if (event.key === "Escape") handleCancel();
          }}
          className="input-field mt-4 w-full"
        />

        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={handleCancel} className="btn-cancel">
            Cancelar
          </button>
          <button type="button" onClick={handleSave} className="btn-success">
            Salvar
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return { prompt, PromptDialog };
}
