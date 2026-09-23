import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

type AppErrorBoundaryProps = {
  children: ReactNode;
  title?: string;
};

type AppErrorBoundaryState = {
  error: Error | null;
};

export default class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Falha inesperada na interface do CaixaUp", error, info);
  }

  private retry = () => {
    const message = this.state.error?.message ?? "";
    if (/chunk|dynamically imported|loading css/i.test(message)) {
      window.location.reload();
      return;
    }
    this.setState({ error: null });
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="flex min-h-[420px] w-full items-center justify-center bg-bg-primary p-6">
        <section className="card w-full max-w-lg p-6 text-center" role="alert">
          <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <AlertTriangle size={24} />
          </span>
          <h1 className="mt-4 text-xl font-bold text-text-primary">
            {this.props.title ?? "Não foi possível abrir esta página"}
          </h1>
          <p className="mt-2 text-sm text-text-secondary">
            Uma parte do sistema encontrou um erro inesperado. Seus dados não foram apagados.
          </p>
          <button
            type="button"
            onClick={this.retry}
            className="btn-primary mt-5 inline-flex items-center justify-center gap-2"
          >
            <RefreshCw size={17} />
            Tentar novamente
          </button>
        </section>
      </div>
    );
  }
}
