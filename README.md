# 🧟 CamQuest — AR Camera Battle (MVP)

Point your phone's camera at the world. **Real people become monsters** — zombies, mummies, aliens, sharks — and you have to take them down. Move around, aim, tap to shoot. Downed monsters respawn on a timer you control.

This is the working MVP / proof-of-concept: a mobile web game — no install, no app store, just open a link on your phone.

## ▶️ How to run it

The camera API requires **HTTPS** (or `localhost`), so pick one:

### Option A — GitHub Pages (easiest for phone testing)
1. Repo **Settings → Pages → Deploy from branch**, choose this branch, root folder.
2. Open `https://<your-username>.github.io/CamQuestGame/` on your phone.
3. Allow camera access when asked.

### Option B — Local dev server
```bash
npx serve .        # or: python3 -m http.server 8000
```
Open `http://localhost:8000` on your computer, or use a tunnel (e.g. `npx localtunnel`/ngrok) to reach it from your phone over HTTPS.

> 🖥️ **No camera?** The game auto-falls back to **Target Practice** mode with simulated monsters, so you can try everything on a laptop too.

## 🎮 What's in the MVP

| Feature | Status |
|---|---|
| Camera feed with live **person detection + body segmentation** (on-device AI) | ✅ |
| Every captured person **becomes the monster**: their own silhouette is cut out, recolored with monster skin, and dressed with glowing eyes, jagged mouths, bandages, fins, antennae… | ✅ |
| HP bars, hit flashes, death FX, respawn countdown rings | ✅ |
| **4 modes**: Zombie Outbreak 🧟 · Pharaoh's Curse 🏺 · Alien Invasion 👾 · Shark Waters 🦈 | ✅ |
| **World themes** per mode — Egypt sand + pyramids, deep space starfield, undersea light rays — as camera grading + animated overlays | ✅ |
| **Theme off switch** — keep monsters on the plain camera feed | ✅ |
| **Configurable respawn timer** (10s–5min), monster health, round length | ✅ |
| Tap-to-shoot with ammo clip, reload, headshot bonus, score, accuracy stats | ✅ |
| Synthesized sound FX + haptic vibration (both toggleable) | ✅ |
| **🤠 Showdown** — 2-player quick-draw duel on one phone (first multiplayer proof) | ✅ |
| Modern glassy menu UI, installable as a PWA | ✅ |

## ⚙️ Settings

- **Monster respawn time** — how long a downed monster stays down (the "3 min" idea; default 30s so demos move fast).
- **Background theme** — toggle the world overlay off to keep only the monsters.
- **Monster health** — Easy / Normal / Hard.
- **Round length**, **sound**, **vibration**.

Settings persist in `localStorage`.

## 🏗️ How it works

```
index.html
├── css/style.css      — glassy dark UI, HUD, showdown arena
└── js/
    ├── app.js         — screen navigation & wiring
    ├── game.js        — camera, detection loop, render loop, shooting
    ├── tracker.js     — matches detections frame-to-frame so each person
    │                    keeps one monster identity (HP, death, respawn)
    ├── themes.js      — mode definitions + animated ambience (pyramids,
    │                    starfields, light rays, sand, bubbles)
    ├── settings.js    — persistent settings
    ├── audio.js       — WebAudio-synthesized SFX (zero audio assets)
    └── showdown.js    — 2-player quick-draw duel
```

- **Detection**: TensorFlow.js + COCO-SSD (`lite_mobilenet_v2`) finds people, and MediaPipe SelfieSegmentation extracts their exact silhouette — all on-device, no video ever leaves the phone. Detection runs ~8×/s; rendering interpolates at 60fps so monsters track smoothly.
- **Monster-ification** (`js/monster-art.js` + `drawPersonMonster` in `game.js`): the person's own pixels are masked out with the segmentation mask, tinted with the theme's monster skin, shaded, then procedural features (eyes, mouth, bandages, fin, antennae) are drawn onto their body. The person *is* the monster.
- **Tracking**: simple nearest-center matcher gives each detected person a stable ID, which is what makes per-person HP and respawn timers possible.
- **Themes**: a CSS filter grades the camera feed + a canvas layer draws animated set-dressing behind the monsters.
- **No fake monsters**: simulated targets only appear in the clearly-labeled Target Practice mode (no camera available), and a failed AI load shows an error with Retry instead of silently faking it.

## 🗺️ Roadmap (post-MVP)

1. **Same-WiFi group multiplayer** — WebRTC (PeerJS) rooms with a join code: laser-tag scoring, shared monster kills, versus showdown across phones.
2. **Pose-based gestures** — reload by physically ducking, melee by swinging the phone (device motion API is already available).
3. Even richer monster art — pose estimation for limb-aware features, 3D (three.js) anchors, WebXR where supported.
4. Full background *replacement* using the segmentation mask (invert it: keep people, swap the world).
5. Power-ups, waves, boss monsters, leaderboards.

## 📱 Requirements

Modern mobile browser (iOS Safari 15+, Android Chrome 90+), camera permission, and a decent connection on first load (the detection model downloads once, ~6 MB, then caches).
