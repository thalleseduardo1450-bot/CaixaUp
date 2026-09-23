import CaixaUpLogo from "@/components/Brand/CaixaUpLogo";

export default function DesktopTitleBar({ pageTitle }: { pageTitle: string }) {
  return (
    <header className="desktop-titlebar" aria-label="Barra da janela">
      <div className="desktop-titlebar-brand">
        <CaixaUpLogo markOnly markHeight={22} />
        <span>CaixaUp</span>
      </div>
      <span className="desktop-titlebar-page">{pageTitle}</span>
    </header>
  );
}
