/**
 * Account rules for sign-in and sign-up. The database enforces the same
 * username rule; this catches problems before a round trip.
 */

export const USERNAME_RULE = /^[A-Za-z0-9_.]{3,20}$/;
export const MIN_PASSWORD = 8;

export interface SignUpInput {
  username: string;
  email: string;
  password: string;
  confirm: string;
}

export type SignUpErrors = Partial<Record<keyof SignUpInput, string>>;

export function usernameProblem(username: string): string | null {
  const name = username.trim();
  if (!name) return "Choose a username.";
  if (name.length < 3 || name.length > 20) return "Usernames are 3 to 20 characters.";
  if (!USERNAME_RULE.test(name)) return "Use only letters, numbers, dots and underscores.";
  return null;
}

/** Every problem with a sign-up, by field; empty when it can be sent. */
export function validateSignUp(input: SignUpInput): SignUpErrors {
  const errors: SignUpErrors = {};
  const username = usernameProblem(input.username);
  if (username) errors.username = username;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) errors.email = "Enter a valid email address.";
  if (input.password.length < MIN_PASSWORD) errors.password = `Use at least ${MIN_PASSWORD} characters.`;
  if (input.confirm !== input.password) errors.confirm = "The passwords don't match.";
  return errors;
}

/** Supabase auth messages, said plainly; unknown ones pass through. */
export function friendlyAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "That email and password don't match an account.";
  if (m.includes("email not confirmed")) return "Confirm your email first — check your inbox for the link.";
  if (m.includes("already registered") || m.includes("already been registered"))
    return "An account with that email already exists. Sign in instead.";
  // The unique index fired: someone took the name after the availability check.
  if (m.includes("database error saving new user")) return "That username was just taken. Pick another.";
  if (m.includes("password should be") || m.includes("weak password"))
    return `Choose a stronger password (at least ${MIN_PASSWORD} characters).`;
  if (m.includes("rate limit")) return "Too many attempts. Wait a minute and try again.";
  return message;
}
