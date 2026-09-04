"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useRouter } from "next/navigation";

export interface User {
  id: string;
  email: string;
  name?: string;
  role: "CLIENT" | "FREELANCER" | "JUROR" | "ADMIN";
  walletAddress?: string | null;
  /** Post-signup onboarding state (absent for synthetic admin/offline sessions). */
  onboardingCompleted?: boolean;
}

export const ADMIN_TEAM_ACCOUNTS = [
  { id: "adm-owner", email: "aakankshakpoojari265@gmail.com", name: "Aakanksha Poojari", role: "ADMIN" as const, title: "Chief Arbitration Officer", password: "123456" },
  { id: "adm-1", email: "admin1@w3hire.io", name: "Elena Rostova", role: "ADMIN" as const, title: "Lead Arbitrator", password: "123456" },
  { id: "adm-2", email: "admin2@w3hire.io", name: "Marcus Vance", role: "ADMIN" as const, title: "Smart Contract Auditor", password: "123456" },
  { id: "adm-3", email: "admin3@w3hire.io", name: "Sarah Chen", role: "ADMIN" as const, title: "Fintech Compliance Arbitrator", password: "123456" },
  { id: "adm-4", email: "admin4@w3hire.io", name: "Tariq Al-Mansoor", role: "ADMIN" as const, title: "Escrow Protocol Engineer", password: "123456" },
  { id: "adm-5", email: "admin5@w3hire.io", name: "David Kim", role: "ADMIN" as const, title: "Dispute Operations Officer", password: "123456" },
  { id: "adm-main", email: "admin@w3hire.io", name: "Chief Administrator", role: "ADMIN" as const, title: "Senior Arbitrator", password: "123456" },
];

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; user?: User; error?: string }>;
  signup: (email: string, password: string, name: string, role: "CLIENT" | "FREELANCER") => Promise<{ success: boolean; user?: User; error?: string }>;
  logout: () => void;
  connectWallet: (walletAddress: string) => Promise<{ success: boolean; error?: string; user?: User }>;
  disconnectWallet: () => Promise<void>;
  updateUserRole: (role: "CLIENT" | "FREELANCER" | "ADMIN") => void;
  /** Re-fetch the authenticated user from the backend (e.g. after email verification / onboarding). */
  refreshUser: () => Promise<User | null>;
}

const getApiBase = () => {
  const base = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001").replace(/\/$/, "");
  return base.endsWith("/api") ? base : `${base}/api`;
};

const API_BASE = getApiBase();

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const router = useRouter();

  // Initialize auth state from localStorage and verify with backend
  useEffect(() => {
    const savedToken = localStorage.getItem("w3hire_auth_token");
    const savedUser = localStorage.getItem("w3hire_user");

    if (savedUser) {
      try {
        setUser(JSON.parse(savedUser));
      } catch (e) {
        console.error("Failed to parse saved user", e);
      }
    }

    if (savedToken) {
      setToken(savedToken);
      fetchMe(savedToken);
    } else {
      setIsLoading(false);
    }
  }, []);

  const fetchMe = async (authToken: string) => {
    // Synthetic local admin or mock tokens should skip remote backend verification
    if (authToken.startsWith("admin_auth_jwt_") || authToken.startsWith("mock_jwt_token_")) {
      const savedUser = localStorage.getItem("w3hire_user");
      if (savedUser) {
        try {
          setUser(JSON.parse(savedUser));
        } catch (e) {
          console.error("Failed to parse saved user", e);
        }
      }
      setIsLoading(false);
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/auth/me`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      if (res.ok) {
        const userData: User = await res.json();
        setUser(userData);
        localStorage.setItem("w3hire_user", JSON.stringify(userData));
        if (userData.walletAddress) {
          localStorage.setItem("w3hire_active_address", userData.walletAddress);
        }
      } else if (res.status === 401 || res.status === 403) {
        // Token invalid/expired
        logout();
      } else {
        // Non-auth server error (500, 503, etc.) - retain local cached session
        const savedUser = localStorage.getItem("w3hire_user");
        if (savedUser) {
          try {
            setUser(JSON.parse(savedUser));
          } catch (e) {}
        }
      }
    } catch (err) {
      console.warn("Could not fetch user profile from API, retaining local session fallback.", err);
      const savedUser = localStorage.getItem("w3hire_user");
      if (savedUser) {
        try {
          setUser(JSON.parse(savedUser));
        } catch (e) {}
      }
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (email: string, password: string): Promise<{ success: boolean; user?: User; error?: string }> => {
    const normalizedEmail = email.toLowerCase().trim();

    // 1. First, check dynamic Supabase admin API route
    try {
      const adminRes = await fetch("/api/admins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail, password }),
      });

      if (adminRes.ok) {
        const adminData = await adminRes.json();
        if (adminData.success && adminData.user) {
          // Credentials are confirmed against the real admins table above —
          // now exchange them for a real, backend-verifiable JWT (instead of
          // a synthetic client-only token) so the admin console can call the
          // same authenticateToken-protected endpoints as everyone else.
          let adminToken = "admin_auth_jwt_" + Date.now();
          try {
            const realRes = await fetch(`${API_BASE}/auth/admin-login`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ email: normalizedEmail, password }),
            });
            if (realRes.ok) {
              const real = await realRes.json();
              if (real.token) adminToken = real.token;
            }
          } catch (e) {
            console.warn("Backend admin-login unavailable, using offline admin session.", e);
          }

          setToken(adminToken);
          setUser(adminData.user);
          localStorage.setItem("w3hire_auth_token", adminToken);
          localStorage.setItem("w3hire_user", JSON.stringify(adminData.user));
          return { success: true, user: adminData.user };
        }
      }
    } catch (e) {
      console.warn("Direct admin api check skipped, verifying local admin registry.");
    }

    // 2. Check pre-registered admin accounts (including aakankshakpoojari265@gmail.com)
    const matchedAdmin = ADMIN_TEAM_ACCOUNTS.find(
      (a) => a.email.toLowerCase() === normalizedEmail && a.password === password
    );
    if (matchedAdmin) {
      const adminUser: User = {
        id: matchedAdmin.id,
        email: matchedAdmin.email,
        name: matchedAdmin.name,
        role: "ADMIN",
        walletAddress: "0x71C...b821",
      };
      const adminToken = "admin_auth_jwt_" + Date.now();
      setToken(adminToken);
      setUser(adminUser);
      localStorage.setItem("w3hire_auth_token", adminToken);
      localStorage.setItem("w3hire_user", JSON.stringify(adminUser));
      return { success: true, user: adminUser };
    }

    // 3. Neither of the frontend-side admin lists matched — try the real
    // backend admins table directly (POST /auth/admin-login). This is the
    // only path that reaches admin accounts that exist purely in the DB
    // (not mirrored into the two fallback lists above), and it always
    // returns a real, verifiable JWT.
    try {
      const realAdminRes = await fetch(`${API_BASE}/auth/admin-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail, password }),
      });
      if (realAdminRes.ok) {
        const real = await realAdminRes.json();
        if (real.token && real.user) {
          setToken(real.token);
          setUser(real.user);
          localStorage.setItem("w3hire_auth_token", real.token);
          localStorage.setItem("w3hire_user", JSON.stringify(real.user));
          return { success: true, user: real.user };
        }
      }
    } catch (e) {
      console.warn("Real admin-login check skipped, trying standard user login.", e);
    }

    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        return { success: false, error: data.error || data.message || "Failed to log in" };
      }

      setToken(data.token);
      setUser(data.user);
      localStorage.setItem("w3hire_auth_token", data.token);
      localStorage.setItem("w3hire_user", JSON.stringify(data.user));
      if (data.user.walletAddress) {
        localStorage.setItem("w3hire_active_address", data.user.walletAddress);
      }

      return { success: true, user: data.user };
    } catch (err: any) {
      // Fallback offline mock login for seamless demo experience
      // Check if user previously signed up with a stored role
      let savedRole: "CLIENT" | "FREELANCER" = "FREELANCER";
      try {
        const storedUsers = JSON.parse(localStorage.getItem("w3hire_mock_registered_users") || "{}");
        if (storedUsers[normalizedEmail]) {
          savedRole = storedUsers[normalizedEmail].role || "FREELANCER";
        }
      } catch (e) {}

      const mockUser: User = {
        id: `usr-${Date.now()}`,
        email: normalizedEmail,
        name: normalizedEmail.split("@")[0],
        role: savedRole,
        walletAddress: null,
      };
      const mockToken = "mock_jwt_token_" + Date.now();

      setToken(mockToken);
      setUser(mockUser);
      localStorage.setItem("w3hire_auth_token", mockToken);
      localStorage.setItem("w3hire_user", JSON.stringify(mockUser));

      return { success: true, user: mockUser };
    }
  };

  const signup = async (
    email: string,
    password: string,
    name: string,
    role: "CLIENT" | "FREELANCER"
  ): Promise<{ success: boolean; user?: User; error?: string }> => {
    const normalizedEmail = email.toLowerCase().trim();

    // Security check: Public signup can never register an admin role
    if ((role as any) === "ADMIN") {
      return { success: false, error: "Unauthorized: Admin accounts cannot be created via public registration." };
    }

    try {
      const res = await fetch(`${API_BASE}/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail, password, name, role }),
      });

      const data = await res.json();

      if (!res.ok) {
        return { success: false, error: data.error || data.message || "Failed to sign up" };
      }

      setToken(data.token);
      setUser(data.user);
      localStorage.setItem("w3hire_auth_token", data.token);
      localStorage.setItem("w3hire_user", JSON.stringify(data.user));

      return { success: true, user: data.user };
    } catch (err: any) {
      // Fallback offline mock signup: persist role mapping
      try {
        const storedUsers = JSON.parse(localStorage.getItem("w3hire_mock_registered_users") || "{}");
        storedUsers[normalizedEmail] = { email: normalizedEmail, name, role };
        localStorage.setItem("w3hire_mock_registered_users", JSON.stringify(storedUsers));
      } catch (e) {}

      const mockUser: User = {
        id: `usr-${Date.now()}`,
        email: normalizedEmail,
        name: name || normalizedEmail.split("@")[0],
        role: role,
        walletAddress: null,
      };
      const mockToken = "mock_jwt_token_" + Date.now();

      setToken(mockToken);
      setUser(mockUser);
      localStorage.setItem("w3hire_auth_token", mockToken);
      localStorage.setItem("w3hire_user", JSON.stringify(mockUser));

      return { success: true, user: mockUser };
    }
  };

  const logout = async () => {
    if (token) {
      try {
        await fetch(`${API_BASE}/auth/logout`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
      } catch (e) {
        console.warn("Logout API notification failed", e);
      }
    }
    setUser(null);
    setToken(null);
    localStorage.removeItem("w3hire_auth_token");
    localStorage.removeItem("w3hire_user");
    router.push("/");
  };

  const connectWallet = async (walletAddress: string) => {
    const normalized = walletAddress.toLowerCase().trim();

    // Local role-conflict check across localStorage
    const savedWalletRole = localStorage.getItem(`w3hire_wallet_role_${normalized}`);
    if (savedWalletRole && user && savedWalletRole.toUpperCase() !== user.role) {
      return {
        success: false,
        error: `This wallet address (${normalized.slice(0, 6)}...${normalized.slice(-4)}) is already permanently registered to a ${savedWalletRole.toUpperCase()} account. A wallet address cannot be linked to both freelancer and client accounts.`,
      };
    }

    if (token) {
      try {
        const res = await fetch(`${API_BASE}/auth/connect-wallet`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ walletAddress: normalized }),
        });

        const data = await res.json();

        if (!res.ok) {
          return { success: false, error: data.message || "Failed to connect wallet" };
        }

        setUser(data);
        localStorage.setItem("w3hire_user", JSON.stringify(data));
        localStorage.setItem("w3hire_active_address", normalized);
        if (data.role) {
          localStorage.setItem(`w3hire_wallet_role_${normalized}`, data.role.toLowerCase());
        }

        return { success: true, user: data };
      } catch (err: any) {
        console.warn("Backend API unavailable, saving wallet locally.", err);
      }
    }

    // Local update if offline/mock
    if (user) {
      const updated = { ...user, walletAddress: normalized };
      setUser(updated);
      localStorage.setItem("w3hire_user", JSON.stringify(updated));
      localStorage.setItem("w3hire_active_address", normalized);
      localStorage.setItem(`w3hire_wallet_role_${normalized}`, user.role.toLowerCase());
      return { success: true, user: updated };
    }

    return { success: false, error: "Must be signed in to connect wallet" };
  };

  const disconnectWallet = async () => {
    if (token) {
      try {
        await fetch(`${API_BASE}/auth/disconnect-wallet`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
      } catch (e) {
        console.error(e);
      }
    }

    if (user) {
      const updated = { ...user, walletAddress: null };
      setUser(updated);
      localStorage.setItem("w3hire_user", JSON.stringify(updated));
      localStorage.removeItem("w3hire_active_address");
    }
  };

  // Clients and freelancers can never re-assign their own role — it's fixed at
  // signup. Only an already-signed-in admin session may call this (e.g. from an
  // admin tool); everyone else is a no-op.
  const updateUserRole = (role: "CLIENT" | "FREELANCER" | "ADMIN") => {
    if (user && user.role === "ADMIN") {
      const updated = { ...user, role };
      setUser(updated);
      localStorage.setItem("w3hire_user", JSON.stringify(updated));
    }
  };

  const refreshUser = async (): Promise<User | null> => {
    const authToken = token || localStorage.getItem("w3hire_auth_token");
    if (!authToken) return null;

    // Synthetic admin / offline-mock sessions have no backend row to refresh.
    if (authToken.startsWith("admin_auth_jwt_") || authToken.startsWith("mock_jwt_token_")) {
      return user;
    }

    try {
      const res = await fetch(`${API_BASE}/auth/me`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (!res.ok) return user;
      const userData: User = await res.json();
      setUser(userData);
      localStorage.setItem("w3hire_user", JSON.stringify(userData));
      return userData;
    } catch {
      return user;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        login,
        signup,
        logout,
        connectWallet,
        disconnectWallet,
        updateUserRole,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
