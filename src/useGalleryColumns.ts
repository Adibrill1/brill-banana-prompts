import { useEffect, useState } from "react";
import { preference, readPreference } from "./api";

function screenSize(): "mobile" | "tablet" | "desktop" {
  return window.matchMedia("(max-width: 600px)").matches
    ? "mobile"
    : window.matchMedia("(max-width: 1000px)").matches
      ? "tablet"
      : "desktop";
}

function savedColumns(key: string, fallback: number) {
  const saved = Number(readPreference(key, ""));
  return Number.isInteger(saved) && saved >= 1 && saved <= 7 ? saved : fallback;
}

export function useGalleryColumns() {
  const [preferences, setPreferences] = useState(() => ({
    desktop: savedColumns(
      "bb_gallery_columns",
      readPreference("bb_gallery_layout", "compact") === "large" ? 3 : 4,
    ),
    tablet: savedColumns("bb_gallery_columns_tablet", 3),
    mobile: savedColumns("bb_gallery_columns_mobile", 2),
  }));
  const [screen, setScreen] = useState(screenSize);
  useEffect(() => {
    const queries = [
      window.matchMedia("(max-width: 600px)"),
      window.matchMedia("(max-width: 1000px)"),
    ];
    const update = () => setScreen(screenSize());
    queries.forEach((query) => query.addEventListener("change", update));
    return () =>
      queries.forEach((query) => query.removeEventListener("change", update));
  }, []);
  useEffect(() => {
    preference("bb_gallery_columns", String(preferences.desktop));
    preference("bb_gallery_columns_tablet", String(preferences.tablet));
    preference("bb_gallery_columns_mobile", String(preferences.mobile));
  }, [preferences]);
  // Every screen allows 1–7; a desktop choice does not shrink the phone default.
  function setColumns(count: number) {
    if (Number.isInteger(count) && count >= 1 && count <= 7)
      setPreferences((current) => ({ ...current, [screen]: count }));
  }
  return { columns: preferences[screen], maximum: 7, setColumns };
}
