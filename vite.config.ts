import { defineConfig } from "vite";

// GitHub Pages serves this project under /devicepeek/, so the build there needs
// that base path. Everywhere else (Vercel, Netlify, local dev) it is served from
// the domain root, so base stays "/". GitHub Actions sets GITHUB_ACTIONS=true.
const onGitHubPages = process.env.GITHUB_ACTIONS === "true";

export default defineConfig({
  base: onGitHubPages ? "/devicepeek/" : "/",
});
