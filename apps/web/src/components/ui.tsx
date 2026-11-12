import {
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
} from 'react';
import { cloneElement, isValidElement } from 'react';
import { errorMessage } from '../lib/errors';
import type { Tone } from '../lib/labels';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  variant = 'primary',
  busy = false,
  className = '',
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; busy?: boolean }) {
  // Default to type="button": a plain <button> in a form submits it, so "Cancel" or "Add another"
  // would send the form. Submit buttons say type="submit".
  return (
    <button
      type={type}
      className={`btn btn-${variant} ${className}`}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...rest}
    >
      {busy ? 'Working…' : children}
    </button>
  );
}

export function Pill({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`pill pill-${tone}`}>{children}</span>;
}

/** Label + control + hint/error, wired up for screen readers. Pass exactly one input/select/textarea. */
export function Field({
  label,
  hint,
  error,
  children,
  className = '',
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactElement<{ id?: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string }>;
  className?: string;
}) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  const control = isValidElement(children)
    ? cloneElement(children, {
        id,
        'aria-invalid': !!error || undefined,
        'aria-describedby': describedBy,
      })
    : children;
  return (
    <div className={`field ${className}`}>
      <label htmlFor={id}>{label}</label>
      {control}
      {error ? (
        <span id={`${id}-error`} className="field-error">
          {error}
        </span>
      ) : hint ? (
        <span id={`${id}-hint`} className="field-hint">
          {hint}
        </span>
      ) : null}
    </div>
  );
}

/**
 * Password field with a show/hide toggle. The toggle is a real button next to the input, so it is
 * keyboard reachable and announced (never an icon inside the field stealing the caret).
 */
export function PasswordField({
  value,
  onValueChange,
  autoComplete = 'current-password',
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange' | 'value'> & {
  value: string;
  onValueChange: (value: string) => void;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <span className="input-affix">
      <input
        {...rest}
        type={visible ? 'text' : 'password'}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
      />
      <button
        type="button"
        className="affix-btn"
        onClick={() => setVisible((v) => !v)}
        aria-pressed={visible}
      >
        {visible ? 'Hide' : 'Show'}
      </button>
    </span>
  );
}

/**
 * Numeric input without the browser spinner: spinners make money and phone-like values easy to
 * change by accident (scroll, arrow keys) and look inconsistent across browsers. Digits only,
 * grouped in threes, right-aligned and tabular — the usual pattern for amounts.
 */
export function NumberField({
  value,
  onValueChange,
  max,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange' | 'value' | 'max'> & {
  /** Digits only, without separators. */
  value: string;
  onValueChange: (digits: string) => void;
  /** Optional ceiling, enforced in the field so the API never sees an out-of-range amount. */
  max?: number;
}) {
  const digits = value.replace(/\D/g, '');
  const overMax = max !== undefined && digits !== '' && Number(digits) > max;
  return (
    <input
      {...rest}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      className={`input-number${rest.className ? ` ${rest.className}` : ''}`}
      aria-invalid={overMax || rest['aria-invalid'] || undefined}
      value={digits === '' ? '' : Number(digits).toLocaleString('en-US')}
      onChange={(e) => {
        const next = e.target.value.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
        onValueChange(max !== undefined ? next.slice(0, String(max).length + 1) : next);
      }}
    />
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <div className="notice notice-error" role="alert">
      {errorMessage(error)}
    </div>
  );
}

export function Notice({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'success' | 'warn';
  children: ReactNode;
}) {
  return (
    <div className={`notice notice-${tone}`} role="status">
      {children}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <p className="empty-title">{title}</p>
      {children && <div className="muted">{children}</div>}
    </div>
  );
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="spinner" role="status" aria-live="polite">
      <span className="spinner-dot" aria-hidden />
      {label}…
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  // Browser tab: "Bookings · CareLynk".
  useEffect(() => {
    document.title = `${title} · CareLynk`;
    return () => {
      document.title = 'CareLynk';
    };
  }, [title]);
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`card ${className}`}>{children}</section>;
}

/** Accessible modal built on <dialog>: focus trapping, Esc to close, backdrop. */
export function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal?.();
    if (!open && d.open) d.close?.();
  }, [open]);
  return (
    <dialog ref={ref} className="modal" onClose={onClose} aria-labelledby="modal-title">
      {open && (
        <>
          <div className="modal-head">
            <h2 id="modal-title">{title}</h2>
            <button className="icon-btn" onClick={onClose} aria-label="Close">
              ×
            </button>
          </div>
          {children}
        </>
      )}
    </dialog>
  );
}

export function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone?: Tone;
}) {
  return (
    <div className={`stat ${tone ? `stat-${tone}` : ''}`}>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}
