export interface DevicePeekOptions {
  /** Label for the Projects list. Default: the project's package.json name. */
  name?: string;
  /** Register this address instead of the detected one, for tunnels or proxies. */
  url?: string;
  /** Inject the diagnostics agent into dev HTML. Default: true. */
  agent?: boolean;
}

/**
 * Registers the project with DevicePeek whenever its dev server starts, so it shows
 * up in the Projects list on its own. Dev only, and a no op in production builds.
 *
 * The return type is loose so the plugin drops into any Vite version's config without
 * needing vite as a dependency of this package.
 */
export default function devicepeek(options?: DevicePeekOptions): {
  name: string;
  apply: "serve";
  [key: string]: unknown;
};
