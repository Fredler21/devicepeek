# DevicePeek

**See any website or app as an iPhone and a laptop, side by side — right in your browser.**

DevicePeek is a single-file, zero-dependency tool for previewing a URL at real
device widths. Paste your site, a Vercel/Netlify preview link, or `localhost:3000`,
and watch the responsive layout render in an iPhone frame and a laptop frame at the
same time. Perfect while you're building an app or website.

<!-- Add a screenshot here after your first push: ![DevicePeek](screenshot.png) -->

## Features

- 📱 **iPhone + 💻 laptop, together** — spot responsive breakpoints at a glance
- 🔗 **Any URL** — your deploys, preview links, or `localhost` for live local dev
- 🔄 **Device presets** — iPhone 15 Pro / Pro Max / SE, Pixel 8, Galaxy S23; MacBook Air, 1366, 1440, 1024
- ↻ **Rotate, reload, open-in-tab**, and a **light/dark backdrop** toggle
- 🎯 **True responsive rendering** — each frame is a real `<iframe>` at that device's CSS width, so `@media` queries fire exactly as on-device
- 🪶 **No build, no install** — one `index.html`; remembers your last URL

## Use it

**Hosted:** open the GitHub Pages link (see the repo's *About* / *Pages* section).

**Locally:** just open `index.html` in your browser — that's it. Or serve it:

```bash
npx serve .        # or: python -m http.server
```

**Preview your own project while building:**

```bash
npm run dev        # start your dev server (e.g. Next.js on :3000)
```
Then in DevicePeek, type `localhost:3000` and hit **Preview**.

## How it works

1. An `<iframe>` gets its **own viewport**, so sizing it to 393 px makes the embedded
   page render its *mobile* CSS — real responsive behavior, not a zoom.
2. The phone/laptop **frames are pure HTML/CSS** drawn around each iframe.
3. Each frame is **scaled with `transform: scale()`** to fit your screen.

## Good to know

Browsers won't let a page be embedded if it sends an `X-Frame-Options` or
`Content-Security-Policy: frame-ancestors` header. So DevicePeek works with sites
that **allow embedding** — your own apps, most preview deployments, and `localhost` —
but **not** locked-down sites like Google, YouTube, or many banks. When a frame comes
up blank, use the **Open in a new tab ↗** shortcut.

It renders with your desktop browser engine, so it's accurate for **layout and
responsive breakpoints**, but won't reproduce iOS-Safari-only quirks — a real device
is still the final check for those.

## License

MIT © Fredler Gracia Pierre-Louis — see [LICENSE](LICENSE).
