import type { Card } from "./types";
import { CopyButton, type CopyState } from "./CopyButton";
export function PromptCard({
  card,
  index,
  columns,
  favorite,
  labels,
  onFavorite,
  onOpen,
  onCopy,
  copyState,
  copyDisabled,
  canCopy,
  catalogMode,
}: {
  card: Card;
  index: number;
  columns: number;
  favorite: boolean;
  labels: string;
  onFavorite: () => void;
  onOpen: () => void;
  onCopy: () => void;
  copyState: CopyState;
  copyDisabled: boolean;
  canCopy: boolean;
  catalogMode: boolean;
}) {
  return (
    <article className="prompt-card" data-key={card.key}>
      <button
        className="image-button"
        onClick={onOpen}
        aria-label={"פתיחת " + card.title}
      >
        {card.image ? (
          <img
            src={card.image.src}
            srcSet={card.image.srcSet || undefined}
            sizes={`${100 / columns}vw`}
            width="640"
            height="640"
            alt={card.title}
            decoding="async"
            loading={index < 4 ? "eager" : "lazy"}
            fetchPriority={index === 0 ? "high" : "auto"}
            onError={(event) => {
              const image = event.currentTarget;
              if (image.dataset.fallback) return;
              image.dataset.fallback = "true";
              image.removeAttribute("srcset");
              image.src = card.image!.original;
            }}
          />
        ) : (
          <span className="no-image">אין תמונה</span>
        )}
        <span className="card-number">
          {String(card.number).padStart(2, "0")}
        </span>
        {card.image && card.image.count > 1 && (
          <span className="image-count">{card.image.count} תמונות</span>
        )}
      </button>
      <div className="card-content">
        <p className="card-category" title={labels}>
          {labels || "פרומפט"}
          {card.free && <span className="free-dot" title="פרומפט חינמי" />}
        </p>
        <h2 dir="auto">
          <button onClick={onOpen}>{card.title}</button>
        </h2>
        <div className="card-actions">
          {!catalogMode && (
            <CopyButton
              className={"copy-button " + (canCopy ? "" : "locked")}
              onClick={onCopy}
              state={copyState}
              disabled={copyDisabled}
              label={canCopy ? "העתקה" : "פרימיום"}
              icon={canCopy ? "↗" : "◇"}
            />
          )}
          <button
            className={"icon-button favorite " + (favorite ? "selected" : "")}
            onClick={onFavorite}
            aria-label={favorite ? "הסרה מהמועדפים" : "שמירה במועדפים"}
            aria-pressed={favorite}
          >
            {favorite ? "♥" : "♡"}
          </button>
        </div>
      </div>
    </article>
  );
}
