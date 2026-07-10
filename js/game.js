/* CamQuest — core game: camera, person detection, monsters, shooting. */

const Game = (() => {
  // DOM
  const video = document.getElementById("cam");
  const gameCanvas = document.getElementById("game-canvas");
  const fxCanvas = document.getElementById("fx-canvas");
  const gctx = gameCanvas.getContext("2d");
  const hud = document.getElementById("hud");
  const loadingEl = document.getElementById("loading");
  const loadingText = document.getElementById("loading-text");
  const scoreEl = document.getElementById("hud-score");
  const timerEl = document.getElementById("hud-timer");
  const ammoEl = document.getElementById("hud-ammo");
  const reloadBtn = document.getElementById("btn-reload");
  const gameoverEl = document.getElementById("gameover");

  const ambience = new Ambience(fxCanvas);
  const tracker = new PersonTracker();

  const CLIP_SIZE = 8;
  const RELOAD_MS = 1000;

  let model = null;          // coco-ssd, loaded once
  let modelLoading = null;
  let stream = null;
  let running = false;
  let rafId = 0;
  let theme = THEMES.zombie;
  let demoMode = false;      // no camera/model → simulated targets

  const state = {
    score: 0, kills: 0, shots: 0, hits: 0,
    ammo: CLIP_SIZE, reloading: false,
    endsAt: 0, lastFrame: 0, elapsed: 0,
  };

  let effects = [];          // muzzle rings, explosions, score popups
  let demoTargets = [];

  /* ---------- boot ---------- */

  async function start(modeKey) {
    theme = THEMES[modeKey] || THEMES.zombie;
    demoMode = false;
    loadingEl.classList.remove("hidden");
    gameoverEl.classList.add("hidden");
    hud.classList.add("hidden");

    loadingText.textContent = "Opening camera…";
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      video.srcObject = stream;
      await new Promise((res) => {
        if (video.readyState >= 2) return res();
        video.onloadedmetadata = () => res();
      });
      await video.play().catch(() => {});
    } catch (err) {
      console.warn("Camera unavailable, using target practice mode:", err);
      demoMode = true;
    }

    if (!demoMode) {
      loadingText.textContent = "Loading monster AI… (first time takes a moment)";
      try {
        if (!model) {
          modelLoading = modelLoading || cocoSsd.load({ base: "lite_mobilenet_v2" });
          model = await modelLoading;
        }
      } catch (err) {
        console.warn("Model failed to load, using target practice mode:", err);
        demoMode = true;
      }
    }

    if (demoMode) {
      stopStream();
      video.srcObject = null;
      loadingText.textContent = "No camera — starting Target Practice";
      await new Promise((r) => setTimeout(r, 900));
      seedDemoTargets();
    }

    // reset round
    const s = Settings.get();
    Object.assign(state, {
      score: 0, kills: 0, shots: 0, hits: 0,
      ammo: CLIP_SIZE, reloading: false,
      endsAt: performance.now() + s.roundSec * 1000,
      lastFrame: performance.now(), elapsed: 0,
    });
    tracker.reset();
    effects = [];

    video.style.filter = s.themeOn && !demoMode ? theme.camFilter : "none";
    ambience.setTheme(theme, s.themeOn || demoMode); // demo mode always themed (it IS the backdrop)

    resize();
    renderAmmo();
    scoreEl.textContent = "0";
    loadingEl.classList.add("hidden");
    hud.classList.remove("hidden");

    running = true;
    detectLoop();
    state.lastFrame = performance.now();
    rafId = requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(rafId);
    stopStream();
    video.srcObject = null;
    video.style.filter = "none";
    hud.classList.add("hidden");
    gameoverEl.classList.add("hidden");
  }

  function stopStream() {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }
  }

  /* ---------- detection ---------- */

  async function detectLoop() {
    while (running) {
      const now = performance.now();
      let detections = [];

      if (demoMode) {
        detections = stepDemoTargets(now);
      } else if (model && video.videoWidth) {
        try {
          const preds = await model.detect(video);
          const vw = video.videoWidth, vh = video.videoHeight;
          detections = preds
            .filter((p) => p.class === "person" && p.score > 0.45)
            .map((p) => ({
              x: p.bbox[0] / vw, y: p.bbox[1] / vh,
              w: p.bbox[2] / vw, h: p.bbox[3] / vh,
            }));
        } catch (_) { /* skip frame */ }
      }

      const s = Settings.get();
      tracker.update(detections, now, {
        maxHp: s.monsterHp,
        respawnMs: s.respawnSec * 1000,
        onRespawn: (tr) => {
          SFX.respawn();
          popup(trCenterX(tr), trTopY(tr), `${theme.monsterName} returned!`, "#ff7b7b");
        },
      });

      // detection cadence: keep CPU/battery sane, rendering interpolates
      await new Promise((r) => setTimeout(r, demoMode ? 33 : 120));
    }
  }

  /* ---------- demo targets (no-camera fallback) ---------- */

  function seedDemoTargets() {
    demoTargets = [];
    for (let i = 0; i < 3; i++) {
      demoTargets.push({
        x: 0.15 + Math.random() * 0.6, y: 0.25 + Math.random() * 0.4,
        vx: (Math.random() - 0.5) * 0.1, vy: (Math.random() - 0.5) * 0.05,
        w: 0.2, h: 0.42,
      });
    }
  }

  function stepDemoTargets(now) {
    const dt = 0.033;
    for (const t of demoTargets) {
      t.x += t.vx * dt; t.y += t.vy * dt;
      if (t.x < 0.02 || t.x + t.w > 0.98) t.vx *= -1;
      if (t.y < 0.05 || t.y + t.h > 0.95) t.vy *= -1;
    }
    return demoTargets.map((t) => ({ x: t.x, y: t.y, w: t.w, h: t.h }));
  }

  /* ---------- coordinates (video uses object-fit: cover) ---------- */

  function videoToScreen(nx, ny) {
    const W = gameCanvas.width, H = gameCanvas.height;
    if (demoMode || !video.videoWidth) return { x: nx * W, y: ny * H, scale: 1 };
    const vw = video.videoWidth, vh = video.videoHeight;
    const scale = Math.max(W / vw, H / vh);
    return {
      x: nx * vw * scale + (W - vw * scale) / 2,
      y: ny * vh * scale + (H - vh * scale) / 2,
      scale,
    };
  }

  function trackScreenBox(tr) {
    const a = videoToScreen(tr.smooth.x, tr.smooth.y);
    const b = videoToScreen(tr.smooth.x + tr.smooth.w, tr.smooth.y + tr.smooth.h);
    return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
  }

  const trCenterX = (tr) => trackScreenBox(tr).x + trackScreenBox(tr).w / 2;
  const trTopY = (tr) => trackScreenBox(tr).y;

  /* ---------- render ---------- */

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    gameCanvas.width = w; gameCanvas.height = h;
    ambience.resize(w, h);
  }
  window.addEventListener("resize", resize);

  function frame(now) {
    if (!running) return;
    const dt = Math.min((now - state.lastFrame) / 1000, 0.1);
    state.lastFrame = now;
    state.elapsed += dt;

    ambience.draw(dt, state.elapsed);

    const W = gameCanvas.width, H = gameCanvas.height;
    gctx.clearRect(0, 0, W, H);

    for (const tr of tracker.tracks) drawMonster(tr, now);
    drawEffects(dt);

    // round timer
    const left = Math.max(0, state.endsAt - now);
    const m = Math.floor(left / 60000), sec = Math.floor((left % 60000) / 1000);
    timerEl.textContent = `${m}:${String(sec).padStart(2, "0")}`;
    if (left <= 0) return endRound();

    rafId = requestAnimationFrame(frame);
  }

  function drawMonster(tr, now) {
    const box = trackScreenBox(tr);
    const cx = box.x + box.w / 2;
    const size = Math.max(48, Math.min(box.w, box.h * 0.6));
    tr.bob += 0.05;
    const bobY = Math.sin(tr.bob) * size * 0.04;
    // monster face sits over the person's upper body
    const cy = box.y + box.h * 0.22 + bobY;

    if (tr.state === "dead") {
      // respawn countdown ring where the monster fell
      const s = Settings.get();
      const total = s.respawnSec * 1000;
      const p = Math.min(1, (now - tr.diedAt) / total);
      gctx.save();
      gctx.globalAlpha = 0.85;
      gctx.beginPath();
      gctx.arc(cx, cy, size * 0.35, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p);
      gctx.strokeStyle = "rgba(255,255,255,0.9)";
      gctx.lineWidth = 4;
      gctx.stroke();
      gctx.font = `700 ${Math.round(size * 0.22)}px sans-serif`;
      gctx.textAlign = "center";
      gctx.fillStyle = "rgba(255,255,255,0.9)";
      gctx.fillText(`${Math.ceil((total - (now - tr.diedAt)) / 1000)}s`, cx, cy + size * 0.08);
      gctx.font = `${Math.round(size * 0.5)}px sans-serif`;
      gctx.globalAlpha = 0.35;
      gctx.fillText("💀", cx, cy - size * 0.45);
      gctx.restore();
      return;
    }

    const spawnP = Math.min(1, (now - tr.spawnedAt) / 400); // pop-in
    const flash = tr.hitFlash > now;

    gctx.save();
    gctx.translate(cx, cy);
    gctx.scale(spawnP, spawnP);

    // aura
    const g = gctx.createRadialGradient(0, 0, size * 0.1, 0, 0, size * 0.85);
    g.addColorStop(0, theme.glow.replace(/[\d.]+\)$/, "0.35)"));
    g.addColorStop(1, "rgba(0,0,0,0)");
    gctx.fillStyle = g;
    gctx.beginPath();
    gctx.arc(0, 0, size * 0.85, 0, Math.PI * 2);
    gctx.fill();

    // body highlight around the person
    gctx.strokeStyle = flash ? "rgba(255,255,255,0.95)" : theme.glow;
    gctx.lineWidth = flash ? 5 : 3;
    gctx.setLineDash([10, 8]);
    roundRect(gctx, box.x - cx, box.y - cy, box.w, box.h, 16);
    gctx.stroke();
    gctx.setLineDash([]);

    // the monster
    gctx.font = `${Math.round(size)}px sans-serif`;
    gctx.textAlign = "center";
    gctx.textBaseline = "middle";
    if (flash) {
      gctx.filter = "brightness(2.5)";
      gctx.translate((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8);
    }
    gctx.fillText(theme.monster, 0, 0);
    gctx.filter = "none";
    if (theme.monsterEmblem) {
      gctx.font = `${Math.round(size * 0.34)}px sans-serif`;
      gctx.fillStyle = theme.glow;
      gctx.fillText(theme.monsterEmblem, 0, -size * 0.72);
    }
    gctx.restore();

    // health bar
    const bw = Math.max(60, size * 1.1), bh = 7;
    const bx = cx - bw / 2, by = cy - size * 0.75;
    gctx.fillStyle = "rgba(0,0,0,0.55)";
    roundRect(gctx, bx, by, bw, bh, 4);
    gctx.fill();
    const hpP = tr.hp / tr.maxHp;
    gctx.fillStyle = hpP > 0.5 ? "#42f57b" : hpP > 0.25 ? "#ffc94d" : "#ff4d6d";
    if (hpP > 0) {
      roundRect(gctx, bx + 1, by + 1, (bw - 2) * hpP, bh - 2, 3);
      gctx.fill();
    }
  }

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /* ---------- effects ---------- */

  function popup(x, y, text, color) {
    effects.push({ kind: "popup", x, y, text, color, life: 1 });
  }

  function boom(x, y) {
    for (let i = 0; i < 22; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 120 + Math.random() * 260;
      effects.push({
        kind: "spark", x, y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60,
        life: 0.7 + Math.random() * 0.4,
        color: Math.random() < 0.5 ? theme.glow : "#ffc94d",
        r: 2 + Math.random() * 4,
      });
    }
    effects.push({ kind: "ring", x, y, life: 0.5, r: 10 });
  }

  function drawEffects(dt) {
    const next = [];
    for (const e of effects) {
      e.life -= dt;
      if (e.life <= 0) continue;
      if (e.kind === "popup") {
        e.y -= 50 * dt;
        gctx.save();
        gctx.globalAlpha = Math.min(1, e.life * 1.5);
        gctx.font = "800 22px sans-serif";
        gctx.textAlign = "center";
        gctx.fillStyle = e.color;
        gctx.shadowColor = "rgba(0,0,0,0.7)";
        gctx.shadowBlur = 6;
        gctx.fillText(e.text, e.x, e.y);
        gctx.restore();
      } else if (e.kind === "spark") {
        e.vy += 500 * dt;
        e.x += e.vx * dt; e.y += e.vy * dt;
        gctx.globalAlpha = Math.min(1, e.life * 2);
        gctx.fillStyle = e.color;
        gctx.beginPath();
        gctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
        gctx.fill();
        gctx.globalAlpha = 1;
      } else if (e.kind === "ring") {
        e.r += 500 * dt;
        gctx.globalAlpha = e.life * 2;
        gctx.strokeStyle = "#fff";
        gctx.lineWidth = 3;
        gctx.beginPath();
        gctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
        gctx.stroke();
        gctx.globalAlpha = 1;
      }
      next.push(e);
    }
    effects = next;
  }

  /* ---------- shooting ---------- */

  function shoot(x, y) {
    if (!running) return;
    if (state.reloading) return;
    if (state.ammo <= 0) { SFX.empty(); haptic(15); return; }

    state.ammo--;
    state.shots++;
    renderAmmo();
    SFX.shoot();
    haptic(20);
    effects.push({ kind: "ring", x, y, life: 0.25, r: 4 });

    // hit test alive monsters (smallest box wins → nearest target)
    let target = null;
    for (const tr of tracker.alive()) {
      const b = trackScreenBox(tr);
      const pad = 14; // forgiving hitbox for fingers
      if (x >= b.x - pad && x <= b.x + b.w + pad && y >= b.y - pad && y <= b.y + b.h + pad) {
        if (!target || b.w * b.h < trackScreenBox(target).w * trackScreenBox(target).h) target = tr;
      }
    }
    if (!target) return;

    state.hits++;
    const b = trackScreenBox(target);
    const headshot = y < b.y + b.h * 0.25;
    const dmg = 1;
    target.hp -= dmg;
    target.hitFlash = performance.now() + 120;

    if (target.hp <= 0) {
      target.state = "dead";
      target.diedAt = performance.now();
      state.kills++;
      const pts = headshot ? 150 : 100;
      state.score += pts;
      boom(b.x + b.w / 2, b.y + b.h * 0.25);
      popup(b.x + b.w / 2, b.y, headshot ? `HEADSHOT +${pts}` : `+${pts}`, headshot ? "#ffc94d" : "#42f57b");
      SFX.kill();
      haptic([30, 40, 60]);
    } else {
      state.score += 10;
      popup(x, y - 10, "+10", "#ffffff");
      SFX.hit();
    }
    scoreEl.textContent = state.score;
  }

  function reload() {
    if (state.reloading || state.ammo === CLIP_SIZE || !running) return;
    state.reloading = true;
    reloadBtn.classList.add("reloading");
    reloadBtn.textContent = "RELOADING…";
    SFX.reload();
    setTimeout(() => {
      state.ammo = CLIP_SIZE;
      state.reloading = false;
      reloadBtn.classList.remove("reloading");
      reloadBtn.textContent = "RELOAD";
      renderAmmo();
    }, RELOAD_MS);
  }

  function renderAmmo() {
    ammoEl.innerHTML = "";
    for (let i = 0; i < CLIP_SIZE; i++) {
      const b = document.createElement("i");
      if (i >= state.ammo) b.className = "spent";
      ammoEl.appendChild(b);
    }
  }

  /* ---------- round over ---------- */

  function endRound() {
    running = false;
    cancelAnimationFrame(rafId);
    document.getElementById("go-score").textContent = state.score;
    document.getElementById("go-kills").textContent = state.kills;
    document.getElementById("go-acc").textContent =
      state.shots ? Math.round((state.hits / state.shots) * 100) + "%" : "—";
    gameoverEl.classList.remove("hidden");
    SFX.win();
  }

  /* ---------- input ---------- */

  gameCanvas.addEventListener("pointerdown", (e) => {
    shoot(e.clientX, e.clientY);
  });
  reloadBtn.addEventListener("click", reload);

  return { start, stop, get lastMode() { return theme; } };
})();
