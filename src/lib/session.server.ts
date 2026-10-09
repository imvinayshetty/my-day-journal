import { useSession } from "@tanstack/react-start/server";

export type GateSession = { unlocked?: boolean; gRefresh?: string | undefined; oauthState?: string | undefined };

export function sessionConfig() {
  const secret = process.env["SESSION_SECRET"];
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET is missing or shorter than 32 characters");
  return {
    password: secret,
    name: "inkwell-gate",
    maxAge: 60 * 60 * 24 * 365,
    cookie: { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/" },
  };
}

export const gateSession = () => useSession<GateSession>(sessionConfig());

export const GOOGLE_SCOPE = "https://www.googleapis.com/auth/drive.file";
export const callbackUrl = (request: Request) => `${new URL(request.url).origin}/api/public/google/callback`;
