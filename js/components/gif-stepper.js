/**
 * GifStepper
 *
 * Enhances <img> tags with data-gif-stepper into click-through frame steppers.
 *
 * Markup:
 *   <img src="anim.gif" data-gif-stepper>
 *   <img src="anim.gif" data-gif-stepper data-steps-per-click="3">
 *
 * Manual init (if you need a handle):
 *   const stepper = new GifStepper(imgElement, { stepsPerClick: 2 });
 *
 * Auto-init all [data-gif-stepper] images on the page:
 *   GifStepper.initAll();
 *
 * Script tag at end of body will auto-init automatically.
 *
 * Public API:
 *   stepper.reset()
 *   stepper.setStepsPerClick(n)
 */
class GifStepper {
  constructor(img, options = {}) {
    if (!(img instanceof HTMLImageElement)) throw new Error("GifStepper requires an <img> element");
    if (!("ImageDecoder" in window)) {
      // ImageDecoder is Chromium-only — not available on iOS/Safari.
      // Restore visibility so the GIF plays normally as a fallback.
      img.style.visibility = "visible";
      return;
    }

    this.img = img;
    // Prefer data-src (lazy-load pattern) over src so the browser never
    // makes an eager duplicate fetch alongside our own fetch() call below.
    this.src = img.dataset.src || img.src;
    this.stepsPerClick = options.stepsPerClick ?? parseInt(img.dataset.stepsPerClick) ?? 1;
    this.frames = [];
    this.current = -1;
    this.started = false;
    this.done = false;
    // Prevent emitting completion more than once per instance
    this._gifCompletedEmitted = false;
    this._gifSoundTriggered = false;
    this._gifSoundPercent = null; // 0-100 or null
    // optional sound to play when gif completes (data-gif-sound)
    const rawGifSound = img.dataset.gifSound || img.getAttribute("data-gif-sound") || null;
    this.gifSoundVolume = img.dataset.gifSoundVolume ? parseFloat(img.dataset.gifSoundVolume) : 1.0;
    this._soundAudio = null;
    this.gifSound = null;
    if (rawGifSound) {
      this._initGifSound(rawGifSound);
    }
    // optional percent (0-100) at which to trigger the sound during the click-through
    const rawPercent = img.dataset.gifSoundPercent || img.getAttribute("data-gif-sound-percent");
    if (rawPercent != null) {
      const p = parseFloat(rawPercent);
      if (!Number.isNaN(p)) {
        this._gifSoundPercent = Math.max(0, Math.min(100, p));
      }
    }

    this._init();
  }

  async _init() {
    // Replace the <img> with a wrapper containing a <canvas> + progress bar
    const wrapper = document.createElement("div");
    Object.assign(wrapper.style, {
      position: "relative",
      cursor: "pointer",
      userSelect: "none",
    });

    // Match any inline styles/classes on the original img
    wrapper.className = this.img.className;
    if (this.img.style.cssText) wrapper.style.cssText += this.img.style.cssText;

    this.canvas = document.createElement("canvas");
    Object.assign(this.canvas.style, {
      display: "block",
      imageRendering: "pixelated",
      width: "100%",
      height: "auto",
      objectFit: "contain",
      visibility: "hidden",
    });
    this.ctx = this.canvas.getContext("2d");

    this.progressWrap = document.createElement("div");
    Object.assign(this.progressWrap.style, {
      display: "block",
      visibility: "hidden",
      width: "100%",
      height: "4px",
      background: "#ddd",
      borderRadius: "2px",
      marginTop: "4px",
      overflow: "hidden",
    });

    this.progressFill = document.createElement("div");
    Object.assign(this.progressFill.style, {
      height: "100%",
      width: "0%",
      background: "#555",
      borderRadius: "2px",
      transition: "width 0.1s",
    });
    this.progressWrap.appendChild(this.progressFill);

    this.resetBtn = document.createElement("button");
    this.resetBtn.textContent = "↺ Reset";
    Object.assign(this.resetBtn.style, {
      display: "none",
      marginTop: "6px",
      padding: "3px 10px",
      fontSize: "12px",
      cursor: "pointer",
      border: "1px solid #aaa",
      borderRadius: "3px",
      background: "#f5f5f5",
    });

    wrapper.appendChild(this.canvas);
    wrapper.appendChild(this.progressWrap);
    wrapper.appendChild(this.resetBtn);

    this.img.replaceWith(wrapper);

    this.canvas.addEventListener("click", () => this._advance());
    this.resetBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.reset();
    });

    await this._decode();
  }

  async _decode() {
    try {
      const res = await fetch(this.src);
      const blob = await res.blob();

      const decoder = new ImageDecoder({ data: blob.stream(), type: "image/gif" });
      await decoder.completed.catch(() => {});

      const count = decoder.tracks.selectedTrack.frameCount;
      const frames = [];
      for (let i = 0; i < count; i++) {
        const { image } = await decoder.decode({ frameIndex: i, completeFramesOnly: true });
        frames.push(await createImageBitmap(image));
      }
      decoder.close();

      if (!frames.length) throw new Error("No frames found");

      this.frames = frames;

      const bmp = frames[0];
      this.canvas.width = bmp.width;
      this.canvas.height = bmp.height;

      this.ctx.drawImage(bmp, 0, 0);
      // First frame is painted — reveal the canvas
      this.canvas.style.visibility = "visible";
    } catch (err) {
      console.error("GifStepper failed to load:", this.src, err);
      // Decode failed — restore the original img so something is visible
      this.canvas.style.visibility = "visible";
    }
  }

  _advance() {
    if (!this.frames.length || this.done) return;

    if (!this.started) {
      this.started = true;
      this.progressWrap.style.visibility = "visible";
      this.current = 0; // start at 0; first click shows frame stepsPerClick
    }

    const next = Math.min(this.current + this.stepsPerClick, this.frames.length - 1);
    this.current = next;

    const bmp = this.frames[this.current];
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.drawImage(bmp, 0, 0);

    this.progressFill.style.width = ((this.current + 1) / this.frames.length) * 100 + "%";

    if (this.current >= this.frames.length - 1) {
      this.done = true;
      this.canvas.style.cursor = "default";
      this.resetBtn.style.display = "inline-block";
      // Emit a completion event only once per instance so we don't trigger races
      if (!this._gifCompletedEmitted) {
        this._gifCompletedEmitted = true;
        // Prefer EventBus emission; only use window.dispatchEvent as a fallback.
        try {
          if (
            window.EventBus &&
            window.EventBus.instance &&
            typeof window.EventBus.instance.emit === "function"
          ) {
            window.EventBus.instance.emit("gif:completed", { src: this.src });
          } else {
            // Fallback for pages not using EventBus
            window.dispatchEvent(new CustomEvent("gif:completed", { detail: { src: this.src } }));
          }
        } catch (e) {
          /* ignore */
        }
        // If a sound is configured on the original <img>, play it once using preloaded audio when available
        if (this.gifSound && (this._gifSoundPercent == null || this._gifSoundPercent >= 100)) {
          try {
            if (this._soundAudio) {
              try {
                try {
                  this._soundAudio.currentTime = 0;
                } catch (e) {}
                const playPromise = this._soundAudio.play();
                if (playPromise && typeof playPromise.catch === "function") {
                  playPromise.catch((err) => {
                    console.warn(
                      "GifStepper: failed to play preloaded gif sound",
                      this.gifSound,
                      err
                    );
                  });
                }
              } catch (err) {
                console.warn(
                  "GifStepper: error while attempting to play preloaded sound",
                  this.gifSound,
                  err
                );
              }
            } else {
              // Fallback: create and play a one-off Audio, but only attempt if browser can probably play it
              try {
                const aTest = new Audio();
                const canPlay = aTest.canPlayType("audio/mpeg") || aTest.canPlayType("audio/mp3");
                if (!canPlay) {
                  console.warn(
                    "GifStepper: browser cannot play mp3 audio; skipping fallback play",
                    this.gifSound
                  );
                } else {
                  const a = new Audio(this.gifSound);
                  a.volume = Number.isFinite(this.gifSoundVolume) ? this.gifSoundVolume : 1.0;
                  const p = a.play();
                  if (p && typeof p.catch === "function")
                    p.catch((err) => {
                      console.warn(
                        "GifStepper: failed to play gif sound fallback",
                        this.gifSound,
                        err
                      );
                    });
                }
              } catch (err) {
                console.warn(
                  "GifStepper: error creating fallback audio element",
                  this.gifSound,
                  err
                );
              }
            }
          } catch (err) {
            console.error("GifStepper: error playing gif sound", err);
          }
        }
      }
    }
    // If a trigger percent is set, check and fire when crossing the trigger frame
    if (
      this.gifSound &&
      this._gifSoundPercent != null &&
      !this._gifSoundTriggered &&
      this.frames.length
    ) {
      const triggerFrame = Math.floor((this._gifSoundPercent / 100) * (this.frames.length - 1));
      if (this.current >= triggerFrame) {
        this._gifSoundTriggered = true;
        try {
          if (this._soundAudio) {
            try {
              this._soundAudio.currentTime = 0;
            } catch (e) {}
            const playPromise = this._soundAudio.play();
            if (playPromise && typeof playPromise.catch === "function") playPromise.catch(() => {});
          } else {
            const a = new Audio(this.gifSound);
            a.volume = Number.isFinite(this.gifSoundVolume) ? this.gifSoundVolume : 1.0;
            const p = a.play();
            if (p && typeof p.catch === "function") p.catch(() => {});
          }
        } catch (err) {
          // swallow playback errors here; handled elsewhere
        }
      }
    }
  }

  reset() {
    if (!this.frames.length) return;
    this.current = 0;
    this.started = true;
    this.done = false;
    this.canvas.style.cursor = "pointer";
    this.canvas.style.width = "100%";
    this.resetBtn.style.display = "none";
    this.progressFill.style.width = (1 / this.frames.length) * 100 + "%";
    const bmp = this.frames[0];
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.drawImage(bmp, 0, 0);
    // Stop any playing gif sound when resetting
    if (this._soundAudio) {
      try {
        this._soundAudio.pause();
        try {
          this._soundAudio.currentTime = 0;
        } catch (e) {}
      } catch (e) {
        // ignore
      }
      // keep preloaded instance around for reuse; do not null it so future plays are quick
    }
    // reset trigger flag so sound can fire again on replay
    this._gifSoundTriggered = false;
  }

  setStepsPerClick(n) {
    this.stepsPerClick = n;
  }

  _initGifSound(rawGifSound) {
    try {
      let s = rawGifSound.trim();
      // Normalize to base audio folder. User will supply bare filenames.
      if (!s.startsWith("/audio/")) {
        // Remove any leading './' or 'audio/'
        s = s.replace(/^\.\/?|^audio\//, "");
        s = `/audio/${s}`;
      }
      // assume .mp3 when no extension provided
      if (!/\.[a-z0-9]{2,5}$/i.test(s)) s = s + ".mp3";
      this.gifSound = s;

      // Preload audio
      try {
        const candidate = new Audio(this.gifSound);
        // Quick check whether browser claims to support the likely mime (mp3)
        const canPlay = candidate.canPlayType("audio/mpeg") || candidate.canPlayType("audio/mp3");
        if (!canPlay) {
          console.warn(
            "GifStepper: browser cannot play mp3 audio; skipping preload",
            this.gifSound
          );
        } else {
          this._soundAudio = candidate;
          this._soundAudio.preload = "auto";
          this._soundAudio.volume = Number.isFinite(this.gifSoundVolume)
            ? this.gifSoundVolume
            : 1.0;
          // attach error handler to surface errors instead of letting unhandled rejections bubble
          this._soundAudio.addEventListener("error", (ev) => {
            try {
              console.warn("GifStepper: audio element error for", this.gifSound, ev);
            } catch (e) {}
          });
          // trigger load; browsers may ignore but it's safe to call
          try {
            this._soundAudio.load();
          } catch (e) {
            // some browsers may throw synchronously
          }
        }
      } catch (err) {
        console.warn("GifStepper: failed to create preloaded audio", this.gifSound, err);
        this._soundAudio = null;
      }
    } catch (err) {
      console.warn("GifStepper: invalid data-gif-sound value", rawGifSound, err);
    }
  }

  // Auto-init all [data-gif-stepper] images in the document
  static initAll(root = document) {
    // Install a lightweight unhandledrejection filter once to suppress noisy
    // NotSupportedError rejections coming from media playback attempts for
    // gif-stepper audio. We keep this narrowly targeted.
    if (!GifStepper._unhandledRejectionHandlerInstalled) {
      GifStepper._unhandledRejectionHandlerInstalled = true;
      window.addEventListener("unhandledrejection", (ev) => {
        try {
          const r = ev.reason;
          if (
            r &&
            r.name === "NotSupportedError" &&
            String(r.message || "").includes("no supported source")
          ) {
            console.warn("GifStepper suppressed NotSupportedError:", r.message || r);
            ev.preventDefault();
          }
        } catch (e) {
          // ignore
        }
      });
    }
    const instances = [];
    root.querySelectorAll("img[data-gif-stepper]").forEach((img) => {
      instances.push(new GifStepper(img));
    });
    return instances;
  }
}

// Auto-init on script load
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => GifStepper.initAll());
} else {
  GifStepper.initAll();
}
