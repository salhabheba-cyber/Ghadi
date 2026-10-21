"use client";
import { ClipboardPaste, FileUp, Globe, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { isBundledOcrLanguage } from "@/lib/document-processing/ocr";
import {
  Button,
  Card,
  Field,
  Input,
  Notice,
  Select,
  Textarea,
  useToast,
} from "@/components/ui/primitives";
import {
  DocumentProcessingError,
  FILE_INPUT_ACCEPT,
  OCR_LANGUAGES,
  SUPPORTED_FORMATS_LABEL,
} from "@/lib/document-processing/files";
import {
  importFromUrl,
  processFile,
  processPastedText,
  toStudyDocument,
  type ProcessedDocument,
} from "@/lib/document-processing/process";
import { useEnsureAiConsent } from "@/hooks/use-ai-consent";
import { fetchHostedStatus } from "@/lib/ai/hosted-client";
import { saveDocument } from "@/lib/storage/repo";
import { cn, errorMessage } from "@/lib/utils";

export type Tab = "file" | "paste" | "url";

export function Importer({
  onImported,
  initialTab = "file",
  initialFiles,
  accept = FILE_INPUT_ACCEPT,
  hideTabs = false,
}: {
  onImported: (docId: string) => void;
  /** Which import method is shown first. */
  initialTab?: Tab;
  /** Files already chosen by the user (e.g. from the home screen); processed once on mount. */
  initialFiles?: File[];
  /** File-picker accept filter (e.g. images only). */
  accept?: string;
  /** Hide the method tabs when the caller already chose one. */
  hideTabs?: boolean;
}) {
  const toast = useToast();
  const ensureConsent = useEnsureAiConsent();
  const [visionReady, setVisionReady] = useState(false);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [ocrFile, setOcrFile] = useState<File | null>(null);
  const [ocrLang, setOcrLang] = useState("eng");
  const [pasteTitle, setPasteTitle] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [url, setUrl] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const progress = (i: { stage: string; fraction?: number }) =>
    setBusy(i.fraction !== undefined ? `${i.stage} (${Math.round(i.fraction * 100)}%)` : i.stage);

  async function store(p: ProcessedDocument) {
    const doc = await saveDocument(toStudyDocument(p));
    if (doc.status === "empty") toast("No readable text was found in that source.", "error");
    else toast(`Imported “${doc.title}”.`, "good");
    onImported(doc.id);
  }

  async function importOne(file: File, mode?: { ocr?: { language: string }; vision?: boolean }) {
    setError(null);
    setBusy(`Reading ${file.name}`);
    try {
      const p = await processFile(file, {
        onProgress: progress,
        ocr: mode?.ocr,
        vision: mode?.vision ? {} : undefined,
      });
      if (p.status === "needs-ocr") {
        setOcrFile(file);
        return;
      }
      await store(p);
    } catch (e) {
      if (e instanceof DocumentProcessingError && e.code === "needs-ocr") setOcrFile(file);
      else setError(`${file.name}: ${errorMessage(e)}`);
    } finally {
      setBusy(null);
    }
  }

  async function handleFiles(files: FileList | File[]) {
    for (const file of Array.from(files)) await importOne(file);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function run(label: string, job: () => Promise<ProcessedDocument>) {
    setError(null);
    setBusy(label);
    try {
      await store(await job());
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    let live = true;
    void fetchHostedStatus().then((st) => live && setVisionReady(st.configured === true));
    return () => {
      live = false;
    };
  }, []);

  const startedRef = useRef(false);
  useEffect(() => {
    if (startedRef.current || !initialFiles?.length) return;
    startedRef.current = true;
    void handleFiles(initialFiles);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tabs: { id: Tab; label: string; icon: typeof FileUp }[] = [
    { id: "file", label: "Upload file", icon: FileUp },
    { id: "paste", label: "Paste text", icon: ClipboardPaste },
    { id: "url", label: "Web page / YouTube", icon: Globe },
  ];

  return (
    <Card>
      <div
        role="tablist"
        aria-label="Import method"
        hidden={hideTabs}
        className="mb-4 flex flex-wrap gap-1"
      >
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            role="tab"
            type="button"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium",
              tab === id ? "bg-brand-600 text-white" : "hover:bg-[var(--surface-2)]",
            )}
          >
            <Icon className="h-4 w-4" aria-hidden /> {label}
          </button>
        ))}
      </div>

      {error ? (
        <div className="mb-3">
          <Notice tone="error">{error}</Notice>
        </div>
      ) : null}
      {busy ? (
        <div className="mb-3" aria-live="polite">
          <Notice tone="info">
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {busy}…
            </span>
          </Notice>
        </div>
      ) : null}

      {tab === "file" && (
        <div role="tabpanel">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              void handleFiles(e.dataTransfer.files);
            }}
            className={cn(
              "flex flex-col items-center rounded-xl border-2 border-dashed px-4 py-10 text-center",
              dragging
                ? "border-brand-500 bg-brand-50 dark:bg-brand-900/20"
                : "border-[var(--border)]",
            )}
          >
            <FileUp className="mb-2 h-8 w-8 text-brand-500" aria-hidden />
            <p className="font-medium">Drag and drop files here</p>
            <p className="mb-3 text-sm text-[var(--muted)]">
              {SUPPORTED_FORMATS_LABEL}. Files are read in your browser and never uploaded.
            </p>
            <input
              ref={fileRef}
              type="file"
              multiple
              accept={accept}
              aria-label="Choose files to import"
              data-testid="file-input"
              className="sr-only"
              onChange={(e) => e.target.files && void handleFiles(e.target.files)}
            />
            <Button disabled={busy !== null} onClick={() => fileRef.current?.click()}>
              Choose files
            </Button>
          </div>

          {ocrFile ? (
            <div className="mt-4 space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-700 dark:bg-amber-900/20">
              <p>
                <strong>{ocrFile.name}</strong> needs text recognition to be read. Choose how.
              </p>
              <p className="text-[var(--muted)]" data-testid="ocr-notice">
                {isBundledOcrLanguage(ocrLang)
                  ? "OCR runs entirely on this device with the engine bundled in Ghadi. Nothing is downloaded or uploaded."
                  : "OCR runs in your browser, but this language needs a one-time download of its data file from a public CDN (cdn.jsdelivr.net). Your file is not uploaded. Continue?"}
              </p>
              <Field label="Language in the document">
                {(id) => (
                  <Select id={id} value={ocrLang} onChange={(e) => setOcrLang(e.target.value)}>
                    {OCR_LANGUAGES.map((l) => (
                      <option key={l.code} value={l.code}>
                        {l.label}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              {visionReady ? (
                <p className="text-[var(--muted)]">
                  “Read with OpenAI” sends this image to OpenAI through Ghadi&apos;s server only
                  when you press it. It reads fractions, exponents and tables far better than
                  on-device OCR but may cost money (separate from ChatGPT).
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => {
                    const f = ocrFile;
                    setOcrFile(null);
                    void importOne(f, { ocr: { language: ocrLang } });
                  }}
                >
                  {isBundledOcrLanguage(ocrLang)
                    ? "Read file with OCR"
                    : "Download language data and read file"}
                </Button>
                {visionReady ? (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      const f = ocrFile;
                      void ensureConsent("images").then((ok) => {
                        if (!ok) return;
                        setOcrFile(null);
                        void importOne(f, { vision: true });
                      });
                    }}
                  >
                    Read with OpenAI (best for maths and tables)
                  </Button>
                ) : null}
                <Button variant="secondary" onClick={() => setOcrFile(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {tab === "paste" && (
        <form
          role="tabpanel"
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const t = pasteTitle;
            const x = pasteText;
            setPasteText("");
            setPasteTitle("");
            void run("Saving text", async () => processPastedText(t, x));
          }}
        >
          <Field label="Title (optional)">
            {(id) => (
              <Input
                id={id}
                value={pasteTitle}
                maxLength={200}
                onChange={(e) => setPasteTitle(e.target.value)}
              />
            )}
          </Field>
          <Field label="Text">
            {(id) => (
              <Textarea
                id={id}
                required
                rows={10}
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder="Paste lecture notes, an article, a chapter…"
              />
            )}
          </Field>
          <Button type="submit" disabled={busy !== null || pasteText.trim().length === 0}>
            Save text
          </Button>
        </form>
      )}

      {tab === "url" && (
        <form
          role="tabpanel"
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void run("Fetching", () => importFromUrl(url.trim()));
          }}
        >
          <Field
            label="Address"
            hint="Public pages only. YouTube videos need published captions: Ghadi does not transcribe audio."
          >
            {(id) => (
              <Input
                id={id}
                type="url"
                required
                value={url}
                placeholder="https://…"
                onChange={(e) => setUrl(e.target.value)}
              />
            )}
          </Field>
          <Notice tone="info">
            This is fetched by the Ghadi server, with private-network and size protections. It does
            not work on a static-only deployment.
          </Notice>
          <Button type="submit" disabled={busy !== null || !url.trim()}>
            Import
          </Button>
        </form>
      )}
    </Card>
  );
}
