import { createFileRoute } from "@tanstack/react-router";
import { gateSession, GOOGLE_SCOPE, callbackUrl } from "@/lib/session.server";

export const Route = createFileRoute("/api/public/google/start")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const s = await gateSession();
        if (!s.data.unlocked) return Response.redirect(new URL("/unlock", request.url), 302);
        const clientId = process.env["GOOGLE_CLIENT_ID"];
        if (!clientId) return new Response("GOOGLE_CLIENT_ID is not set", { status: 500 });
        const state = crypto.randomUUID();
        await s.update({ oauthState: state });
        const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
        url.search = new URLSearchParams({
          client_id: clientId,
          redirect_uri: callbackUrl(request),
          response_type: "code",
          scope: GOOGLE_SCOPE,
          access_type: "offline",
          prompt: "consent",
          state,
        }).toString();
        return new Response(null, { status: 302, headers: { Location: url.toString() } });
      },
    },
  },
});
