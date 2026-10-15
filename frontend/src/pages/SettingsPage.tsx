import { useEffect, useState, type CSSProperties, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { ApiError } from "../api/client";
import { changePassword } from "../api/auth";
import { updateMe } from "../api/users";
import type { UpdateProfileInput } from "../api/types";
import { useAuth } from "../context/AuthContext";

const labelStyle: CSSProperties = {
  display: "block",
  fontSize: 14,
  fontWeight: 600,
  marginBottom: 4,
  color: "var(--color-fg)",
};

const fieldErrorStyle: CSSProperties = {
  fontSize: 13,
  lineHeight: "18px",
  color: "var(--color-danger)",
  marginTop: 4,
  marginBottom: 0,
};

const counterStyle: CSSProperties = {
  fontSize: 13,
  color: "var(--color-fg-muted)",
  marginTop: 4,
  marginBottom: 0,
  textAlign: "right",
};

function alertStyle(tone: "error" | "success"): CSSProperties {
  const colour = tone === "error" ? "danger" : "success";
  return {
    padding: "12px 16px",
    borderRadius: "var(--radius-md)",
    border: `1px solid var(--color-${colour})`,
    background: `var(--color-${colour}-soft)`,
    color: "var(--color-fg)",
    fontSize: 14,
  };
}

/**
 * Read a field message from the shared error envelope. A 422 carries an array
 * of {field, message} in details; a 400 (wrong current password) may carry the
 * same field key in an object — both are handled here.
 */
function fieldMessage(error: ApiError, field: string): string | undefined {
  const fromFields = error.fieldErrors()[field];
  if (fromFields) return fromFields;
  const details = error.details;
  if (details && !Array.isArray(details) && typeof details === "object") {
    const value = (details as Record<string, unknown>)[field];
    if (typeof value === "string" && value.trim() !== "") return value;
  }
  return undefined;
}

interface PasswordTouched {
  current: boolean;
  next: boolean;
}

/**
 * The settings page /settings: profile editing via PATCH /api/v1/users/me and
 * the password change via POST /api/v1/auth/change-password. Validation
 * feedback appears only after a field was touched or the form submitted
 * (AC-44); a wrong current password renders the field error from the server.
 */
export function SettingsPage() {
  const { user, isAuthenticated, isLoading, setUser } = useAuth();

  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [bio, setBio] = useState("");
  const [profileTouched, setProfileTouched] = useState(false);
  const [profileSubmitted, setProfileSubmitted] = useState(false);
  const [profileFieldErrors, setProfileFieldErrors] = useState<
    Record<string, string>
  >({});
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSuccess, setProfileSuccess] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [pwTouched, setPwTouched] = useState<PasswordTouched>({
    current: false,
    next: false,
  });
  const [pwSubmitted, setPwSubmitted] = useState(false);
  const [pwFieldErrors, setPwFieldErrors] = useState<Record<string, string>>(
    {},
  );
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSuccess, setPwSuccess] = useState(false);

  useEffect(() => {
    if (!user) return;
    setDisplayName(user.display_name ?? "");
    setAvatarUrl(user.avatar_url ?? "");
    setBio(user.bio ?? "");
  }, [user]);

  if (isLoading) {
    return (
      <section className="card empty-state" aria-label="Einstellungen werden geladen">
        <p className="empty-state__hint">Lädt…</p>
      </section>
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  function clearProfileFieldError(field: string): void {
    setProfileFieldErrors((prev) => {
      if (!(field in prev)) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }

  function profileErrorFor(field: string, clientMessage?: string): string | undefined {
    if (profileFieldErrors[field]) return profileFieldErrors[field];
    if (profileTouched || profileSubmitted) return clientMessage;
    return undefined;
  }

  async function handleProfileSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setProfileSubmitted(true);
    setProfileError(null);
    setProfileSuccess(false);

    if (displayName.trim() === "") return;

    setProfileSaving(true);
    try {
      const input: UpdateProfileInput = {
        display_name: displayName.trim(),
        bio,
      };
      if (avatarUrl.trim() !== "") input.avatar_url = avatarUrl.trim();
      const updated = await updateMe(input);
      setUser(updated);
      setProfileTouched(false);
      setProfileSubmitted(false);
      setProfileFieldErrors({});
      setProfileSuccess(true);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.status === 422) {
          setProfileFieldErrors(err.fieldErrors());
        } else {
          setProfileError(err.message || "Speichern fehlgeschlagen.");
        }
      } else {
        setProfileError("Speichern fehlgeschlagen. Bitte erneut versuchen.");
      }
    } finally {
      setProfileSaving(false);
    }
  }

  function clearPwFieldError(field: string): void {
    setPwFieldErrors((prev) => {
      if (!(field in prev)) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }

  function pwErrorFor(
    field: "current_password" | "new_password",
    touched: boolean,
    clientMessage?: string,
  ): string | undefined {
    if (pwFieldErrors[field]) return pwFieldErrors[field];
    if (touched || pwSubmitted) return clientMessage;
    return undefined;
  }

  async function handlePasswordSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setPwSubmitted(true);
    setPwError(null);
    setPwSuccess(false);

    if (currentPassword === "" || newPassword === "") return;

    setPwSaving(true);
    try {
      await changePassword({
        current_password: currentPassword,
        new_password: newPassword,
      });
      setCurrentPassword("");
      setNewPassword("");
      setPwTouched({ current: false, next: false });
      setPwSubmitted(false);
      setPwFieldErrors({});
      setPwSuccess(true);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        const currentMessage = fieldMessage(err, "current_password");
        if (currentMessage) {
          setPwFieldErrors({ current_password: currentMessage });
        } else if (err.status === 422) {
          setPwFieldErrors(err.fieldErrors());
        } else {
          setPwError(err.message || "Passwortänderung fehlgeschlagen.");
        }
      } else {
        setPwError(
          "Passwortänderung fehlgeschlagen. Bitte erneut versuchen.",
        );
      }
    } finally {
      setPwSaving(false);
    }
  }

  const displayNameError = profileErrorFor(
    "display_name",
    "Bitte einen Anzeigenamen angeben.",
  );
  const avatarError = profileErrorFor("avatar_url");
  const bioError = profileErrorFor("bio");
  const currentPasswordError = pwErrorFor(
    "current_password",
    pwTouched.current,
    "Bitte das aktuelle Passwort angeben.",
  );
  const newPasswordError = pwErrorFor(
    "new_password",
    pwTouched.next,
    "Bitte ein neues Passwort angeben.",
  );

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Einstellungen</h1>

      <form
        className="card flex flex-col gap-4"
        noValidate
        onSubmit={handleProfileSubmit}
        aria-labelledby="settings-profile-title"
      >
        <h2 id="settings-profile-title" className="text-lg font-semibold">
          Profil
        </h2>

        {profileError && (
          <div style={alertStyle("error")} role="alert">
            {profileError}
          </div>
        )}
        {profileSuccess && (
          <div style={alertStyle("success")} role="status">
            Profil gespeichert.
          </div>
        )}

        <div>
          <label htmlFor="settings-display-name" style={labelStyle}>
            Anzeigename
          </label>
          <input
            id="settings-display-name"
            className="input"
            type="text"
            value={displayName}
            maxLength={80}
            disabled={profileSaving}
            aria-invalid={displayNameError ? true : undefined}
            aria-describedby={
              displayNameError ? "settings-display-name-error" : undefined
            }
            style={displayNameError ? { borderColor: "var(--color-danger)" } : undefined}
            onChange={(event) => {
              setDisplayName(event.target.value);
              clearProfileFieldError("display_name");
            }}
            onBlur={() => setProfileTouched(true)}
          />
          {displayNameError && (
            <p
              id="settings-display-name-error"
              role="alert"
              style={fieldErrorStyle}
            >
              {displayNameError}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="settings-avatar" style={labelStyle}>
            Avatar-URL
          </label>
          <input
            id="settings-avatar"
            className="input"
            type="url"
            value={avatarUrl}
            disabled={profileSaving}
            placeholder="https://…"
            aria-invalid={avatarError ? true : undefined}
            style={avatarError ? { borderColor: "var(--color-danger)" } : undefined}
            onChange={(event) => {
              setAvatarUrl(event.target.value);
              clearProfileFieldError("avatar_url");
            }}
            onBlur={() => setProfileTouched(true)}
          />
          {avatarError && (
            <p role="alert" style={fieldErrorStyle}>
              {avatarError}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="settings-bio" style={labelStyle}>
            Bio
          </label>
          <textarea
            id="settings-bio"
            className="input"
            value={bio}
            maxLength={500}
            rows={4}
            disabled={profileSaving}
            aria-invalid={bioError ? true : undefined}
            style={bioError ? { borderColor: "var(--color-danger)" } : undefined}
            onChange={(event) => {
              setBio(event.target.value);
              clearProfileFieldError("bio");
            }}
            onBlur={() => setProfileTouched(true)}
          />
          <p style={counterStyle}>{bio.length}/500</p>
          {bioError && (
            <p role="alert" style={fieldErrorStyle}>
              {bioError}
            </p>
          )}
        </div>

        <div>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={profileSaving}
          >
            {profileSaving ? "Wird gespeichert…" : "Profil speichern"}
          </button>
        </div>
      </form>

      <form
        className="card flex flex-col gap-4"
        noValidate
        onSubmit={handlePasswordSubmit}
        aria-labelledby="settings-password-title"
      >
        <h2 id="settings-password-title" className="text-lg font-semibold">
          Passwort ändern
        </h2>

        {pwError && (
          <div style={alertStyle("error")} role="alert">
            {pwError}
          </div>
        )}
        {pwSuccess && (
          <div style={alertStyle("success")} role="status">
            Passwort geändert. Andere Sitzungen wurden abgemeldet.
          </div>
        )}

        <div>
          <label htmlFor="settings-current-password" style={labelStyle}>
            Aktuelles Passwort
          </label>
          <input
            id="settings-current-password"
            className="input"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            disabled={pwSaving}
            aria-invalid={currentPasswordError ? true : undefined}
            aria-describedby={
              currentPasswordError
                ? "settings-current-password-error"
                : undefined
            }
            style={
              currentPasswordError
                ? { borderColor: "var(--color-danger)" }
                : undefined
            }
            onChange={(event) => {
              setCurrentPassword(event.target.value);
              clearPwFieldError("current_password");
            }}
            onBlur={() =>
              setPwTouched((prev) => ({ ...prev, current: true }))
            }
          />
          {currentPasswordError && (
            <p
              id="settings-current-password-error"
              role="alert"
              style={fieldErrorStyle}
            >
              {currentPasswordError}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="settings-new-password" style={labelStyle}>
            Neues Passwort
          </label>
          <input
            id="settings-new-password"
            className="input"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            disabled={pwSaving}
            aria-invalid={newPasswordError ? true : undefined}
            aria-describedby={
              newPasswordError ? "settings-new-password-error" : undefined
            }
            style={
              newPasswordError
                ? { borderColor: "var(--color-danger)" }
                : undefined
            }
            onChange={(event) => {
              setNewPassword(event.target.value);
              clearPwFieldError("new_password");
            }}
            onBlur={() => setPwTouched((prev) => ({ ...prev, next: true }))}
          />
          {newPasswordError && (
            <p
              id="settings-new-password-error"
              role="alert"
              style={fieldErrorStyle}
            >
              {newPasswordError}
            </p>
          )}
        </div>

        <div>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={pwSaving}
          >
            {pwSaving ? "Wird geändert…" : "Passwort ändern"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default SettingsPage;
