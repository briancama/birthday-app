// On A Stick — scroll scenes (hero corndog + rules skewer). Maps scroll progress
// to CSS custom properties; all motion is defined in css/on-a-stick.css.
// Standalone page: no BasePage/appState on purpose.
(function () {
  const hero = document.getElementById("hero");
  if (!hero) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const stage = hero.querySelector(".hero-stage");
  const rules = document.querySelector(".rules");
  let ticking = false;

  function update() {
    ticking = false;
    const rect = hero.getBoundingClientRect();
    const runway = hero.offsetHeight - stage.offsetHeight;
    if (runway > 0) {
      const progress = Math.min(1, Math.max(0, -rect.top / runway));

      // Food departs during the first 60% of the runway; copy arrives 35%→90%
      const foodShift = Math.min(1, progress / 0.6);
      const reveal = Math.min(1, Math.max(0, (progress - 0.35) / 0.55));

      stage.style.setProperty("--food-shift", foodShift.toFixed(3));
      stage.style.setProperty("--reveal", reveal.toFixed(3));
    }

    // Rules scene: 0 when the section top reaches the viewport top, 1 near its end
    if (rules) {
      const r = rules.getBoundingClientRect();
      const span = r.height - window.innerHeight * 0.6;
      const p = span > 0 ? Math.min(1, Math.max(0, -r.top / span)) : 0;
      rules.style.setProperty("--rules-p", p.toFixed(3));
    }
  }

  function onScroll() {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });
  update();
})();
