import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { unlockDiary } from "@/lib/diary.functions";

export const Route = createFileRoute("/unlock")({
  head: () => ({
    meta: [
      { title: "Unlock — Inkwell Diary" },
      { name: "description", content: "Enter your password to open your private diary." },
      { property: "og:title", content: "Unlock — Inkwell Diary" },
      { property: "og:description", content: "Enter your password to open your private diary." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Unlock,
});

function Unlock() {
  const router = useRouter();
  const unlock = useServerFn(unlockDiary);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const password = new FormData(e.currentTarget).get("password") as string;
    const { ok } = await unlock({ data: { password } });
    setBusy(false);
    if (ok) await router.navigate({ to: "/" });
    else setError(true);
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-6">
      <form method="post" onSubmit={onSubmit} className="w-full max-w-sm text-center">
        <p className="text-5xl">🔒</p>
        <h1 className="mt-4 text-4xl font-semibold italic">Inkwell</h1>
        <p className="mt-2 text-muted-foreground">Your diary is locked.</p>
        <input name="password" type="password" autoFocus autoComplete="current-password" placeholder="Password"
          className="mt-6 w-full rounded-full border bg-card px-5 py-3 text-center outline-none" />
        {error && <p className="mt-3 text-sm text-destructive">Incorrect password</p>}
        <button disabled={busy} className="mt-4 w-full rounded-full bg-primary py-3 font-semibold text-primary-foreground disabled:opacity-60">
          {busy ? "Opening…" : "Open diary"}
        </button>
      </form>
    </main>
  );
}
