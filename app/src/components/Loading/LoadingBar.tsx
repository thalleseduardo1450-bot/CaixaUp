/**
 *  Componente de barra de carregamento exibida durante o carregamento de páginas ou dados.
 *  Objetivo: fornecer feedback visual de carregamento para melhorar a experiência do usuário.
 *  Entradas esperadas: não recebe props; é exibida ou ocultada pelo componente pai conforme necessário.
 */

const LoadingBar = () => {
  return (
    <div role="status" className="flex items-center gap-3 p-6 text-sm text-text-secondary">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-secondary/20 border-t-secondary" aria-hidden="true" />
      Carregando…
    </div>
  );
};

export default LoadingBar;
