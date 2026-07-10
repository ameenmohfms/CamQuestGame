/* CamQuest — Cowboy Showdown: 2 players, 1 phone quick-draw duel.
   Proof-of-concept for the multiplayer pillar; same-WiFi group play is next. */

const Showdown = (() => {
  const center = document.getElementById("sd-center");
  const scoreEl = document.getElementById("sd-score");
  const p1 = document.getElementById("sd-p1");
  const p2 = document.getElementById("sd-p2");

  const WINS_NEEDED = 3;
  let score = [0, 0];
  let phase = "idle";     // idle | wait | draw | done
  let drawTimer = 0;
  let drawAt = 0;
  let active = false;

  function start() {
    active = true;
    score = [0, 0];
    updateScore();
    nextRound();
  }

  function stop() {
    active = false;
    phase = "idle";
    clearTimeout(drawTimer);
    clearPads();
  }

  function clearPads() {
    p1.classList.remove("win", "lose");
    p2.classList.remove("win", "lose");
  }

  function updateScore() {
    scoreEl.textContent = `P2 ${score[1]} — ${score[0]} P1`;
  }

  function nextRound() {
    if (!active) return;
    clearPads();
    phase = "wait";
    center.classList.remove("draw");
    center.textContent = "WAIT FOR IT…";
    // random 1.5–5s tension window
    clearTimeout(drawTimer);
    drawTimer = setTimeout(() => {
      if (!active) return;
      phase = "draw";
      drawAt = performance.now();
      center.textContent = "DRAW!";
      center.classList.add("draw");
      SFX.draw();
      haptic(60);
    }, 1500 + Math.random() * 3500);
  }

  function press(player) {
    if (!active) return;
    const me = player === 1 ? p1 : p2;
    const other = player === 1 ? p2 : p1;

    if (phase === "wait") {
      // jumped the gun — opponent takes the round
      clearTimeout(drawTimer);
      phase = "done";
      score[player === 1 ? 1 : 0]++;
      center.classList.remove("draw");
      center.textContent = `P${player} DREW EARLY!`;
      me.classList.add("lose");
      other.classList.add("win");
      SFX.foul();
      haptic([80, 50, 80]);
      finishRound();
    } else if (phase === "draw") {
      phase = "done";
      const ms = Math.round(performance.now() - drawAt);
      score[player - 1]++;
      center.classList.remove("draw");
      center.textContent = `P${player} WINS · ${ms}ms`;
      me.classList.add("win");
      other.classList.add("lose");
      SFX.win();
      haptic(50);
      finishRound();
    }
  }

  function finishRound() {
    updateScore();
    const champ = score[0] >= WINS_NEEDED ? 1 : score[1] >= WINS_NEEDED ? 2 : 0;
    setTimeout(() => {
      if (!active) return;
      if (champ) {
        center.textContent = `🏆 PLAYER ${champ} WINS THE DUEL`;
        clearPads();
        (champ === 1 ? p1 : p2).classList.add("win");
        setTimeout(() => { if (active) start(); }, 3000);
      } else {
        nextRound();
      }
    }, 1800);
  }

  p1.addEventListener("pointerdown", () => press(1));
  p2.addEventListener("pointerdown", () => press(2));

  return { start, stop };
})();
