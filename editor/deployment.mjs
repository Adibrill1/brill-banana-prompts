export async function waitForPublication(revision, { read, signal, interval = 10000, timeout = 20 * 60 * 1000, now = Date.now, sleep = pause }) {
  const end = now() + timeout;
  while (!signal?.aborted && now() < end) {
    try {
      const result = await read();
      if (!result.stale && (result.stateRevision || result.revision) === revision) return true;
    } catch { if (signal?.aborted) return false; }
    await sleep(interval, signal);
  }
  return false;
}
function pause(ms, signal) {
  if (signal?.aborted) return Promise.resolve();
  return new Promise(resolve => {
    const finish = () => { clearTimeout(timer); signal?.removeEventListener('abort', finish); resolve(); };
    const timer = setTimeout(finish, ms);
    signal?.addEventListener('abort', finish, { once: true });
  });
}
