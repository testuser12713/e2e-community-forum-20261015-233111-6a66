import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import * as authApi from "../api/auth";
import { ApiError } from "../api/client";

type FieldMap = Record<string, string>;

function validateUsername(value: string): string | undefined {
  if (!value.trim()) return "Bitte einen Benutzernamen angeben.";
  if (value.trim().length < 3) {
    return "Der Benutzername muss mindestens 3 Zeichen haben.";
  }
  return undefined;
}

function validateEmail(value: string): string | undefined {
  if (!value.trim()) return "Bitte eine E-Mail-Adresse angeben.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) {
    return "Bitte eine gültige E-Mail-Adresse angeben.";
  }
  return undefined;
}

function validatePassword(value: string): string | undefined {
  if (!value) return "Bitte ein Passwort angeben.";
  if (value.length < 12) return "Das Passwort muss mindestens 12 Zeichen haben.";
  if (!/[A-Z]/.test(value)) {
    return "Das Passwort muss einen Großbuchstaben enthalten.";
  }
  if (!/[a-z]/.test(value)) {
    return "Das Passwort muss einen Kleinbuchstaben enthalten.";
  }
  if (!/[0-9]/.test(value)) return "Das Passwort muss eine Ziffer enthalten.";
  if (!/[^A-Za-z0-9]/.test(value)) {
    return "Das Passwort muss ein Sonderzeichen enthalten.";
  }
  return undefined;
}

/**
 * Forum registration form (contract: POST /api/v1/auth/register).
 *
 * Registration answers 201 with the created user but no token, so after a
 * successful registration the page signs the new account in with the same
 * credentials — that hands the access token to AuthContext and lands the user
 * on the feed. Conflicts (409) and any other failure render from the shared
 * error envelope; 422 field messages render next to their field. Validation
 * feedback appears only after a field was touched or the form was submitted.
 */
export function RegisterPage() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);
  const [serverFieldErrors, setServerFieldErrors] = useState<FieldMap>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function localErrors(): FieldMap {
    const errors: FieldMap = {};
    const usernameError = validateUsername(username);
    if (usernameError) errors.username = usernameError;
    const emailError = validateEmail(email);
    if (emailError) errors.email = emailError;
    const passwordError = validatePassword(password);
    if (passwordError) errors.password = passwordError;
    return errors;
  }

  function errorFor(field: string): string | undefined {
    if (!touched[field] && !submitted) return undefined;
    return serverFieldErrors[field] ?? localErrors()[field];
  }

  function markTouched(field: string): void {
    setTouched((current) => ({ ...current, [field]: true }));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSubmitted(true);
    setFormError(null);
    setServerFieldErrors({});
    if (Object.keys(localErrors()).length > 0) return;

    setSubmitting(true);
    try {
      await authApi.register({
        username: username.trim(),
        email: email.trim(),
        password,
      });
      try {
        await login(username.trim(), password);
        navigate("/", { replace: true });
      } catch {
        navigate("/login", { replace: true });
      }
    } catch (error) {
      if (error instanceof ApiError) {
        const fields = error.fieldErrors();
        if (error.status === 422 && Object.keys(fields).length > 0) {
          setServerFieldErrors(fields);
        } else {
          setFormError(error.message);
        }
      } else {
        setFormError(
          "Registrierung fehlgeschlagen. Bitte später erneut versuchen.",
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  const usernameError = errorFor("username");
  const emailError = errorFor("email");
  const passwordError = errorFor("password");

  return (
    <div className="mx-auto w-full max-w-[440px]">
      <section className="card flex flex-col gap-4" aria-label="Registrieren">
        <h1 className="text-[24px] font-semibold text-fg">Registrieren</h1>

        {formError ? (
          <div
            role="alert"
            className="rounded-md border border-danger bg-danger-soft px-4 py-3 text-sm text-fg"
          >
            {formError}
          </div>
        ) : null}

        <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
          <div className="flex flex-col gap-1">
            <label
              htmlFor="register-username"
              className="text-sm font-medium text-fg"
            >
              Benutzername
            </label>
            <input
              id="register-username"
              className="input"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              onBlur={() => markTouched("username")}
              aria-invalid={usernameError ? true : undefined}
              aria-describedby={
                usernameError ? "register-username-error" : undefined
              }
              disabled={submitting}
            />
            {usernameError ? (
              <p
                id="register-username-error"
                role="alert"
                className="mt-1 text-[13px] leading-[18px] text-danger"
              >
                {usernameError}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="register-email"
              className="text-sm font-medium text-fg"
            >
              E-Mail
            </label>
            <input
              id="register-email"
              className="input"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              onBlur={() => markTouched("email")}
              aria-invalid={emailError ? true : undefined}
              aria-describedby={emailError ? "register-email-error" : undefined}
              disabled={submitting}
            />
            {emailError ? (
              <p
                id="register-email-error"
                role="alert"
                className="mt-1 text-[13px] leading-[18px] text-danger"
              >
                {emailError}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="register-password"
              className="text-sm font-medium text-fg"
            >
              Passwort
            </label>
            <input
              id="register-password"
              className="input"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              onBlur={() => markTouched("password")}
              aria-invalid={passwordError ? true : undefined}
              aria-describedby={
                passwordError ? "register-password-error" : undefined
              }
              disabled={submitting}
            />
            {passwordError ? (
              <p
                id="register-password-error"
                role="alert"
                className="mt-1 text-[13px] leading-[18px] text-danger"
              >
                {passwordError}
              </p>
            ) : null}
          </div>

          <button
            type="submit"
            className="btn btn-primary w-full"
            disabled={submitting}
          >
            {submitting ? "Registrieren…" : "Registrieren"}
          </button>
        </form>

        <p className="text-sm text-fg-muted">
          Bereits ein Konto?{" "}
          <Link to="/login" className="text-accent underline">
            Anmelden
          </Link>
        </p>
      </section>
    </div>
  );
}

export default RegisterPage;
