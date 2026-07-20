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
  watchFrame("phone");
  watchFrame("laptop");
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

// ---- diagnostics ----
type LoadState = "loading" | "loaded" | "timeout";
type Frame = "phone" | "laptop";
interface Issue {
  device: Frame;
  level: "error" | "warn";
  type: string;
  message: string;
  at?: string;
}

// Paste-into-your-site agent. Reports errors, broken assets, and overflow to DevicePeek.
const AGENT_SNIPPET = `<script>
(function(){var T="devicepeek-agent";function s(o){try{parent.postMessage(Object.assign({source:T,url:location.href},o),"*")}catch(e){}}
s({type:"ready"});
addEventListener("error",function(e){var t=e.target||{};if(t.tagName==="IMG"||t.tagName==="SCRIPT"||t.tagName==="LINK"){s({type:"resource",level:"error",message:(t.tagName==="IMG"?"Broken image: ":"Failed to load: ")+(t.src||t.href||"")});}else{s({type:"js",level:"error",message:e.message,at:(e.filename||"")+":"+(e.lineno||"")});}},true);
addEventListener("unhandledrejection",function(e){var r=e.reason;s({type:"promise",level:"error",message:"Unhandled rejection: "+(r&&r.message?r.message:String(r))});});
["error","warn"].forEach(function(k){var o=console[k];console[k]=function(){s({type:"console",level:k==="warn"?"warn":"error",message:[].map.call(arguments,String).join(" ")});o.apply(console,arguments);};});
function of(){var e=document.documentElement;if(e.scrollWidth>e.clientWidth+2){s({type:"layout",level:"warn",message:"Horizontal overflow: content "+e.scrollWidth+"px in a "+e.clientWidth+"px viewport"});}}
addEventListener("load",of);addEventListener("resize",function(){clearTimeout(window.__dpof);window.__dpof=setTimeout(of,300);});
})();
<\/script>`;

const loadTimers: Record<Frame, number> = { phone: 0, laptop: 0 };
const issues: Issue[] = [];

function setStatus(device: Frame, state: LoadState): void {
  const chip = el<HTMLElement>(device === "phone" ? "phoneStatus" : "laptopStatus");
  chip.className = "statuschip " + state;
  chip.textContent = state === "loading" ? "Loading" : state === "loaded" ? "Loaded" : "No response";
}

function setAgent(device: Frame, on: boolean): void {
  const chip = el<HTMLElement>(device === "phone" ? "agentPhone" : "agentLaptop");
  chip.textContent = `${device === "phone" ? "Phone" : "Laptop"} agent: ${on ? "on" : "off"}`;
  chip.classList.toggle("on", on);
}

function watchFrame(device: Frame): void {
  const frame = device === "phone" ? phoneFrame : laptopFrame;
  setStatus(device, "loading");
  setAgent(device, false);
  window.clearTimeout(loadTimers[device]);
  loadTimers[device] = window.setTimeout(() => setStatus(device, "timeout"), 8000);
  frame.onload = () => {
    window.clearTimeout(loadTimers[device]);
    setStatus(device, "loaded");
  };
}

function renderIssues(): void {
  const badge = el<HTMLElement>("issuesBadge");
  badge.textContent = String(issues.length);
  badge.classList.toggle("has", issues.length > 0);
  el<HTMLElement>("issuesCount").textContent = String(issues.length);

  const list = el<HTMLElement>("issuesList");
  el<HTMLElement>("issuesEmpty").hidden = issues.length > 0;
  list.textContent = "";
  for (const it of issues.slice().reverse()) {
    const row = document.createElement("li");
    row.className = "irow " + it.level;
    const dev = document.createElement("span");
    dev.className = "idev";
    dev.textContent = it.device === "phone" ? "Phone" : "Laptop";
    const type = document.createElement("span");
    type.className = "itype";
    type.textContent = it.type;
    const msg = document.createElement("span");
    msg.className = "imsg";
    msg.textContent = it.at ? `${it.message}  (${it.at})` : it.message;
    row.append(dev, type, msg);
    list.appendChild(row);
  }
}

function addIssue(it: Issue): void {
  issues.push(it);
  if (issues.length > 200) issues.shift();
  renderIssues();
}

// Messages from the opt-in agent. Only trusted by our tag, and rendered as text.
window.addEventListener("message", (e: MessageEvent) => {
  const data = e.data as Record<string, unknown> | null;
  if (!data || data.source !== "devicepeek-agent") return;
  const device: Frame | null =
    e.source === phoneFrame.contentWindow ? "phone" : e.source === laptopFrame.contentWindow ? "laptop" : null;
  if (!device) return;
  if (data.type === "ready") {
    setAgent(device, true);
    return;
  }
  addIssue({
    device,
    level: data.level === "warn" ? "warn" : "error",
    type: String(data.type ?? "issue"),
    message: String(data.message ?? "").slice(0, 500),
    at: data.at ? String(data.at).slice(0, 200) : undefined,
  });
});

el<HTMLButtonElement>("issuesBtn").addEventListener("click", () => {
  const panel = el<HTMLElement>("issuesPanel");
  panel.hidden = !panel.hidden;
});
el<HTMLButtonElement>("closePanel").addEventListener("click", () => {
  el<HTMLElement>("issuesPanel").hidden = true;
});
el<HTMLButtonElement>("clearIssues").addEventListener("click", () => {
  issues.length = 0;
  renderIssues();
});
el<HTMLButtonElement>("copySnippet").addEventListener("click", async () => {
  const box = el<HTMLTextAreaElement>("snippetBox");
  try {
    await navigator.clipboard.writeText(box.value);
  } catch {
    box.select();
    document.execCommand("copy");
  }
  const btn = el<HTMLButtonElement>("copySnippet");
  btn.textContent = "Copied";
  window.setTimeout(() => (btn.textContent = "Copy"), 1200);
});

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
el<HTMLButtonElement>("stageToggle").addEventListener("click", () => {
  const root = document.documentElement;
  root.dataset.stage = root.dataset.stage === "light" ? "dark" : "light";
  writeStore("dp_stage", root.dataset.stage);
});
window.addEventListener("resize", fit);

// ---- init ----
document.documentElement.dataset.stage = readStore("dp_stage") ?? "dark";
el<HTMLTextAreaElement>("snippetBox").value = AGENT_SNIPPET;
renderIssues();
// A ?url= query param wins, so preview links are shareable (e.g. ?url=example.com).
const paramUrl = new URLSearchParams(location.search).get("url");
loadUrl(paramUrl ?? readStore("dp_url") ?? DEFAULT_URL);
fit();
