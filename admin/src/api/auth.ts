import { apiRequest, setAccessToken } from "./client";
import type { AuthOut, UserMe, UserOut } from "./types";

export interface RegisterPayload {
  username: string;
  email: string;
  password: string;
}

export interface LoginPayload {
  username_or_email: string;
  password: string;
}

export interface ChangePasswordPayload {
  current_password: string;
  new_password: string;
}

export interface UpdateProfilePayload {
  display_name?: string;
  bio?: string | null;
  avatar_url?: string | null;
}

export async function register(payload: RegisterPayload): Promise<UserOut> {
  return apiRequest<UserOut>("/api/v1/auth/register", {
    method: "POST",
    body: payload,
    auth: false,
  });
}

export async function login(payload: LoginPayload): Promise<AuthOut> {
  const result = await apiRequest<AuthOut>("/api/v1/auth/login", {
    method: "POST",
    body: payload,
    auth: false,
  });
  setAccessToken(result.access_token);
  return result;
}

export async function refresh(): Promise<AuthOut> {
  const result = await apiRequest<AuthOut>("/api/v1/auth/refresh", {
    method: "POST",
    auth: false,
    retryOn401: false,
  });
  setAccessToken(result.access_token);
  return result;
}

export async function logout(): Promise<void> {
  setAccessToken(null);
  await apiRequest<void>("/api/v1/auth/logout", {
    method: "POST",
    auth: false,
  });
}

export async function changePassword(
  payload: ChangePasswordPayload,
): Promise<void> {
  await apiRequest<void>("/api/v1/auth/change-password", {
    method: "POST",
    body: payload,
  });
}

export async function getMe(): Promise<UserMe> {
  return apiRequest<UserMe>("/api/v1/users/me");
}

export async function updateMe(
  payload: UpdateProfilePayload,
): Promise<UserMe> {
  return apiRequest<UserMe>("/api/v1/users/me", {
    method: "PATCH",
    body: payload,
  });
}
