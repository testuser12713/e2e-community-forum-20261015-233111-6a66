import { api } from "./client";
import type {
  CategoryOut,
  CreateCategoryInput,
  Page,
  PaginationParams,
  UpdateCategoryInput,
} from "./types";

export async function listCategories(
  params: PaginationParams = {},
): Promise<Page<CategoryOut>> {
  return api.get<Page<CategoryOut>>("/api/v1/categories", {
    query: { ...params },
  });
}

export async function getCategory(slug: string): Promise<CategoryOut> {
  return api.get<CategoryOut>(
    `/api/v1/categories/${encodeURIComponent(slug)}`,
  );
}

export async function createCategory(
  input: CreateCategoryInput,
): Promise<CategoryOut> {
  return api.post<CategoryOut>("/api/v1/admin/categories", input);
}

export async function updateCategory(
  id: number,
  input: UpdateCategoryInput,
): Promise<CategoryOut> {
  return api.patch<CategoryOut>(`/api/v1/admin/categories/${id}`, input);
}

export async function reorderCategories(
  ids: number[],
): Promise<Page<CategoryOut>> {
  return api.put<Page<CategoryOut>>("/api/v1/admin/categories/order", { ids });
}
