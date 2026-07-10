/* CamQuest — tracks detected people across frames so each person keeps
   a stable monster identity (with HP, death state and respawn timer). */

class PersonTracker {
  constructor() {
    this.tracks = [];
    this.nextId = 1;
    this.MAX_LOST_MS = 2500;   // drop a live track not seen for this long
    this.MATCH_DIST = 0.35;    // max normalized center distance to match
  }

  /* detections: [{x, y, w, h}] normalized 0..1 (video space) */
  update(detections, now, opts) {
    const unmatched = new Set(this.tracks);

    for (const det of detections) {
      const cx = det.x + det.w / 2, cy = det.y + det.h / 2;
      let best = null, bestDist = this.MATCH_DIST;
      for (const tr of unmatched) {
        const tcx = tr.box.x + tr.box.w / 2, tcy = tr.box.y + tr.box.h / 2;
        const d = Math.hypot(cx - tcx, cy - tcy);
        if (d < bestDist) { best = tr; bestDist = d; }
      }
      if (best) {
        unmatched.delete(best);
        best.box = det;
        best.lastSeen = now;
        // smooth the display box so the monster doesn't jitter
        const k = 0.35;
        best.smooth.x += (det.x - best.smooth.x) * k;
        best.smooth.y += (det.y - best.smooth.y) * k;
        best.smooth.w += (det.w - best.smooth.w) * k;
        best.smooth.h += (det.h - best.smooth.h) * k;
      } else {
        this.tracks.push({
          id: this.nextId++,
          box: det,
          smooth: { ...det },
          lastSeen: now,
          spawnedAt: now,
          state: "alive",       // alive | dead
          hp: opts.maxHp,
          maxHp: opts.maxHp,
          diedAt: 0,
          hitFlash: 0,
          bob: Math.random() * Math.PI * 2,
        });
      }
    }

    // respawn the fallen after the configured delay (person must still be visible)
    for (const tr of this.tracks) {
      if (tr.state === "dead" && now - tr.diedAt >= opts.respawnMs && now - tr.lastSeen < 500) {
        tr.state = "alive";
        tr.hp = opts.maxHp;
        tr.spawnedAt = now;
        if (opts.onRespawn) opts.onRespawn(tr);
      }
    }

    // forget tracks whose person left the frame (dead ones linger so the
    // respawn countdown survives brief occlusion)
    this.tracks = this.tracks.filter((tr) => {
      const lostFor = now - tr.lastSeen;
      return lostFor < (tr.state === "dead" ? Math.max(opts.respawnMs + 2000, 8000) : this.MAX_LOST_MS);
    });
  }

  alive() { return this.tracks.filter((t) => t.state === "alive"); }
  reset() { this.tracks = []; }
}
