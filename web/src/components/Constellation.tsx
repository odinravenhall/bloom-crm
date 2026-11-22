"use client";

import { useEffect, useRef } from "react";

/**
 * Décor « Constellation » : des points qui dérivent et se relient quand ils sont proches ; la souris les attire et se relie à eux.
 * Ne tourne que si ce décor est choisi, onglet visible, sans mode Optimisation ni « mouvements réduits ».
 * `preview` : miniature des réglages (toujours animée, taille fixe 1600×900 réduite par le parent).
 */
export function Constellation({ preview = false }: { preview?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    const html = document.documentElement;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let W = 0;
    let H = 0;
    let raf = 0;
    let running = false;
    let color = "#ec3654";
    let lastColor = 0;
    const mouse = { x: -9999, y: -9999 };
    type P = { x: number; y: number; vx: number; vy: number; r: number };
    let pts: P[] = [];

    const size = () => {
      const dpr = preview ? 1 : Math.min(window.devicePixelRatio || 1, 2);
      W = preview ? 1600 : window.innerWidth;
      H = preview ? 900 : window.innerHeight;
      c.width = Math.round(W * dpr);
      c.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.max(40, Math.min(120, Math.round((W * H) / 15000)));
      while (pts.length < n) pts.push({ x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - 0.5) * 0.6, vy: (Math.random() - 0.5) * 0.6, r: 1 + Math.random() * 1.6 });
      pts = pts.slice(0, n);
    };

    const active = () =>
      (preview || html.dataset.decor === "constellation") &&
      !document.hidden &&
      !reduced.matches &&
      !html.classList.contains("perf-noanim") &&
      !html.classList.contains("perf-lite");

    const LINK = 140;
    const frame = (t: number) => {
      if (!active()) {
        running = false;
        return;
      }
      if (t - lastColor > 1000) {
        color = getComputedStyle(html).getPropertyValue("--color-primary").trim() || color;
        lastColor = t;
      }
      ctx.clearRect(0, 0, W, H);
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      for (const p of pts) {
        // Attirés doucement par la souris
        const mx = mouse.x - p.x;
        const my = mouse.y - p.y;
        const md = Math.hypot(mx, my);
        if (md < 220 && md > 1) {
          p.vx += (mx / md) * 0.02;
          p.vy += (my / md) * 0.02;
        }
        const sp = Math.hypot(p.vx, p.vy);
        if (sp > 0.9) {
          p.vx *= 0.9 / sp;
          p.vy *= 0.9 / sp;
        }
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < -20) p.x = W + 20;
        if (p.x > W + 20) p.x = -20;
        if (p.y < -20) p.y = H + 20;
        if (p.y > H + 20) p.y = -20;
      }
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        for (let j = i + 1; j < pts.length; j++) {
          const b = pts[j];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < LINK) {
            ctx.globalAlpha = (1 - d / LINK) * 0.45;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
        const dm = Math.hypot(a.x - mouse.x, a.y - mouse.y);
        if (dm < 200) {
          ctx.globalAlpha = (1 - dm / 200) * 0.7;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(mouse.x, mouse.y);
          ctx.stroke();
        }
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.arc(a.x, a.y, a.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(frame);
    };
    const start = () => {
      if (running || !active()) return;
      running = true;
      raf = requestAnimationFrame(frame);
    };

    const onMove = (e: PointerEvent) => {
      if (preview) {
        const r = c.getBoundingClientRect();
        mouse.x = ((e.clientX - r.left) / r.width) * W;
        mouse.y = ((e.clientY - r.top) / r.height) * H;
      } else {
        mouse.x = e.clientX;
        mouse.y = e.clientY;
      }
    };
    const onLeave = () => {
      mouse.x = -9999;
      mouse.y = -9999;
    };

    size();
    start();
    const mo = new MutationObserver(start);
    mo.observe(html, { attributes: true, attributeFilter: ["data-decor", "class"] });
    const onResize = () => !preview && size();
    window.addEventListener("resize", onResize);
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    document.addEventListener("visibilitychange", start);
    reduced.addEventListener?.("change", start);
    return () => {
      cancelAnimationFrame(raf);
      mo.disconnect();
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("visibilitychange", start);
      reduced.removeEventListener?.("change", start);
    };
  }, [preview]);

  return <canvas ref={ref} className="cn-canvas" />;
}
