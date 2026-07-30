/**
 * The Projects list.
 *
 * A project that has DevicePeek added to it registers itself when its dev server
 * starts, and this polls that registry through the local CLI. The effect is that any
 * project you add DevicePeek to is simply there to view, with no URL to paste.
 *
 * When the app is served by `npx devicepeek` the API is same origin. When it is the
 * hosted build, it falls back to the CLI's default port on this machine, which is why
 * the list stays empty until the CLI is running.
 */
import { el } from "./dom";

export interface Project {
  id: string;
  name: string;
  url: string;
  root?: string;
  via?: string;
  seenAt?: number;
  live?: boolean;
}

export interface ProjectsConfig {
  /** The URL showing in the frames right now, used to highlight the active row. */
  activeUrl(): string;
  /** A row was clicked. */
  onPick(url: string, project: Project): void;
  /** Every successful poll, so the app can decide whether to open a project on its own. */
  onDiscover(projects: Project[]): void;
}

const POLL_MS = 4000;
const CLI_ORIGIN = "http://127.0.0.1:7331";
/** Same origin first, since that is the case when the CLI serves this app itself. */
const CANDIDATES = ["", CLI_ORIGIN];

let config: ProjectsConfig | null = null;
let projects: Project[] = [];
let apiBase: string | null = null;
let reachable = false;

async function fetchFrom(origin: string): Promise<Project[] | null> {
  try {
    const res = await fetch(`${origin}/api/projects`, { cache: "no-store" });
    if (!res.ok) return null;
    const data: unknown = await res.json();
    const list = (data as { projects?: unknown } | null)?.projects;
    return Array.isArray(list) ? (list as Project[]).filter((p) => p && p.url && p.name) : null;
  } catch {
    return null; // no CLI running, which is a normal state and not an error
  }
}

async function poll(): Promise<void> {
  const origins = apiBase === null ? CANDIDATES : [apiBase];
  for (const origin of origins) {
    const found = await fetchFrom(origin);
    if (found) {
      apiBase = origin;
      reachable = true;
      projects = found;
      render();
      config?.onDiscover(projects);
      return;
    }
  }
  // Nothing answered. Forget the base so the next tick retries both candidates.
  apiBase = null;
  reachable = false;
  projects = [];
  render();
}

async function forget(project: Project): Promise<void> {
  if (apiBase === null) return;
  try {
    await fetch(`${apiBase}/api/projects/${encodeURIComponent(project.id)}`, { method: "DELETE" });
  } catch {
    /* the CLI went away, and the next poll will reflect that */
  }
  projects = projects.filter((p) => p.id !== project.id);
  render();
}

/** localhost:5173 reads better in a narrow list than the full origin. */
function short(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.host + (parsed.pathname === "/" ? "" : parsed.pathname);
  } catch {
    return url;
  }
}

function sameTarget(a: string, b: string): boolean {
  return a.replace(/\/+$/, "") === b.replace(/\/+$/, "");
}

function row(project: Project): HTMLLIElement {
  const active = config ? config.activeUrl() : "";
  const item = document.createElement("li");
  item.className = "prow" + (sameTarget(project.url, active) ? " on" : "");

  const pick = document.createElement("button");
  pick.className = "ppick";
  pick.title = project.root ? `${project.url}\n${project.root}` : project.url;

  const dot = document.createElement("span");
  dot.className = "pdot" + (project.live ? " live" : "");

  const name = document.createElement("span");
  name.className = "pname";
  name.textContent = project.name;

  const where = document.createElement("span");
  where.className = "purl";
  where.textContent = project.live ? short(project.url) : `${short(project.url)} offline`;

  pick.append(dot, name, where);
  pick.addEventListener("click", () => config?.onPick(project.url, project));

  const drop = document.createElement("button");
  drop.className = "pforget";
  drop.title = `Forget ${project.name}`;
  drop.textContent = "×";
  drop.addEventListener("click", () => void forget(project));

  item.append(pick, drop);
  return item;
}

function render(): void {
  const live = projects.filter((p) => p.live).length;
  const badge = el<HTMLElement>("projectsBadge");
  badge.textContent = String(projects.length);
  badge.classList.toggle("has", live > 0);
  el<HTMLElement>("projectsCount").textContent = String(projects.length);

  const list = el<HTMLElement>("projectsList");
  list.textContent = "";
  for (const project of projects) list.appendChild(row(project));

  el<HTMLElement>("projectsEmpty").hidden = projects.length > 0;
  el<HTMLElement>("projectsHint").hidden = reachable;
}

/** Re-highlight the active row after the app loads a different URL. */
export function redrawProjects(): void {
  if (config) render();
}

export function initProjects(next: ProjectsConfig): void {
  config = next;

  el<HTMLButtonElement>("projectsBtn").addEventListener("click", () => {
    const panel = el<HTMLElement>("projectsPanel");
    panel.hidden = !panel.hidden;
    if (!panel.hidden) void poll();
  });
  el<HTMLButtonElement>("closeProjects").addEventListener("click", () => {
    el<HTMLElement>("projectsPanel").hidden = true;
  });

  render();
  void poll();
  window.setInterval(() => void poll(), POLL_MS);
  // Coming back to the tab after starting a dev server should feel immediate.
  window.addEventListener("focus", () => void poll());
}
