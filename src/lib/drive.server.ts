const GW = "https://connector-gateway.lovable.dev/google_drive";
const GOOGLE_API = "https://www.googleapis.com";
const FOLDER_NAME = "Inkwell-Diary";
const LEGACY_FOLDER = "Inkwell Diary";
const LEGACY_FILE = "Inkwell Diary.json";

export type EntryMeta = {
  fileId: string;
  date: string;
  title: string;
  mood: string;
  preview: string;
  modifiedTime: string;
};
export type FullEntry = EntryMeta & { body: string };

// Token priority: refresh token from the in-app "Connect Google Drive" button, then GOOGLE_REFRESH_TOKEN, then the Lovable connector.
const tokenCache = new Map<string, { value: string; expiresAt: number }>();
let lastRefresh = "";

async function googleAccessToken(refreshToken: string): Promise<string> {
  lastRefresh = refreshToken;
  const hit = tokenCache.get(refreshToken);
  if (hit && hit.expiresAt > Date.now() + 60_000) return hit.value;
  const clientId = process.env["GOOGLE_CLIENT_ID"];
  const clientSecret = process.env["GOOGLE_CLIENT_SECRET"];
  if (!clientId || !clientSecret) throw new Error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`Google token refresh failed [${res.status}]: ${body}`);
    throw new Error(`Google sign-in failed [${res.status}]: ${body}`);
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache.set(refreshToken, { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 });
  return json.access_token;
}

async function target(): Promise<{ base: string; auth: Record<string, string> }> {
  const { gateSession } = await import("./session.server");
  const s = await gateSession();
  const rt = s.data.gRefresh || process.env["GOOGLE_REFRESH_TOKEN"];
  if (rt) return { base: GOOGLE_API, auth: { Authorization: `Bearer ${await googleAccessToken(rt)}` } };
  const lk = process.env["LOVABLE_API_KEY"];
  const dk = process.env["GOOGLE_DRIVE_API_KEY"];
  if (!lk || !dk) throw new Error("Google Drive is not connected: tap 'Connect Google Drive'");
  return { base: GW, auth: { Authorization: `Bearer ${lk}`, "X-Connection-Api-Key": dk } };
}

async function drive(path: string, init: RequestInit = {}, what = "request") {
  const { base, auth } = await target();
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: { ...((init.headers as Record<string, string>) ?? {}), ...auth },
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`Drive ${what} failed [${res.status}]: ${body}`);
    if (res.status === 401) tokenCache.delete(lastRefresh);
    throw new Error(`Google Drive ${what} failed [${res.status}]`);
  }
  return res;
}

// Drive appProperties: key + value must fit in 124 UTF-8 bytes.
function clip(s: string, maxBytes: number) {
  const enc = new TextEncoder();
  if (enc.encode(s).length <= maxBytes) return s;
  let out = "";
  for (const ch of s) {
    if (enc.encode(out + ch + "…").length > maxBytes) break;
    out += ch;
  }
  return out + "…";
}

function props(e: { date: string; title: string; mood: string; body: string }) {
  return {
    inkwell: "1",
    d: e.date.slice(0, 10),
    t: clip(e.title, 110),
    m: clip(e.mood, 16),
    p: clip(e.body.replace(/\s+/g, " ").trim(), 110),
  };
}

type DriveFile = { id: string; modifiedTime: string; appProperties?: Record<string, string> };

function toMeta(f: DriveFile): EntryMeta {
  const a = f.appProperties ?? {};
  return { fileId: f.id, date: a["d"] ?? "", title: a["t"] ?? "", mood: a["m"] ?? "😊", preview: a["p"] ?? "", modifiedTime: f.modifiedTime };
}

async function findOne(q: string): Promise<string | null> {
  const res = await drive(`/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)&pageSize=1`, {}, "lookup");
  const { files } = (await res.json()) as { files: { id: string }[] };
  return files[0]?.id ?? null;
}

// Reuse the same Drive folder on every (re)connect: find "Inkwell-Diary" by name, adopt the older
// "Inkwell Diary" folder if that is all there is, and only create a new one when neither exists.
async function getFolderId(): Promise<string> {
  const isFolder = "mimeType='application/vnd.google-apps.folder' and trashed=false and 'root' in parents";
  const existing = await findOne(`name='${FOLDER_NAME}' and ${isFolder}`);
  if (existing) return existing;
  const legacy = await findOne(`name='${LEGACY_FOLDER}' and ${isFolder}`);
  if (legacy) {
    await drive(
      `/drive/v3/files/${legacy}`,
      { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: FOLDER_NAME }) },
      "folder rename",
    );
    return legacy;
  }
  const res = await drive(
    "/drive/v3/files?fields=id",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: FOLDER_NAME, mimeType: "application/vnd.google-apps.folder", parents: ["root"] }),
    },
    "folder create",
  );
  return ((await res.json()) as { id: string }).id;
}

async function createFile(folderId: string, e: { date: string; title: string; mood: string; body: string }) {
  const boundary = "inkwell" + crypto.randomUUID();
  const meta = {
    name: `${e.date.slice(0, 10)} ${clip(e.title || "Untitled", 60)}.json`.replace(/[\/\\]/g, "-"),
    mimeType: "application/json",
    parents: [folderId],
    appProperties: props(e),
  };
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}` +
    `\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(e)}\r\n--${boundary}--`;
  const res = await drive(
    "/upload/drive/v3/files?uploadType=multipart&fields=id,modifiedTime,appProperties",
    { method: "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, body },
    "create",
  );
  return toMeta((await res.json()) as DriveFile);
}

// One-time move of entries from the old single-file format.
async function migrateLegacy(folderId: string) {
  const legacyId = await findOne(`name='${LEGACY_FILE}' and trashed=false and not '${folderId}' in parents`);
  if (!legacyId) return;
  const res = await drive(`/drive/v3/files/${legacyId}?alt=media`, {}, "legacy read");
  let old: { date: string; title: string; mood: string; body: string }[] = [];
  try { old = await res.json(); } catch { old = []; }
  for (const e of old) {
    await createFile(folderId, { date: e.date ?? "", title: e.title ?? "", mood: e.mood ?? "😊", body: e.body ?? "" });
  }
  // Keep the old file as a backup, renamed so it is not migrated twice.
  await drive(
    `/drive/v3/files/${legacyId}`,
    { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Inkwell Diary (old backup).json" }) },
    "legacy rename",
  );
}

export async function listEntries(): Promise<EntryMeta[]> {
  const folderId = await getFolderId();
  await migrateLegacy(folderId);
  const out: EntryMeta[] = [];
  let pageToken = "";
  do {
    const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
    const res = await drive(
      `/drive/v3/files?q=${q}&pageSize=1000&fields=nextPageToken,files(id,modifiedTime,appProperties)${pageToken ? `&pageToken=${pageToken}` : ""}`,
      {},
      "list",
    );
    const json = (await res.json()) as { files: DriveFile[]; nextPageToken?: string };
    out.push(...json.files.map(toMeta));
    pageToken = json.nextPageToken ?? "";
  } while (pageToken);
  return out;
}

export async function readEntry(fileId: string): Promise<FullEntry> {
  const [metaRes, bodyRes] = await Promise.all([
    drive(`/drive/v3/files/${fileId}?fields=id,modifiedTime,appProperties`, {}, "read"),
    drive(`/drive/v3/files/${fileId}?alt=media`, {}, "read"),
  ]);
  const meta = toMeta((await metaRes.json()) as DriveFile);
  const content = (await bodyRes.json()) as { title?: string; body?: string; date?: string; mood?: string };
  return { ...meta, title: content.title ?? meta.title, date: content.date ?? meta.date, mood: content.mood ?? meta.mood, body: content.body ?? "" };
}

export type SaveResult = { ok: true; entry: EntryMeta } | { ok: false; conflict: true };

export async function writeEntry(input: {
  fileId?: string | undefined;
  expectedModifiedTime?: string | undefined;
  date: string;
  title: string;
  mood: string;
  body: string;
}): Promise<SaveResult> {
  const e = { date: input.date, title: input.title, mood: input.mood, body: input.body };
  if (!input.fileId) return { ok: true, entry: await createFile(await getFolderId(), e) };

  if (input.expectedModifiedTime) {
    const res = await drive(`/drive/v3/files/${input.fileId}?fields=modifiedTime`, {}, "check");
    const { modifiedTime } = (await res.json()) as { modifiedTime: string };
    if (modifiedTime !== input.expectedModifiedTime) return { ok: false, conflict: true };
  }

  await drive(
    `/drive/v3/files/${input.fileId}`,
    { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ appProperties: props(e) }) },
    "update metadata",
  );
  const res = await drive(
    `/upload/drive/v3/files/${input.fileId}?uploadType=media&fields=id,modifiedTime,appProperties`,
    { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(e) },
    "update",
  );
  return { ok: true, entry: toMeta((await res.json()) as DriveFile) };
}

export async function trashEntry(fileId: string) {
  await drive(
    `/drive/v3/files/${fileId}`,
    { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trashed: true }) },
    "delete",
  );
}
