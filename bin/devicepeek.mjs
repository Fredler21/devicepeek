#!/usr/bin/env node
/**
 * DevicePeek CLI.
 *
 *   npx devicepeek              open the dashboard, which lists every registered project
 *   npx devicepeek list         print the registered projects
 *   npx devicepeek register     add a project by hand, for stacks that are not Vite
 *   npx devicepeek forget NAME  drop a project from the list
 *
 * The dashboard is the built app plus a small read only API over the registry. It binds
 * to the loopback address only, since the registry says what you are working on and
 * where it is on disk.
 */
import { spawn } from "node:child_process";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { connect } from "node:net";
import { join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { forget, listProjects, register, registryFile } from "../plugin/registry.mjs";

const PKG_ROOT = fileURLToPath(new URL("..", import.meta.url));
const UI_ROOT = resolve(join(PKG_ROOT, "dist"));
const AGENT_FILE = join(PKG_ROOT, "plugin", "agent.js");
const DEFAULT_PORT = 7331;
const PORT_TRIES = 10;
const PROBE_MS = 500;

/** The hosted build reads this same API, so it is allowed through CORS by default. */
const DEFAULT_ORIGINS = ["https://fredler21.github.io"];

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

function version() {
  try {
    return JSON.parse(readFileSync(join(PKG_ROOT, "package.json"), "utf8")).version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function parseArgs(argv) {
  const flags = {};
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("-")) {
      rest.push(arg);
      continue;
    }
    if (arg === "--no-open") {
      flags.open = false;
      continue;
    }
    const [key, inline] = arg.replace(/^-+/, "").split("=");
    if (inline !== undefined) flags[key] = inline;
    else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith("-")) flags[key] = argv[++i];
    else flags[key] = true;
  }
  return { flags, rest };
}

// ---- liveness ----

/**
 * A registered project is only worth showing as live if something is actually
 * answering on its port. That is also how a dev server killed with no chance to clean
 * up still shows as offline instead of lingering as a dead row.
 */
function probe(rawUrl) {
  return new Promise((done) => {
    let target;
    try {
      target = new URL(rawUrl);
    } catch {
      return done(false);
    }
    const port = Number(target.port) || (target.protocol === "https:" ? 443 : 80);
    const socket = connect({ host: target.hostname, port });
    const finish = (ok) => {
      socket.destroy();
      done(ok);
    };
    socket.setTimeout(PROBE_MS);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

async function withLiveness(projects) {
  const live = await Promise.all(projects.map((p) => probe(p.url)));
  return projects.map((p, i) => ({ ...p, live: live[i] }));
}

// ---- http ----

function send(res, status, type, body) {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store" });
  res.end(body);
}

function json(res, status, body) {
  send(res, status, "application/json; charset=utf-8", JSON.stringify(body));
}

function allowedOrigin(origin, origins) {
  if (!origin) return null;
  if (/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(origin)) return origin;
  return origins.includes(origin) ? origin : null;
}

/**
 * Refuse requests aimed at a hostname that merely resolves to loopback, so a page in
 * the browser cannot use DNS rebinding to read the registry.
 */
function hostOk(req) {
  const host = String(req.headers.host ?? "")
    .replace(/:\d+$/, "")
    .toLowerCase();
  return host === "" || host === "localhost" || host === "127.0.0.1" || host === "[::1]";
}

function serveFile(res, file, fallbackType = "application/octet-stream") {
  const dot = file.lastIndexOf(".");
  const type = MIME[file.slice(dot).toLowerCase()] ?? fallbackType;
  res.writeHead(200, { "content-type": type, "cache-control": "no-store" });
  createReadStream(file)
    .on("error", () => res.end())
    .pipe(res);
}

/**
 * The Pages build puts assets under /devicepeek/, the build for everywhere else puts
 * them at the root. Read whichever it is out of the built HTML so the dashboard serves
 * either one instead of coming up blank.
 */
function detectBase() {
  try {
    const html = readFileSync(join(UI_ROOT, "index.html"), "utf8");
    return html.match(/(?:src|href)="(\/[^"]*?\/)assets\//)?.[1] ?? "/";
  } catch {
    return "/";
  }
}

const BASE = detectBase();

function serveStatic(res, pathname) {
  let rel;
  try {
    rel = decodeURIComponent(pathname);
  } catch {
    return send(res, 400, "text/plain; charset=utf-8", "Bad request");
  }
  if (BASE !== "/" && rel.startsWith(BASE)) rel = rel.slice(BASE.length - 1);
  if (rel.endsWith("/")) rel += "index.html";

  const full = resolve(join(UI_ROOT, normalize(rel)));
  if (full !== UI_ROOT && !full.startsWith(UI_ROOT + sep)) {
    return send(res, 403, "text/plain; charset=utf-8", "Forbidden");
  }

  // Unknown paths fall back to the app shell rather than 404, so deep links work.
  const target = existsSync(full) && statSync(full).isFile() ? full : join(UI_ROOT, "index.html");
  if (!existsSync(target)) return send(res, 404, "text/plain; charset=utf-8", "Not found");
  return serveFile(res, target);
}

async function handle(req, res, origins) {
  const origin = req.headers.origin;
  const allow = allowedOrigin(origin, origins);
  const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
  const isApi = pathname === "/api/projects" || pathname.startsWith("/api/projects/");

  res.setHeader("Vary", "Origin");
  if (allow) {
    res.setHeader("Access-Control-Allow-Origin", allow);
    res.setHeader("Access-Control-Allow-Methods", "GET, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "content-type");
  }
  if (req.method === "OPTIONS") {
    res.writeHead(allow ? 204 : 403).end();
    return;
  }

  // The agent is public code that any local project may pull in, so it needs no gate.
  if (pathname === "/agent.js") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    return serveFile(res, AGENT_FILE);
  }

  if (isApi) {
    if (!hostOk(req)) return send(res, 403, "text/plain; charset=utf-8", "Forbidden host");
    if (origin && !allow) return send(res, 403, "text/plain; charset=utf-8", "Origin not allowed");

    if (pathname === "/api/projects" && req.method === "GET") {
      return json(res, 200, { projects: await withLiveness(listProjects()) });
    }
    if (pathname.startsWith("/api/projects/") && req.method === "DELETE") {
      const id = decodeURIComponent(pathname.slice("/api/projects/".length));
      return json(res, 200, { removed: forget(id).map((p) => p.id) });
    }
    return json(res, 405, { error: "Method not allowed" });
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    return send(res, 405, "text/plain; charset=utf-8", "Method not allowed");
  }
  return serveStatic(res, pathname);
}

/** Listen on the wanted port, stepping up if something already holds it. */
function listen(server, port, tries) {
  return new Promise((ok, fail) => {
    const attempt = (candidate, left) => {
      server.removeAllListeners("error");
      server.once("error", (err) => {
        if (err.code === "EADDRINUSE" && left > 0) return attempt(candidate + 1, left - 1);
        fail(err);
      });
      server.listen(candidate, "127.0.0.1", () => ok(candidate));
    };
    attempt(port, tries);
  });
}

function openBrowser(url) {
  const [cmd, args] =
    process.platform === "win32"
      ? ["cmd", ["/c", "start", "", url]]
      : process.platform === "darwin"
        ? ["open", [url]]
        : ["xdg-open", [url]];
  try {
    spawn(cmd, args, { stdio: "ignore", detached: true }).unref();
  } catch {
    /* no browser to launch, and the URL is printed anyway */
  }
}

// ---- commands ----

async function serve(flags) {
  if (!existsSync(join(UI_ROOT, "index.html"))) {
    console.error("DevicePeek: the app is not built yet.");
    console.error(`Expected ${join(UI_ROOT, "index.html")}`);
    console.error("Run npm run build in the devicepeek package, then try again.");
    process.exitCode = 1;
    return;
  }

  const extra = typeof flags.origin === "string" ? flags.origin.split(",").filter(Boolean) : [];
  const origins = [...DEFAULT_ORIGINS, ...extra];
  const server = createServer((req, res) => {
    handle(req, res, origins).catch(() => {
      if (!res.headersSent) send(res, 500, "text/plain; charset=utf-8", "Server error");
      else res.end();
    });
  });

  const port = await listen(server, Number(flags.port) || DEFAULT_PORT, PORT_TRIES);
  const url = `http://localhost:${port}/`;
  const projects = listProjects();

  console.log(`DevicePeek  ${url}`);
  console.log(`Registry    ${registryFile()}`);
  console.log(
    projects.length
      ? `Projects    ${projects.length} registered: ${projects.map((p) => p.name).join(", ")}`
      : "Projects    none yet. Add devicepeek to a project and start its dev server."
  );

  if (flags.open !== false) openBrowser(url);
}

async function list() {
  const projects = await withLiveness(listProjects());
  if (!projects.length) {
    console.log("No projects registered yet.");
    console.log(`Registry: ${registryFile()}`);
    return;
  }
  const width = Math.max(...projects.map((p) => p.name.length), 4);
  console.log(`${"NAME".padEnd(width)}  STATUS   URL`);
  for (const p of projects) {
    console.log(`${p.name.padEnd(width)}  ${(p.live ? "live" : "offline").padEnd(7)}  ${p.url}`);
  }
}

function registerManually(flags, rest) {
  const url = typeof flags.url === "string" ? flags.url : rest[0];
  if (!url) {
    console.error("DevicePeek: register needs a url, for example:");
    console.error("  npx devicepeek register --url http://localhost:3000 --name my-app");
    process.exitCode = 1;
    return;
  }
  const root = typeof flags.root === "string" ? resolve(flags.root) : process.cwd();
  const name = typeof flags.name === "string" ? flags.name : undefined;
  const entry = register({ url, name: name ?? basenameOf(root), root, via: "manual" });
  console.log(`Registered ${entry.name} at ${entry.url}`);
}

function basenameOf(dir) {
  const parts = dir.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? "project";
}

function forgetProject(rest) {
  const needle = rest[0];
  if (!needle) {
    console.error("DevicePeek: forget needs a project name or id. Run devicepeek list to see them.");
    process.exitCode = 1;
    return;
  }
  const removed = forget(needle);
  console.log(removed.length ? `Removed ${removed.map((p) => p.name).join(", ")}` : `No project matched ${needle}`);
}

function help() {
  console.log(`DevicePeek ${version()}

  npx devicepeek                    open the dashboard with every registered project
  npx devicepeek list               print the registered projects and whether each is live
  npx devicepeek register --url U   add a project by hand, for stacks that are not Vite
  npx devicepeek forget NAME        drop a project from the list

Options for the dashboard:
  --port N        port to serve on, default ${DEFAULT_PORT}
  --no-open       do not open a browser
  --origin A,B    extra origins allowed to read the local API

Options for register:
  --url URL       address of the project's dev server, required
  --name NAME     label for the Projects list, default the folder name
  --root DIR      project folder, default the current directory

To register automatically instead, add the plugin to the project's Vite config:

  import devicepeek from "devicepeek/vite";
  export default { plugins: [devicepeek()] };

Registry: ${registryFile()}`);
}

async function main() {
  const { flags, rest } = parseArgs(process.argv.slice(2));
  const command = rest.shift();

  if (flags.help || flags.h || command === "help") return help();
  if (flags.version || flags.v) return console.log(version());

  switch (command) {
    case undefined:
    case "serve":
      return serve(flags);
    case "list":
    case "ls":
      return list();
    case "register":
    case "add":
      return registerManually(flags, rest);
    case "forget":
    case "remove":
    case "rm":
      return forgetProject(rest);
    default:
      console.error(`DevicePeek: unknown command ${command}`);
      process.exitCode = 1;
      return help();
  }
}

main().catch((err) => {
  console.error(`DevicePeek: ${err.message}`);
  process.exitCode = 1;
});
