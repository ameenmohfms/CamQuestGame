/* CamQuest — core game: camera, person detection + segmentation, monsters, shooting.
   Every person the camera captures IS a monster: their own pixels are cut out
   (body segmentation), recolored with the theme's monster skin, and dressed
   with procedural features (MonsterArt). No random monsters — Target Practice
   with simulated bodies only runs when there is no camera, clearly labeled. */

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
  const camErrorEl = document.getElementById("cam-error");
  const practiceBadge = document.getElementById("practice-badge");

  const ambience = new Ambience(fxCanvas);
  const tracker = new PersonTracker();

  const CLIP_SIZE = 8;
  const RELOAD_MS = 1000;

  let model = null;            // coco-ssd person boxes (loaded once)
  let modelLoading = null;
  let segmenter = null;        // selfie segmentation → person pixel mask
  let segLoading = null;
  let stream = null;
  let running = false;
  let rafId = 0;
  let theme = THEMES.zombie;
  let lastModeKey = "zombie";
  let demoMode = false;

  // person-pixel mask, refreshed by the detection loop
  const maskCanvas = document.createElement("canvas");
  const maskCtx = maskCanvas.getContext("2d");
  let maskFresh = 0;
  // scratch canvas for building each monster's tinted cutout
  const cutCanvas = document.createElement("canvas");
  const cutCtx = cutCanvas.getContext("2d");

  const state = {
    score: 0, kills: 0, shots: 0, hits: 0,
    ammo: CLIP_SIZE, reloading: false,
    endsAt: 0, lastFrame: 0, elapsed: 0,
  };

  let effects = [];
  let demoTargets = [];

  /* ---------- boot ---------- */

  async function start(modeKey) {
    lastModeKey = modeKey;
    theme = THEMES[modeKey] || THEMES.zombie;
    demoMode = false;
    loadingEl.classList.remove("hidden");
    gameoverEl.classList.add("hidden");
    camErrorEl.classList.add("hidden");
    hud.classList.add("hidden");
    practiceBadge.classList.add("hidden");

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
      // no camera at all → the only case where simulated monsters are allowed
      console.warn("Camera unavailable → Target Practice:", err);
      loadingText.textContent = "No camera — starting Target Practice";
      await new Promise((r) => setTimeout(r, 900));
      return startPractice();
    }

    loadingText.textContent = "Loading monster AI… (first time takes a moment)";
    try {
      if (!model) {
        modelLoading = modelLoading || cocoSsd.load({ base: "lite_mobilenet_v2" });
        model = await modelLoading;
      }
    } catch (err) {
      // camera works but detection can't load: tell the user, don't fake it
      console.warn("Detection model failed to load:", err);
      modelLoading = null;
      loadingEl.classList.add("hidden");
      camErrorEl.classList.remove("hidden");
      return;
    }

    // segmentation makes monsters hug the person's silhouette; optional
    if (!segmenter && typeof bodySegmentation !== "undefined") {
      try {
        segLoading = segLoading || bodySegmentation.createSegmenter(
          bodySegmentation.SupportedModels.MediaPipeSelfieSegmentation,
          { runtime: "tfjs", modelType: "general" }
        );
        segmenter = await segLoading;
      } catch (err) {
        console.warn("Segmentation unavailable, using soft-blend monsters:", err);
        segLoading = null;
      }
    }

    beginRound();
  }

  function startPractice() {
    stopStream();
    video.srcObject = null;
    demoMode = true;
    seedDemoTargets();
    camErrorEl.classList.add("hidden");
    practiceBadge.classList.remove("hidden");
    beginRound();
  }

  function beginRound() {
    const s = Settings.get();
    Object.assign(state, {
      score: 0, kills: 0, shots: 0, hits: 0,
      ammo: CLIP_SIZE, reloading: false,
      endsAt: performance.now() + s.roundSec * 1000,
      lastFrame: performance.now(), elapsed: 0,
    });
    tracker.reset();
    effects = [];
    maskFresh = 0;

    video.style.filter = s.themeOn && !demoMode ? theme.camFilter : "none";
    ambience.setTheme(theme, s.themeOn || demoMode); // practice mode IS the backdrop

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
    camErrorEl.classList.add("hidden");
    practiceBadge.classList.add("hidden");
  }

  function stopStream() {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }
  }

  /* ---------- detection ---------- */

  async function detectLoop() {
    let tick = 0;
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
            .filter((p) => p.class === "person" && p.score > 0.4)
            .map((p) => ({
              x: p.bbox[0] / vw, y: p.bbox[1] / vh,
              w: p.bbox[2] / vw, h: p.bbox[3] / vh,
            }));
        } catch (_) { /* skip frame */ }

        // refresh the person-pixel mask every other pass
        if (segmenter && tick % 2 === 0) {
          try {
            const people = await segmenter.segmentPeople(video, { flipHorizontal: false });
            if (people.length) {
              const mask = await bodySegmentation.toBinaryMask(
                people,
                { r: 255, g: 255, b: 255, a: 255 },
                { r: 0, g: 0, b: 0, a: 0 }
              );
              if (maskCanvas.width !== mask.width || maskCanvas.height !== mask.height) {
                maskCanvas.width = mask.width;
                maskCanvas.height = mask.height;
              }
              maskCtx.putImageData(mask, 0, 0);
              maskFresh = now;
            }
          } catch (_) { /* keep last mask */ }
        }
      }
      tick++;

      const s = Settings.get();
      tracker.update(detections, now, {
        maxHp: s.monsterHp,
        respawnMs: s.respawnSec * 1000,
        onRespawn: (tr) => {
          SFX.respawn();
          const b = trackScreenBox(tr);
          popup(b.x + b.w / 2, b.y, `${theme.monsterName} returned!`, "#ff7b7b");
        },
      });

      // detection cadence: keep CPU/battery sane, rendering interpolates
      await new Promise((r) => setTimeout(r, demoMode ? 33 : 120));
    }
  }

  /* ---------- demo targets (no-camera Target Practice) ---------- */

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
    if (demoMode || !video.videoWidth) return { x: nx * W, y: ny * H };
    const vw = video.videoWidth, vh = video.videoHeight;
    const scale = Math.max(W / vw, H / vh);
    return {
      x: nx * vw * scale + (W - vw * scale) / 2,
      y: ny * vh * scale + (H - vh * scale) / 2,
    };
  }

  function trackScreenBox(tr) {
    const a = videoToScreen(tr.smooth.x, tr.smooth.y);
    const b = videoToScreen(tr.smooth.x + tr.smooth.w, tr.smooth.y + tr.smooth.h);
    return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
  }

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

    if (tr.state === "dead") {
      drawRespawnRing(tr, box, now);
      return;
    }

    const spawnP = Math.min(1, (now - tr.spawnedAt) / 400); // fade/pop in
    const flash = tr.hitFlash > now;

    gctx.save();
    gctx.globalAlpha = spawnP;

    if (demoMode) {
      MonsterArt.drawDemoBody(gctx, theme, box, state.elapsed, tr.id);
      if (flash) flashBox(box);
    } else {
      drawPersonMonster(tr, box, flash);
      MonsterArt.drawFeatures(gctx, theme, box, state.elapsed, tr.id);
    }

    gctx.restore();
    drawHealthBar(tr, box);
  }

  /* The heart of the game: turn the captured person into the monster.
     Their own pixels are masked out, tinted with monster skin, shaded,
     and drawn back over them with a themed glow. */
  function drawPersonMonster(tr, box, flash) {
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw) return;

    // person's region in video pixels (clamped)
    let sx = tr.smooth.x * vw, sy = tr.smooth.y * vh;
    let sw = tr.smooth.w * vw, sh = tr.smooth.h * vh;
    sx = Math.max(0, sx); sy = Math.max(0, sy);
    sw = Math.min(sw, vw - sx); sh = Math.min(sh, vh - sy);
    if (sw < 4 || sh < 4) return;

    // build the cutout at capped resolution for phone performance
    const cap = 320;
    const cs = Math.min(1, cap / Math.max(box.w, box.h));
    const cw = Math.max(4, Math.round(box.w * cs));
    const ch = Math.max(4, Math.round(box.h * cs));
    cutCanvas.width = cw; cutCanvas.height = ch;

    const maskUsable = maskFresh && performance.now() - maskFresh < 1500;
    if (maskUsable) {
      // person silhouette from the segmentation mask
      const mx = maskCanvas.width / vw, my = maskCanvas.height / vh;
      cutCtx.drawImage(maskCanvas, sx * mx, sy * my, sw * mx, sh * my, 0, 0, cw, ch);
    } else {
      // soft body-shaped blend while the mask warms up / if it failed
      const g = cutCtx.createRadialGradient(cw / 2, ch * 0.45, Math.min(cw, ch) * 0.18, cw / 2, ch * 0.5, Math.max(cw, ch) * 0.55);
      g.addColorStop(0, "rgba(0,0,0,1)");
      g.addColorStop(0.75, "rgba(0,0,0,0.85)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      cutCtx.fillStyle = g;
      cutCtx.fillRect(0, 0, cw, ch);
    }

    // keep only the person's pixels inside the silhouette
    cutCtx.globalCompositeOperation = "source-in";
    cutCtx.drawImage(video, sx, sy, sw, sh, 0, 0, cw, ch);

    // monster skin: flat tint + vertical shading, only on person pixels
    cutCtx.globalCompositeOperation = "source-atop";
    cutCtx.fillStyle = theme.skinTint;
    cutCtx.fillRect(0, 0, cw, ch);
    const shade = cutCtx.createLinearGradient(0, 0, 0, ch);
    shade.addColorStop(0, "rgba(0,0,0,0)");
    shade.addColorStop(1, theme.skinShade);
    cutCtx.fillStyle = shade;
    cutCtx.fillRect(0, 0, cw, ch);
    if (flash) {
      cutCtx.fillStyle = "rgba(255,255,255,0.55)";
      cutCtx.fillRect(0, 0, cw, ch);
    }
    cutCtx.globalCompositeOperation = "source-over";

    // paint the monster back over the person, glowing
    gctx.save();
    gctx.shadowColor = theme.glow;
    gctx.shadowBlur = 24;
    gctx.drawImage(cutCanvas, 0, 0, cw, ch, box.x, box.y, box.w, box.h);
    gctx.restore();
  }

  function flashBox(box) {
    gctx.fillStyle = "rgba(255,255,255,0.35)";
    gctx.fillRect(box.x, box.y, box.w, box.h);
  }

  function drawRespawnRing(tr, box, now) {
    const s = Settings.get();
    const total = s.respawnSec * 1000;
    const p = Math.min(1, (now - tr.diedAt) / total);
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h * 0.25;
    const r = Math.max(20, Math.min(box.w, box.h) * 0.3);
    gctx.save();
    gctx.globalAlpha = 0.85;
    gctx.beginPath();
    gctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p);
    gctx.strokeStyle = "rgba(255,255,255,0.9)";
    gctx.lineWidth = 4;
    gctx.stroke();
    gctx.font = `700 ${Math.round(r * 0.6)}px sans-serif`;
    gctx.textAlign = "center";
    gctx.fillStyle = "rgba(255,255,255,0.9)";
    gctx.fillText(`${Math.ceil((total - (now - tr.diedAt)) / 1000)}s`, cx, cy + r * 0.22);
    gctx.font = `${Math.round(r)}px sans-serif`;
    gctx.globalAlpha = 0.35;
    gctx.fillText("💀", cx, cy - r * 1.3);
    gctx.restore();
  }

  function drawHealthBar(tr, box) {
    const bw = Math.max(60, box.w * 0.6), bh = 7;
    const bx = box.x + box.w / 2 - bw / 2;
    const by = box.y - 16;
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
    let target = null, targetBox = null;
    for (const tr of tracker.alive()) {
      const b = trackScreenBox(tr);
      const pad = 14; // forgiving hitbox for fingers
      if (x >= b.x - pad && x <= b.x + b.w + pad && y >= b.y - pad && y <= b.y + b.h + pad) {
        if (!target || b.w * b.h < targetBox.w * targetBox.h) { target = tr; targetBox = b; }
      }
    }
    if (!target) return;

    state.hits++;
    const b = targetBox;
    const headshot = y < b.y + b.h * 0.25;
    target.hp -= 1;
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
  document.getElementById("btn-retry-detect").addEventListener("click", () => {
    stopStream();
    start(lastModeKey);
  });
  document.getElementById("btn-practice").addEventListener("click", () => {
    SFX.ui();
    startPractice();
  });

  return { start, stop, get lastModeKey() { return lastModeKey; } };
})();
