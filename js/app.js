/* CamQuest — screen navigation and app wiring */

(() => {
  function show(id) {
    document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
    document.getElementById(id).classList.add("active");
  }

  // generic navigation buttons
  document.querySelectorAll("[data-goto]").forEach((btn) => {
    btn.addEventListener("click", () => {
      SFX.unlock(); // audio needs a user gesture on mobile
      if (btn.dataset.stopgame) Game.stop();
      SFX.ui();
      show(btn.dataset.goto);
    });
  });

  // mode cards → start game
  document.querySelectorAll("[data-mode]").forEach((card) => {
    card.addEventListener("click", () => {
      SFX.unlock();
      SFX.ui();
      show("screen-game");
      Game.start(card.dataset.mode);
    });
  });

  // in-game exit
  document.getElementById("btn-exit").addEventListener("click", () => {
    Game.stop();
    show("screen-menu");
  });

  // play again keeps the same mode
  document.getElementById("btn-again").addEventListener("click", () => {
    Game.start(Game.lastModeKey);
  });

  // showdown
  document.getElementById("btn-showdown-start").addEventListener("click", () => {
    SFX.unlock();
    SFX.ui();
    show("screen-showdown");
    Showdown.start();
  });
  document.getElementById("sd-exit").addEventListener("click", () => {
    Showdown.stop();
    show("screen-menu");
  });

  // keep the camera honest when the app is backgrounded
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      Game.stop();
      Showdown.stop();
      show("screen-menu");
    }
  });
})();
