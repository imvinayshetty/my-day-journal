import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import {
  getEntryList, getEntry, saveEntry, deleteEntry, lockDiary, getDriveStatus, disconnectDrive, type EntryMeta,
} from "@/lib/diary.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Inkwell — Your Personal Diary" },
      { name: "description", content: "A calm, private diary to write your days, moods and memories." },
      { property: "og:title", content: "Inkwell — Your Personal Diary" },
      { property: "og:description", content: "A calm, private diary to write your days, moods and memories." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: async () => {
    const drive = await getDriveStatus();
    const entries = drive.connected ? await getEntryList().catch(() => [] as EntryMeta[]) : [];
    return { drive, entries };
  },
  component: Diary,
});

const MOODS = ["😊", "😌", "😐", "😔", "😤", "🥰"];

type Draft = { fileId?: string | undefined; expectedModifiedTime?: string | undefined; date: string; title: string; mood: string; body: string };
type Status = "synced" | "saving" | "loading" | "error" | "conflict";

function Diary() {
  const router = useRouter();
  const { drive, entries: initial } = Route.useLoaderData();
  const listFn = useServerFn(getEntryList);
  const getFn = useServerFn(getEntry);
  const saveFn = useServerFn(saveEntry);
  const deleteFn = useServerFn(deleteEntry);
  const lock = useServerFn(lockDiary);
  const disconnect = useServerFn(disconnectDrive);

  const [entries, setEntries] = useState<EntryMeta[]>(initial);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [status, setStatus] = useState<Status>("synced");
  const [q, setQ] = useState("");

  const filtered = useMemo(
    () => entries
      .filter((e) => (e.title + " " + e.preview).toLowerCase().includes(q.toLowerCase()))
      .sort((a, b) => b.date.localeCompare(a.date) || b.modifiedTime.localeCompare(a.modifiedTime)),
    [entries, q],
  );

  const refresh = async () => {
    setStatus("loading");
    try { setEntries(await listFn()); setStatus("synced"); } catch { setStatus("error"); }
  };
  const logout = async () => { await lock(); await router.navigate({ to: "/unlock" }); };

  const newEntry = () =>
    setEditing({ date: new Date().toISOString().slice(0, 10), title: "", body: "", mood: "😊" });

  const open = async (m: EntryMeta) => {
    setEditing({ fileId: m.fileId, date: m.date, title: m.title, mood: m.mood, body: "", expectedModifiedTime: m.modifiedTime });
    setStatus("loading");
    try {
      const full = await getFn({ data: { fileId: m.fileId } });
      setEditing({ fileId: full.fileId, expectedModifiedTime: full.modifiedTime, date: full.date, title: full.title, mood: full.mood, body: full.body });
      setStatus("synced");
    } catch { setStatus("error"); }
  };

  const save = async () => {
    if (!editing || status === "loading") return;
    setStatus("saving");
    try {
      const res = await saveFn({ data: editing });
      if (!res.ok) { setStatus("conflict"); return; }
      setEntries((prev) => [res.entry, ...prev.filter((e) => e.fileId !== res.entry.fileId)]);
      setEditing(null);
      setStatus("synced");
    } catch { setStatus("error"); }
  };

  const remove = async () => {
    if (!editing?.fileId || !confirm("Delete this entry? It will go to your Google Drive trash.")) return;
    setStatus("saving");
    try {
      await deleteFn({ data: { fileId: editing.fileId } });
      setEntries((prev) => prev.filter((e) => e.fileId !== editing.fileId));
      setEditing(null);
      setStatus("synced");
    } catch { setStatus("error"); }
  };

  const reloadConflict = async () => {
    if (!editing?.fileId) return;
    const m = entries.find((e) => e.fileId === editing.fileId);
    if (m) await open(m);
  };

  const statusText: Record<Status, string> = {
    synced: "☁︎ Synced with Google Drive",
    saving: "Saving to Google Drive…",
    loading: "Loading from Google Drive…",
    error: "Couldn't reach Google Drive — try again",
    conflict: "This entry was changed on another device.",
  };

  if (editing) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-2xl flex-col px-5 pb-8 pt-[max(1.25rem,env(safe-area-inset-top))]">
        <div className="mb-4 flex items-center justify-between">
          <button onClick={() => { setEditing(null); setStatus("synced"); }} className="text-muted-foreground">← Back</button>
          <div className="flex gap-3">
            {editing.fileId && <button onClick={remove} className="text-destructive">Delete</button>}
            <button onClick={save} disabled={status === "saving" || status === "loading"}
              className="rounded-full bg-primary px-5 py-2 font-semibold text-primary-foreground disabled:opacity-60">
              {status === "saving" ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
        {status !== "synced" && (
          <div className={`mb-3 rounded-lg px-3 py-2 text-sm ${status === "error" || status === "conflict" ? "bg-muted text-destructive" : "bg-muted text-muted-foreground"}`}>
            {statusText[status]}
            {status === "conflict" && (
              <span className="mt-2 flex gap-3">
                <button onClick={reloadConflict} className="font-semibold underline">Load their version</button>
                <button onClick={() => { setEditing({ ...editing, expectedModifiedTime: undefined }); setStatus("synced"); }}
                  className="font-semibold underline">Keep mine (then Save)</button>
              </span>
            )}
          </div>
        )}
        <input type="date" value={editing.date} onChange={(e) => setEditing({ ...editing, date: e.target.value })}
          className="mb-3 w-fit rounded-lg bg-muted px-3 py-1 text-sm text-muted-foreground" />
        <div className="mb-3 flex gap-2">
          {MOODS.map((m) => (
            <button key={m} onClick={() => setEditing({ ...editing, mood: m })}
              className={`rounded-full p-2 text-2xl transition ${editing.mood === m ? "bg-accent scale-110" : "opacity-50"}`}>{m}</button>
          ))}
        </div>
        <input placeholder="Title of your day" value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })}
          className="mb-3 bg-transparent font-serif text-3xl outline-none placeholder:text-muted-foreground/60" />
        <textarea autoFocus placeholder={status === "loading" ? "Loading…" : "Dear diary…"} value={editing.body}
          disabled={status === "loading"}
          onChange={(e) => setEditing({ ...editing, body: e.target.value })}
          className="flex-1 resize-none rounded-lg border bg-card p-4 font-serif text-lg leading-relaxed outline-none" />
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-dvh max-w-2xl px-5 pb-28 pt-[max(1.5rem,env(safe-area-inset-top))]">
      <header className="mb-6">
        <p className="text-sm uppercase tracking-widest text-muted-foreground">
          {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
        </p>
        <div className="flex items-end justify-between gap-3">
          <h1 className="text-4xl font-semibold italic">Inkwell</h1>
          <div className="flex gap-4 text-sm text-muted-foreground">
            <button onClick={refresh}>↻ Refresh</button>
            <button onClick={logout}>Lock 🔒</button>
          </div>
        </div>
        <p className={`mt-1 text-xs ${status === "error" ? "text-destructive" : "text-muted-foreground"}`}>
          {drive.connected ? statusText[status] : "Not connected to Google Drive"}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {drive.canConnect && (
            <a href="/api/public/google/start"
              className="rounded-full border bg-card px-4 py-2 text-sm font-semibold">
              {drive.viaButton ? "↻ Reconnect Google Drive" : "🔗 Connect Google Drive"}
            </a>
          )}
          {drive.viaButton && (
            <button className="text-sm text-muted-foreground underline"
              onClick={async () => { await disconnect(); await router.invalidate(); }}>
              Disconnect
            </button>
          )}
        </div>
      </header>
      <input placeholder="Search titles and previews…" value={q} onChange={(e) => setQ(e.target.value)}
        className="mb-5 w-full rounded-full border bg-card px-4 py-3 outline-none" />
      {filtered.length === 0 ? (
        <div className="py-20 text-center text-muted-foreground">
          <p className="font-serif text-2xl italic">A blank page awaits.</p>
          <p className="mt-2">Tap + to write your first entry.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {filtered.map((e) => (
            <li key={e.fileId}>
              <button onClick={() => open(e)} className="flex w-full gap-4 rounded-lg border bg-card p-4 text-left transition hover:bg-muted">
                <span className="shrink-0 text-3xl">{e.mood}</span>
                <span className="min-w-0 flex-1">
                  <span className="text-xs text-muted-foreground">
                    {e.date ? new Date(e.date + "T00:00").toLocaleDateString(undefined, { dateStyle: "medium" }) : ""}
                  </span>
                  <span className="block truncate font-serif text-lg font-semibold">{e.title || "Untitled"}</span>
                  <span className="line-clamp-2 text-sm text-muted-foreground">{e.preview}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <button onClick={newEntry} aria-label="New entry"
        className="fixed bottom-[max(1.5rem,env(safe-area-inset-bottom))] right-6 h-16 w-16 rounded-full bg-primary text-3xl text-primary-foreground shadow-lg transition hover:scale-105">+</button>
    </main>
  );
}
