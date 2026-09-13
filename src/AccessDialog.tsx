import { useState } from 'react';
import { Dialog } from './Dialog';
import { request, safeLink } from './api';
import type { Config } from './types';
export function AccessDialog({ config, premium, onClose, onActivate, onLogout }: { config: Config; premium: boolean; onClose: () => void; onActivate: (key: string, expiresAt: string) => void; onLogout: () => void }) {
  const [key, setKey] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const phone = (config.wa.phone || '972523919350').replace(/\D/g, '');
  const purchase = safeLink(config.modal.buyUrl, 'https://wa.me/' + phone + '?text=' + encodeURIComponent(config.wa.purchaseMsg || 'היי, אשמח לגישת פרימיום'));
  return <Dialog title="גישת פרימיום" onClose={onClose}>
    <div className="access-content"><span className="eyebrow">BRILL STUDIO</span><h2>{premium ? 'גישת הפרימיום שלך פעילה' : 'כל הרעיונות. בהעתקה אחת.'}</h2>
      {premium ? <><p>אפשר להמשיך לגלוש ולהעתיק פרומפטים.</p><button onClick={onLogout}>התנתקות מהמכשיר הזה</button></> : <>
        <p>{config.modal.price || 'גישה מלאה לקטלוג הפרומפטים'}</p>
        {!!config.modal.bullets?.length && <ul>{config.modal.bullets.map((text, i) => <li key={i}>{text}</li>)}</ul>}
        <a className="primary-button" href={purchase} target="_blank" rel="noopener noreferrer">{config.modal.buyText || 'לרכישת גישה'}</a>
        <form onSubmit={async event => {
          event.preventDefault(); if (!key.trim() || busy) return; setBusy(true); setError('');
          try {
            const data = await request<{ valid: boolean; error?: string; expiresAt: string }>('/api/license', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ license_key: key.trim() }) });
            if (!data.valid) throw new Error(data.error || 'המפתח לא תקין');
            onActivate(key.trim(), data.expiresAt);
          } catch (error) { setError((error as Error).message); } finally { setBusy(false); }
        }}><label htmlFor="license">יש לך מפתח גישה?</label><div className="license-row"><input id="license" type="password" value={key} onChange={e => setKey(e.target.value)} autoComplete="off" placeholder="מפתח גישה" dir="ltr" required /><button className="primary-button" disabled={busy}>{busy ? 'בודק…' : 'הפעלה'}</button></div></form>
        {error && <p className="error" role="alert">{error}</p>}
      </>}
      <a className="admin-link" href="/admin">כניסת מנהל</a>
    </div>
  </Dialog>;
}
