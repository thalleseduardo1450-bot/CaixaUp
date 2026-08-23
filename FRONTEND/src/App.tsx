/**
 * Arquivo: src/App.tsx
 * Objetivo: orquestra o shell administrativo com sidebar, cabeçalho mobile e lazy loading das páginas.
 * Entradas esperadas: não recebe props; controla estado global de navegação local.
 */
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { CircleHelp, Menu } from "lucide-react";
import AppSidebar, { type PageKey } from "@/components/AppSidebar/AppSidebar";
import LoadingBar from "@/components/Loading/LoadingBar";
import GuidedTour from "@/components/Tour/GuidedTour";
import { APP_OPEN_TOUR_EVENT } from "@/domain/navigation/events";
import { Toast, useStatusDialog } from "@/hooks/Dialog";
import ForgotPasswordPage from "@/pages/Auth/ForgotPasswordPage";
import LoginPage from "@/pages/Auth/LoginPage";
import RegisterPage from "@/pages/Auth/RegisterPage";
import ResetPasswordPage from "@/pages/Auth/ResetPasswordPage";
import type { RegisterFormPayload } from "@/pages/Auth/types";
import { authService } from "@/services/api/authService";
import { autoLoginAtivo, tentarAutoLogin } from "@/utils/autoLogin";
import { cashRegisterService } from "@/services/api/cashRegisterService";
import {
  clearAuthSession,
  getStoredAuthUser,
  setAuthSession,
  type AuthenticatedUser,
} from "@/utils/authStorage";

const HomePage = lazy(() => import("@/pages/Admin/HomePage"));
const CustomerRegisterPage = lazy(
  () => import("@/pages/Admin/CustomerRegisterPage"),
);
const SupplierRegisterPage = lazy(
  () => import("@/pages/Admin/SupplierRegisterPage"),
);
const ProductRegisterPage = lazy(
  () => import("@/pages/Admin/ProductRegisterPage"),
);
const SalesHistoryPage = lazy(() => import("@/pages/Admin/SalesHistoryPage"));
const SalesStartPage = lazy(() => import("@/pages/Admin/SalesStartPage"));
const ReportsPage = lazy(() => import("@/pages/Admin/ReportsPage"));
const UserAccountsPage = lazy(() => import("@/pages/Admin/UserAccountsPage"));
const FiscalPage = lazy(() => import("@/pages/Admin/FiscalPage"));
const PaymentsPage = lazy(() => import("@/pages/Admin/PaymentsPage"));
const StockPage = lazy(() => import("@/pages/Admin/StockPage"));
const CashRegisterPage = lazy(() => import("@/pages/Admin/CashRegisterPage"));
const PurchasesPage = lazy(() => import("@/pages/Admin/PurchasesPage"));
const ReturnsPage = lazy(() => import("@/pages/Admin/ReturnsPage"));
const CrmLoyaltyPage = lazy(() => import("@/pages/Admin/CrmLoyaltyPage"));
const OmnichannelPage = lazy(() => import("@/pages/Admin/OmnichannelPage"));
const SettingsPage = lazy(() => import("@/pages/Admin/SettingsPage"));
const MyCompanyPage = lazy(() => import("@/pages/Admin/MyCompanyPage"));
const LicenseDetailsPage = lazy(
  () => import("@/pages/Admin/LicenseDetailsPage"),
);
const AboutPdvPage = lazy(() => import("@/pages/Admin/AboutPdvPage"));
const EditProfilePage = lazy(() => import("@/pages/Admin/EditProfilePage"));
const PROFILE_AVATAR_STORAGE_KEY = "horuspdv.profile.avatar";
const ACTIVE_PAGE_STORAGE_KEY = "horuspdv.activePage";
const THEME_STORAGE_KEY = "horuspdv.theme";

const EmptyPage = () => null;

type CurrentUser = {
  id: string;
  name: string;
  email: string;
  phone: string;
  permission: string;
  avatarUrl: string | null;
};

type ThemeMode = "light" | "dark";
type PublicAuthPage =
  | "login"
  | "forgot-password"
  | "reset-password"
  | "register";

function hasSupabaseRecoveryCallback() {
  if (typeof window === "undefined") return false;
  const query = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  return (
    query.get("recovery") === "1" ||
    query.has("code") ||
    query.has("resetToken") ||
    query.has("token") ||
    hash.get("type") === "recovery"
  );
}

function formatRole(role: string) {
  const labels: Record<string, string> = {
    administrador: "Administrador",
    gerente: "Gerente",
    atendente: "Atendente",
    financeiro: "Financeiro",
  };
  return labels[role] ?? role;
}

function toCurrentUser(user: AuthenticatedUser): CurrentUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    permission: formatRole(user.role),
    avatarUrl:
      typeof window !== "undefined"
        ? window.localStorage.getItem(PROFILE_AVATAR_STORAGE_KEY)
        : null,
  };
}

export default function App() {
  const statusDialog = useStatusDialog();
  const [isRecoveryFlow] = useState(hasSupabaseRecoveryCallback);
  const isStandalonePos =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("pdv") === "1";

  const [collapsed, setCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const [activePage, setActivePage] = useState<PageKey>(() => {
    return "vendas";
  });
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") return "light";
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    return storedTheme === "dark" ? "dark" : "light";
  });
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    if (typeof window === "undefined") return false;
    return Boolean(getStoredAuthUser());
  });
  const [isCheckingAuth, setIsCheckingAuth] = useState(() => {
    if (typeof window === "undefined") return false;
    return !hasSupabaseRecoveryCallback();
  });

  const [currentUser, setCurrentUser] = useState<CurrentUser>(() => {
    const storedUser =
      typeof window !== "undefined" ? getStoredAuthUser() : null;
    return {
      id: storedUser?.id || "",
      name: storedUser?.name || "",
      email: storedUser?.email || "",
      phone: storedUser?.phone || "",
      permission: formatRole(storedUser?.role || ""),
      avatarUrl:
        typeof window !== "undefined"
          ? window.localStorage.getItem(PROFILE_AVATAR_STORAGE_KEY)
          : null,
    };
  });
  const [publicAuthPage, setPublicAuthPage] = useState<PublicAuthPage>(() => {
    if (typeof window === "undefined") return "login";
    return hasSupabaseRecoveryCallback() ? "reset-password" : "login";
  });
  const [passwordResetToken, setPasswordResetToken] = useState(() => {
    if (typeof window === "undefined") return "";
    const params = new URLSearchParams(window.location.search);
    return params.get("resetToken") || params.get("token") || "supabase-recovery";
  });
  const [loginInitialEmail, setLoginInitialEmail] = useState("");
  const [loginNotice, setLoginNotice] = useState("");

  const pageTitleByKey: Record<PageKey, string> = {
    home: "Home",
    "cadastro-cliente": "Cadastro de Cliente",
    "cadastro-fornecedor": "Cadastro de Fornecedor",
    "cadastro-produto": "Cadastro de Produto",
    "historico-vendas": "Histórico de Vendas",
    relatorios: "Relatórios",
    vendas: "Iniciar Vendas",
    fiscal: "Fiscal NFC-e / NF-e",
    pagamentos: "Pagamentos Integrados",
    estoque: "Estoque e Inventário",
    caixa: "Abertura e Fechamento de Caixa",
    compras: "Compras e Reposição",
    devolucoes: "Trocas e Devoluções",
    "crm-fidelidade": "CRM e Fidelidade",
    omnichannel: "Omnichannel e Integrações",
    "conta-de-usuario": "Contas de Usuários",
    "minha-empresa": "Minha Empresa",
    "detalhe-licenca": "Detalhes da Licença",
    "sobre-pdv": "Sobre PDV",
    "editar-perfil": "Meu Perfil",
    configuracoes: "Configurações",
  };

  const CurrentPage = useMemo(() => {
    switch (activePage) {
      case "home":
        return HomePage;
      case "cadastro-cliente":
        return CustomerRegisterPage;
      case "cadastro-fornecedor":
        return SupplierRegisterPage;
      case "cadastro-produto":
        return ProductRegisterPage;
      case "historico-vendas":
        return SalesHistoryPage;
      case "relatorios":
        return ReportsPage;
      case "fiscal":
        return FiscalPage;
      case "pagamentos":
        return PaymentsPage;
      case "estoque":
        return StockPage;
      case "caixa":
        return CashRegisterPage;
      case "compras":
        return PurchasesPage;
      case "devolucoes":
        return ReturnsPage;
      case "crm-fidelidade":
        return CrmLoyaltyPage;
      case "omnichannel":
        return OmnichannelPage;
      case "vendas":
        return SalesStartPage;
      case "conta-de-usuario":
        return UserAccountsPage;
      case "minha-empresa":
        return MyCompanyPage;
      case "detalhe-licenca":
        return LicenseDetailsPage;
      case "sobre-pdv":
        return AboutPdvPage;
      default:
        return EmptyPage;
    }
  }, [activePage]);

  const handleToggleTheme = () => {
    setThemeMode((current) => (current === "light" ? "dark" : "light"));
  };

  const handleLogout = () => {
    const destino: PageKey = "home";
    setMobileSidebarOpen(false);
    setActivePage(destino);
    window.localStorage.setItem(ACTIVE_PAGE_STORAGE_KEY, destino);
    setIsAuthenticated(false);
    authService.logout().catch(() => undefined);
    clearAuthSession();
  };

  const handleUploadAvatar = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : null;
      if (!result) return;
      window.localStorage.setItem(PROFILE_AVATAR_STORAGE_KEY, result);
      setCurrentUser((current) => ({ ...current, avatarUrl: result }));
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveAvatar = () => {
    setCurrentUser((current) => {
      window.localStorage.removeItem(PROFILE_AVATAR_STORAGE_KEY);
      return { ...current, avatarUrl: null };
    });
  };

  const handleChangePassword = async (
    currentPassword: string,
    nextPassword: string,
  ) => {
    try {
      await authService.changePassword(currentPassword, nextPassword);
      clearAuthSession();
      setIsAuthenticated(false);
      return {
        success: true,
        message: "Senha atualizada com sucesso. Faça login novamente.",
      };
    } catch (error) {
      return {
        success: false,
        message:
          error instanceof Error ? error.message : "Erro ao atualizar senha.",
      };
    }
  };

  const handleUpdateProfile = async (name: string, email: string, phone: string) => {
    try {
      const user = await authService.updateMe({ name: name.trim(), email: email.trim(), phone: phone.trim() });
      if (!user) {
        return { success: false, message: "A API não retornou o perfil atualizado." };
      }

      setAuthSession(user);
      setCurrentUser(toCurrentUser(user));
      return { success: true, message: "Perfil atualizado com sucesso." };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Erro ao atualizar perfil.",
      };
    }
  };

  const handleOpenSalesInNewTab = async () => {
    try {
      const cashStatus = await cashRegisterService.status();
      if (!cashStatus?.canSell) {
        const shouldOpenCashRegister = await statusDialog.confirm(
          cashStatus?.blockReason ||
            "Para iniciar vendas, abra o caixa do dia primeiro.",
          {
            confirmIntent: "success",
            cancelLabel: "Agora não",
            confirmLabel: "Abrir caixa",
          },
        );

        if (shouldOpenCashRegister) {
          setActivePage("caixa");
        }

        setMobileSidebarOpen(false);
        return;
      }
    } catch (error) {
      Toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível validar o status do caixa.",
      );
      setMobileSidebarOpen(false);
      return;
    }

    setActivePage("vendas");
    window.localStorage.setItem(ACTIVE_PAGE_STORAGE_KEY, "vendas");
    setMobileSidebarOpen(false);
  };

  const handleLogin = async (
    email: string,
    password: string,
    remember: boolean,
    recaptchaToken?: string,
  ) => {
    try {
      const result = await authService.login({
        email: email.trim(),
        password,
        rememberMe: remember,
        recaptchaToken,
      });

      if (!result) {
        return {
          success: false,
          message: "A API não retornou os dados de login.",
        };
      }

      setAuthSession(result.user, remember);
      setCurrentUser(toCurrentUser(result.user));
      setIsAuthenticated(true);
      setActivePage("vendas");
      return { success: true, message: "Login realizado com sucesso." };
    } catch (error) {
      return {
        success: false,
        message:
          error instanceof Error ? error.message : "Erro ao fazer login.",
      };
    }
  };

  const handleForgotPassword = async (
    cnpj: string,
    email: string,
    recaptchaToken?: string,
  ) => {
    try {
      const data = await authService.forgotPassword(
        cnpj.trim(),
        email.trim(),
        recaptchaToken,
      );
      return {
        success: true,
        message:
          "Se o e-mail estiver cadastrado, enviaremos as instruções de recuperação.",
        data,
      };
    } catch (error) {
      return {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Erro ao solicitar recuperação de senha.",
      };
    }
  };

  const handleResetPassword = async (
    token: string,
    nextPassword: string,
    confirmPassword: string,
    recaptchaToken?: string,
  ) => {
    try {
      await authService.resetPassword(
        token.trim(),
        nextPassword,
        confirmPassword,
        recaptchaToken,
      );
      const url = new URL(window.location.href);
      url.searchParams.delete("resetToken");
      url.searchParams.delete("token");
      url.searchParams.delete("recovery");
      url.searchParams.delete("code");
      url.hash = "";
      window.history.replaceState({}, "", url.toString());
      setLoginNotice("Senha redefinida com sucesso. Entre com sua nova senha.");
      return {
        success: true,
        message: "Senha redefinida com sucesso. Faça login novamente.",
      };
    } catch (error) {
      return {
        success: false,
        message:
          error instanceof Error ? error.message : "Erro ao redefinir senha.",
      };
    }
  };

  const handleRegister = async (
    payload: RegisterFormPayload,
    recaptchaToken?: string,
  ) => {
    try {
      const result = await authService.register({
        ...payload,
        email: payload.email.trim(),
        name: payload.name.trim(),
        recaptchaToken,
      });
      return {
        success: true,
        message: result.requiresEmailConfirmation
          ? "Cadastro criado. Confirme o e-mail recebido antes de entrar."
          : "Cadastro criado e liberado. Faça login para continuar.",
      };
    } catch (error) {
      return {
        success: false,
        message:
          error instanceof Error ? error.message : "Erro ao criar cadastro.",
      };
    }
  };

  useEffect(() => {
    if (isRecoveryFlow) {
      setIsAuthenticated(false);
      setIsCheckingAuth(false);
      return;
    }

    const entrarSozinho = async () => {
      const user = await tentarAutoLogin();
      if (user) {
        setCurrentUser(toCurrentUser(user));
        setIsAuthenticated(true);
        setActivePage("vendas");
        return true;
      }
      return false;
    };

    authService
      .me()
      .then(async (user) => {
        if (!user) {
          clearAuthSession();
          if (await entrarSozinho()) return;
          setIsAuthenticated(false);
          return;
        }

        setAuthSession(user);
        setCurrentUser(toCurrentUser(user));
        setIsAuthenticated(true);
      })
      .catch(async () => {
        clearAuthSession();
        if (await entrarSozinho()) return;
        setIsAuthenticated(false);
      })
      .finally(() => {
        setIsCheckingAuth(false);
      });
  }, [isRecoveryFlow, isStandalonePos]);

  useEffect(() => {
    if (!autoLoginAtivo) return;
    if (isCheckingAuth || isAuthenticated) return;

    let cancelado = false;
    tentarAutoLogin().then((user) => {
      if (cancelado || !user) return;
      setCurrentUser(toCurrentUser(user));
      setIsAuthenticated(true);
      setActivePage("vendas");
    });

    return () => {
      cancelado = true;
    };
  }, [isAuthenticated, isCheckingAuth]);

  useEffect(() => {
    const syncAuthState = () => {
      const user = getStoredAuthUser();
      if (user) {
        setCurrentUser(toCurrentUser(user));
        setIsAuthenticated(true);
      } else {
        setIsAuthenticated(false);
      }
    };

    window.addEventListener("storage", syncAuthState);
    window.addEventListener("horuspdv-auth-change", syncAuthState);
    window.addEventListener("focus", syncAuthState);
    return () => {
      window.removeEventListener("storage", syncAuthState);
      window.removeEventListener("horuspdv-auth-change", syncAuthState);
      window.removeEventListener("focus", syncAuthState);
    };
  }, []);

  useEffect(() => {
    if (isStandalonePos) return;
    window.localStorage.setItem(ACTIVE_PAGE_STORAGE_KEY, activePage);
  }, [activePage, isStandalonePos]);

  useEffect(() => {
    const handleOpenTourEvent = () => {
      setTourOpen(true);
    };

    window.addEventListener(APP_OPEN_TOUR_EVENT, handleOpenTourEvent);
    return () => window.removeEventListener(APP_OPEN_TOUR_EVENT, handleOpenTourEvent);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", themeMode);
    window.localStorage.setItem(THEME_STORAGE_KEY, themeMode);
  }, [themeMode]);

  useEffect(() => {
    if (activePage === "vendas" && isStandalonePos) {
      document.title = "CaixaUp - Frente de caixa";
      return;
    }
    document.title = "CaixaUp | Sistema de Caixa e Gestão para seu Negócio";
  }, [activePage, isStandalonePos]);

  if (isRecoveryFlow) {
    return (
      <ResetPasswordPage
        initialToken={passwordResetToken}
        onResetPassword={handleResetPassword}
        onOpenLogin={() => setPublicAuthPage("login")}
        closeAfterSuccess={
          typeof navigator !== "undefined" &&
          !navigator.userAgent.toLowerCase().includes("electron")
        }
      />
    );
  }

  if (isCheckingAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-primary text-text-secondary">
        <LoadingBar />
      </div>
    );
  }

  if (!isAuthenticated) {
    if (publicAuthPage === "forgot-password") {
      return (
        <ForgotPasswordPage
          onForgotPassword={handleForgotPassword}
          onOpenLogin={() => setPublicAuthPage("login")}
          onOpenResetPassword={(token) => {
            setPasswordResetToken(token);
            setPublicAuthPage("reset-password");
          }}
        />
      );
    }

    if (publicAuthPage === "reset-password") {
      return (
        <ResetPasswordPage
          initialToken={passwordResetToken}
          onResetPassword={handleResetPassword}
          onOpenLogin={() => setPublicAuthPage("login")}
        />
      );
    }

    if (publicAuthPage === "register") {
      return (
        <RegisterPage
          onRegister={handleRegister}
          onOpenLogin={() => setPublicAuthPage("login")}
          onRegisterSuccess={(email) => {
            setLoginInitialEmail(email);
            setLoginNotice("Cadastro criado e liberado. Entre com seu e-mail e senha.");
            setPublicAuthPage("login");
          }}
        />
      );
    }

    return (
      <LoginPage
        onLogin={handleLogin}
        onOpenForgotPassword={() => setPublicAuthPage("forgot-password")}
        onOpenRegister={() => setPublicAuthPage("register")}
        initialEmail={loginInitialEmail}
        notice={loginNotice}
      />
    );
  }

  if (activePage === "vendas") {
    return (
      <div className="page-enter min-h-screen bg-bg-primary text-text-primary font-sans">
        <Suspense
          fallback={
            <div className="flex min-h-screen items-center justify-center text-text-secondary">
              <LoadingBar />
            </div>
          }
        >
          <SalesStartPage
            standalone={isStandalonePos}
            operatorName={currentUser.name}
            themeMode={themeMode}
            onToggleTheme={handleToggleTheme}
            onNavigate={setActivePage}
            onExit={() => {
              if (isStandalonePos) {
                window.close();
                window.location.href = `${window.location.origin}${window.location.pathname}`;
                return;
              }
              setActivePage("home");
              window.localStorage.setItem(ACTIVE_PAGE_STORAGE_KEY, "home");
            }}
          />
        </Suspense>
      </div>
    );
  }

  return (
    <div className="relative flex h-screen overflow-hidden bg-bg-primary text-text-primary font-sans">
      <header className="lg:hidden fixed top-0 left-0 right-0 z-layer-mobile-header h-14 bg-bg-light border-b border-border-primary px-3 shadow-sm">
        <div className="h-full flex items-center justify-between">
          <button
            type="button"
            onClick={() => setMobileSidebarOpen(true)}
            className="p-2 rounded-lg border border-border-primary bg-bg-light shadow-sm"
            aria-label="Abrir menu"
          >
            <Menu size={20} className="text-accent" />
          </button>

          <h1 className="text-sm font-semibold text-text-primary truncate px-2">
            {pageTitleByKey[activePage]}
          </h1>
          <button
            type="button"
            onClick={() => setTourOpen(true)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border-primary bg-bg-light text-secondary shadow-sm transition hover:bg-secondary/10"
            aria-label="Abrir tour da tela"
            title="Tour da tela"
          >
            <CircleHelp size={16} />
          </button>
        </div>
      </header>

      {mobileSidebarOpen && (
        <button
          type="button"
          onClick={() => setMobileSidebarOpen(false)}
          className="lg:hidden fixed inset-0 z-layer-mobile-header bg-black/30"
          aria-label="Fechar menu lateral"
        />
      )}

      <AppSidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed((current) => !current)}
        activePage={activePage}
        onChangePage={setActivePage}
        currentUserName={currentUser.name}
        currentUserPermission={currentUser.permission}
        currentUserAvatarUrl={currentUser.avatarUrl}
        onOpenProfile={() => setActivePage("editar-perfil")}
        onOpenSettings={() => setActivePage("configuracoes")}
        onLogout={handleLogout}
        onOpenSalesInNewTab={handleOpenSalesInNewTab}
        mobileOpen={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
      />

      <Suspense
        fallback={
          <div className="flex-1 h-full min-h-0 flex items-center justify-center text-text-secondary">
            <LoadingBar />
          </div>
        }
      >
        <main
          data-active-page={activePage}
          className="flex-1 h-full min-h-0 min-w-0 overflow-y-auto overflow-x-hidden pt-14 lg:pt-0"
        >
          <div key={activePage} className="page-enter min-h-full">
            {activePage === "editar-perfil" ? (
              <EditProfilePage
                userName={currentUser.name}
                userEmail={currentUser.email}
                userPhone={currentUser.phone}
                userRole={currentUser.permission}
                userAvatarUrl={currentUser.avatarUrl}
                onUploadAvatar={handleUploadAvatar}
                onRemoveAvatar={handleRemoveAvatar}
                onChangePassword={handleChangePassword}
                onUpdateProfile={handleUpdateProfile}
              />
            ) : activePage === "configuracoes" ? (
              <SettingsPage
                themeMode={themeMode}
                onToggleTheme={handleToggleTheme}
              />
            ) : activePage === "home" ? (
              <HomePage
                onNavigate={setActivePage}
                onOpenSalesInNewTab={handleOpenSalesInNewTab}
              />
            ) : (
              <CurrentPage />
            )}
          </div>
          <GuidedTour
            open={tourOpen}
            page={activePage}
            onClose={() => setTourOpen(false)}
          />
        </main>
      </Suspense>
      {statusDialog.Dialog}
    </div>
  );
}
