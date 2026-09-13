export type CopyState = "idle" | "pending" | "success" | "error";

export function CopyButton({
  state = "idle",
  disabled = false,
  onClick,
  label = "העתקה",
  icon = "↗",
  className = "copy-button",
}: {
  state?: CopyState;
  disabled?: boolean;
  onClick: () => void;
  label?: string;
  icon?: string;
  className?: string;
}) {
  const text =
    state === "pending"
      ? "מעתיק…"
      : state === "success"
        ? "הועתק"
        : state === "error"
          ? "נסו שוב"
          : label;
  return (
    <button
      className={className + " copy-feedback"}
      data-copy-state={state}
      disabled={disabled || state === "pending"}
      aria-busy={state === "pending"}
      onClick={onClick}
    >
      <span aria-live="polite">{text}</span>
      <span
        className={state === "pending" ? "copy-icon copy-spinner" : "copy-icon"}
        aria-hidden="true"
      >
        {state === "pending"
          ? ""
          : state === "success"
            ? "✓"
            : state === "error"
              ? "↻"
              : icon}
      </span>
    </button>
  );
}
