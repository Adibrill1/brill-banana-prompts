import type { Catalog, Detail, Selection } from "./types";
export async function request<T>(
  url: string,
  options?: RequestInit,
): Promise<T> {
  const response = await fetch(url, { credentials: "same-origin", ...options });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data)
    throw new Error(data?.error || "לא ניתן להתחבר כרגע. נסו שוב.");
  return data as T;
}
export function loadCatalog(
  selection: Selection,
  favorites: string[],
  signal: AbortSignal,
) {
  const params = {
    q: selection.q,
    category: selection.category,
    page: String(selection.page),
    limit: "100",
  };
  return selection.favorites
    ? request<Catalog>("/api/catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...params, keys: favorites }),
        signal,
      })
    : request<Catalog>("/api/catalog?" + new URLSearchParams(params), {
        signal,
      });
}
export const loadDetail = (key: string, signal?: AbortSignal) =>
  request<Detail>("/api/prompt?" + new URLSearchParams({ key }), { signal });
export function stored<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}
export function store(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Browsing still works when storage is unavailable. */
  }
}
export function readPreference(key: string, fallback: string) {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}
export function preference(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Optional preference. */
  }
}
export function safeLink(value: string | undefined, fallback: string) {
  try {
    const url = new URL(value || "");
    return url.protocol === "https:" ? url.href : fallback;
  } catch {
    return fallback;
  }
}
