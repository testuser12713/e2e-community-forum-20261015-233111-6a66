import type { AuthOut, ErrorDetail, ErrorEnvelope } from "./types";

/*
 * Typed fetch wrapper for the admin app.
 *
 * Every request carries the bearer access token when one is known, decodes the
 * shared error envelope into an ApiError and, on a 401, transparently refreshes
 * the session once against POST /api/v1/auth/refresh (HttpOnly refresh cookie)
 * and repeats the original request.
 */

const rawBase = import.meta.env.VITE_API_BASE_URL as string | undefined;
const API_BASE_URL = (rawBase && rawBase.trim().length > 0
  ? rawBase.replace(/\/+$/, "")
  : "http://localhost:8000");

export function getApiBaseUrl(): string {
  return API_BASE_URL;
}

type ErrorDetails = ErrorDetail[] | Record<string, unknown> | null;

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: ErrorDetails;

  constructor(
    status: number,
    code: string,
    message: string,
    details: ErrorDetails = null,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

let accessToken: string | null = null;
let sessionExpiredHandler: (() => void) | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function setSessionExpiredHandler(handler: (() => void) | null): void {
  sessionExpiredHandler = handler;
}

let refreshPromise: Promise<string | null> | null = null;

/** Silently refresh the session; concurrent callers share one request. */
export function refreshSession(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = (async (): Promise<string | null> => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/v1/auth/refresh`, {
          method: "POST",
          credentials: "include",
          headers: { Accept: "application/json" },
        });
        if (!res.ok) {
          accessToken = null;
          return null;
        }
        const data = (await res.json()) as AuthOut;
        accessToken = data.access_token;
        return data.access_token;
      } catch {
        accessToken = null;
        return null;
      }
    })().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

export interface RequestOptions {
  method?: string;
  body?: unknown;
  /** Attach the bearer token (default true). */
  auth?: boolean;
  /** Refresh once and retry on 401 (default true). */
  retryOn401?: boolean;
  signal?: AbortSignal;
}

async function parseResponse<T>(res: Response): Promise<T> {
  if (res.status === 204) {
    return undefined as T;
  }
  const text = await res.text();
  let parsed: unknown = null;
  if (text.length > 0) {
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      parsed = null;
    }
  }
  if (!res.ok) {
    const envelope = parsed as Partial<ErrorEnvelope> | null;
    const body = envelope?.error;
    throw new ApiError(
      res.status,
      body?.code ?? "http_error",
      body?.message ?? `HTTP ${res.status}`,
      body?.details ?? null,
    );
  }
  return parsed as T;
}

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const {
    method = "GET",
    body,
    auth = true,
    retryOn401 = true,
    signal,
  } = options;

  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (auth && accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      credentials: "include",
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch {
    throw new ApiError(
      0,
      "network_error",
      "Netzwerkfehler – bitte erneut versuchen.",
      null,
    );
  }

  if (res.status === 401 && auth && retryOn401) {
    const token = await refreshSession();
    if (token) {
      return apiRequest<T>(path, { ...options, retryOn401: false });
    }
    sessionExpiredHandler?.();
  }

  return parseResponse<T>(res);
}

export function buildQuery(
  params: Record<string, string | number | undefined | null>,
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      search.set(key, String(value));
    }
  }
  const qs = search.toString();
  return qs.length > 0 ? `?${qs}` : "";
}
