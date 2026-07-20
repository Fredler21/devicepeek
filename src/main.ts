import "./style.css";

/** A previewable device: CSS point dimensions plus phone frame styling hints. */
interface Device {
  name: string;
  w: number;
  h: number;
  island?: boolean;
  radius?: number;
  screenRadius?: number;
  bezel?: number;
}

type ViewMode = "both" | "phone" | "laptop";
interface Size {
  w: number;
  h: number;
}

const PHONES: Record<string, Device> = {
  iphone15pro: { name: "iPhone 15 Pro", w: 393, h: 852, island: true, radius: 52, screenRadius: 40, bezel: 13 },
  iphone15max: { name: "iPhone 15 Pro Max", w: 430, h: 932, island: true, radius: 56, screenRadius: 44, bezel: 14 },
  iphonese: { name: "iPhone SE", w: 375, h: 667, island: false, radius: 44, screenRadius: 30, bezel: 14 },
  pixel8: { name: "Pixel 8", w: 412, h: 915, island: false, radius: 44, screenRadius: 34, bezel: 12 },
  galaxys23: { name: "Galaxy S23", w: 360, h: 780, island: false, radius: 42, screenRadius: 32, bezel: 12 },
};

const LAPTOPS: Record<string, Device> = {
  macbookair: { name: 'MacBook Air 13"', w: 1280, h: 832 },
  laptop: { name: "Laptop 1366", w: 1366, h: 768 },
  desktop: { name: "Desktop 1440", w: 1440, h: 900 },
  small: { name: "Small 1024", w: 1024, h: 640 },
};

const DEFAULT_URL = "https://new-cleaning-apps.vercel.app";

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`DevicePeek: missing element #${id}`);
  return node as T;
}

const phoneSel = el<HTMLSelectElement>("phoneDev");
const laptopSel = el<HTMLSelectElement>("laptopDev");
const urlInput = el<HTMLInputElement>("url");
const phoneFrame = el<HTMLIFrameElement>("phoneFrame");
const laptopFrame = el<HTMLIFrameElement>("laptopFrame");
const stage = el<HTMLElement>("stage");

function populate(select: HTMLSelectElement, devices: Record<string, Device>): void {
  for (const [key, device] of Object.entries(devices)) {
    const option = document.createElement("option");
    option.value = key;
    option.textContent = device.name;
    select.appendChild(option);
  }
}
populate(phoneSel, PHONES);
populate(laptopSel, LAPTOPS);
phoneSel.value = "iphone15pro";
laptopSel.value = "macbookair";

let view: ViewMode = "both";
let landscape = false;

function normalize(raw: string): string {
  const u = (raw ?? "").trim();
  if (!u) return "";
  if (/^(localhost|127\.0\.0\.1|\d+\.\d+\.\d+\.\d+)/.test(u)) return "http://" + u;
  if (!/^https?:\/\//i.test(u)) return "https://" + u;
  return u;
}

function currentUrl(): string {
  return normalize(urlInput.value) || DEFAULT_URL;
}

function readStore(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeStore(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable — ignore */
  }
}

function loadUrl(raw: string): void {
  const url = normalize(raw);
  if (!url) return;
  urlInput.value = url;
  phoneFrame.src = url;
  laptopFrame.src = url;
  writeStore("dp_url", url);
}

function layoutPhone(): Size {
  const d = PHONES[phoneSel.value];
  let w = d.w;
  let h = d.h;
  if (landscape) [w, h] = [h, w];

  const phone = el<HTMLElement>("phone");
  const screenEl = el<HTMLElement>("pscreen");
  phone.style.borderRadius = `${d.radius}px`;
  phone.style.padding = `${d.bezel}px`;
  screenEl.style.width = `${w}px`;
  screenEl.style.height = `${h}px`;
  screenEl.style.borderRadius = `${d.screenRadius}px`;
  el<HTMLElement>("island").className = "island" + (!d.island || landscape ? " hidden" : "");
  el<HTMLElement>("phoneTag").textContent = `${d.name} (${w} × ${h})`;

  const bezel = d.bezel ?? 0;
  return { w: w + bezel * 2, h: h + bezel * 2 };
}

function layoutLaptop(): Size {
  const d = LAPTOPS[laptopSel.value];
  el<HTMLElement>("lscreen").style.width = `${d.w}px`;
  el<HTMLElement>("lscreen").style.height = `${d.h}px`;
  el<HTMLElement>("lbase").style.width = `${d.w + 64}px`;
  el<HTMLElement>("laptopTag").textContent = `${d.name} (${d.w} × ${d.h})`;
  return { w: d.w + 22, h: d.h + 22 + 15 };
}

function applyScale(id: string, scale: number, dim: Size): void {
  const node = el<HTMLElement>(id);
  node.style.transform = `scale(${scale.toFixed(3)})`;
  node.style.width = `${dim.w * scale}px`;
  node.style.height = `${dim.h * scale}px`;
}

function fit(): void {
  const showPhone = view === "both" || view === "phone";
  const showLaptop = view === "both" || view === "laptop";
  el<HTMLElement>("phoneDevice").style.display = showPhone ? "" : "none";
  el<HTMLElement>("laptopDevice").style.display = showLaptop ? "" : "none";

  const pDim = layoutPhone();
  const lDim = layoutLaptop();
  const gap = showPhone && showLaptop ? 56 : 0;
  const availH = stage.clientHeight - 80 - 34;
  const availW = stage.clientWidth - 80;

  let pScale = showPhone ? Math.min(1.15, availH / pDim.h) : 0;
  let lScale = showLaptop ? Math.min(1, availH / lDim.h) : 0;

  const combinedW = (showPhone ? pDim.w * pScale : 0) + (showLaptop ? lDim.w * lScale : 0) + gap;
  if (combinedW > availW) {
    const factor = availW / combinedW;
    pScale *= factor;
    lScale *= factor;
  }
  applyScale("phoneScaler", pScale, pDim);
  applyScale("laptopScaler", lScale, lDim);
}

// ---- events ----
el<HTMLFormElement>("urlform").addEventListener("submit", (e) => {
  e.preventDefault();
  loadUrl(urlInput.value);
});

el<HTMLElement>("view").addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("button");
  if (!btn || !btn.dataset.view) return;
  view = btn.dataset.view as ViewMode;
  document.querySelectorAll<HTMLButtonElement>("#view button").forEach((x) => x.classList.toggle("on", x === btn));
  fit();
});

phoneSel.addEventListener("change", fit);
laptopSel.addEventListener("change", fit);
el<HTMLButtonElement>("rotate").addEventListener("click", () => {
  landscape = !landscape;
  fit();
});
el<HTMLButtonElement>("reload").addEventListener("click", () => {
  const u = currentUrl();
  phoneFrame.src = u;
  laptopFrame.src = u;
});
el<HTMLButtonElement>("openTab").addEventListener("click", () => window.open(currentUrl(), "_blank", "noopener"));
el<HTMLAnchorElement>("noteOpen").addEventListener("click", (e) => {
  e.preventDefault();
  window.open(currentUrl(), "_blank", "noopener");
});
el<HTMLButtonElement>("stageToggle").addEventListener("click", () => {
  const root = document.documentElement;
  root.dataset.stage = root.dataset.stage === "light" ? "dark" : "light";
  writeStore("dp_stage", root.dataset.stage);
});
window.addEventListener("resize", fit);

// ---- init ----
document.documentElement.dataset.stage = readStore("dp_stage") ?? "dark";
// A ?url= query param wins, so preview links are shareable (e.g. ?url=example.com).
const paramUrl = new URLSearchParams(location.search).get("url");
loadUrl(paramUrl ?? readStore("dp_url") ?? DEFAULT_URL);
fit();
