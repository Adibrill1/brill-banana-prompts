import { useEffect, useState } from "react";
import { preference, readPreference } from "./api";

function availableColumns() {
  return window.matchMedia("(max-width: 600px)").matches
    ? 2
    : window.matchMedia("(max-width: 1000px)").matches
      ? 3
      : 7;
}

export function useGalleryColumns() {
  const [preferred, setColumns] = useState(() => {
    const saved = Number(readPreference("bb_gallery_columns", ""));
    return Number.isInteger(saved) && saved >= 1 && saved <= 7
      ? saved
      : readPreference("bb_gallery_layout", "compact") === "large"
        ? 3
        : 4;
  });
  const [maximum, setMaximum] = useState(availableColumns);
  useEffect(() => {
    const queries = [
      window.matchMedia("(max-width: 600px)"),
      window.matchMedia("(max-width: 1000px)"),
    ];
    const update = () => setMaximum(availableColumns());
    queries.forEach((query) => query.addEventListener("change", update));
    return () =>
      queries.forEach((query) => query.removeEventListener("change", update));
  }, []);
  useEffect(() => {
    preference("bb_gallery_columns", String(preferred));
  }, [preferred]);
  // Resizing clamps the display without overwriting the saved desktop choice.
  return { columns: Math.min(preferred, maximum), maximum, setColumns };
}
