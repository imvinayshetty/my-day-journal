import { createServerFn } from "@tanstack/react-start";
import { useSession } from "@tanstack/react-start/server";
import { redirect } from "@tanstack/react-router";
import { createHash, timingSafeEqual } from "node:crypto";
import { listEntries, readEntry, writeEntry, trashEntry } from "./drive.server";

export type { EntryMeta, FullEntry, SaveResult } from "./drive.server";

function sessionConfig() {
  return {
    password: process.env["SESSION_SECRET"]!,
    name: "inkwell-gate",
    maxAge: 60 * 60 * 24 * 30,
    cookie: { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/" },
  };
}

async function requireUnlocked() {
  const s = await useSession<{ unlocked?: boolean }>(sessionConfig());
  if (!s.data.unlocked) throw redirect({ to: "/unlock" });
}

const fileIdOf = (v: unknown) => {
  const id = String(v ?? "");
  if (!/^[A-Za-z0-9_-]{10,200}$/.test(id)) throw new Error("Invalid entry id");
  return id;
};

export const unlockDiary = createServerFn({ method: "POST" })
  .inputValidator((d: { password: string }) => ({ password: String(d.password ?? "").slice(0, 200) }))
  .handler(async ({ data }) => {
    const expected = process.env["SITE_PASSWORD"];
    if (!expected) throw new Error("SITE_PASSWORD is not set");
    const a = createHash("sha256").update(data.password).digest();
    const b = createHash("sha256").update(expected).digest();
    if (!timingSafeEqual(a, b)) return { ok: false as const };
    const s = await useSession<{ unlocked?: boolean }>(sessionConfig());
    await s.update({ unlocked: true });
    return { ok: true as const };
  });

export const lockDiary = createServerFn({ method: "POST" }).handler(async () => {
  const s = await useSession(sessionConfig());
  await s.clear();
  return { ok: true };
});

export const getEntryList = createServerFn({ method: "GET" }).handler(async () => {
  await requireUnlocked();
  return listEntries();
});

export const getEntry = createServerFn({ method: "GET" })
  .inputValidator((d: { fileId: string }) => ({ fileId: fileIdOf(d.fileId) }))
  .handler(async ({ data }) => {
    await requireUnlocked();
    return readEntry(data.fileId);
  });

export const saveEntry = createServerFn({ method: "POST" })
  .inputValidator(
    (d: { fileId?: string | undefined; expectedModifiedTime?: string | undefined; date: string; title: string; mood: string; body: string }) => ({
      fileId: d.fileId ? fileIdOf(d.fileId) : undefined,
      expectedModifiedTime: d.expectedModifiedTime ? String(d.expectedModifiedTime) : undefined,
      date: String(d.date ?? "").slice(0, 10),
      title: String(d.title ?? "").slice(0, 500),
      mood: String(d.mood ?? "").slice(0, 16),
      body: String(d.body ?? "").slice(0, 2_000_000),
    }),
  )
  .handler(async ({ data }) => {
    await requireUnlocked();
    return writeEntry(data);
  });

export const deleteEntry = createServerFn({ method: "POST" })
  .inputValidator((d: { fileId: string }) => ({ fileId: fileIdOf(d.fileId) }))
  .handler(async ({ data }) => {
    await requireUnlocked();
    await trashEntry(data.fileId);
    return { ok: true };
  });
