"use client";
import { useRef, useState } from "react";

interface Props {
  action: (formData: FormData) => void | Promise<void>;
  hidden: Record<string, string>;
  triggerLabel: string;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  /** When set, the user must type this exact text before the button enables. The server re-checks it. */
  requireText?: string;
  className?: string;
}

export function ConfirmDelete({ action, hidden, triggerLabel, title, body, confirmLabel, cancelLabel, requireText, className = "btn btn-secondary" }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [typed, setTyped] = useState("");
  const ready = !requireText || typed.trim() === requireText;
  return (
    <>
      <button type="button" className={className} onClick={() => ref.current?.showModal()}>{triggerLabel}</button>
      <dialog ref={ref} className="modal" aria-labelledby="dlg-title">
        <form action={action} className="stack">
          <h2 id="dlg-title">{title}</h2>
          <p>{body}</p>
          {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
          {requireText && (
            <div className="field">
              <label htmlFor="confirm-text">{requireText}</label>
              <input id="confirm-text" name="confirm" className="input" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
            </div>
          )}
          <div className="row">
            <button type="button" className="btn btn-secondary" onClick={() => ref.current?.close()}>{cancelLabel}</button>
            <button type="submit" className="btn btn-danger" disabled={!ready}>{confirmLabel}</button>
          </div>
        </form>
      </dialog>
    </>
  );
}
