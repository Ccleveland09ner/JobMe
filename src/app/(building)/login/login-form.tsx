"use client";

/**
 * Sign in, or create an account (username, email, password). Usernames are
 * unique regardless of case: checked early, guaranteed by a unique index.
 * The member code is assigned by the database.
 */

import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { useBuilding } from "@/components/building/BuildingProvider";
import { Button } from "@/components/ui/Button";
import { paperField } from "@/components/ui/Clipboard";
import { friendlyAuthError, MIN_PASSWORD, usernameProblem, validateSignUp, type SignUpErrors } from "@/lib/frontend/account";
import { createClient } from "@/lib/supabase/client";

type Mode = "signin" | "signup";
type NameCheck = "idle" | "checking" | "available" | "taken";

function Field({
  id,
  label,
  error,
  hint,
  ...input
}: React.InputHTMLAttributes<HTMLInputElement> & { id: string; label: string; error?: string; hint?: React.ReactNode }) {
  // An error replaces the hint rather than stacking under it.
  if (error) hint = undefined;
  const describedBy = [error && `${id}-error`, hint && `${id}-hint`].filter(Boolean).join(" ") || undefined;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>
      <input id={id} className={paperField} aria-invalid={error ? true : undefined} aria-describedby={describedBy} {...input} />
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-muted" aria-live="polite">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export function LoginForm() {
  const router = useRouter();
  const building = useBuilding();
  const supabase = createClient();
  const id = useId();

  const [mode, setMode] = useState<Mode>("signin");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [nameCheck, setNameCheck] = useState<NameCheck>("idle");
  const [fieldErrors, setFieldErrors] = useState<SignUpErrors>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setNotice(null);
    setFieldErrors({});
    setPassword("");
    setConfirm("");
  }

  /** Through the door to the front desk; the desk's page arrives with the walk. */
  function enter() {
    building?.walkTo("desk");
    router.push("/dashboard");
    router.refresh();
  }

  async function isAvailable(name: string): Promise<boolean | null> {
    const { data, error: rpcError } = await supabase.rpc("username_available", { name: name.trim() });
    return rpcError ? null : Boolean(data);
  }

  async function checkUsername() {
    const name = username.trim();
    if (!name || usernameProblem(name)) {
      setNameCheck("idle");
      return;
    }
    setNameCheck("checking");
    const free = await isAvailable(name);
    // Unknown (the check itself failed): say nothing; the sign-up decides.
    setNameCheck(free === null ? "idle" : free ? "available" : "taken");
  }

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setNotice(null);
    const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (authError) {
      setLoading(false);
      setError(friendlyAuthError(authError.message));
      return;
    }
    enter();
  }

  async function signUp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    const errors = validateSignUp({ username, email, password, confirm });
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;

    setLoading(true);
    if ((await isAvailable(username)) === false) {
      setNameCheck("taken");
      setFieldErrors({ username: "That username is taken. Pick another." });
      setLoading(false);
      return;
    }

    const { data, error: authError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { username: username.trim() } },
    });
    setLoading(false);
    if (authError) {
      setError(friendlyAuthError(authError.message));
      return;
    }
    if (!data.session) {
      // Email confirmation is on for this project: no session until the link is clicked.
      switchMode("signin");
      setNotice(`Account created. We sent a confirmation link to ${email.trim()} — open it, then sign in.`);
      return;
    }
    enter();
  }

  const nameHint =
    nameCheck === "checking"
      ? "Checking…"
      : nameCheck === "available"
        ? "That username is free."
        : nameCheck === "taken"
          ? undefined
          : "3–20 letters, numbers, dots or underscores. Yours alone.";
  const nameError = fieldErrors.username ?? (nameCheck === "taken" ? "That username is taken. Pick another." : undefined);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="mb-1 text-xl font-semibold text-ink">{mode === "signin" ? "Sign in" : "Create an account"}</h1>
        <p className="text-sm text-muted">
          {mode === "signin"
            ? "Welcome back. Sign in with your email and password."
            : "Pick a username, then your email and a password. We'll give you a member code."}
        </p>
      </div>

      {notice && (
        <p role="status" className="rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent-strong">
          {notice}
        </p>
      )}

      {mode === "signin" ? (
        <form onSubmit={signIn} className="flex flex-col gap-4">
          <Field
            id={`${id}-email`}
            label="Email"
            type="email"
            // "username": password managers pair this with the password below.
            autoComplete="username"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
          <Field
            id={`${id}-password`}
            label="Password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <Button type="submit" disabled={loading} className="mt-2">
            {loading ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      ) : (
        <form onSubmit={signUp} noValidate className="flex flex-col gap-4">
          <Field
            id={`${id}-username`}
            label="Username"
            autoComplete="username"
            required
            autoFocus
            maxLength={20}
            value={username}
            onChange={(e) => {
              setUsername(e.target.value);
              setNameCheck("idle");
              setFieldErrors((errors) => ({ ...errors, username: undefined }));
            }}
            onBlur={checkUsername}
            hint={nameHint}
            error={nameError}
          />
          <Field
            id={`${id}-email`}
            label="Email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            error={fieldErrors.email}
          />
          <Field
            id={`${id}-password`}
            label="Password"
            type="password"
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            hint={`At least ${MIN_PASSWORD} characters.`}
            error={fieldErrors.password}
          />
          <Field
            id={`${id}-confirm`}
            label="Confirm password"
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            error={fieldErrors.confirm}
          />
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <Button type="submit" disabled={loading || nameCheck === "taken"} className="mt-2">
            {loading ? "Creating your account…" : "Create account"}
          </Button>
        </form>
      )}

      <p className="border-t-2 border-dashed border-ink/20 pt-4 text-center text-sm text-muted">
        {mode === "signin" ? "New here?" : "Already have an account?"}{" "}
        <Button variant="ghost" size="sm" className="underline" onClick={() => switchMode(mode === "signin" ? "signup" : "signin")}>
          {mode === "signin" ? "Create an account" : "Sign in"}
        </Button>
      </p>
    </div>
  );
}
