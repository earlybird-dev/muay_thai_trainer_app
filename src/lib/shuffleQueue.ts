/**
 * The order "Shuffle all" plays the training tracks in: every track once, in random order, before any
 * plays again. The order is kept on the device, so it carries on across sessions.
 */
export interface ShuffleQueue {
  /** Tracks (file names) in the order they play. */
  order: string[];
  /** Position of the next track to play in `order`. */
  next: number;
}

function shuffled<T>(items: T[], rand: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * The next track to play, and the queue after it. Tracks that were removed drop out; new ones join the
 * part not played yet. A new round starts once all have played, never with the track that just did.
 * `skip` holds tracks that can't play right now (e.g. broken files); they're passed over.
 */
export function takeNext(
  queue: ShuffleQueue | null,
  files: string[],
  rand: () => number = Math.random,
  skip: ReadonlySet<string> = new Set(),
): { file: string | null; queue: ShuffleQueue } {
  const known = new Set(files);
  const old = queue && Array.isArray(queue.order) ? queue : { order: [], next: 0 };
  // Each track once (a damaged saved order could list one twice).
  const seen = new Set<string>();
  const keep = (f: string) => known.has(f) && !seen.has(f) && !!seen.add(f);
  const at = Math.max(0, Math.min(Math.floor(old.next) || 0, old.order.length));
  const played = old.order.slice(0, at).filter(keep);
  const left = old.order.slice(at).filter(keep);
  const last = played[played.length - 1];
  const fresh = files.filter((f) => !played.includes(f) && !left.includes(f));
  for (const f of fresh) left.splice(Math.floor(rand() * (left.length + 1)), 0, f);
  let order = [...played, ...left];
  let next = played.length;

  for (let tries = 0; tries < 2; tries++) {
    while (next < order.length && skip.has(order[next])) next++;
    if (next < order.length) return { file: order[next], queue: { order, next: next + 1 } };
    // Everything has played: start a new round, but not with the track that just played.
    order = shuffled(files, rand);
    if (order.length > 1 && order[0] === last) [order[0], order[1]] = [order[1], order[0]];
    next = 0;
  }
  return { file: null, queue: { order, next: 0 } };
}

const KEY = 'mtt-shuffle-queue';

export function loadShuffleQueue(): ShuffleQueue | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    return v && Array.isArray(v.order) && typeof v.next === 'number' ? { order: v.order.filter((f: unknown) => typeof f === 'string'), next: v.next } : null;
  } catch {
    return null;
  }
}

export function saveShuffleQueue(q: ShuffleQueue) {
  try {
    localStorage.setItem(KEY, JSON.stringify(q));
  } catch {
    /* private mode or full: the order just won't carry over */
  }
}
