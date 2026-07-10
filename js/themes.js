/* CamQuest — game modes: monsters + background world themes.
   Each theme paints ambience on the fx canvas (behind monsters) and
   defines how its monster looks. Camera grading is a CSS filter on the video. */

const THEMES = {
  zombie: {
    name: "Zombie Outbreak",
    monster: "🧟",
    monsterName: "Zombie",
    glow: "rgba(66, 245, 123, 0.85)",
    camFilter: "saturate(0.55) contrast(1.15) sepia(0.25) hue-rotate(50deg)",
    tint: "rgba(30, 60, 30, 0.18)",
    particles: { emoji: null, color: "rgba(160, 255, 170, 0.5)", count: 26, rise: true }, // toxic motes
    horizon: null,
    fog: "rgba(70, 100, 70, 0.16)",
  },
  egypt: {
    name: "Pharaoh's Curse",
    monster: "🧟‍♂️",
    monsterEmblem: "𓂀",
    monsterName: "Mummy",
    glow: "rgba(255, 201, 77, 0.9)",
    camFilter: "sepia(0.65) saturate(1.3) contrast(1.1) brightness(1.05)",
    tint: "rgba(200, 150, 50, 0.14)",
    particles: { emoji: null, color: "rgba(255, 220, 150, 0.55)", count: 40, rise: false }, // drifting sand
    horizon: "pyramids",
    fog: "rgba(220, 180, 100, 0.12)",
  },
  space: {
    name: "Alien Invasion",
    monster: "👾",
    monsterName: "Alien",
    glow: "rgba(170, 120, 255, 0.9)",
    camFilter: "saturate(1.2) contrast(1.25) brightness(0.8) hue-rotate(200deg)",
    tint: "rgba(30, 15, 70, 0.28)",
    particles: { emoji: null, color: "rgba(255, 255, 255, 0.8)", count: 60, rise: false, twinkle: true }, // stars
    horizon: "planets",
    fog: null,
  },
  sea: {
    name: "Shark Waters",
    monster: "🦈",
    monsterName: "Shark",
    glow: "rgba(0, 210, 255, 0.9)",
    camFilter: "saturate(1.15) contrast(1.05) brightness(0.9) hue-rotate(160deg)",
    tint: "rgba(0, 80, 130, 0.3)",
    particles: { emoji: null, color: "rgba(200, 240, 255, 0.6)", count: 30, rise: true, bubble: true },
    horizon: "rays",
    fog: "rgba(0, 60, 100, 0.15)",
  },
};

/* ---- Ambience renderer (fx canvas, behind monsters) ---- */
class Ambience {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.parts = [];
    this.theme = null;
  }

  setTheme(theme, enabled) {
    this.theme = enabled ? theme : null;
    this.parts = [];
    if (!this.theme) return;
    const p = this.theme.particles;
    for (let i = 0; i < p.count; i++) {
      this.parts.push({
        x: Math.random(), y: Math.random(),
        r: 1 + Math.random() * (p.bubble ? 5 : 2.5),
        vx: (Math.random() - 0.5) * (p.rise ? 0.02 : 0.08),
        vy: p.rise ? -(0.02 + Math.random() * 0.05) : (Math.random() - 0.5) * 0.015,
        tw: Math.random() * Math.PI * 2,
      });
    }
  }

  resize(w, h) {
    this.canvas.width = w;
    this.canvas.height = h;
  }

  draw(dt, t) {
    const { ctx, canvas, theme } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!theme) return;
    const W = canvas.width, H = canvas.height;

    // color wash
    ctx.fillStyle = theme.tint;
    ctx.fillRect(0, 0, W, H);

    // horizon set-dressing
    if (theme.horizon === "pyramids") this.pyramids(W, H);
    if (theme.horizon === "planets") this.planets(W, H, t);
    if (theme.horizon === "rays") this.rays(W, H, t);

    // fog band
    if (theme.fog) {
      const g = ctx.createLinearGradient(0, H * 0.55, 0, H);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(1, theme.fog);
      ctx.fillStyle = g;
      ctx.fillRect(0, H * 0.55, W, H * 0.45);
    }

    // particles
    const p = theme.particles;
    ctx.fillStyle = p.color;
    for (const q of this.parts) {
      q.x += q.vx * dt; q.y += q.vy * dt; q.tw += dt * 2;
      if (q.x < -0.05) q.x = 1.05; if (q.x > 1.05) q.x = -0.05;
      if (q.y < -0.05) q.y = 1.05; if (q.y > 1.05) q.y = -0.05;
      const alpha = p.twinkle ? 0.3 + 0.7 * Math.abs(Math.sin(q.tw)) : 1;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(q.x * W, q.y * H, q.r, 0, Math.PI * 2);
      ctx.fill();
      if (p.bubble) {
        ctx.globalAlpha = alpha * 0.4;
        ctx.strokeStyle = p.color;
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  pyramids(W, H) {
    const ctx = this.ctx;
    const base = H * 0.9;
    ctx.fillStyle = "rgba(120, 85, 30, 0.35)";
    const py = (cx, w, h) => {
      ctx.beginPath();
      ctx.moveTo(cx - w / 2, base);
      ctx.lineTo(cx, base - h);
      ctx.lineTo(cx + w / 2, base);
      ctx.closePath();
      ctx.fill();
    };
    py(W * 0.15, W * 0.36, H * 0.22);
    py(W * 0.85, W * 0.44, H * 0.28);
    // sun disc
    const g = ctx.createRadialGradient(W * 0.5, H * 0.12, 0, W * 0.5, H * 0.12, W * 0.18);
    g.addColorStop(0, "rgba(255, 210, 120, 0.5)");
    g.addColorStop(1, "rgba(255, 210, 120, 0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H * 0.45);
  }

  planets(W, H, t) {
    const ctx = this.ctx;
    // nebula
    const g = ctx.createRadialGradient(W * 0.8, H * 0.2, 0, W * 0.8, H * 0.2, W * 0.5);
    g.addColorStop(0, "rgba(140, 80, 255, 0.28)");
    g.addColorStop(1, "rgba(140, 80, 255, 0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // drifting planet
    const px = W * (0.15 + 0.03 * Math.sin(t * 0.2));
    ctx.beginPath();
    ctx.arc(px, H * 0.15, W * 0.06, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 130, 90, 0.55)";
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(px, H * 0.15, W * 0.1, W * 0.02, -0.35, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255, 200, 150, 0.5)";
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  rays(W, H, t) {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (let i = 0; i < 4; i++) {
      const x = W * (0.15 + i * 0.25) + Math.sin(t * 0.4 + i) * 30;
      const g = ctx.createLinearGradient(x, 0, x + W * 0.12, H);
      g.addColorStop(0, "rgba(150, 230, 255, 0.16)");
      g.addColorStop(1, "rgba(150, 230, 255, 0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + W * 0.1, 0);
      ctx.lineTo(x + W * 0.28, H);
      ctx.lineTo(x + W * 0.06, H);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
}
