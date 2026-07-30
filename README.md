![DevicePeek. See any website or app as an iPhone and a laptop, side by side.](docs/banner.png)

# DevicePeek

See any website or app as an iPhone and a laptop, side by side, right in your browser.

DevicePeek renders a URL at real device widths inside an iPhone frame and a laptop
frame at the same time. Paste your site, a Vercel or Netlify preview link, or
`localhost:3000`, and instantly see how the responsive layout behaves on each. It
gives you a fast feedback loop while you build an app or website.

Add DevicePeek to a project and you skip the pasting entirely. That project registers
itself when its dev server starts, so it is simply there in the Projects list, ready to
look at. See [Add DevicePeek to a project](#add-devicepeek-to-a-project).

Live app: https://fredler21.github.io/devicepeek/

## Screenshot

![DevicePeek previewing a site as an iPhone and a laptop at the same time](docs/screenshot.png)

## Features

- iPhone and laptop, together, so you can spot responsive breakpoints at a glance
- Projects that add DevicePeek show up on their own. Add the plugin once and every dev server you start lands in the Projects list, live, with no URL to type
- Any URL, including your deploys, preview links, or `localhost` for live local dev
- Shareable preview links. Add `?url=example.com` to the address and DevicePeek opens with that site already loaded
- Device presets: iPhone 15 Pro, Pro Max, and SE, Pixel 8, Galaxy S23, plus MacBook Air, 1366, 1440, and 1024 laptops
- Rotate, reload, open in a new tab, and a light or dark backdrop toggle
- Issue detection. Load failures show up automatically, and an opt in agent snippet reports JavaScript errors, broken images, and layout overflow live, labeled per device
- True responsive rendering. Each frame is a real iframe at that device's CSS width, so media queries fire exactly as they do on the device
- Built with TypeScript and Vite, so it stays typed and tiny

## Controls

- URL bar: type any address and press Preview or Enter. It adds `https` for you, and uses `http` for `localhost` and IP addresses
- Both, Phone, Laptop: choose which frames to show
- Phone and Laptop menus: pick a device preset
- Rotate: switch the phone between portrait and landscape
- Reload: refresh both frames at once
- Backdrop: toggle a light or dark stage behind the devices
- Open in a new tab: open the current URL directly, which is handy when a site blocks embedding
- Projects: open the list of projects that registered themselves. Click one to preview it, or click the × to drop it from the list
- Issues: open the panel that shows each frame's load status and any problems detected

## Finding issues

DevicePeek can surface problems with the site you are previewing. It works in two layers.

Always on, for any URL, with no setup: each device shows a status of Loading, Loaded,
or No response, so a blank frame, a site that is down, or one that blocks embedding is
obvious right away.

Deep checks, opt in: browsers do not let one page read inside another site's frame, so
to catch JavaScript errors, unhandled promise rejections, broken images, and horizontal
overflow, your site sends them to DevicePeek. Projects using the Vite plugin already have
the agent injected into their dev HTML, so this works with no setup. For anything else,
open the Issues panel, copy the small agent snippet, and paste it into your dev build
once. It reports problems over postMessage, and DevicePeek lists them live, labeled by
device. The agent stays silent unless the page is actually inside a frame, so it is inert
if it ever reaches production.

## Tech stack

- Language: TypeScript in strict mode for the app, plain ESM for the plugin and CLI
- Build tool: Vite
- Runtime dependencies: none. The app is just DOM and CSS, and the CLI is Node built ins only
- Hosting: GitHub Pages through GitHub Actions, with the dashboard also runnable locally

## Getting started

    git clone https://github.com/Fredler21/devicepeek.git
    cd devicepeek
    npm install
    npm run dev

The dev server runs at http://localhost:5173/

Build and preview the production bundle:

    npm run build     # type checks with tsc, then bundles with Vite into dist
    npm run preview   # serve the built dist folder locally
    npm start         # serve the built app plus the local Projects API

`npm install` builds `dist` for you, so `npm start` and `npx devicepeek` work straight
after a clone.

## Add DevicePeek to a project

Adding DevicePeek to a project is what makes that project viewable in DevicePeek without
anyone typing a URL or registering a domain.

There are four ways to register a project. They all write to the same list, so pick the
first one that fits your stack. Every route needs the package installed and the dashboard
running, so start with the two steps below.

### Step 1: install it

The package is not on npm yet, so install it straight from GitHub:

    npm install -D github:Fredler21/devicepeek

Once it is published that becomes:

    npm install -D devicepeek

To work against a local clone instead, link it once and it is available everywhere:

    cd devicepeek
    npm link                 # makes devicepeek a global command
    cd ../your-project
    npm link devicepeek      # lets that project import devicepeek/vite

### Step 2: open the dashboard

    npx devicepeek

It serves at http://localhost:7331 and you can leave it sitting in a tab. Click Projects
in the top bar to see the list. Use `--port` to move it, and `--no-open` to stop it
launching a browser.

### Way 1: the Vite plugin

The best option when the project is on Vite. It needs no upkeep and it knows the real
port.

    // vite.config.ts
    import devicepeek from "devicepeek/vite";

    export default {
      plugins: [devicepeek()],
    };

Start the dev server the way you always do. The project appears in the Projects list the
moment the server is up, labeled with its package name and the port it actually bound to,
and the first live project opens in the frames by itself. Add the plugin to a second
project and it joins the list too, so you can flip between them from the sidebar instead
of the URL bar.

The plugin is dev only. It does nothing in a production build, and it injects the
diagnostics agent for you, so the Issues panel does its deep checks with no extra setup.
Stopping the dev server takes the project back out of the list.

Options, if you need them:

    devicepeek({
      name: "storefront",              // label, default the package.json name
      url: "https://tunnel.example",   // register this address instead of the detected one
      agent: false,                    // skip the diagnostics agent
    })

### Way 2: an npm script, for any stack

Works for Next.js, Nuxt, Astro, Remix, SvelteKit, Rails, Django, or anything else with a
dev command. npm runs a `pre` script before the script whose name it matches, so the
project registers itself every time you start it.

    "scripts": {
      "predev": "devicepeek register --url http://localhost:3000 --name my-app",
      "dev": "next dev"
    }

Set the port to whatever your dev server uses. If your dev command is called `start`
rather than `dev`, name the hook `prestart` instead.

One caveat: this registers the port you wrote down, not the port the server ends up on.
If 3000 is busy and the server moves to 3001, the row points at the wrong place. Way 1
does not have that problem, because the plugin reads the port after the server binds.

### Way 3: the CLI, once by hand

Good for a project you only reach for occasionally, or a deployed preview you want to
keep in the list.

    devicepeek register --url http://localhost:3000 --name my-app
    devicepeek register --url https://my-app.vercel.app --name my-app-preview
    devicepeek list
    devicepeek forget my-app

`--root` sets the folder the entry belongs to, which defaults to the current directory.
An entry stays until you forget it, and shows offline whenever nothing answers at that
address.

### Way 4: the Node API, from a config file

For stacks whose config is JavaScript but that have no Vite plugin hook. Next.js is the
usual case.

    // next.config.ts
    import { register } from "devicepeek";

    if (process.env.NODE_ENV === "development") {
      register({ name: "my-app", url: "http://localhost:3000" });
    }

    export default {
      // your config
    };

Same port caveat as way 2. `register` also takes `root`, and there is a matching
`forget`, `listProjects`, and `readRegistry` from the same import.

### Or skip registering entirely

Registering is a convenience, not a requirement. Typing a URL into the address bar still
works for anything, and adding `?url=example.com` still makes a shareable link.

### Deep checks without the Vite plugin

Way 1 injects the diagnostics agent for you. On the other three routes, pull it from the
running dashboard in your dev HTML to get the same reporting:

    <script src="http://localhost:7331/agent.js"></script>

### How discovery works

A project writes its name, its dev server URL, and its folder into a small registry file
at `~/.devicepeek/projects.json`. The dashboard reads that file and lists what it finds,
probing each address to decide what is live. Nothing leaves your machine, there is no
account, and there is no server in the middle. Point `DEVICEPEEK_HOME` somewhere else to
move the registry.

A row is identified by its folder and its name together. Registering the same folder
under the same name updates that row in place, which is why restarting a dev server never
piles up duplicates. Registering the same folder under a different name adds a second row,
which is how one project can keep a localhost address and a deployed preview side by side.

Registering is safe to run at the same time from several projects. Writes take a lock and
replace the file atomically, so two dev servers starting together cannot lose each other's
entry.

The dashboard's local API binds to the loopback address only, rejects requests aimed at
any other hostname, and allows only localhost origins plus the hosted DevicePeek build.

The hosted build can read that same list, because it looks for the CLI on port 7331.
Chrome, Edge, and Firefox allow a secure page to reach localhost. Safari does not, so on
Safari use `npx devicepeek`, which serves the app from the same origin as the API.

## Project structure

    devicepeek/
      index.html                     Vite entry, markup only
      src/
        main.ts                      typed app logic for devices, layout, and scaling
        projects.ts                  polls the registry and renders the Projects list
        dom.ts                       shared element lookup helper
        style.css                    styles
        vite-env.d.ts                Vite client types
      plugin/
        vite.mjs                     the plugin a project adds to register itself
        registry.mjs                 reads and writes ~/.devicepeek/projects.json
        agent.js                     diagnostics agent, shared by the plugin, CLI, and app
        index.mjs                    Node API for stacks that are not Vite
      bin/devicepeek.mjs             CLI: the dashboard, plus list, register, and forget
      public/favicon.svg             copied to the build as is
      vite.config.ts                 base path for GitHub Pages
      .github/workflows/deploy.yml   build and deploy to Pages on every push to main

## Deployment

Deploy on Vercel:

1. Push this repo to GitHub.
2. In Vercel, choose Add New Project and import the repository.
3. Vercel detects Vite automatically. Build command is `npm run build` and the output
   directory is `dist` (also set in `vercel.json`). Click Deploy.

The Vite base path is `/` everywhere except GitHub Pages, so the Vercel build serves
correctly from the domain root with no extra config.

Deploy on GitHub Pages:

Every push to main triggers the Deploy to GitHub Pages workflow, which runs `npm ci`
and `npm run build` with the base path set to `/devicepeek/`, then publishes the dist
folder to Pages. There are no manual steps.

## How it works

1. An iframe gets its own viewport, so sizing it to 393px makes the embedded page
   render its mobile CSS. You get real responsive behavior instead of a zoom.
2. The phone and laptop frames are pure HTML and CSS drawn around each iframe.
3. Each frame is scaled with a CSS transform to fit your screen.

## Good to know

Browsers will not let a page be embedded if it sends an `X-Frame-Options` header or a
`Content-Security-Policy: frame-ancestors` header. DevicePeek works with sites that
allow embedding, such as your own apps, most preview deployments, and `localhost`. It
cannot embed locked down sites like Google, YouTube, or many banks. When a frame comes
up blank, use the Open in a new tab shortcut.

It renders with your desktop browser engine, so it is accurate for layout and
responsive breakpoints. It will not reproduce Safari quirks that happen only on iOS,
so a real device is still the final check for those.

## Contributing

Contributions are welcome. See CONTRIBUTING.md for how to set up the project and open
a pull request.

## License

MIT, by Fredler Gracia Pierre-Louis. See the LICENSE file.
