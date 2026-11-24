import { useEffect, useRef } from 'react';

/** Wait before a held button starts repeating, then between steps: each wait is shorter, down to a floor. */
const HOLD_MS = 400;
const FIRST_MS = 200;
const SPEED_UP = 0.9;
const FASTEST_MS = 30;

/** − value + control. Hold a button to keep changing, faster and faster. */
export default function Stepper({
  value,
  min,
  max,
  step = 1,
  less,
  more,
  format = String,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  /** Names of the two buttons, for screen readers. */
  less: string;
  more: string;
  format?: (v: number) => string;
  onChange: (v: number) => void;
}) {
  const ref = useRef({ value, onChange });
  ref.current = { value, onChange };
  const timer = useRef(0);
  /** When a finger or mouse last touched a button, to tell its click from a keyboard's. */
  const touched = useRef(-Infinity);
  const stop = () => window.clearTimeout(timer.current);
  useEffect(() => stop, []);

  /** One step; false when already at the limit. */
  const nudge = (dir: 1 | -1): boolean => {
    const { value: v, onChange: on } = ref.current;
    // Snap onto the step grid, then move one step.
    const next = Math.min(max, Math.max(min, dir > 0 ? Math.floor(v / step) * step + step : Math.ceil(v / step) * step - step));
    if (next === v) return false;
    ref.current.value = next;
    on(next);
    return true;
  };
  const press = (dir: 1 | -1) => {
    stop();
    nudge(dir);
    let wait = FIRST_MS;
    const repeat = () => {
      if (!nudge(dir)) return;
      timer.current = window.setTimeout(repeat, wait);
      wait = Math.max(FASTEST_MS, wait * SPEED_UP);
    };
    timer.current = window.setTimeout(repeat, HOLD_MS);
  };
  const release = () => {
    touched.current = performance.now();
    stop();
  };

  const btn = (dir: 1 | -1) => (
    <button
      type="button"
      className="btn icon"
      aria-label={dir > 0 ? more : less}
      disabled={dir > 0 ? value >= max : value <= min}
      onPointerDown={(e) => {
        touched.current = performance.now();
        if (e.button === 0) press(dir);
      }}
      onPointerUp={release}
      onPointerLeave={release}
      onPointerCancel={release}
      onContextMenu={(e) => e.preventDefault()}
      onClick={() => {
        // Presses are handled above; this is the keyboard or a screen reader.
        if (performance.now() - touched.current > 500) nudge(dir);
      }}
    >
      {dir > 0 ? '+' : '−'}
    </button>
  );
  return (
    <div className="stepper">
      {btn(-1)}
      <b className="stepper-time">{format(value)}</b>
      {btn(1)}
    </div>
  );
}
