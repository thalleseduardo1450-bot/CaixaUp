/**
 * Arquivo: src/main.tsx
 * Objetivo: inicializa o React e monta a aplicação no elemento raiz.
 * Entradas esperadas: espera que exista um elemento #root no HTML base.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ToastContainer } from "@/hooks/Dialog";
import AppErrorBoundary from "@/components/ErrorBoundary/AppErrorBoundary";
import "./index.css";
import App from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ToastContainer />
    <AppErrorBoundary title="O CaixaUp encontrou um problema">
      <App />
    </AppErrorBoundary>
  </StrictMode>,
);
