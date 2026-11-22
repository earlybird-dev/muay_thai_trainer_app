import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Icon from './Icon';

/** In-app replacements for window.confirm / alert / prompt, styled like the rest of the app. */

interface BaseOptions {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button, for destructive actions. */
  danger?: boolean;
}
export interface PromptOptions extends BaseOptions {
  defaultValue?: string;
  placeholder?: string;
  /** Live check of the typed text: return an error message to show (and block saving), or null when it's fine. */
  validate?: (value: string) => string | null;
}

type Request =
  | { kind: 'confirm'; opts: BaseOptions; resolve: (v: boolean) => void }
  | { kind: 'alert'; opts: BaseOptions; resolve: () => void }
  | { kind: 'prompt'; opts: PromptOptions; resolve: (v: string | null) => void };

interface DialogApi {
  confirm: (opts: BaseOptions) => Promise<boolean>;
  alert: (opts: BaseOptions) => Promise<void>;
  /** Resolves to the trimmed text, or null if cancelled/empty. */
  prompt: (opts: PromptOptions) => Promise<string | null>;
}

const Ctx = createContext<DialogApi | null>(null);

export function useDialog(): DialogApi {
  const api = useContext(Ctx);
  if (!api) throw new Error('useDialog outside DialogProvider');
  return api;
}

export function DialogProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<Request[]>([]);
  const push = useCallback((r: Request) => setQueue((q) => [...q, r]), []);
  const api = useMemo<DialogApi>(
    () => ({
      confirm: (opts) => new Promise((resolve) => push({ kind: 'confirm', opts, resolve })),
      alert: (opts) => new Promise((resolve) => push({ kind: 'alert', opts, resolve })),
      prompt: (opts) => new Promise((resolve) => push({ kind: 'prompt', opts, resolve })),
    }),
    [push],
  );
  const current = queue[0];
  const close = useCallback(() => setQueue((q) => q.slice(1)), []);

  return (
    <Ctx.Provider value={api}>
      {children}
      {current && <DialogView key={queue.length + current.opts.title} req={current} onClose={close} />}
    </Ctx.Provider>
  );
}

function DialogView({ req, onClose }: { req: Request; onClose: () => void }) {
  const { opts } = req;
  const [value, setValue] = useState(req.kind === 'prompt' ? (req.opts.defaultValue ?? '') : '');
  const okRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const done = useRef(false);

  const finish = useCallback(
    (ok: boolean) => {
      if (done.current) return;
      done.current = true;
      if (req.kind === 'confirm') req.resolve(ok);
      else if (req.kind === 'alert') req.resolve();
      else req.resolve(ok ? value.trim() || null : null);
      onClose();
    },
    [req, value, onClose],
  );

  // Focus the input (prompt) or the main button; restore focus afterwards.
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    if (req.kind === 'prompt') {
      inputRef.current?.focus();
      inputRef.current?.select();
    } else okRef.current?.focus();
    return () => prev?.focus?.();
  }, [req.kind]);

  // Escape cancels; Tab stays inside the dialog.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        finish(false);
      } else if (e.key === 'Tab' && boxRef.current) {
        const items = [...boxRef.current.querySelectorAll<HTMLElement>('button, input')];
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [finish]);

  const confirmLabel = opts.confirmLabel ?? (req.kind === 'alert' ? 'OK' : req.kind === 'prompt' ? 'Save' : 'Confirm');
  const promptError = req.kind === 'prompt' && value.trim() ? (req.opts.validate?.(value.trim()) ?? null) : null;
  const promptEmpty = req.kind === 'prompt' && (!value.trim() || !!promptError);

  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && finish(false)}>
      <div
        ref={boxRef}
        className="dialog"
        role={req.kind === 'alert' ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-labelledby="dialog-title"
        aria-describedby={opts.message ? 'dialog-message' : undefined}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!promptEmpty) finish(true);
          }}
        >
          <h2 id="dialog-title" className="dialog-title">
            {opts.title}
          </h2>
          {opts.message && (
            <div id="dialog-message" className="dialog-message">
              {opts.message}
            </div>
          )}
          {req.kind === 'prompt' && (
            <input
              ref={inputRef}
              className="input dialog-input"
              value={value}
              placeholder={req.opts.placeholder}
              maxLength={80}
              aria-label={opts.title}
              aria-invalid={!!promptError}
              aria-describedby={promptError ? 'dialog-error' : undefined}
              onChange={(e) => setValue(e.target.value)}
            />
          )}
          {promptError && (
            <p id="dialog-error" className="field-error" role="alert">
              {promptError}
            </p>
          )}
          <div className="dialog-actions">
            {req.kind !== 'alert' && (
              <button type="button" className="btn" onClick={() => finish(false)}>
                {opts.cancelLabel ?? 'Cancel'}
              </button>
            )}
            <button ref={okRef} type="submit" className={`btn ${opts.danger ? 'danger solid' : 'primary'}`} disabled={promptEmpty}>
              {!opts.danger && <Icon name="check" />}
              {confirmLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
