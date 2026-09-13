import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { loadCatalog, loadDetail, preference, readPreference, request, stored, store } from './api';
import { PromptCard } from './PromptCard';
import type { Card, Catalog, Selection } from './types';
const PromptDialog = lazy(() => import('./PromptDialog').then(m => ({ default: m.PromptDialog })));
const AccessDialog = lazy(() => import('./AccessDialog').then(m => ({ default: m.AccessDialog })));
function fromUrl(): Selection {
  const q = new URLSearchParams(location.search);
  return { q: q.get('q') || '', category: q.get('category') || '', page: Math.max(1, Number.parseInt(q.get('page') || '1') || 1), favorites: q.get('favorites') === '1' };
}
function initialFavorites(): Record<string, boolean> {
  const value = stored<unknown>('bb_favs', {});
  return value && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).filter(([key, on]) => /^[\w-]{1,160}$/.test(key) && on === true)) : {};
}
export default function App() {
  const [selection, setSelection] = useState(fromUrl);
  const selectionRef = useRef(selection); selectionRef.current = selection;
  const [query, setQuery] = useState(selection.q);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [favorites, setFavorites] = useState(initialFavorites);
  const [theme, setTheme] = useState(() => readPreference('bb_theme', 'dark'));
  const [layout, setLayout] = useState(() => readPreference('bb_gallery_layout', 'compact'));
  const [opened, setOpened] = useState<Card | null>(null);
  const [access, setAccess] = useState(false); const [premium, setPremium] = useState(false);
  const [notice, setNotice] = useState(''); const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const resultsRef = useRef<HTMLDivElement>(null);
  const [copying, setCopying] = useState(false);
  const favoriteKeys = Object.keys(favorites).filter(key => favorites[key]);
  const favoritesSignature = selection.favorites ? favoriteKeys.join(',') : '';
  const notify = (message: string) => { clearTimeout(noticeTimer.current); setNotice(message); noticeTimer.current = setTimeout(() => setNotice(''), 4500); };
  function navigate(next: Partial<Selection>, replace = false) {
    const value = { ...selectionRef.current, ...next }; const params = new URLSearchParams();
    if (value.q) params.set('q', value.q); if (value.category) params.set('category', value.category);
    if (value.page > 1) params.set('page', String(value.page)); if (value.favorites) params.set('favorites', '1');
    const url = location.pathname + (params.size ? '?' + params : '');
    if (replace) history.replaceState(null, '', url); else history.pushState(null, '', url);
    setSelection(value);
  }
  useEffect(() => {
    const pop = () => { const value = fromUrl(); setSelection(value); setQuery(value.q); setOpened(null); };
    window.addEventListener('popstate', pop); return () => window.removeEventListener('popstate', pop);
  }, []);
  useEffect(() => { const timer = setTimeout(() => { if (query !== selection.q) navigate({ q: query, page: 1 }, true); }, 250); return () => clearTimeout(timer); }, [query, selection.q]);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError('');
    loadCatalog(selection, favoriteKeys, controller.signal).then(data => {
      if (controller.signal.aborted) return;
      setCatalog(data); setLoading(false);
      store('bb_services_config', data.config.services);
      store('bb_header_config', data.config.header);
      if (data.page !== selection.page) navigate({ page: data.page }, true);
    }).catch(error => { if (!controller.signal.aborted) { setError(error.message); setLoading(false); } });
    return () => controller.abort();
  }, [selection.q, selection.category, selection.page, selection.favorites, favoritesSignature, reload]);
  useEffect(() => { document.documentElement.dataset.theme = theme === 'light' ? 'light' : 'dark'; preference('bb_theme', theme); }, [theme]);
  useEffect(() => { preference('bb_gallery_layout', layout); }, [layout]);
  useEffect(() => {
    let active = true;
    const params = new URLSearchParams(location.search);
    const activationKey = params.get('license_key');
    if (activationKey) { params.delete('license_key'); history.replaceState(null, '', location.pathname + (params.size ? '?' + params : '')); }
    request<{ premium: boolean }>('/api/session').then(async session => {
      if (session.premium && !activationKey) { if (active) setPremium(true); return; }
      const license = activationKey ? { key: activationKey } : stored<{ key?: string } | null>('brill_license', null);
      if (!license?.key) return;
      const result = await request<{ valid: boolean; expiresAt: string }>('/api/license', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ license_key: license.key }) });
      if (active && result.valid) { setPremium(true); store('brill_license', { ...license, expiresAt: result.expiresAt }); }
    }).catch(() => { /* Public browsing remains available if license validation is offline. */ });
    return () => { active = false; clearTimeout(noticeTimer.current); };
  }, []);
  function toggleFavorite(card: Card) {
    setFavorites(current => { const next = { ...current }; if (next[card.key]) delete next[card.key]; else next[card.key] = true; store('bb_favs', next); return next; });
  }
  async function copy(card: Card) {
    if (copying) return;
    if (!premium && catalog && !['full', 'catalog'].includes(catalog.config.freeMode) && !(catalog.config.freeMode === 'partial' && card.free)) { setOpened(null); setAccess(true); return; }
    setCopying(true);
    const text = loadDetail(card.key).then(detail => { if (!detail.copyEnabled || detail.prompt === null) throw new Error(detail.locked ? 'נדרשת גישת פרימיום' : 'ההעתקה אינה זמינה במצב קטלוג'); return detail.prompt; });
    // Start clipboard permission in the click gesture; Safari can reject it after an awaited fetch.
    try {
      if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') await navigator.clipboard.write([new ClipboardItem({ 'text/plain': text.then(value => new Blob([value], { type: 'text/plain' })) })]);
      else await navigator.clipboard.writeText(await text);
      notify('הפרומפט הועתק');
    } catch {
      await text.catch(() => undefined);
      setOpened(card); notify('אפשר להעתיק את הטקסט מתוך חלון הפרומפט.');
    } finally { setCopying(false); }
  }
  const config = catalog?.config;
  const categoryLabels = new Map(config?.categories.map(c => [c.id, c.label]) || []);
  const activeIndex = catalog?.items.findIndex(p => p.key === opened?.key) ?? -1;
  const category = config?.categories.find(c => c.id === selection.category)?.label || (selection.category === 'free' ? 'חינם' : selection.category === 'paid' ? 'בתשלום' : 'כל הפרומפטים');
  async function shareFavorites(kind: 'favsPrefix' | 'orderMsg' | 'sessionMsg') {
    if (!config) return;
    if (favoriteKeys.length === 0) { notify('בחרו תמונות במועדפים כדי לשתף אותן'); return; }
    const phone = (config.wa.phone || '972523919350').replace(/\D/g, '');
    const prefix = (config.wa[kind] || 'בחרתי {n} תמונות:').replace('{n}', String(favoriteKeys.length));
    // Preserve every selected ID, including favorites on other catalog pages.
    const text = prefix + '\n\n' + favoriteKeys.map(key => 'https://brill-banana-prompts-v3.vercel.app/?prompt=' + encodeURIComponent(key)).join('\n');
    if (text.length > 6000) { notify('הרשימה ארוכה לשיתוף אחד. אפשר להעתיק את הרשימה.'); try { await navigator.clipboard.writeText(text); notify('רשימת המועדפים הועתקה'); } catch { notify('לא ניתן להעתיק כרגע'); } return; }
    window.open('https://wa.me/' + phone + '?text=' + encodeURIComponent(text), '_blank', 'noopener,noreferrer');
  }
  useEffect(() => {
    const key = new URLSearchParams(location.search).get('prompt');
    if (!key) return;
    const controller = new AbortController();
    loadDetail(key, controller.signal).then(detail => setOpened(detail)).catch(error => { if (!controller.signal.aborted) notify(error.message); });
    return () => controller.abort();
  }, []);
  return <>
    <a className="skip-link" href="#results">דילוג לגלריה</a>
    <header className="site-header">
      <a className="brand" href="/" aria-label="Brill Studio — דף הבית"><span className="brand-mark" aria-hidden="true">B<span>·</span></span><span>{config?.header.title || 'Brill Studio'}</span></a>
      <div className="header-actions">
        {config?.shareWhatsApp && <a className="services-link" href="/services">שירותי הסטודיו</a>}
        <button className={'premium-button ' + (premium ? 'active' : '')} onClick={() => setAccess(true)}>◇ <span>{premium ? 'החשבון שלי' : 'פרימיום'}</span></button>
        <button className="icon-button theme-button" aria-label={theme === 'light' ? 'מעבר למצב כהה' : 'מעבר למצב בהיר'} onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>{theme === 'light' ? '☾' : '☀'}</button>
      </div>
    </header>
    <main>
      <section className="gallery-heading" aria-label="חיפוש בגלריה">
        <div><p className="eyebrow">THE PROMPT COLLECTION</p><h1>{config?.header.sub1 || 'קטלוג ליצירת תמונות אישיות'}</h1><p className="intro">{config?.header.sub2 || 'בחרו רעיון. העתיקו פרומפט. צרו משהו משלכם.'}</p></div>
        <form className="search-form" role="search" onSubmit={event => { event.preventDefault(); navigate({ q: query, page: 1 }, true); }}><label htmlFor="search" className="sr-only">חיפוש בכל הפרומפטים</label><span aria-hidden="true">⌕</span><input id="search" type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="מה ניצור היום?" autoComplete="off" /><kbd aria-hidden="true">חיפוש</kbd></form>
      </section>
      <section className="browse-controls" aria-label="סינון ותצוגה">
        <nav className="categories" aria-label="קטגוריות">
          {[{ id: '', label: 'הכול' }, { id: 'free', label: 'חינם' }, { id: 'paid', label: 'בתשלום' }, ...(config?.categories || [])].map(c => <button key={c.id} aria-pressed={selection.category === c.id} className={selection.category === c.id ? 'active' : ''} onClick={() => navigate({ category: c.id, page: 1 })}>{c.label}</button>)}
        </nav>
        <div className="results-bar">
          <div className="result-label"><span className="status-dot" /><span>{selection.favorites ? 'המועדפים שלי' : category}</span><span className="result-count" aria-live="polite">{loading ? '…' : catalog?.total.toLocaleString('he-IL')}</span></div>
          <div className="view-actions"><button className={'favorites-filter ' + (selection.favorites ? 'active' : '')} aria-pressed={selection.favorites} onClick={() => navigate({ favorites: !selection.favorites, page: 1 })}><span aria-hidden="true">♡</span> מועדפים <span>{favoriteKeys.length}</span></button>
            <div className="layout-toggle" role="group" aria-label="גודל כרטיסים"><button className={layout === 'large' ? 'active' : ''} aria-pressed={layout === 'large'} aria-label="כרטיסים גדולים" onClick={() => setLayout('large')}>▣</button><button className={layout !== 'large' ? 'active' : ''} aria-pressed={layout !== 'large'} aria-label="גלריה צפופה" onClick={() => setLayout('compact')}>▦</button></div>
          </div>
        </div>
        {selection.favorites && config?.shareWhatsApp && <div className="favorites-actions"><button onClick={() => shareFavorites('favsPrefix')}>שיתוף הבחירה</button><button onClick={() => shareFavorites('orderMsg')}>הזמנת תמונות</button><button onClick={() => shareFavorites('sessionMsg')}>קביעת סשן</button></div>}
      </section>
      {catalog?.stale && <p className="connection-note" role="status">מוצג העותק האחרון שנשמר. העדכונים החדשים יופיעו כשהחיבור יחזור.</p>}
      <div ref={resultsRef} id="results" tabIndex={-1} className="results" aria-busy={loading}>
        {error ? <div className="empty-state" role="alert"><h2>לא הצלחנו לטעון את הגלריה</h2><p>{error}</p><button className="primary-button" onClick={() => setReload(reload + 1)}>ניסיון נוסף</button></div>
          : !catalog ? <div className="initial-loading" role="status"><span className="loader" /> טוען את הגלריה…</div>
          : catalog.total === 0 ? <div className="empty-state"><span aria-hidden="true">⌕</span><h2>{selection.favorites ? 'כאן יופיעו הרעיונות ששמרתם' : 'לא נמצאו פרומפטים'}</h2><p>{selection.favorites ? 'סמנו לב ליד תמונה שאהבתם.' : 'נסו מילת חיפוש אחרת או קטגוריה נוספת.'}</p><button onClick={() => { setQuery(''); navigate({ q: '', category: '', favorites: false, page: 1 }); }}>חזרה לכל הפרומפטים</button></div>
          : <div className={'gallery-grid ' + (layout === 'large' ? 'large-cards' : '')} data-testid="gallery">
            {catalog.items.map((card, index) => <PromptCard key={card.key} card={card} index={index} large={layout === 'large'} favorite={!!favorites[card.key]} labels={card.cats.map(id => categoryLabels.get(id)).filter(Boolean).join(' · ') || card.cat} onFavorite={() => toggleFavorite(card)} onOpen={() => setOpened(card)} onCopy={() => copy(card)} catalogMode={config?.freeMode === 'catalog'} canCopy={premium || config?.freeMode === 'full' || (config?.freeMode === 'partial' && card.free)} />)}
          </div>}
      </div>
      {catalog && catalog.total > 0 && <nav className="pagination" aria-label="עמודי גלריה"><button disabled={loading || catalog.page <= 1} onClick={() => { navigate({ page: catalog.page - 1 }); resultsRef.current?.scrollIntoView({ block: 'start' }); resultsRef.current?.focus({ preventScroll: true }); }}>→ הקודם</button><span>עמוד <strong>{catalog.page}</strong> מתוך {catalog.pages}</span><button disabled={loading || catalog.page >= catalog.pages} onClick={() => { navigate({ page: catalog.page + 1 }); resultsRef.current?.scrollIntoView({ block: 'start' }); resultsRef.current?.focus({ preventScroll: true }); }}>הבא ←</button></nav>}
    </main>
    <footer><a className="footer-brand" href="/">Brill Studio<span>·</span></a><span>{catalog?.catalogTotal.toLocaleString('he-IL') || ''} רעיונות ליצירה הבאה שלך</span><a href="/admin">ניהול</a></footer>
    <Suspense fallback={null}>
      {opened && <PromptDialog card={opened} onClose={() => setOpened(null)} previous={activeIndex > 0} next={!!catalog && activeIndex >= 0 && activeIndex < catalog.items.length - 1} onNavigate={delta => { const card = catalog?.items[activeIndex + delta]; if (card) setOpened(card); }} favorite={!!favorites[opened.key]} onFavorite={() => toggleFavorite(opened)} onCopy={() => copy(opened)} onUnlock={() => { setOpened(null); setAccess(true); }} />}
      {access && config && <AccessDialog config={config} premium={premium} onClose={() => setAccess(false)} onActivate={(key, expiresAt) => { store('brill_license', { key, expiresAt, activatedAt: new Date().toISOString() }); const saved = stored<Record<string, boolean>>('bb_favs_' + key, {}); const merged = { ...saved, ...favorites }; setFavorites(merged); store('bb_favs', merged); setPremium(true); setAccess(false); notify('גישת הפרימיום הופעלה'); }} onLogout={async () => { try { await request('/api/session', { method: 'DELETE' }); const current = stored<{ key?: string } | null>('brill_license', null); if (current?.key) store('bb_favs_' + current.key, favorites); store('brill_license', null); setPremium(false); setAccess(false); notify('התנתקת בהצלחה'); } catch (error) { notify((error as Error).message); } }} />}
    </Suspense>
    <div className={'toast ' + (notice ? 'visible' : '')} role="status" aria-live="polite">{notice}</div>
  </>;
}
