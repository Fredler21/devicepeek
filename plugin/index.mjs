/**
 * Node API for the DevicePeek registry, for build tools that are not Vite.
 *
 *   import { register } from "devicepeek";
 *   register({ name: "my-app", url: "http://localhost:3000" });
 */
export { forget, home, listProjects, projectId, readRegistry, register, registryFile, update } from "./registry.mjs";
export { default as vite } from "./vite.mjs";
