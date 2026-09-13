import type { Card } from "./types";
export function PromptCard({
  card,
  index,
  large,
  favorite,
  labels,
  onFavorite,
  onOpen,
  onCopy,
  canCopy,
  catalogMode,
}: {
  card: Card;
  index: number;
  large: boolean;
  favorite: boolean;
  labels: string;
  onFavorite: () => void;
  onOpen: () => void;
  onCopy: () => void;
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
            sizes={
              large
                ? "(max-width: 600px) 100vw, (max-width: 1000px) 50vw, 33vw"
                : "(max-width: 600px) 50vw, (max-width: 1000px) 33vw, (max-width: 1450px) 25vw, 20vw"
            }
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
            <button
              className={"copy-button " + (canCopy ? "" : "locked")}
              onClick={onCopy}
            >
              {canCopy ? "העתקה" : "פרימיום"}{" "}
              <span aria-hidden="true">{canCopy ? "↗" : "◇"}</span>
            </button>
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
