import { useEffect, useRef, useState } from 'react';
import type { Card, Detail } from './types';
import { loadDetail } from './api';
import { Dialog } from './Dialog';
export function PromptDialog({ card, onClose, onNavigate, previous, next, favorite, onFavorite, onCopy, onUnlock }: {
  card: Card; onClose: () => void; onNavigate: (delta: number) => void; previous: boolean; next: boolean;
  favorite: boolean; onFavorite: () => void; onCopy: () => void; onUnlock: () => void;
}) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState(''); const [retry, setRetry] = useState(0);
  const [imageIndex, setImageIndex] = useState(0);
  const touch = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const controller = new AbortController(); setDetail(null); setError(''); setImageIndex(0);
    loadDetail(card.key, controller.signal).then(setDetail).catch(error => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, [card.key, retry]);
  const images = detail?.images || (card.image ? [card.image.src] : []);
  return <Dialog title={card.title} onClose={onClose} className="prompt-dialog">
    <div className="detail-layout" onKeyDown={event => {
      if (event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLInputElement) return;
      if (event.key === 'ArrowLeft' && next) { event.preventDefault(); onNavigate(1); }
      if (event.key === 'ArrowRight' && previous) { event.preventDefault(); onNavigate(-1); }
    }}>
      <div className="detail-visual" onTouchStart={event => { touch.current = { x: event.touches[0].clientX, y: event.touches[0].clientY }; }}
        onTouchEnd={event => {
          if (!touch.current) return;
          const dx = event.changedTouches[0].clientX - touch.current.x; const dy = event.changedTouches[0].clientY - touch.current.y;
          touch.current = null;
          if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) {
            if (dx > 0 && next) onNavigate(1); else if (dx < 0 && previous) onNavigate(-1);
          }
        }}>
        {images[imageIndex] ? <img key={card.key + imageIndex} src={images[imageIndex]} alt={card.title} onError={event => {
          const img = event.currentTarget; if (img.dataset.fallback || !card.image) return; img.dataset.fallback = 'true'; img.src = card.image.original;
        }} /> : <span>אין תמונה</span>}
        {images.length > 1 && <div className="image-pagination" aria-label="תמונות בפרומפט">
          {images.map((_, i) => <button key={i} className={i === imageIndex ? 'active' : ''} onClick={() => setImageIndex(i)} aria-label={'תמונה ' + (i + 1)} aria-current={i === imageIndex ? 'true' : undefined}>{i + 1}</button>)}
        </div>}
      </div>
      <div className="detail-content">
        <p className="eyebrow">פרומפט {card.number}</p><h2 dir="auto">{card.title}</h2>
        <div className="detail-actions">
          {!detail || detail.copyEnabled ? <button className="primary-button" onClick={onCopy}>העתקת פרומפט ↗</button> : detail.locked ? <button className="primary-button" onClick={onUnlock}>פתיחת גישת פרימיום</button> : null}
          <button className={'icon-button favorite ' + (favorite ? 'selected' : '')} onClick={onFavorite} aria-label={favorite ? 'הסרה מהמועדפים' : 'שמירה במועדפים'} aria-pressed={favorite}>{favorite ? '♥' : '♡'}</button>
        </div>
        {error ? <div role="alert"><p>{error}</p><button onClick={() => setRetry(retry + 1)}>ניסיון נוסף</button></div> : !detail ? <p className="muted" role="status">טוען את הפרומפט…</p> : detail.locked ? <p className="muted">הפרומפט זמין לבעלי גישת פרימיום.</p> : <pre className="full-prompt" dir="auto" tabIndex={0}>{detail.prompt}</pre>}
        <nav className="detail-nav" aria-label="מעבר בין פרומפטים"><button disabled={!previous} onClick={() => onNavigate(-1)}>→ הקודם</button><button disabled={!next} onClick={() => onNavigate(1)}>הבא ←</button></nav>
      </div>
    </div>
  </Dialog>;
}
