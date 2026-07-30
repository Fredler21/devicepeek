/** Looks up a required element, failing loudly if the markup and the code drift apart. */
export function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`DevicePeek: missing element #${id}`);
  return node as T;
}
