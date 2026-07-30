/**
 * The DevicePeek project registry.
 *
 * A project that adds DevicePeek writes itself here when its dev server starts, and
 * the DevicePeek app reads this file through the CLI. That is what makes a project
 * show up on its own instead of someone typing its URL.
 *
 * The file lives at ~/.devicepeek/projects.json, or wherever DEVICEPEEK_HOME points.
 * Every call is synchronous on purpose: unregistering happens in a process exit
 * handler, where async work would never run.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const VERSION = 1;
const LOCK_STALE_MS = 5000;
const LOCK_TRIES = 60;
const LOCK_WAIT_MS = 25;

/** Directory holding the registry. Override with DEVICEPEEK_HOME, which tests rely on. */
export function home() {
  return process.env.DEVICEPEEK_HOME || join(homedir(), ".devicepeek");
}

export function registryFile() {
  return join(home(), "projects.json");
}

/**
 * A stable id for a project folder, so restarting a dev server updates one entry
 * rather than piling up duplicates.
 */
export function projectId(root) {
  const abs = resolve(root);
  const key = process.platform === "win32" ? abs.toLowerCase() : abs;
  return createHash("sha1").update(key).digest("hex").slice(0, 8);
}

function empty() {
  return { version: VERSION, projects: [] };
}

function usable(entry) {
  return Boolean(entry) && typeof entry.name === "string" && typeof entry.url === "string" && typeof entry.id === "string";
}

/** Reads the registry, treating any corruption as an empty list rather than throwing. */
export function readRegistry() {
  try {
    const data = JSON.parse(readFileSync(registryFile(), "utf8"));
    if (!data || !Array.isArray(data.projects)) return empty();
    return { version: VERSION, projects: data.projects.filter(usable) };
  } catch {
    return empty();
  }
}

export function listProjects() {
  return readRegistry().projects;
}

function pause(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Takes a directory as a mutex so two dev servers starting at once cannot lose each
 * other's entry. A lock left behind by a killed process is broken once it goes stale.
 * Returns null if the lock never frees, in which case we write anyway: delaying
 * someone's dev server matters more than a rare lost write.
 */
function acquire() {
  const lock = join(home(), ".lock");
  mkdirSync(home(), { recursive: true });
  for (let i = 0; i < LOCK_TRIES; i++) {
    try {
      mkdirSync(lock);
      return lock;
    } catch (err) {
      if (err.code !== "EEXIST") return null;
      try {
        if (Date.now() - statSync(lock).mtimeMs > LOCK_STALE_MS) {
          rmSync(lock, { recursive: true, force: true });
          continue;
        }
      } catch {
        continue; // the lock vanished between the two calls, so try again
      }
      pause(LOCK_WAIT_MS);
    }
  }
  return null;
}

function release(lock) {
  if (!lock) return;
  try {
    rmSync(lock, { recursive: true, force: true });
  } catch {
    /* already gone */
  }
}

/** Read, mutate, and write the registry under the lock, replacing the file atomically. */
export function update(mutator) {
  const lock = acquire();
  try {
    const data = readRegistry();
    const next = mutator(data) ?? data;
    const file = registryFile();
    const tmp = `${file}.${process.pid}.tmp`;
    mkdirSync(home(), { recursive: true });
    writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`);
    try {
      renameSync(tmp, file);
    } catch (err) {
      try {
        unlinkSync(tmp);
      } catch {
        /* nothing to clean up */
      }
      throw err;
    }
    return next;
  } finally {
    release(lock);
  }
}

/**
 * Adds or refreshes a project. Called by the Vite plugin on dev server start and by
 * `devicepeek register` for projects that are not on Vite.
 */
export function register(entry) {
  if (!entry || typeof entry.url !== "string" || !entry.url) throw new Error("DevicePeek: register needs a url");
  const root = resolve(entry.root ?? process.cwd());
  const id = projectId(root);
  const now = Date.now();
  let saved = null;
  update((data) => {
    const prev = data.projects.find((p) => p.id === id);
    saved = {
      id,
      name: String(entry.name || "project"),
      url: entry.url.replace(/\/+$/, ""),
      root,
      via: entry.via ?? "manual",
      pid: entry.pid ?? process.pid,
      addedAt: prev?.addedAt ?? now,
      seenAt: now,
    };
    data.projects = [saved, ...data.projects.filter((p) => p.id !== id)];
    return data;
  });
  return saved;
}

/** Removes projects matching an id, a name, or a folder. Returns what came out. */
export function forget(idOrName) {
  const needle = String(idOrName ?? "").trim();
  if (!needle) return [];
  const asRoot = resolve(needle);
  const removed = [];
  update((data) => {
    data.projects = data.projects.filter((p) => {
      const hit = p.id === needle || p.name === needle || p.root === asRoot;
      if (hit) removed.push(p);
      return !hit;
    });
    return data;
  });
  return removed;
}
