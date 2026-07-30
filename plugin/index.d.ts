export interface Project {
  /** Stable id derived from the project folder and its name. */
  id: string;
  name: string;
  url: string;
  root: string;
  /** How it was registered, for example "vite" or "manual". */
  via: string;
  pid: number;
  addedAt: number;
  seenAt: number;
}

export interface Registry {
  version: number;
  projects: Project[];
}

export interface RegisterInput {
  url: string;
  name?: string;
  /** Project folder, default process.cwd(). */
  root?: string;
  via?: string;
  pid?: number;
}

export declare function home(): string;
export declare function registryFile(): string;
export declare function projectId(root: string, name?: string): string;
export declare function readRegistry(): Registry;
export declare function listProjects(): Project[];
export declare function update(mutator: (registry: Registry) => Registry | void): Registry;
export declare function register(entry: RegisterInput): Project;
export declare function forget(idOrName: string): Project[];

export { default as vite } from "./vite.js";
