/**
 *  Componente de barra de carregamento exibida durante o carregamento de páginas ou dados.
 *  Objetivo: fornecer feedback visual de carregamento para melhorar a experiência do usuário.
 *  Entradas esperadas: não recebe props; é exibida ou ocultada pelo componente pai conforme necessário.
 */

const LoadingBar = () => {
  return (
    <div className="fixed top-0 left-0 w-full z-layer-loading">
      <div className="h-0.75 w-full animate-loading-bar bg-linear-to-r from-hover-accent via-accent to-hover-accent bg-size-[500%_auto] origin-left"></div>
    </div>
  );
};

export default LoadingBar;
