// One bounded cache for background loading, the prompt viewer and Copy.
export function createDetailCache<T extends { key: string }>(options: {
  one: (key: string) => Promise<T>;
  many: (keys: string[]) => Promise<T[]>;
  valid?: (value: T) => boolean;
  ttl?: number;
  capacity?: number;
  now?: () => number;
}) {
  const values = new Map<string, { value: T; until: number }>();
  const pending = new Map<string, Promise<T | undefined>>();
  const now = options.now || Date.now;
  let scope = "",
    generation = 0;
  function setScope(next: string) {
    if (scope === next) return;
    scope = next;
    generation++;
    values.clear();
    pending.clear();
  }
  function peek(key: string) {
    const entry = values.get(key);
    if (!entry) return;
    if (entry.until <= now()) {
      values.delete(key);
      return;
    }
    values.delete(key);
    values.set(key, entry);
    return entry.value;
  }
  function save(value: T, started: number) {
    if (started !== generation || (options.valid && !options.valid(value)))
      return;
    values.delete(value.key);
    values.set(value.key, { value, until: now() + (options.ttl ?? 60000) });
    while (values.size > (options.capacity ?? 300))
      values.delete(values.keys().next().value!);
  }
  function subscribe(task: Promise<T>, signal?: AbortSignal): Promise<T> {
    if (!signal) return task;
    if (signal.aborted)
      return Promise.reject(new DOMException("Aborted", "AbortError"));
    return new Promise((resolve, reject) => {
      const abort = () => reject(new DOMException("Aborted", "AbortError"));
      signal.addEventListener("abort", abort, { once: true });
      task.then(
        (value) => {
          signal.removeEventListener("abort", abort);
          if (!signal.aborted) resolve(value);
        },
        (error) => {
          signal.removeEventListener("abort", abort);
          reject(error);
        },
      );
    });
  }
  function load(key: string, signal?: AbortSignal): Promise<T> {
    const value = peek(key);
    if (value) return subscribe(Promise.resolve(value), signal);
    const started = generation;
    const existing = pending.get(key);
    if (existing)
      return subscribe(
        existing.then((value) => {
          if (started !== generation)
            throw new DOMException("Context changed", "AbortError");
          return value || load(key);
        }),
        signal,
      );
    const task = options
      .one(key)
      .then((value) => {
        if (started !== generation)
          throw new DOMException("Context changed", "AbortError");
        save(value, started);
        return value;
      })
      .finally(() => {
        if (pending.get(key) === task) pending.delete(key);
      });
    pending.set(key, task);
    return subscribe(task, signal);
  }
  async function preload(keys: string[]) {
    const missing = [...new Set(keys)]
      .filter((key) => !peek(key) && !pending.has(key))
      .slice(0, 100);
    if (!missing.length) return;
    const started = generation;
    const job = options
      .many(missing)
      .then((items) => {
        items.forEach((value) => save(value, started));
        return new Map(items.map((value) => [value.key, value]));
      })
      .catch(() => new Map<string, T>());
    for (const key of missing) {
      const task = job
        .then((items) => (started === generation ? items.get(key) : undefined))
        .finally(() => {
          if (pending.get(key) === task) pending.delete(key);
        });
      pending.set(key, task);
    }
    await job;
  }
  return { setScope, peek, load, preload };
}
