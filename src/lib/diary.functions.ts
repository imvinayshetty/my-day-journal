import { createServerFn } from "@tanstack/react-start";
import { useSession } from "@tanstack/react-start/server";
import { redirect } from "@tanstack/react-router";
import { createHash, timingSafeEqual } from "node:crypto";

export type Entry = { id: string; date: string; title: string; body: string; mood: string };

const FILE_NAME = "Inkwell Diary.json";
const GW = "https://connector-gateway.lovable.dev/google_drive";

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

function headers(extra: Record<string, string> = {}) {
  const lk = process.env["LOVABLE_API_KEY"];
  const dk = process.env["GOOGLE_DRIVE_API_KEY"];
  if (!lk || !dk) throw new Error("Google Drive is not connected");
  return { Authorization: `Bearer ${lk}`, "X-Connection-Api-Key": dk, ...extra };
}

async function check(res: Response, what: string) {
  if (!res.ok) {
    const body = await res.text();
    console.error(`Drive ${what} failed [${res.status}]: ${body}`);
    throw new Error(`Google Drive ${what} failed [${res.status}]`);
  }
  return res;
}

async function findFileId(): Promise<string | null> {
  const q = encodeURIComponent(`name='${FILE_NAME}' and trashed=false`);
  const res = await check(
    await fetch(`${GW}/drive/v3/files?q=${q}&fields=files(id)&pageSize=1`, { headers: headers() }),
    "lookup",
  );
  const { files } = (await res.json()) as { files: { id: string }[] };
  return files[0]?.id ?? null;
}

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

export const getEntries = createServerFn({ method: "GET" }).handler(async () => {
  await requireUnlocked();
  const id = await findFileId();
  if (!id) return [] as Entry[];
  const res = await check(await fetch(`${GW}/drive/v3/files/${id}?alt=media`, { headers: headers() }), "read");
  try {
    return (await res.json()) as Entry[];
  } catch {
    return [] as Entry[];
  }
});

export const saveEntries = createServerFn({ method: "POST" })
  .inputValidator((d: { entries: Entry[] }) => {
    if (!Array.isArray(d.entries)) throw new Error("Invalid entries");
    return { entries: d.entries.map((e) => ({
      id: String(e.id), date: String(e.date), title: String(e.title), body: String(e.body), mood: String(e.mood),
    })) };
  })
  .handler(async ({ data }) => {
    await requireUnlocked();
    const json = JSON.stringify(data.entries, null, 2);
    const id = await findFileId();
    if (id) {
      await check(
        await fetch(`${GW}/upload/drive/v3/files/${id}?uploadType=media`, {
          method: "PATCH",
          headers: headers({ "Content-Type": "application/json" }),
          body: json,
        }),
        "update",
      );
    } else {
      const boundary = "inkwell" + Date.now();
      const body =
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
        JSON.stringify({ name: FILE_NAME, mimeType: "application/json" }) +
        `\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${json}\r\n--${boundary}--`;
      await check(
        await fetch(`${GW}/upload/drive/v3/files?uploadType=multipart`, {
          method: "POST",
          headers: headers({ "Content-Type": `multipart/related; boundary=${boundary}` }),
          body,
        }),
        "create",
      );
    }
    return { ok: true, savedAt: new Date().toISOString() };
  });
