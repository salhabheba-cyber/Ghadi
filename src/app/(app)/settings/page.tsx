"use client";
import { Download, Printer, Trash2, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  Notice,
  PageHeader,
  Select,
  useConfirm,
  useToast,
} from "@/components/ui/primitives";
import { useSettings } from "@/hooks/use-settings";
import { fetchHostedStatus, type HostedStatus } from "@/lib/ai/hosted-client";
import { testOllamaConnection, type OllamaConnectionResult } from "@/lib/ai/ollama";
import { deckToCsv, downloadText } from "@/lib/export";
import {
  MAX_BACKUP_BYTES,
  backupFileName,
  createBackup,
  parseBackup,
  restoreBackup,
  type RestoreMode,
} from "@/lib/storage/backup";
import { getDb } from "@/lib/storage/db";
import { deleteAllData, saveSettings } from "@/lib/storage/repo";
import { errorMessage } from "@/lib/utils";
import type { Settings } from "@/lib/validation/schemas";

export default function SettingsPage() {
  const saved = useSettings();
  const toast = useToast();
  const confirm = useConfirm();
  const [edits, setEdits] = useState<Partial<Settings>>({});
  const form: Settings = { ...saved, ...edits };
  const dirty = Object.keys(edits).length > 0;
  const [ollama, setOllama] = useState<OllamaConnectionResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [hosted, setHosted] = useState<HostedStatus | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [restoreMode, setRestoreMode] = useState<RestoreMode>("merge");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetchHostedStatus().then(setHosted);
  }, []);
  const update = (patch: Partial<Settings>) => setEdits((e) => ({ ...e, ...patch }));

  async function save() {
    try {
      await saveSettings(form);
      setEdits({});
      toast("Settings saved.", "good");
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  }
  async function testOllama() {
    setTesting(true);
    setOllama(await testOllamaConnection(form.ollamaEndpoint, form.ollamaModel));
    setTesting(false);
  }
  async function exportBackup() {
    try {
      downloadText(
        backupFileName(),
        JSON.stringify(await createBackup(), null, 2),
        "application/json",
      );
      toast("Backup downloaded.", "good");
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  }
  async function exportCardsCsv() {
    const cards = await getDb().cards.toArray();
    if (cards.length === 0) {
      toast("There are no flashcards to export.", "info");
      return;
    }
    downloadText("ghadi-flashcards.csv", deckToCsv(cards), "text/csv");
  }
  async function onRestoreFile(file: File | undefined) {
    if (!file) return;
    try {
      if (file.size > MAX_BACKUP_BYTES)
        throw new Error("That file is larger than the 100 MB backup limit.");
      const backup = parseBackup(await file.text());
      const d = backup.data;
      const ok = await confirm({
        title: restoreMode === "replace" ? "Replace all data?" : "Merge backup into your data?",
        message: `This backup (${backup.exportedAt.slice(0, 10)}) contains ${d.documents.length} documents, ${d.notes.length} notes, ${d.quizzes.length} quizzes, ${d.decks.length} decks and ${d.cards.length} cards. ${restoreMode === "replace" ? "Everything currently on this device will be erased first." : "Items with the same id are overwritten by the backup."}`,
        confirmLabel: restoreMode === "replace" ? "Replace everything" : "Merge",
        danger: restoreMode === "replace",
      });
      if (!ok) return;
      setBusy(true);
      await restoreBackup(backup, restoreMode);
      toast("Backup restored.", "good");
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }
  async function wipe() {
    const ok = await confirm({
      title: "Delete all data?",
      message:
        "Every document, note, quiz, deck and setting on this device will be permanently erased. Download a backup first if you might want it back.",
      confirmLabel: "Delete everything",
      danger: true,
    });
    if (!ok) return;
    await deleteAllData();
    setEdits({});
    toast("All local data deleted.", "good");
  }

  return (
    <>
      <PageHeader
        title="Settings"
        description="Choose how study material is generated and manage your data."
        actions={
          <Button onClick={() => void save()} disabled={!dirty}>
            Save settings
          </Button>
        }
      />
      <div className="space-y-6">
        <Card className="space-y-4">
          <h2 className="text-lg font-semibold">Generator</h2>
          <fieldset className="space-y-2">
            <legend className="sr-only">Generator</legend>
            {(
              [
                [
                  "offline",
                  "Offline heuristics (default)",
                  "Rule-based text analysis in your browser. No AI model, no network, fully private.",
                ],
                [
                  "ollama",
                  "Ollama (local AI)",
                  "A language model on your own computer. Document text goes only to localhost.",
                ],
                [
                  "hosted",
                  "Hosted AI (server-side)",
                  "Sends document text to the AI provider configured on this Ghadi server. Needs your consent.",
                ],
              ] as const
            ).map(([value, label, hint]) => (
              <label
                key={value}
                className="flex cursor-pointer items-start gap-3 rounded-lg border border-[var(--border)] p-3"
              >
                <input
                  type="radio"
                  name="provider"
                  className="mt-1"
                  checked={form.provider === value}
                  onChange={() => update({ provider: value })}
                />
                <span>
                  <span className="font-medium">{label}</span>
                  <span className="block text-sm text-[var(--muted)]">{hint}</span>
                </span>
              </label>
            ))}
          </fieldset>

          {form.provider === "ollama" ? (
            <div className="space-y-3 rounded-lg bg-[var(--surface-2)] p-4">
              <Field label="Ollama address">
                {(id) => (
                  <Input
                    id={id}
                    value={form.ollamaEndpoint}
                    onChange={(e) => {
                      update({ ollamaEndpoint: e.target.value });
                      setOllama(null);
                    }}
                  />
                )}
              </Field>
              <Field
                label="Model name"
                hint="Ghadi never downloads models. Install one yourself, e.g. “ollama pull llama3.2”."
              >
                {(id) => (
                  <Input
                    id={id}
                    value={form.ollamaModel}
                    onChange={(e) => {
                      update({ ollamaModel: e.target.value });
                      setOllama(null);
                    }}
                  />
                )}
              </Field>
              <Button variant="secondary" disabled={testing} onClick={() => void testOllama()}>
                {testing ? "Testing…" : "Test connection"}
              </Button>
              {ollama ? (
                <Notice tone={ollama.ok ? "good" : "error"}>
                  {ollama.message}
                  {ollama.models.length > 0
                    ? ` Installed: ${ollama.models.slice(0, 8).join(", ")}.`
                    : ""}
                </Notice>
              ) : null}
              <Notice tone="info">
                Browsers block pages from calling Ollama unless it allows this site. Start Ollama
                with OLLAMA_ORIGINS set to this site’s address (for example{" "}
                <code>OLLAMA_ORIGINS=http://localhost:3000 ollama serve</code>).
              </Notice>
            </div>
          ) : null}

          {form.provider === "hosted" ? (
            <div className="space-y-3 rounded-lg bg-[var(--surface-2)] p-4">
              <p className="text-sm">
                Server status:{" "}
                {hosted === null ? (
                  "checking…"
                ) : hosted.configured ? (
                  <Badge tone="good">configured{hosted.model ? ` (${hosted.model})` : ""}</Badge>
                ) : (
                  <Badge tone="warn">not configured</Badge>
                )}
              </p>
              {hosted && !hosted.configured ? (
                <Notice tone="warn">
                  No hosted provider is set up on this server, so Ghadi will use offline heuristics.
                  The server owner can configure one with environment variables (see .env.example).
                </Notice>
              ) : null}
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={form.hostedConsent}
                  onChange={(e) => update({ hostedConsent: e.target.checked })}
                />
                <span>
                  I understand that the text of documents I generate material from will be sent to a
                  third-party AI provider through this server. API keys stay on the server and are
                  never exposed to my browser.
                </span>
              </label>
            </div>
          ) : null}
        </Card>

        <Card className="space-y-3">
          <h2 className="text-lg font-semibold">Review</h2>
          <Field label="Daily review goal (cards per session)">
            {(id) => (
              <Input
                id={id}
                type="number"
                min={1}
                max={500}
                value={form.dailyGoalCards}
                onChange={(e) =>
                  update({
                    dailyGoalCards: Math.min(
                      500,
                      Math.max(1, Math.round(Number(e.target.value) || 1)),
                    ),
                  })
                }
              />
            )}
          </Field>
        </Card>

        <Card className="space-y-4">
          <h2 className="text-lg font-semibold">Your data</h2>
          <p className="text-sm text-[var(--muted)]">
            Everything lives in this browser (IndexedDB). Clearing site data erases it, so keep a
            backup.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => void exportBackup()}>
              <Download className="h-4 w-4" aria-hidden /> Download full backup (JSON)
            </Button>
            <Button variant="secondary" onClick={() => void exportCardsCsv()}>
              <Download className="h-4 w-4" aria-hidden /> All flashcards (CSV)
            </Button>
            <Button variant="secondary" onClick={() => window.print()}>
              <Printer className="h-4 w-4" aria-hidden /> Print this page
            </Button>
          </div>
          <div className="space-y-2 rounded-lg border border-[var(--border)] p-4">
            <h3 className="font-medium">Restore from backup</h3>
            <Field label="If data already exists">
              {(id) => (
                <Select
                  id={id}
                  value={restoreMode}
                  onChange={(e) => setRestoreMode(e.target.value as RestoreMode)}
                >
                  <option value="merge">Merge (keep what is here, add the backup)</option>
                  <option value="replace">Replace everything</option>
                </Select>
              )}
            </Field>
            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              aria-label="Backup file"
              data-testid="restore-input"
              className="sr-only"
              onChange={(e) => void onRestoreFile(e.target.files?.[0])}
            />
            <Button variant="secondary" disabled={busy} onClick={() => fileRef.current?.click()}>
              <Upload className="h-4 w-4" aria-hidden /> Choose backup file…
            </Button>
          </div>
          <div>
            <Button variant="danger" onClick={() => void wipe()}>
              <Trash2 className="h-4 w-4" aria-hidden /> Delete all local data
            </Button>
          </div>
        </Card>
      </div>
    </>
  );
}
