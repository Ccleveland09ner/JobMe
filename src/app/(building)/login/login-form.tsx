"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useBuilding } from "@/components/building/BuildingProvider";
import { Button } from "@/components/ui/Button";
import { paperField } from "@/components/ui/Clipboard";
import { createClient } from "@/lib/supabase/client";

type Step = "email" | "code";

export function LoginForm() {
  const router = useRouter();
  const building = useBuilding();
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
    // Through the door to the front desk; the desk's page arrives with the walk.
    building?.walkTo("desk");
    router.push("/dashboard");
    router.refresh();
  }

  if (step === "email") {
    return (
      <form onSubmit={sendCode} className="flex flex-col gap-4">
        <label htmlFor="login-email" className="text-sm font-medium text-ink">
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
          className={paperField}
        />
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <Button type="submit" disabled={loading} className="mt-2">
          {loading ? "Sending code…" : "Send code"}
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={verifyCode} className="flex flex-col gap-4">
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
        className={`${paperField} text-center text-lg tracking-[0.5em]`}
      />
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <Button type="submit" disabled={loading} className="mt-2">
        {loading ? "Verifying…" : "Verify code"}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          setStep("email");
          setCode("");
          setError(null);
        }}
        className="text-muted underline"
      >
        Use a different email
      </Button>
    </form>
  );
}
