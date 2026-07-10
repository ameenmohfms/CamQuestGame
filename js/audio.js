/* CamQuest — synthesized sound effects (no audio assets needed) */
const SFX = (() => {
  let ctx = null;

  function ensure() {
    if (!Settings.get().sound) return null;
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  function blip({ type = "square", from = 440, to = 110, dur = 0.15, gain = 0.25, delay = 0 }) {
    const c = ensure();
    if (!c) return;
    const t = c.currentTime + delay;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(to, 1), t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g).connect(c.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function noise({ dur = 0.2, gain = 0.3, filterFrom = 3000, filterTo = 200, delay = 0 }) {
    const c = ensure();
    if (!c) return;
    const t = c.currentTime + delay;
    const len = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource();
    src.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(filterFrom, t);
    f.frequency.exponentialRampToValueAtTime(filterTo, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(c.destination);
    src.start(t);
  }

  return {
    unlock() { ensure(); },
    shoot()   { noise({ dur: 0.12, gain: 0.35, filterFrom: 5000, filterTo: 400 }); blip({ type: "sawtooth", from: 900, to: 120, dur: 0.08, gain: 0.12 }); },
    hit()     { blip({ type: "square", from: 300, to: 80, dur: 0.12, gain: 0.3 }); },
    kill()    { noise({ dur: 0.35, gain: 0.4, filterFrom: 2500, filterTo: 100 }); blip({ type: "sawtooth", from: 200, to: 40, dur: 0.4, gain: 0.25 }); },
    empty()   { blip({ type: "square", from: 200, to: 180, dur: 0.06, gain: 0.15 }); },
    reload()  { blip({ type: "square", from: 500, to: 700, dur: 0.08, gain: 0.15 }); blip({ type: "square", from: 700, to: 1000, dur: 0.08, gain: 0.15, delay: 0.12 }); },
    respawn() { blip({ type: "sine", from: 100, to: 500, dur: 0.5, gain: 0.2 }); },
    ui()      { blip({ type: "sine", from: 600, to: 900, dur: 0.07, gain: 0.12 }); },
    draw()    { blip({ type: "square", from: 880, to: 880, dur: 0.25, gain: 0.3 }); },
    win()     { blip({ type: "sine", from: 523, to: 523, dur: 0.12, gain: 0.2 }); blip({ type: "sine", from: 659, to: 659, dur: 0.12, gain: 0.2, delay: 0.13 }); blip({ type: "sine", from: 784, to: 784, dur: 0.25, gain: 0.25, delay: 0.26 }); },
    foul()    { blip({ type: "sawtooth", from: 220, to: 90, dur: 0.4, gain: 0.3 }); },
  };
})();

function haptic(ms = 30) {
  if (Settings.get().haptics && navigator.vibrate) navigator.vibrate(ms);
}
