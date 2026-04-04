// scam-reveal.js
// Standalone reveal sequence: triggers achievement, shows car overlay, plays audio.
// Extracted from ChallengesSubmitPage so it can be reused across pages.

import { EventBus } from "../events/event-bus.js";

export async function revealScam() {
  try {
    // Emit achievement trigger on both EventBus and window so all listeners receive it.
    try {
      EventBus.instance.emit("achievement:trigger", { key: "hacked", source: "scamFlow" });
    } catch (e) {
      console.debug("EventBus emit for achievement:trigger failed", e);
    }
    try {
      window.dispatchEvent(
        new CustomEvent("achievement:trigger", { detail: { key: "hacked", source: "scamFlow" } })
      );
    } catch (err) {
      console.warn("Failed to dispatch window achievement:trigger:", err);
    }

    const overlay = document.createElement("div");
    overlay.className = "scam-reveal";

    const loading = document.createElement("div");
    loading.className = "scam-reveal__loading scam-reveal-loading";
    const spinner = document.createElement("div");
    spinner.className = "scam-spinner";
    const msg = document.createElement("div");
    msg.textContent = "Loading...";
    loading.appendChild(spinner);
    loading.appendChild(msg);
    overlay.appendChild(loading);
    document.body.appendChild(overlay);

    const imgSrc = "/images/new-car.jpg";
    const audioSrc = "/audio/2taktare.mp3";

    const loadImage = () =>
      new Promise((res) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = () => res(i);
        i.src = imgSrc;
      });

    const loadAudio = () =>
      new Promise((res) => {
        const a = new Audio();
        a.preload = "auto";
        a.src = audioSrc;
        a.addEventListener("canplaythrough", () => res(a), { once: true });
        a.addEventListener("error", () => res(a), { once: true });
      });

    const timeout = new Promise((res) => setTimeout(res, 5000));
    const result = await Promise.race([
      Promise.all([loadImage(), loadAudio()]),
      timeout.then(() => [null, null]),
    ]);
    const [img, audio] = result || [null, null];

    try {
      await new Promise((res) => setTimeout(res, 800));
      try {
        loading.classList.add("scam-reveal__loading--hidden");
        setTimeout(() => {
          try {
            loading.remove();
          } catch (e) {}
        }, 350);
      } catch (e) {
        try {
          loading.remove();
        } catch (ee) {}
      }
    } catch (e) {
      try {
        loading.remove();
      } catch (ee) {}
    }

    const carImg = document.createElement("img");
    carImg.className = "scam-car scam-reveal__car";
    carImg.alt = "A very fast car";
    carImg.src = img ? img.src : imgSrc;

    overlay.appendChild(carImg);

    requestAnimationFrame(() =>
      requestAnimationFrame(() => carImg.classList.add("scam-car-enter"))
    );

    const onAnimEnd = () => {
      try {
        carImg.removeEventListener("animationend", onAnimEnd);
        carImg.removeEventListener("transitionend", onAnimEnd);
      } catch (e) {}
      try {
        if (audio && audio.play) {
          audio.volume = 0.5;
          audio.play().catch((err) => console.warn("Audio play failed:", err));
        } else {
          const a2 = new Audio(audioSrc);
          a2.volume = 0.5;
          a2.play().catch((err) => console.warn("Audio play fallback failed:", err));
        }
      } catch (e) {
        console.warn("Play meme audio error", e);
      }
    };
    carImg.addEventListener("animationend", onAnimEnd);
    carImg.addEventListener("transitionend", onAnimEnd);

    carImg.addEventListener("click", (ev) => ev.stopPropagation());

    const closeBtn = document.createElement("button");
    closeBtn.className = "scam-reveal__close";
    closeBtn.textContent = "CLOSE";

    let _closed = false;
    const cleanup = () => {
      if (_closed) return;
      _closed = true;
      try {
        if (audio && audio.pause) {
          audio.pause();
          audio.currentTime = 0;
        }
      } catch (e) {}
      try {
        carImg.remove();
      } catch (e) {}
      try {
        overlay.remove();
      } catch (e) {}
    };

    closeBtn.addEventListener("click", cleanup);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) cleanup();
    });

    overlay.appendChild(closeBtn);
  } catch (e) {
    console.error("Reveal sequence failed:", e);
  }
}
