import type { Catalog, Detail, Selection } from "./types";
import { createDetailCache } from "./detail-cache.ts";
let revision = "";
const details = createDetailCache<Detail>({
  one: (key) => request<Detail>("/api/prompt?" + new URLSearchParams({ key })),
  many: async (keys) =>
    (
      await request<{ items: Detail[] }>("/api/prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keys }),
        priority: "low",
      })
    ).items,
  valid: (value) => value.revision === revision,
});
export function setDetailContext(next: string, premium: boolean) {
  revision = next;
  details.setScope(next + ":" + premium);
}
export const peekDetail = details.peek;
export const preloadDetails = details.preload;
export function initialCatalog(selection: Selection): Catalog | null {
  if (
    selection.q ||
    selection.category ||
    selection.favorites ||
    selection.page !== 1
  )
    return null;
  try {
    const text = document.getElementById("catalog-bootstrap")?.textContent;
    const data = text ? (JSON.parse(text) as Catalog) : null;
    if (
      data &&
      Array.isArray(data.items) &&
      /^[a-f0-9]{40}$/.test(data.revision)
    ) {
      revision = data.revision;
      return data;
    }
  } catch {
    /* Development and older HTML use the catalog endpoint. */
  }
  return null;
}
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
export async function loadCatalog(
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
  if (revision && !selection.favorites && !selection.q && !selection.category) {
    try {
      return await request<Catalog>(
        `/catalog/${revision}/page-${selection.page}.json`,
        { signal },
      );
    } catch (error) {
      if (signal.aborted) throw error;
    }
  }
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
export const loadDetail = details.load;
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
