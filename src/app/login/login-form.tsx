"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Step = "email" | "code";

export function LoginForm() {
  const router = useRouter();
  const supabase = createClient();

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithOtp({ email });

    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setStep("code");
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.verifyOtp({
      email,
      token: code,
      type: "email",
    });

    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push("/");
    router.refresh();
  }

  if (step === "email") {
    return (
      <form onSubmit={sendCode} className="flex flex-col gap-3">
        <label htmlFor="login-email" className="text-sm text-muted">
          Email
        </label>
        <input
          id="login-email"
          type="email"
          autoComplete="email"
          required
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="rounded-lg border border-line bg-surface px-3 py-2 text-ink"
        />
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-accent px-4 py-2 font-medium text-white hover:bg-accent-strong disabled:opacity-50"
        >
          {loading ? "Sending code…" : "Send code"}
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={verifyCode} className="flex flex-col gap-3">
      <p className="text-sm text-muted">
        We sent a 6-digit code to <span className="font-medium">{email}</span>
      </p>
      <input
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        aria-label="6-digit code"
        pattern="[0-9]{6}"
        maxLength={6}
        required
        autoFocus
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="123456"
        className="rounded-lg border border-line bg-surface px-3 py-2 text-center text-lg tracking-[0.5em] text-ink"
      />
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="rounded-lg bg-accent px-4 py-2 font-medium text-white hover:bg-accent-strong disabled:opacity-50"
      >
        {loading ? "Verifying…" : "Verify code"}
      </button>
      <button
        type="button"
        onClick={() => {
          setStep("email");
          setCode("");
          setError(null);
        }}
        className="text-sm text-muted underline"
      >
        Use a different email
      </button>
    </form>
  );
}
