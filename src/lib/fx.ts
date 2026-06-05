// Canvas particle engine — optimized for low-end Android.
// Key perf choices: pre-rendered sprites (no per-frame gradients, no shadowBlur),
// capped DPR, fewer particles + lower pixel ratio on weak devices, rAF only runs
// while particles exist. Stamping a cached sprite with drawImage is GPU-cheap.

type Kind = "coin" | "spark";
interface P {
  x: number; y: number; vx: number; vy: number; tx: number; ty: number;
  kind: Kind; r: number; rot: number; vr: number; hover: number;
  homing: boolean; landed: boolean; alpha: number; onLand?: () => void;
}

let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let dpr = 1, W = 0, H = 0;
let particles: P[] = [];
let raf = 0, running = false;
let lowEnd = false;
let coinSprite: HTMLCanvasElement | null = null;
let sparkSprite: HTMLCanvasElement | null = null;

const reduce = () =>
  typeof window !== "undefined" && window.matchMedia &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function detectLowEnd() {
  try {
    const nav = navigator as Navigator & { deviceMemory?: number };
    lowEnd = (nav.hardwareConcurrency || 8) <= 4 || (nav.deviceMemory || 8) <= 4;
  } catch { lowEnd = false; }
}

function makeSprite(size: number, draw: (x: CanvasRenderingContext2D, s: number) => void) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const x = c.getContext("2d");
  if (x) draw(x, size);
  return c;
}

function buildSprites() {
  coinSprite = makeSprite(40, (x, s) => {
    const r = s / 2;
    const g = x.createRadialGradient(r * 0.62, r * 0.55, 1, r, r, r);
    g.addColorStop(0, "#fff7c8"); g.addColorStop(0.45, "#ffd24a");
    g.addColorStop(0.82, "#e6951a"); g.addColorStop(1, "rgba(230,149,26,0)");
    x.fillStyle = g; x.beginPath(); x.arc(r, r, r, 0, Math.PI * 2); x.fill();
  });
  sparkSprite = makeSprite(22, (x, s) => {
    const r = s / 2;
    const g = x.createRadialGradient(r, r, 0, r, r, r);
    g.addColorStop(0, "rgba(255,243,190,1)"); g.addColorStop(0.4, "rgba(255,214,95,.8)");
    g.addColorStop(1, "rgba(255,214,95,0)");
    x.fillStyle = g; x.beginPath(); x.arc(r, r, r, 0, Math.PI * 2); x.fill();
  });
}

let ready = false;

export function registerCanvas(c: HTMLCanvasElement) {
  // PERF: store the ref only. Defer the heavy getContext + sprite build + full-viewport
  // backing-store allocation to the first burst (ensureReady). On the LIGHT/compliant
  // model the canvas is never used → never allocates; on HIGH it's off the load path
  // (the intro burst is itself deferred to idle), so first paint stays smooth.
  canvas = c;
}

function ensureReady() {
  if (ready || !canvas) return;
  ctx = canvas.getContext("2d");
  detectLowEnd();
  buildSprites();
  ready = true;
  resize();
}

export function resize() {
  if (!ready || !canvas || typeof window === "undefined") return;
  dpr = Math.min(window.devicePixelRatio || 1, lowEnd ? 1 : 1.5);
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = Math.floor(W * dpr); canvas.height = Math.floor(H * dpr);
  canvas.style.width = W + "px"; canvas.style.height = H + "px";
  if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

// Pre-warm during idle (HIGH model): allocate the canvas + build sprites + force the
// one-time sprite GPU upload (off-screen draw, then clear) so the FIRST real coin burst
// (e.g. the first tap) is smooth instead of paying cold-start costs mid-animation.
export function warmUp() {
  ensureReady();
  if (!ctx || !coinSprite || !sparkSprite) return;
  ctx.drawImage(coinSprite, -200, -200);
  ctx.drawImage(sparkSprite, -200, -200);
  ctx.clearRect(0, 0, W, H);
}

function loop() {
  if (!ctx) { running = false; return; }
  ctx.clearRect(0, 0, W, H);
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    if (!p.homing) {
      p.hover -= 1; p.vy += 0.45; p.x += p.vx; p.y += p.vy; p.vx *= 0.99; p.vy *= 0.99;
      if (p.hover <= 0) p.homing = true;
    } else {
      const dx = p.tx - p.x, dy = p.ty - p.y;
      const dist = Math.hypot(dx, dy) || 1;
      const speed = Math.min(38, 6 + dist * 0.18);
      p.vx = p.vx * 0.55 + (dx / dist) * speed * 0.45;
      p.vy = p.vy * 0.55 + (dy / dist) * speed * 0.45;
      p.x += p.vx; p.y += p.vy;
      if (dist < 26) { p.landed = true; if (p.onLand) p.onLand(); }
    }
    p.rot += p.vr;
    if (p.landed) { particles.splice(i, 1); continue; }
    if (p.y > H + 80 || p.x < -100 || p.x > W + 100) { particles.splice(i, 1); continue; }

    const sprite = p.kind === "coin" ? coinSprite : sparkSprite;
    if (!sprite) continue;
    const sz = p.r * 2;
    ctx.save();
    ctx.translate(p.x, p.y);
    if (p.kind === "coin") {
      const sx = Math.abs(Math.cos(p.rot)) * 0.78 + 0.22; // 3D spin
      ctx.scale(sx, 1);
    } else {
      ctx.globalAlpha = p.alpha;
    }
    ctx.drawImage(sprite, -p.r, -p.r, sz, sz);
    ctx.restore();
  }
  if (particles.length > 0) raf = requestAnimationFrame(loop);
  else { running = false; ctx.clearRect(0, 0, W, H); }
}

function ensureRunning() { if (running || !ctx) return; running = true; raf = requestAnimationFrame(loop); }

export interface BurstOpts {
  fromX: number; fromY: number; toX: number; toY: number;
  count?: number; onLand?: () => void; intense?: boolean;
}

export function coinBurst(o: BurstOpts) {
  ensureReady();
  const want = o.count ?? 14;
  if (!ctx || reduce()) { if (o.onLand) for (let i = 0; i < want; i++) o.onLand(); return; }
  const n = Math.max(6, Math.round(want * (lowEnd ? 0.55 : 1)));
  for (let i = 0; i < n; i++) {
    const ang = Math.random() * Math.PI * 2;
    const power = 5 + Math.random() * (o.intense ? 16 : 11);
    const isCoin = Math.random() < 0.72;
    particles.push({
      x: o.fromX, y: o.fromY,
      vx: Math.cos(ang) * power, vy: Math.sin(ang) * power - (4 + Math.random() * 4),
      tx: o.toX + (Math.random() - 0.5) * 30, ty: o.toY + (Math.random() - 0.5) * 20,
      kind: isCoin ? "coin" : "spark",
      r: isCoin ? 9 + Math.random() * 6 : 4 + Math.random() * 4,
      rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.5,
      hover: 14 + Math.floor(Math.random() * 14) + (o.intense ? 8 : 0),
      homing: false, landed: false, alpha: 1, onLand: o.onLand,
    });
  }
  ensureRunning();
}

export function shower(intense = false) {
  ensureReady();
  if (!ctx || reduce()) return;
  const n = lowEnd ? (intense ? 36 : 22) : (intense ? 80 : 48);
  for (let i = 0; i < n; i++) {
    const isCoin = Math.random() < 0.5;
    particles.push({
      x: Math.random() * W, y: -20 - Math.random() * 80,
      vx: (Math.random() - 0.5) * 3, vy: 2 + Math.random() * 4,
      tx: 0, ty: 0, kind: isCoin ? "coin" : "spark",
      r: isCoin ? 9 + Math.random() * 6 : 5 + Math.random() * 4,
      rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.6,
      hover: 9999, homing: false, landed: false, alpha: 1,
    });
  }
  ensureRunning();
  window.setTimeout(() => { particles = particles.filter((p) => p.homing || p.onLand); }, 3500);
}
