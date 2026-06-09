"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { motion } from "framer-motion";

/* ─── Shared Auth Type ─────────────────────────────────────────────────────── */
interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "RESELLER" | "CUSTOMER";
  points: number;
}

/* ─── Page ─────────────────────────────────────────────────────────────────── */
export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    const trimmed = email.trim();
    if (!trimmed) {
      setError("Masukkan alamat email kamu.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("http://127.0.0.1:8000/api/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ email: trimmed }),
      });

      const json = await res.json();

      if (res.ok && json.success) {
        const user: AuthUser = json.user;
        localStorage.setItem("tebeee_user", JSON.stringify(user));
        router.push("/");
        return;
      }

      if (res.status === 404) {
        setError("Email tidak terdaftar");
        return;
      }

      // 422 or any other non-ok status
      setError(json.message ?? "Terjadi kesalahan. Coba lagi.");
    } catch {
      setError("Server tidak dapat dijangkau");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center bg-slate-100 px-4 py-8"
      style={{ fontFamily: "var(--font-body)" }}
    >
      {/* Card */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl px-8 py-10 shadow-2xl shadow-slate-950/80"
      >
        {/* Logo / Brand */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <Image
            src="/images/logo-tebeeesport-v3.png"
            alt="Logo"
            width={160}
            height={160}
            className="object-contain"
            priority
          />
          <p className="mt-1 text-[11px] uppercase tracking-[0.22em] text-slate-400">
            Portal Masuk
          </p>
        </div>

        {/* Divider */}
        <div className="mb-7 h-px w-full bg-slate-800" />

        {/* Form */}
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="login-email"
              className="text-xs font-semibold uppercase tracking-widest text-slate-300"
            >
              Alamat Email
            </label>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              autoFocus
              placeholder="kamu@email.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (error) setError(null);
              }}
              disabled={loading}
              className="
                w-full rounded-xl border border-slate-700 bg-slate-800
                px-4 py-3 text-sm text-white placeholder-slate-500
                outline-none transition-all duration-200
                focus:border-blue-500 focus:ring-2 focus:ring-blue-900/50
                disabled:cursor-not-allowed disabled:opacity-50
              "
            />
          </div>

          {/* Inline error */}
          {error && (
            <div
              role="alert"
              className="flex items-center gap-2 rounded-lg border border-red-900/30 bg-red-950/20 px-4 py-3 text-sm text-red-400"
            >
              <svg
                className="h-4 w-4 shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
                />
              </svg>
              <span>{error}</span>
            </div>
          )}

          {/* Submit button */}
          <button
            id="login-submit"
            type="submit"
            disabled={loading}
            className="
              mt-1 w-full rounded-xl bg-blue-600 px-6 py-3.5
              text-sm font-bold uppercase tracking-widest text-white
              transition-all duration-200
              hover:bg-blue-700 hover:shadow-lg hover:shadow-blue-600/20
              active:scale-[0.98]
              disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-blue-600 disabled:hover:shadow-none
            "
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg
                  className="h-4 w-4 animate-spin"
                  fill="none"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                Authenticating...
              </span>
            ) : (
              "Masuk"
            )}
          </button>
        </form>

        {/* Test accounts hint */}
        <div className="mt-7 border-t border-slate-800 pt-5">
          <p className="mb-2 text-center text-[10px] font-semibold uppercase tracking-widest text-slate-400">
            Akun Test
          </p>
          <div className="flex flex-col gap-1.5 text-center">
            <button
              type="button"
              onClick={() => setEmail("admin@tebeee.com")}
              className="text-xs text-slate-400 transition-colors hover:text-white"
            >
              admin@tebeee.com
            </button>
            <button
              type="button"
              onClick={() => setEmail("resellera@tebeee.com")}
              className="text-xs text-slate-400 transition-colors hover:text-white"
            >
              resellera@tebeee.com
            </button>
          </div>
        </div>
      </motion.div>

      {/* Footer note */}
      <div className="mt-8 flex flex-col items-center justify-center gap-2 text-xs text-slate-400 text-center">
        <span>© 2026 TEBEEE SPORT. All rights reserved.</span>
      </div>
    </div>
  );
}
