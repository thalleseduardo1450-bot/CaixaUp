export type AuthenticatedUser = {
  id: string;
  companyId: string;
  cpf: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  status: string;
  createdAt: string;
  lastLoginAt: string;
  mustChangePassword: boolean;
};

let currentUser: AuthenticatedUser | null = null;
export const AUTH_USER_STORAGE_KEY = "horuspdv.auth.user";
export const AUTH_REMEMBER_STORAGE_KEY = "horuspdv.auth.remember";
export function getStoredAuthUser() { return currentUser; }
export function setAuthSession(user: AuthenticatedUser, _remember = false) {
 currentUser = user;
 window.dispatchEvent(new CustomEvent("horuspdv-auth-change", { detail: { user } }));
}
export function clearAuthSession() {
 currentUser = null;
 window.dispatchEvent(new CustomEvent("horuspdv-auth-change"));
}
