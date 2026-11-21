/**
 * Speech helpers for recorded clips: speed up/slow down without changing pitch (WSOLA), and trim silence.
 * Pure functions on Float32Arrays so they're testable outside the browser.
 */

/**
 * Time-stretch by `rate` (1.25 = 25% faster, same pitch) using WSOLA: overlap-add short windowed frames,
 * each shifted slightly to line up with the previous one so the waveform stays continuous.
 * Returns the frame positions so other channels can be stretched identically.
 */
export function wsola(input: Float32Array, rate: number, sampleRate: number, positions?: number[]): { out: Float32Array; positions: number[] } {
  const N = Math.max(64, Math.round(0.03 * sampleRate)); // 30 ms frames
  const hs = N >> 1; // 50% overlap on output
  const ha = hs * rate; // analysis hop
  const tol = Math.round(0.01 * sampleRate); // ±10 ms search
  const win = new Float32Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N); // periodic Hann: sums to 1 at 50%
  const frames = Math.max(1, Math.floor((input.length - N) / ha) + 1);
  const out = new Float32Array(frames * hs + N);
  const pos: number[] = positions ?? [];

  if (!positions) {
    let prev = 0;
    for (let k = 0; k < frames; k++) {
      if (k === 0) {
        pos.push(0);
        continue;
      }
      const nominal = Math.round(k * ha);
      const target = prev + hs; // where the previous frame "naturally" continues
      let best = Math.min(Math.max(0, nominal), input.length - N);
      let bestScore = -Infinity;
      const lo = Math.max(0, nominal - tol);
      const hi = Math.min(input.length - N, nominal + tol);
      // Cross-correlate against the natural continuation; subsampled for speed.
      for (let p = lo; p <= hi; p += 2) {
        let sc = 0;
        for (let i = 0; i < hs && target + i < input.length; i += 4) sc += input[p + i] * input[target + i];
        if (sc > bestScore) {
          bestScore = sc;
          best = p;
        }
      }
      pos.push(best);
      prev = best;
    }
  }

  for (let k = 0; k < pos.length; k++) {
    const p = pos[k];
    const o = k * hs;
    for (let i = 0; i < N && p + i < input.length; i++) out[o + i] += input[p + i] * win[i];
  }
  // The first half-frame has only one window over it: fade-in is fine for speech, which starts near silence.
  return { out: out.subarray(0, Math.round(input.length / rate)), positions: pos };
}

/** Start/end sample of the audible part, with a little padding kept so consonants aren't clipped. */
export function audibleRange(data: Float32Array, sampleRate: number, threshold = 0.02, padSec = 0.04): [number, number] {
  let start = 0;
  while (start < data.length && Math.abs(data[start]) < threshold) start++;
  let end = data.length - 1;
  while (end > start && Math.abs(data[end]) < threshold) end--;
  if (start >= end) return [0, data.length];
  const pad = Math.round(padSec * sampleRate);
  return [Math.max(0, start - pad), Math.min(data.length, end + pad)];
}
