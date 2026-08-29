/**
 * Arquivo: src/components/AppSidebar/AppSidebar.tsx
 * Objetivo: renderiza menu lateral no padrão do legado com suporte a desktop colapsado e drawer mobile.
  * Entradas esperadas: recebe página ativa, usuário, estado responsivo e callbacks de navegação/logout.
*/
import {
  House,
  Menu,
  ShoppingCart,
} from "lucide-react";
import { type ReactNode } from "react";
import CaixaUpLogo from "@/components/Brand/CaixaUpLogo";

export type PageKey =
  | "home"
  | "cadastro-cliente"
  | "cadastro-fornecedor"
  | "cadastro-produto"
  | "historico-vendas"
  | "relatorios"
  | "vendas"
  | "fiscal"
  | "pagamentos"
  | "estoque"
  | "caixa"
  | "compras"
  | "devolucoes"
  | "crm-fidelidade"
  | "omnichannel"
  | "conta-de-usuario"
  | "minha-empresa"
  | "configuracoes"
  | "detalhe-licenca"
  | "sobre-pdv"
  | "editar-perfil";

type SidebarItemProps = {
  icon: ReactNode;
  label: string;
  active?: boolean;
  collapsed: boolean;
  onClick: () => void;
};

type SidebarSectionTitleProps = {
  label: string;
  collapsed: boolean;
};

function SidebarSectionTitle({ label, collapsed }: SidebarSectionTitleProps) {
  if (collapsed) {
    return <div className="my-1 border-t border-border-primary/70" />;
  }

  return (
    <h2 className="px-3 pt-2 pb-1 text-xs font-semibold text-text-tertiary">
      {label}
    </h2>
  );
}

function SidebarItem({
  icon,
  label,
  active,
  collapsed,
  onClick,
}: SidebarItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`sidebar-item group w-full flex items-center gap-3 px-3 py-2.5 min-h-[48px] rounded-lg transition text-left ${
        active
          ? "bg-accent/12 text-text-primary font-semibold"
          : "hover:bg-hover-light hover:text-text-primary"
      }`}
    >
      <div className="text-accent transition-transform duration-200 group-hover:translate-x-0.5">
        {icon}
      </div>
      {!collapsed && <span className="flex-1 whitespace-nowrap">{label}</span>}
    </button>
  );
}

type AppSidebarProps = {
  collapsed: boolean;
  onToggle: () => void;
  activePage: PageKey;
  onChangePage: (page: PageKey) => void;
  onOpenSalesInNewTab: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
};

export default function AppSidebar({
  collapsed,
  onToggle,
  activePage,
  onChangePage,
  onOpenSalesInNewTab,
  mobileOpen,
  onCloseMobile,
}: AppSidebarProps) {
  const handleChangePage = (page: PageKey) => {
    onChangePage(page);
    onCloseMobile();
  };

  return (
    <>
      <aside
        data-app-sidebar
        className={`fixed top-0 left-0 z-layer-sidebar h-screen bg-bg-light border-r border-border-primary transition-all duration-200 flex flex-col justify-between ${
          collapsed ? "w-20" : "w-72"
        } ${mobileOpen ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0 lg:static`}
      >
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="border-b border-border-primary p-3">
          {collapsed ? (
            <div className="flex flex-col items-center gap-2">
              <CaixaUpLogo markOnly markHeight={28} />
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={onToggle}
                  aria-label="Expandir menu lateral"
                  className="hidden p-1.5 rounded-lg hover:bg-accent/10 lg:inline-flex"
                >
                  <Menu size={18} className="text-accent rotate-180" />
                </button>
                <button
                  type="button"
                  onClick={onCloseMobile}
                  className="p-1.5 rounded-lg hover:bg-accent/10 lg:hidden"
                  aria-label="Fechar menu"
                >
                  <Menu size={18} className="text-accent" />
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <CaixaUpLogo size="sm" markHeight={34} />
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={onToggle}
                  aria-label="Recolher menu lateral"
                  className="hidden p-2 rounded-lg hover:bg-accent/10 lg:inline-flex"
                >
                  <Menu
                    size={20}
                    className="text-accent transition-transform duration-300"
                  />
                </button>
                <button
                  type="button"
                  onClick={onCloseMobile}
                  className="p-2 rounded-lg hover:bg-accent/10 lg:hidden"
                  aria-label="Fechar menu"
                >
                  <Menu size={20} className="text-accent" />
                </button>
              </div>
            </div>
          )}
        </div>

        <nav className="flex-1 min-h-0 space-y-4 overflow-y-auto overflow-x-hidden px-2 py-3 text-base font-medium">
          <div className="space-y-2">
            <SidebarSectionTitle label="Principal" collapsed={collapsed} />

            <SidebarItem
              icon={<House size={22} />}
              label="Dashboard"
              active={activePage === "home"}
              collapsed={collapsed}
              onClick={() => handleChangePage("home")}
            />
            <SidebarItem
              icon={<ShoppingCart size={22} />}
              label="PDV / Caixa"
              active={activePage === "vendas"}
              collapsed={collapsed}
              onClick={onOpenSalesInNewTab}
            />
          </div>
        </nav>
      </div>
      </aside>
    </>
  );
}
