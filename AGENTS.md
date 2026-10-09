<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Diary storage: one Google Drive JSON file per entry in an "Inkwell Diary" folder, with list metadata in appProperties; why: saves touch only one entry and the list loads without downloading bodies.
- Diary access: shared-password gate in an encrypted session, checked inside every diary server function; why: single-owner app without accounts.
- Vercel hosting: vercel.json pins Bun install/build with no framework preset, and the build auto-targets Vercel output when VERCEL is set; why: the same repo deploys to both Lovable and Vercel without config forks.
- Drive auth: own Google OAuth refresh token (GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN) calls googleapis.com directly when set, else falls back to the Lovable connector gateway; why: lets the diary run on non-Lovable hosts like Vercel.
