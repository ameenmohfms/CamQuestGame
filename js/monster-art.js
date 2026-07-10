/* CamQuest — procedural monster art.
   Monsters are drawn ONTO the detected person: game.js tints the person's
   own pixels, then this module paints features (eyes, mouth, bandages,
   fins, antennae…) positioned on their body. Also draws full synthetic
   bodies for Target Practice mode. */

const MonsterArt = (() => {
  // rough head geometry from a person bounding box (head ≈ top ~16% of body)
  function headOf(box) {
    const headH = Math.max(24, Math.min(box.h * 0.18, box.w * 0.95));
    const headW = Math.min(box.w * 0.6, headH * 1.25);
    return { cx: box.x + box.w / 2, top: box.y, headH, headW };
  }

  function drawFeatures(ctx, theme, box, t, seed = 0) {
    const h = headOf(box);
    // under-layers first so eyes/mouth glow on top
    if (theme.extras === "bandages") bandages(ctx, box, t, seed);
    if (theme.extras === "scars") scars(ctx, box, seed);
    if (theme.extras === "fin") fin(ctx, theme, h);
    if (theme.extras === "antennae") antennae(ctx, theme, h, t);
    eyes(ctx, theme, h, t, seed);
    mouth(ctx, theme, h, t);
  }

  /* ---- eyes ---- */
  function eyes(ctx, theme, h, t, seed) {
    const eyeY = h.top + h.headH * 0.5;
    const dx = h.headW * 0.22;
    const r = Math.max(3.5, h.headW * 0.12);
    const pulse = 1 + 0.12 * Math.sin(t * 3 + seed);

    for (const side of [-1, 1]) {
      const x = h.cx + side * dx;
      if (theme.eye.style === "almond") {
        // big black alien eyes with a glossy spec
        ctx.save();
        ctx.translate(x, eyeY);
        ctx.rotate(side * 0.5);
        ctx.beginPath();
        ctx.ellipse(0, 0, r * 1.9, r * 1.05, 0, 0, Math.PI * 2);
        ctx.fillStyle = "#0a0312";
        ctx.shadowColor = theme.eye.color;
        ctx.shadowBlur = 12 * pulse;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.ellipse(-r * 0.55, -r * 0.3, r * 0.35, r * 0.2, 0, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.fill();
        ctx.restore();
      } else {
        // sunken socket + glowing iris
        ctx.beginPath();
        ctx.ellipse(x, eyeY, r * 1.5, r * 1.25, 0, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(5, 10, 5, 0.6)";
        ctx.fill();
        const g = ctx.createRadialGradient(x, eyeY, 0, x, eyeY, r * pulse);
        g.addColorStop(0, "#ffffff");
        g.addColorStop(0.35, theme.eye.color);
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.beginPath();
        ctx.arc(x, eyeY, r * pulse, 0, Math.PI * 2);
        ctx.fillStyle = g;
        ctx.shadowColor = theme.eye.color;
        ctx.shadowBlur = 14;
        ctx.fill();
        ctx.shadowBlur = 0;
        // slit pupil
        ctx.fillStyle = "#000";
        ctx.fillRect(x - r * 0.08, eyeY - r * 0.55, r * 0.16, r * 1.1);
      }
    }
  }

  /* ---- mouths ---- */
  function mouth(ctx, theme, h, t) {
    const y = h.top + h.headH * 0.85;
    const w = h.headW * 0.5;
    ctx.save();
    ctx.lineCap = "round";

    if (theme.mouth === "jagged") {
      ctx.beginPath();
      const teeth = 5;
      for (let i = 0; i <= teeth; i++) {
        const x = h.cx - w / 2 + (w * i) / teeth;
        const yy = y + (i % 2 ? h.headH * 0.1 : 0);
        i ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy);
      }
      ctx.strokeStyle = "rgba(40, 8, 8, 0.9)";
      ctx.lineWidth = Math.max(2, h.headW * 0.06);
      ctx.stroke();
    } else if (theme.mouth === "stitch") {
      ctx.beginPath();
      ctx.moveTo(h.cx - w / 2, y);
      ctx.lineTo(h.cx + w / 2, y);
      ctx.strokeStyle = "rgba(45, 30, 10, 0.85)";
      ctx.lineWidth = Math.max(2, h.headW * 0.045);
      ctx.stroke();
      for (let i = 0; i < 4; i++) {
        const x = h.cx - w / 2 + w * (0.125 + i * 0.25);
        ctx.beginPath();
        ctx.moveTo(x, y - h.headH * 0.06);
        ctx.lineTo(x, y + h.headH * 0.06);
        ctx.stroke();
      }
    } else if (theme.mouth === "teeth") {
      // open shark maw with triangle teeth
      ctx.beginPath();
      ctx.ellipse(h.cx, y, w * 0.6, h.headH * 0.16, 0, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(20, 5, 8, 0.9)";
      ctx.fill();
      ctx.fillStyle = "#e8f2f5";
      const n = 5;
      for (let i = 0; i < n; i++) {
        const x = h.cx - w * 0.45 + (w * 0.9 * i) / (n - 1);
        ctx.beginPath();
        ctx.moveTo(x - w * 0.06, y - h.headH * 0.1);
        ctx.lineTo(x + w * 0.06, y - h.headH * 0.1);
        ctx.lineTo(x, y + h.headH * 0.04);
        ctx.closePath();
        ctx.fill();
      }
    } else { // small
      ctx.beginPath();
      ctx.moveTo(h.cx - w * 0.18, y);
      ctx.quadraticCurveTo(h.cx, y + h.headH * 0.08 * (1 + 0.4 * Math.sin(t * 2)), h.cx + w * 0.18, y);
      ctx.strokeStyle = "rgba(20, 5, 30, 0.8)";
      ctx.lineWidth = Math.max(2, h.headW * 0.04);
      ctx.stroke();
    }
    ctx.restore();
  }

  /* ---- theme extras ---- */
  function scars(ctx, box, seed) {
    ctx.save();
    ctx.strokeStyle = "rgba(90, 20, 20, 0.65)";
    ctx.lineWidth = Math.max(2, box.w * 0.015);
    ctx.lineCap = "round";
    const rnd = (i) => Math.abs(Math.sin(seed * 12.9898 + i * 78.233)) % 1;
    for (let i = 0; i < 3; i++) {
      const x = box.x + box.w * (0.25 + rnd(i) * 0.5);
      const y = box.y + box.h * (0.3 + rnd(i + 3) * 0.4);
      const len = box.w * 0.2;
      const a = rnd(i + 6) * Math.PI;
      ctx.beginPath();
      ctx.moveTo(x - Math.cos(a) * len / 2, y - Math.sin(a) * len / 2);
      ctx.lineTo(x + Math.cos(a) * len / 2, y + Math.sin(a) * len / 2);
      ctx.stroke();
      // cross ticks
      for (const f of [-0.2, 0.1, 0.35]) {
        const tx = x + Math.cos(a) * len * f, ty = y + Math.sin(a) * len * f;
        ctx.beginPath();
        ctx.moveTo(tx - Math.sin(a) * len * 0.12, ty + Math.cos(a) * len * 0.12);
        ctx.lineTo(tx + Math.sin(a) * len * 0.12, ty - Math.cos(a) * len * 0.12);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function bandages(ctx, box, t, seed) {
    ctx.save();
    ctx.fillStyle = "rgba(235, 225, 200, 0.55)";
    ctx.strokeStyle = "rgba(120, 100, 60, 0.35)";
    ctx.lineWidth = 1;
    const stripH = Math.max(6, box.h * 0.045);
    for (let y = box.y + stripH * 1.5; y < box.y + box.h; y += stripH * 1.9) {
      const tilt = Math.sin(seed + y * 0.05) * stripH * 0.6;
      ctx.beginPath();
      ctx.moveTo(box.x, y + tilt);
      ctx.lineTo(box.x + box.w, y - tilt);
      ctx.lineTo(box.x + box.w, y - tilt + stripH);
      ctx.lineTo(box.x, y + tilt + stripH);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  function fin(ctx, theme, h) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(h.cx - h.headW * 0.28, h.top + h.headH * 0.1);
    ctx.quadraticCurveTo(h.cx - h.headW * 0.05, h.top - h.headH * 0.9, h.cx + h.headW * 0.15, h.top - h.headH * 0.75);
    ctx.quadraticCurveTo(h.cx + h.headW * 0.1, h.top - h.headH * 0.2, h.cx + h.headW * 0.28, h.top + h.headH * 0.1);
    ctx.closePath();
    ctx.fillStyle = "rgba(70, 100, 120, 0.9)";
    ctx.shadowColor = theme.glow;
    ctx.shadowBlur = 10;
    ctx.fill();
    ctx.restore();
    // gill slits
    ctx.save();
    ctx.strokeStyle = "rgba(15, 35, 50, 0.7)";
    ctx.lineWidth = Math.max(2, h.headW * 0.035);
    ctx.lineCap = "round";
    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const x = h.cx + side * h.headW * (0.4 + i * 0.06);
        ctx.beginPath();
        ctx.moveTo(x, h.top + h.headH * 0.55);
        ctx.lineTo(x, h.top + h.headH * 0.8);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function antennae(ctx, theme, h, t) {
    ctx.save();
    ctx.strokeStyle = "rgba(90, 60, 160, 0.9)";
    ctx.lineWidth = Math.max(2, h.headW * 0.05);
    ctx.lineCap = "round";
    for (const side of [-1, 1]) {
      const x0 = h.cx + side * h.headW * 0.22;
      const sway = Math.sin(t * 2.4 + side) * h.headW * 0.1;
      const x1 = x0 + side * h.headW * 0.2 + sway;
      const y1 = h.top - h.headH * 0.55;
      ctx.beginPath();
      ctx.moveTo(x0, h.top + h.headH * 0.08);
      ctx.quadraticCurveTo(x0 + side * h.headW * 0.05, h.top - h.headH * 0.25, x1, y1);
      ctx.stroke();
      const g = ctx.createRadialGradient(x1, y1, 0, x1, y1, h.headW * 0.14);
      g.addColorStop(0, "#fff");
      g.addColorStop(0.4, theme.eye.color);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.beginPath();
      ctx.arc(x1, y1, h.headW * 0.14, 0, Math.PI * 2);
      ctx.fillStyle = g;
      ctx.fill();
    }
    ctx.restore();
  }

  /* ---- full synthetic body for Target Practice mode ---- */
  function drawDemoBody(ctx, theme, box, t, seed = 0) {
    const h = headOf(box);
    const sway = Math.sin(t * 1.6 + seed) * box.w * 0.03;
    ctx.save();
    ctx.translate(sway, 0);

    const grad = ctx.createLinearGradient(box.x, box.y, box.x, box.y + box.h);
    grad.addColorStop(0, theme.demoBody[0]);
    grad.addColorStop(1, theme.demoBody[1]);
    ctx.fillStyle = grad;
    ctx.shadowColor = theme.glow;
    ctx.shadowBlur = 18;

    // head
    ctx.beginPath();
    ctx.ellipse(h.cx, h.top + h.headH * 0.55, h.headW * 0.55, h.headH * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
    // torso: rounded blob with ragged bottom
    const ty = h.top + h.headH * 1.05;
    const tw = box.w * 0.78, th = box.y + box.h - ty;
    ctx.beginPath();
    ctx.moveTo(h.cx - tw / 2, ty + th * 0.18);
    ctx.quadraticCurveTo(h.cx, ty - th * 0.08, h.cx + tw / 2, ty + th * 0.18);
    ctx.lineTo(h.cx + tw * 0.42, ty + th * 0.92);
    for (let i = 4; i >= 0; i--) {
      const x = h.cx - tw * 0.42 + (tw * 0.84 * i) / 4;
      ctx.lineTo(x, ty + th * (i % 2 ? 0.85 : 0.98));
    }
    ctx.closePath();
    ctx.fill();
    // arms
    ctx.lineWidth = Math.max(6, box.w * 0.1);
    ctx.lineCap = "round";
    ctx.strokeStyle = theme.demoBody[0];
    const armY = ty + th * 0.22;
    const reach = Math.sin(t * 2 + seed) * box.h * 0.02;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(h.cx + side * tw * 0.4, armY);
      ctx.lineTo(h.cx + side * (tw * 0.62), armY + box.h * 0.12 + reach * side);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    ctx.restore();

    drawFeatures(ctx, theme, { ...box, x: box.x + sway }, t, seed);
  }

  return { drawFeatures, drawDemoBody, headOf };
})();
