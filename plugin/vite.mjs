/**
 * Vite plugin. Add it to a project and that project registers itself with DevicePeek
 * every time its dev server starts, so it is there to view in DevicePeek without
 * anyone typing a URL.
 *
 *   // vite.config.ts
 *   import devicepeek from "devicepeek/vite";
 *   export default { plugins: [devicepeek()] };
 */
import { readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { forget, register } from "./registry.mjs";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const AGENT = readFileSync(join(HERE, "agent.js"), "utf8");

/** The project's own name, so the Projects list reads the way the developer expects. */
function projectName(root) {
  try {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    if (typeof pkg.name === "string" && pkg.name) return pkg.name;
  } catch {
    /* no package.json, so fall back to the folder name */
  }
  return basename(root) || "project";
}

/**
 * Where the dev server actually ended up. Vite's own resolvedUrls is the best answer
 * because it accounts for host, https, and a port that moved because one was taken.
 * The socket address is the fallback for the tick before resolvedUrls is filled in.
 */
function serverUrl(server) {
  const resolved = server.resolvedUrls?.local?.[0];
  if (resolved) return resolved;

  const addr = server.httpServer?.address();
  if (!addr || typeof addr === "string") return null;
  const scheme = server.config.server?.https ? "https" : "http";
  const wildcard = addr.address === "::" || addr.address === "0.0.0.0";
  const host = wildcard ? "localhost" : addr.address;
  return `${scheme}://${host.includes(":") ? `[${host}]` : host}:${addr.port}`;
}

/**
 * @param {{ name?: string, url?: string, agent?: boolean }} [options]
 *   name  label for the Projects list, default the package.json name
 *   url   register this address instead of the detected one, for tunnels or proxies
 *   agent inject the diagnostics agent into dev HTML, default true
 */
export default function devicepeek(options = {}) {
  const { name, url, agent = true } = options;
  let entry = null;

  const drop = () => {
    if (!entry) return;
    const { id } = entry;
    entry = null;
    try {
      forget(id);
    } catch {
      /* registry unwritable, so leave the entry for the liveness probe to mark dead */
    }
  };

  return {
    name: "devicepeek",
    apply: "serve",

    configureServer(server) {
      const root = resolve(server.config.root ?? process.cwd());
      const log = server.config.logger;

      const announce = () => {
        if (entry) return;
        const local = url ?? serverUrl(server);
        if (!local) return;
        try {
          entry = register({ name: name ?? projectName(root), url: local, root, via: "vite" });
          log.info(`  DevicePeek  ${entry.name} is in the Projects list at ${entry.url}`);
        } catch (err) {
          log.warn(`  DevicePeek  could not register this project: ${err.message}`);
        }
      };

      if (server.httpServer) {
        // resolvedUrls lands just after the listening event, so give it a tick.
        server.httpServer.once("listening", () => setTimeout(announce, 0));
        server.httpServer.once("close", drop);
      } else if (url) {
        // Middleware mode has no address to detect, so only an explicit url works.
        announce();
      }

      // Covers Ctrl+C and any exit that closes the process without closing the server.
      process.once("exit", drop);
    },

    transformIndexHtml: {
      order: "pre",
      handler() {
        if (!agent) return [];
        return [{ tag: "script", children: AGENT, injectTo: "head-prepend" }];
      },
    },
  };
}
