import type { ErrorBody, ErrorDetail, AuthOut } from "./types";

/**
 * The typed fetch wrapper for the forum API.
 *
 * - attaches `Authorization: Bearer <access_token>` when a token is present
 * - turns the shared error envelope into a typed `ApiError`
 * - on a 401 it refreshes ONCE via POST /api/v1/auth/refresh (the HttpOnly
 *   cookie is sent with `credentials: "include"`) and repeats the original
 *   request silently, so a user working past the 15-minute expiry stays signed in.
 */

const rawBase =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";
export const API_BASE_URL = rawBase.replace(/\/+$/, "");

const TOKEN_KEY = "forum.access_token";

function readStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

let accessToken: string | null = readStoredToken();

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable — keep the in-memory copy only */
  }
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: ErrorBody["details"];

  constructor(
    status: number,
    code: string,
    message: string,
    details: ErrorBody["details"] = null,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** Field-level messages from a 422, keyed by field name. */
  fieldErrors(): Record<string, string> {
    const out: Record<string, string> = {};
    if (Array.isArray(this.details)) {
      for (const d of this.details as ErrorDetail[]) {
        out[d.field] = d.message;
      }
    }
    return out;
  }
}

export interface RequestOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  headers?: Record<string, string>;
  auth?: boolean;
  signal?: AbortSignal;
}

function buildUrl(
  path: string,
  query?: RequestOptions["query"],
): string {
  const url = `${API_BASE_URL}${path}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    params.append(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

async function rawRequest(
  path: string,
  opts: RequestOptions,
): Promise<Response> {
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  if (opts.body !== undefined && !("Content-Type" in headers)) {
    headers["Content-Type"] = "application/json";
  }
  if (opts.auth !== false && accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }
  return fetch(buildUrl(path, opts.query), {
    method: opts.method ?? "GET",
    headers,
    credentials: "include",
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  });
}

async function parseError(res: Response): Promise<ApiError> {
  let code = "http_error";
  let message = res.statusText || `HTTP ${res.status}`;
  let details: ErrorBody["details"] = null;
  try {
    const body = (await res.json()) as { error?: ErrorBody };
    if (body && body.error) {
      code = body.error.code ?? code;
      message = body.error.message ?? message;
      details = body.error.details ?? null;
    }
  } catch {
    /* non-JSON error body — keep the defaults */
  }
  return new ApiError(res.status, code, message, details);
}

async function readBody<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

const REFRESH_PATH = "/api/v1/auth/refresh";
let refreshInFlight: Promise<boolean> | null = null;

/** Refresh the access token once, sharing a single call across concurrent 401s. */
export async function refreshAccessToken(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}${REFRESH_PATH}`, {
          method: "POST",
          credentials: "include",
        });
        if (!res.ok) {
          setAccessToken(null);
          return false;
        }
        const data = (await res.json()) as AuthOut;
        if (data?.access_token) {
          setAccessToken(data.access_token);
          return true;
        }
        setAccessToken(null);
        return false;
      } catch {
        setAccessToken(null);
        return false;
      } finally {
        refreshInFlight = null;
      }
    })();
  }
  return refreshInFlight;
}

export async function request<T>(
  path: string,
  opts: RequestOptions = {},
): Promise<T> {
  const res = await rawRequest(path, opts);

  if (res.status === 401 && opts.auth !== false && path !== REFRESH_PATH) {
    const didRefresh = await refreshAccessToken();
    if (didRefresh) {
      const retry = await rawRequest(path, opts);
      if (retry.ok) return readBody<T>(retry);
      throw await parseError(retry);
    }
  }

  if (!res.ok) throw await parseError(res);
  return readBody<T>(res);
}

export const api = {
  get: <T>(path: string, opts?: RequestOptions) =>
    request<T>(path, { ...opts, method: "GET" }),
  post: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    request<T>(path, { ...opts, method: "POST", body }),
  patch: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    request<T>(path, { ...opts, method: "PATCH", body }),
  put: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    request<T>(path, { ...opts, method: "PUT", body }),
  del: <T>(path: string, opts?: RequestOptions) =>
    request<T>(path, { ...opts, method: "DELETE" }),
};
