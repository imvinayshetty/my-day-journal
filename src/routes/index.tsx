import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Inkwell — Your Personal Diary" },
      { name: "description", content: "A calm, private diary to write your days, moods and memories." },
      { property: "og:title", content: "Inkwell — Your Personal Diary" },
      { property: "og:description", content: "A calm, private diary to write your days, moods and memories." },
    ],
  }),
  component: Diary,
});

type Entry = { id: string; date: string; title: string; body: string; mood: string };
const MOODS = ["😊", "😌", "😐", "😔", "😤", "🥰"];
const KEY = "inkwell-entries";

function Diary() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [editing, setEditing] = useState<Entry | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    try { setEntries(JSON.parse(localStorage.getItem(KEY) || "[]")); } catch {}
  }, []);
  const persist = (e: Entry[]) => { setEntries(e); localStorage.setItem(KEY, JSON.stringify(e)); };

  const filtered = useMemo(
    () => entries
      .filter((e) => (e.title + e.body).toLowerCase().includes(q.toLowerCase()))
      .sort((a, b) => b.date.localeCompare(a.date)),
    [entries, q],
  );

  const newEntry = () =>
    setEditing({ id: crypto.randomUUID(), date: new Date().toISOString().slice(0, 10), title: "", body: "", mood: "😊" });

  const save = () => {
    if (!editing) return;
    const exists = entries.some((e) => e.id === editing.id);
    persist(exists ? entries.map((e) => (e.id === editing.id ? editing : e)) : [editing, ...entries]);
    setEditing(null);
  };
  const remove = () => {
    if (!editing || !confirm("Delete this entry?")) return;
    persist(entries.filter((e) => e.id !== editing.id));
    setEditing(null);
  };

  if (editing) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-2xl flex-col px-5 pb-8 pt-[max(1.25rem,env(safe-area-inset-top))]">
        <div className="mb-4 flex items-center justify-between">
          <button onClick={() => setEditing(null)} className="text-muted-foreground">← Back</button>
          <div className="flex gap-3">
            {entries.some((e) => e.id === editing.id) && (
              <button onClick={remove} className="text-destructive">Delete</button>
            )}
            <button onClick={save} className="rounded-full bg-primary px-5 py-2 font-semibold text-primary-foreground">Save</button>
          </div>
        </div>
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
        <textarea autoFocus placeholder="Dear diary…" value={editing.body} onChange={(e) => setEditing({ ...editing, body: e.target.value })}
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
        <h1 className="text-4xl font-semibold italic">Inkwell</h1>
      </header>
      <input placeholder="Search your memories…" value={q} onChange={(e) => setQ(e.target.value)}
        className="mb-5 w-full rounded-full border bg-card px-4 py-3 outline-none" />
      {filtered.length === 0 ? (
        <div className="py-20 text-center text-muted-foreground">
          <p className="font-serif text-2xl italic">A blank page awaits.</p>
          <p className="mt-2">Tap + to write your first entry.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {filtered.map((e) => (
            <li key={e.id}>
              <button onClick={() => setEditing(e)} className="flex w-full gap-4 rounded-lg border bg-card p-4 text-left transition hover:bg-muted">
                <span className="shrink-0 text-3xl">{e.mood}</span>
                <span className="min-w-0 flex-1">
                  <span className="text-xs text-muted-foreground">
                    {new Date(e.date + "T00:00").toLocaleDateString(undefined, { dateStyle: "medium" })}
                  </span>
                  <span className="block truncate font-serif text-lg font-semibold">{e.title || "Untitled"}</span>
                  <span className="line-clamp-2 text-sm text-muted-foreground">{e.body}</span>
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
