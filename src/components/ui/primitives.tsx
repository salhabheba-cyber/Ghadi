"use client";
import { cn } from "@/lib/utils";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from "react";
import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes,
} from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
const variants: Record<Variant, string> = {
  primary: "bg-brand-600 text-white hover:bg-brand-700 disabled:bg-brand-600/50",
  secondary: "border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-2)]",
  ghost: "hover:bg-[var(--surface-2)]",
  danger: "bg-red-600 text-white hover:bg-red-700 disabled:bg-red-600/50",
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" | "lg" }) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:cursor-not-allowed",
        size === "sm"
          ? "px-3 py-1.5 text-sm"
          : size === "lg"
            ? "px-6 py-3 text-base"
            : "px-4 py-2 text-sm",
        variants[variant],
        className,
      )}
    />
  );
}

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      className={cn(
        "rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm",
        className,
      )}
    />
  );
}

const fieldCls =
  "w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm placeholder:text-[var(--muted)]";

export function Field({
  label,
  hint,
  children,
  id,
}: {
  label: string;
  hint?: string;
  children: (id: string) => ReactNode;
  id?: string;
}) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <div className="space-y-1">
      <label htmlFor={fid} className="text-sm font-medium">
        {label}
      </label>
      {children(fid)}
      {hint ? <p className="text-xs text-[var(--muted)]">{hint}</p> : null}
    </div>
  );
}
export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(fieldCls, props.className)} />;
}
export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn(fieldCls, "min-h-32", props.className)} />;
}
export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn(fieldCls, props.className)} />;
}

export function Badge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: "neutral" | "brand" | "warn" | "good";
  children: ReactNode;
  className?: string;
}) {
  const tones = {
    neutral: "bg-[var(--surface-2)] text-[var(--muted)]",
    brand: "bg-brand-100 text-brand-700 dark:bg-brand-900 dark:text-brand-200",
    warn: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
    good: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-[var(--border)] px-6 py-12 text-center">
      {icon ? (
        <div className="mb-3 text-brand-500" aria-hidden>
          {icon}
        </div>
      ) : null}
      <h2 className="text-lg font-semibold">{title}</h2>
      {children ? <p className="mt-1 max-w-md text-sm text-[var(--muted)]">{children}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Notice({
  tone = "info",
  children,
}: {
  tone?: "info" | "warn" | "error" | "good";
  children: ReactNode;
}) {
  const map = {
    info: [
      "border-brand-200 bg-brand-50 text-brand-900 dark:border-brand-700 dark:bg-brand-900/30 dark:text-brand-100",
      Info,
    ],
    warn: [
      "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-100",
      AlertTriangle,
    ],
    error: [
      "border-red-300 bg-red-50 text-red-900 dark:border-red-700 dark:bg-red-900/30 dark:text-red-100",
      AlertTriangle,
    ],
    good: [
      "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-100",
      CheckCircle2,
    ],
  } as const;
  const [cls, Icon] = map[tone];
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn("flex gap-2 rounded-lg border px-3 py-2 text-sm", cls)}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div>{children}</div>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {description ? <p className="mt-1 text-sm text-[var(--muted)]">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

/* --------------------------------- Dialog -------------------------------- */

export function Dialog({
  open,
  onClose,
  title,
  children,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  size?: "md" | "lg";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  // Keep the latest onClose in a ref so callers may pass an inline function without the effect below
  // re-running (which would move focus back to the first control after every keystroke).
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    ref.current
      ?.querySelector<HTMLElement>("input:not([hidden]), textarea, select, button")
      ?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
      if (e.key === "Tab" && ref.current) {
        const items = ref.current.querySelectorAll<HTMLElement>(
          "button, input, textarea, select, a[href]",
        );
        if (items.length === 0) return;
        const first = items[0]!;
        const last = items[items.length - 1]!;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      prev?.focus();
    };
  }, [open]);
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          "max-h-[90dvh] w-full overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 text-[var(--text)] shadow-xl",
          size === "lg" ? "max-w-2xl" : "max-w-md",
        )}
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <h2 id={titleId} className="text-lg font-semibold">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded p-1 hover:bg-[var(--surface-2)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
}
type ConfirmFn = (o: ConfirmOptions) => Promise<boolean>;
const ConfirmCtx = createContext<ConfirmFn | null>(null);

/** Accessible replacement for window.confirm. */
export function useConfirm(): ConfirmFn {
  const fn = useContext(ConfirmCtx);
  if (!fn) throw new Error("useConfirm must be used inside <UiProvider>");
  return fn;
}

/* --------------------------------- Toasts -------------------------------- */

interface Toast {
  id: number;
  tone: "good" | "error" | "info";
  text: string;
}
type ToastFn = (text: string, tone?: Toast["tone"]) => void;
const ToastCtx = createContext<ToastFn | null>(null);
export function useToast(): ToastFn {
  const fn = useContext(ToastCtx);
  if (!fn) throw new Error("useToast must be used inside <UiProvider>");
  return fn;
}

export function UiProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [dialog, setDialog] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(
    null,
  );
  const counter = useRef(0);

  const toast = useCallback<ToastFn>((text, tone = "info") => {
    const id = ++counter.current;
    setToasts((t) => [...t, { id, tone, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000);
  }, []);
  const confirm = useCallback<ConfirmFn>(
    (o) => new Promise((resolve) => setDialog({ ...o, resolve })),
    [],
  );
  const close = (v: boolean) => {
    dialog?.resolve(v);
    setDialog(null);
  };

  return (
    <ToastCtx.Provider value={toast}>
      <ConfirmCtx.Provider value={confirm}>
        {children}
        <div
          aria-live="polite"
          className="no-print fixed bottom-4 right-4 z-50 flex max-w-sm flex-col gap-2"
        >
          {toasts.map((t) => (
            <Notice key={t.id} tone={t.tone === "error" ? "error" : t.tone}>
              {t.text}
            </Notice>
          ))}
        </div>
        <Dialog open={dialog !== null} onClose={() => close(false)} title={dialog?.title ?? ""}>
          <p className="text-sm text-[var(--muted)]">{dialog?.message}</p>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => close(false)}>
              Cancel
            </Button>
            <Button variant={dialog?.danger ? "danger" : "primary"} onClick={() => close(true)}>
              {dialog?.confirmLabel ?? "Confirm"}
            </Button>
          </div>
        </Dialog>
      </ConfirmCtx.Provider>
    </ToastCtx.Provider>
  );
}
