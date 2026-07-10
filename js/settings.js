/* CamQuest — settings with localStorage persistence */
const Settings = (() => {
  const KEY = "camquest.settings.v1";

  const defaults = {
    respawnSec: 30,     // monster respawn delay (10–300s)
    themeOn: true,      // background theme overlay on camera
    monsterHp: 4,       // hits to eliminate
    sound: true,
    haptics: true,
    roundSec: 180,      // round length
  };

  let state = { ...defaults };
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (saved && typeof saved === "object") state = { ...defaults, ...saved };
  } catch (_) { /* fresh start */ }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (_) {}
  }

  return {
    get: () => state,
    set(patch) { Object.assign(state, patch); save(); },
  };
})();

/* Wire up the settings screen */
document.addEventListener("DOMContentLoaded", () => {
  const s = Settings.get();

  const fmtTime = (sec) => sec >= 60 ? `${Math.floor(sec / 60)}m${sec % 60 ? ` ${sec % 60}s` : ""}` : `${sec}s`;

  // Respawn slider
  const respawn = document.getElementById("set-respawn");
  const respawnVal = document.getElementById("set-respawn-val");
  respawn.value = s.respawnSec;
  respawnVal.textContent = fmtTime(s.respawnSec);
  respawn.addEventListener("input", () => {
    Settings.set({ respawnSec: +respawn.value });
    respawnVal.textContent = fmtTime(+respawn.value);
  });

  // Round length slider
  const round = document.getElementById("set-round");
  const roundVal = document.getElementById("set-round-val");
  round.value = s.roundSec;
  roundVal.textContent = fmtTime(s.roundSec);
  round.addEventListener("input", () => {
    Settings.set({ roundSec: +round.value });
    roundVal.textContent = fmtTime(+round.value);
  });

  // Toggles
  const bindToggle = (id, key) => {
    const el = document.getElementById(id);
    el.setAttribute("aria-pressed", String(s[key]));
    el.addEventListener("click", () => {
      const v = el.getAttribute("aria-pressed") !== "true";
      el.setAttribute("aria-pressed", String(v));
      Settings.set({ [key]: v });
      SFX.ui();
    });
  };
  bindToggle("set-theme", "themeOn");
  bindToggle("set-sound", "sound");
  bindToggle("set-haptics", "haptics");

  // Difficulty segmented control
  const seg = document.getElementById("set-hp");
  seg.querySelectorAll("button").forEach((b) => {
    b.classList.toggle("on", +b.dataset.v === s.monsterHp);
    b.addEventListener("click", () => {
      seg.querySelectorAll("button").forEach((x) => x.classList.remove("on"));
      b.classList.add("on");
      Settings.set({ monsterHp: +b.dataset.v });
      SFX.ui();
    });
  });
});
