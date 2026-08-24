/**
 * Arquivo: src/components/AppSidebar/AppSidebar.tsx
 * Objetivo: renderiza menu lateral no padrão do legado com suporte a desktop colapsado e drawer mobile.
  * Entradas esperadas: recebe página ativa, usuário, estado responsivo e callbacks de navegação/logout.
*/
import {
  Boxes,
  Building2,
  FileText,
  History,
  House,
  Landmark,
  Menu,
  Package,
  Settings,
  ShoppingCart,
  Truck,
  UserRoundPlus,
} from "lucide-react";
import { type ReactNode } from "react";
import CaixaUpLogo from "@/components/Brand/CaixaUpLogo";
import UserMenu from "./UserMenu";

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
  currentUserName: string;
  currentUserPermission: string;
  currentUserAvatarUrl: string | null;
  onOpenProfile: () => void;
  onOpenSettings: () => void;
  onLogout: () => void;
  onOpenSalesInNewTab: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
};

export default function AppSidebar({
  collapsed,
  onToggle,
  activePage,
  onChangePage,
  currentUserName,
  currentUserPermission,
  currentUserAvatarUrl,
  onOpenProfile,
  onOpenSettings,
  onLogout,
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
            <SidebarItem
              icon={<Landmark size={22} />}
              label="Abrir ou fechar caixa"
              active={activePage === "caixa"}
              collapsed={collapsed}
              onClick={() => handleChangePage("caixa")}
            />
          </div>

          <div className="space-y-2">
            <SidebarSectionTitle label="Cadastros" collapsed={collapsed} />
            <SidebarItem
              icon={<UserRoundPlus size={22} />}
              label="Clientes"
              active={activePage === "cadastro-cliente"}
              collapsed={collapsed}
              onClick={() => handleChangePage("cadastro-cliente")}
            />
            <SidebarItem
              icon={<Truck size={22} />}
              label="Fornecedores"
              active={activePage === "cadastro-fornecedor"}
              collapsed={collapsed}
              onClick={() => handleChangePage("cadastro-fornecedor")}
            />
            <SidebarItem
              icon={<Package size={22} />}
              label="Produtos"
              active={activePage === "cadastro-produto"}
              collapsed={collapsed}
              onClick={() => handleChangePage("cadastro-produto")}
            />
            <SidebarItem
              icon={<Boxes size={22} />}
              label="Estoque"
              active={activePage === "estoque"}
              collapsed={collapsed}
              onClick={() => handleChangePage("estoque")}
            />
          </div>

          <div className="space-y-2">
            <SidebarSectionTitle label="Consultas" collapsed={collapsed} />
            <SidebarItem
              icon={<History size={22} />}
              label="Histórico de Vendas"
              active={activePage === "historico-vendas"}
              collapsed={collapsed}
              onClick={() => handleChangePage("historico-vendas")}
            />
            <SidebarItem
              icon={<FileText size={22} />}
              label="Relatórios"
              active={activePage === "relatorios"}
              collapsed={collapsed}
              onClick={() => handleChangePage("relatorios")}
            />
          </div>

          <div className="space-y-2">
            <SidebarSectionTitle label="Empresa" collapsed={collapsed} />
            <SidebarItem
              icon={<Building2 size={22} />}
              label="Dados da empresa"
              active={activePage === "minha-empresa"}
              collapsed={collapsed}
              onClick={() => handleChangePage("minha-empresa")}
            />
            <SidebarItem
              icon={<Settings size={22} />}
              label="Configurações"
              active={activePage === "configuracoes"}
              collapsed={collapsed}
              onClick={() => handleChangePage("configuracoes")}
            />
          </div>
        </nav>
      </div>

      <div className="p-3 border-t border-border-primary">
        <UserMenu
          collapsed={collapsed}
          currentUserName={currentUserName}
          currentUserPermission={currentUserPermission}
          avatarUrl={currentUserAvatarUrl}
          onOpenProfile={() => {
            onOpenProfile();
            onCloseMobile();
          }}
          onOpenSettings={() => {
            onOpenSettings();
            onCloseMobile();
          }}
          onOpenCompany={() => handleChangePage("minha-empresa")}
          onOpenLicense={() => handleChangePage("detalhe-licenca")}
          onOpenAbout={() => handleChangePage("sobre-pdv")}
          onLogout={() => {
            onLogout();
            onCloseMobile();
          }}
        />
      </div>
      </aside>
    </>
  );
}
