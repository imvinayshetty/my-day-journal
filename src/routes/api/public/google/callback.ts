import { createFileRoute } from "@tanstack/react-router";
import { gateSession, callbackUrl } from "@/lib/session.server";

export const Route = createFileRoute("/api/public/google/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const home = (q = "") => new Response(null, { status: 302, headers: { Location: `/${q}` } });
        const s = await gateSession();
        if (!s.data.unlocked) return new Response(null, { status: 302, headers: { Location: "/unlock" } });
        const state = url.searchParams.get("state");
        const code = url.searchParams.get("code");
        if (!state || state !== s.data.oauthState || !code) return home("?drive=failed");
        const res = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            code,
            client_id: process.env["GOOGLE_CLIENT_ID"] ?? "",
            client_secret: process.env["GOOGLE_CLIENT_SECRET"] ?? "",
            redirect_uri: callbackUrl(request),
            grant_type: "authorization_code",
          }),
        });
        if (!res.ok) {
          console.error(`Google code exchange failed [${res.status}]: ${await res.text()}`);
          return home("?drive=failed");
        }
        const json = (await res.json()) as { refresh_token?: string };
        if (!json.refresh_token) return home("?drive=failed");
        await s.update({ gRefresh: json.refresh_token, oauthState: undefined });
        return home();
      },
    },
  },
});
