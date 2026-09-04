"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { X, Lock, Mail, User, ShieldCheck, ArrowRight, Loader2 } from "lucide-react";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: "signin" | "signup";
  initialRole?: "CLIENT" | "FREELANCER";
  onSuccess?: () => void;
}

export default function AuthModal({
  isOpen,
  onClose,
  initialMode = "signin",
  initialRole = "FREELANCER",
  onSuccess,
}: AuthModalProps) {
  const router = useRouter();
  const { login, signup } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<"CLIENT" | "FREELANCER">(initialRole);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync mode/role to the props when the caller changes them — React's
  // "adjusting state during render on prop change" pattern (no effect needed).
  const [prevInitialMode, setPrevInitialMode] = useState(initialMode);
  if (initialMode !== prevInitialMode) {
    setPrevInitialMode(initialMode);
    setMode(initialMode);
  }
  const [prevInitialRole, setPrevInitialRole] = useState(initialRole);
  if (initialRole !== prevInitialRole) {
    setPrevInitialRole(initialRole);
    setRole(initialRole);
  }

  if (!isOpen) return null;

  // Route to the right place after auth: users who haven't finished profile
  // setup go to onboarding, everyone else to their role dashboard.
  const routeAfterAuth = (u: {
    role?: "CLIENT" | "FREELANCER" | "JUROR" | "ADMIN";
    onboardingCompleted?: boolean;
  }) => {
    if (u.role === "ADMIN") {
      router.push("/admin");
      return;
    }
    if (u.onboardingCompleted === false) {
      router.push("/onboarding");
      return;
    }
    router.push(u.role === "CLIENT" ? "/client" : "/bounties");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (mode === "signin") {
      const res = await login(email, password);
      setLoading(false);
      if (res.success && res.user) {
        if (onSuccess) onSuccess();
        onClose();
        routeAfterAuth(res.user);
      } else {
        setError(res.error || "Failed to sign in.");
      }
    } else {
      const res = await signup(email, password, name, role);
      setLoading(false);
      if (res.success && res.user) {
        if (onSuccess) onSuccess();
        onClose();
        routeAfterAuth(res.user);
      } else {
        setError(res.error || "Failed to create account.");
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-surface border border-surface-border rounded-3xl p-6 sm:p-8 shadow-2xl text-foreground">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-muted hover:text-foreground p-1 rounded-lg hover:bg-background transition"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-background border border-surface-border flex items-center justify-center mx-auto mb-3 text-moss shadow-inner">
            <Lock className="w-6 h-6" />
          </div>
          <h3 className="text-2xl font-bold tracking-tight text-foreground">
            {mode === "signin" ? "Welcome Back" : "Create W3HIRE Account"}
          </h3>
          <p className="text-xs text-muted mt-1">
            {mode === "signin"
              ? "Sign in with your email & password to explore W3HIRE"
              : "Register your account to access client and freelancer features"}
          </p>
        </div>

        {/* Tab Toggle */}
        <div className="flex bg-background p-1 rounded-xl border border-surface-border mb-6">
          <button
            type="button"
            onClick={() => {
              setMode("signin");
              setError(null);
            }}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
              mode === "signin"
                ? "bg-surface text-foreground shadow-sm"
                : "text-muted hover:text-foreground"
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("signup");
              setError(null);
            }}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
              mode === "signup"
                ? "bg-surface text-foreground shadow-sm"
                : "text-muted hover:text-foreground"
            }`}
          >
            Sign Up
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-950/40 border border-red-800/40 text-xs text-red-300">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "signup" && (
            <>
              <div>
                <label className="block text-[11px] font-mono font-semibold uppercase text-muted mb-1">
                  Full Name
                </label>
                <div className="relative">
                  <User className="absolute left-3.5 top-3.5 w-4 h-4 text-muted" />
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Satoshi Nakamoto"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-background border border-surface-border text-sm text-foreground focus:outline-none focus:border-moss transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-mono font-semibold uppercase text-muted mb-1">
                  Primary Account Role
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setRole("FREELANCER")}
                    className={`py-2 px-3 rounded-xl border text-xs font-semibold transition flex items-center justify-center gap-1.5 ${
                      role === "FREELANCER"
                        ? "border-[#22C55E] bg-[#22C55E]/10 text-[#22C55E]"
                        : "border-surface-border bg-background text-muted hover:text-foreground"
                    }`}
                  >
                    <span>Freelancer</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setRole("CLIENT")}
                    className={`py-2 px-3 rounded-xl border text-xs font-semibold transition flex items-center justify-center gap-1.5 ${
                      role === "CLIENT"
                        ? "border-moss bg-moss/10 text-moss"
                        : "border-surface-border bg-background text-muted hover:text-foreground"
                    }`}
                  >
                    <span>Client</span>
                  </button>
                </div>
              </div>
            </>
          )}

          <div>
            <label className="block text-[11px] font-mono font-semibold uppercase text-muted mb-1">
              Email Address
            </label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-3.5 w-4 h-4 text-muted" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-background border border-surface-border text-sm text-foreground focus:outline-none focus:border-moss transition"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-mono font-semibold uppercase text-muted mb-1">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-3.5 w-4 h-4 text-muted" />
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-background border border-surface-border text-sm text-foreground focus:outline-none focus:border-moss transition"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 px-4 rounded-xl font-bold bg-moss hover:bg-[#BEF264] text-background transition shadow-lg shadow-[#84CC16]/20 flex items-center justify-center gap-2 text-sm mt-6"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin text-background" />
            ) : (
              <>
                <span>{mode === "signin" ? "Sign In" : "Create Account"}</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <div className="mt-4 pt-4 border-t border-surface-border text-center text-xs text-muted">
          <p className="flex items-center justify-center gap-1">
            <ShieldCheck className="w-4 h-4 text-moss" />
            <span>You can link your Web3 wallet anytime</span>
          </p>
        </div>
      </div>
    </div>
  );
}
