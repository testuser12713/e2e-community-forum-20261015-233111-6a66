import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ApiError } from "../api/client";

type FieldMap = Record<string, string>;

/**
 * Forum sign-in form (contract: POST /api/v1/auth/login).
 *
 * On success the access token is stored by AuthContext and the user lands on
 * the feed. Server failures use the shared error envelope: field-level 422
 * messages render next to their field, every other failure renders as a
 * form-level Alert. Validation feedback appears only after a field was touched
 * or the form was submitted (AC-44).
 */
export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [usernameOrEmail, setUsernameOrEmail] = useState("");
  const [password, setPassword] = useState("");
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);
  const [serverFieldErrors, setServerFieldErrors] = useState<FieldMap>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function localErrors(): FieldMap {
    const errors: FieldMap = {};
    if (!usernameOrEmail.trim()) {
      errors.username_or_email = "Bitte Benutzername oder E-Mail angeben.";
    }
    if (!password) {
      errors.password = "Bitte Passwort angeben.";
    }
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
      await login(usernameOrEmail.trim(), password);
      navigate("/", { replace: true });
    } catch (error) {
      if (error instanceof ApiError) {
        const fields = error.fieldErrors();
        if (error.status === 422 && Object.keys(fields).length > 0) {
          setServerFieldErrors(fields);
        } else {
          setFormError(error.message);
        }
      } else {
        setFormError("Anmeldung fehlgeschlagen. Bitte später erneut versuchen.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  const usernameError = errorFor("username_or_email");
  const passwordError = errorFor("password");

  return (
    <div className="mx-auto w-full max-w-[440px]">
      <section className="card flex flex-col gap-4" aria-label="Anmelden">
        <h1 className="text-[24px] font-semibold text-fg">Anmelden</h1>

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
              htmlFor="login-username"
              className="text-sm font-medium text-fg"
            >
              Benutzername oder E-Mail
            </label>
            <input
              id="login-username"
              className="input"
              type="text"
              autoComplete="username"
              value={usernameOrEmail}
              onChange={(event) => setUsernameOrEmail(event.target.value)}
              onBlur={() => markTouched("username_or_email")}
              aria-invalid={usernameError ? true : undefined}
              aria-describedby={
                usernameError ? "login-username-error" : undefined
              }
              disabled={submitting}
            />
            {usernameError ? (
              <p
                id="login-username-error"
                role="alert"
                className="mt-1 text-[13px] leading-[18px] text-danger"
              >
                {usernameError}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="login-password" className="text-sm font-medium text-fg">
              Passwort
            </label>
            <input
              id="login-password"
              className="input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              onBlur={() => markTouched("password")}
              aria-invalid={passwordError ? true : undefined}
              aria-describedby={
                passwordError ? "login-password-error" : undefined
              }
              disabled={submitting}
            />
            {passwordError ? (
              <p
                id="login-password-error"
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
            {submitting ? "Anmelden…" : "Anmelden"}
          </button>
        </form>

        <p className="text-sm text-fg-muted">
          Noch kein Konto?{" "}
          <Link to="/register" className="text-accent underline">
            Jetzt registrieren
          </Link>
        </p>
      </section>
    </div>
  );
}

export default LoginPage;
