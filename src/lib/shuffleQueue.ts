/**
 * The order "Shuffle all" plays the training tracks in during a session: every track once, in random
 * order, before any plays again. Each session starts a new order; nothing is saved.
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

/** A new random order of `files`, not starting with `avoid` (e.g. the track that just played). */
export function newQueue(files: string[], rand: () => number = Math.random, avoid?: string): ShuffleQueue {
  const order = shuffled([...new Set(files)], rand);
  if (order.length > 1 && order[0] === avoid) [order[0], order[1]] = [order[1], order[0]];
  return { order, next: 0 };
}

/**
 * The next track to play, and the queue after it. Tracks that were removed drop out. A new round starts
 * once all have played, never with the track that just did. `skip` holds tracks that can't play right
 * now (e.g. broken files); they're passed over.
 */
export function takeNext(
  queue: ShuffleQueue | null,
  files: string[],
  rand: () => number = Math.random,
  skip: ReadonlySet<string> = new Set(),
): { file: string | null; queue: ShuffleQueue } {
  const known = new Set(files);
  let q = queue ?? newQueue(files, rand);
  let last: string | undefined = q.order[q.next - 1];
  for (let round = 0; round < 2; round++) {
    let next = q.next;
    while (next < q.order.length && (!known.has(q.order[next]) || skip.has(q.order[next]))) next++;
    if (next < q.order.length) return { file: q.order[next], queue: { order: q.order, next: next + 1 } };
    // Everything has played: start a new round, but not with the track that just played.
    q = newQueue(files, rand, last);
    last = undefined;
  }
  return { file: null, queue: q };
}
