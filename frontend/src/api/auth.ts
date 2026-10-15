import { api, setAccessToken } from "./client";
import type {
  AuthOut,
  ChangePasswordInput,
  LoginInput,
  RegisterInput,
  UserOut,
} from "./types";

export async function register(input: RegisterInput): Promise<UserOut> {
  return api.post<UserOut>("/api/v1/auth/register", input, { auth: false });
}

export async function login(input: LoginInput): Promise<AuthOut> {
  const out = await api.post<AuthOut>("/api/v1/auth/login", input, {
    auth: false,
  });
  setAccessToken(out.access_token);
  return out;
}

export async function refresh(): Promise<AuthOut> {
  const out = await api.post<AuthOut>("/api/v1/auth/refresh", undefined, {
    auth: false,
  });
  setAccessToken(out.access_token);
  return out;
}

export async function logout(): Promise<void> {
  try {
    await api.post<void>("/api/v1/auth/logout");
  } finally {
    setAccessToken(null);
  }
}

export async function changePassword(
  input: ChangePasswordInput,
): Promise<void> {
  return api.post<void>("/api/v1/auth/change-password", input);
}
