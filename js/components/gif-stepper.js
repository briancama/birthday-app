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
      console.warn("GifStepper: ImageDecoder not supported. Use Chrome or Edge 94+.");
      return;
    }

    this.img = img;
    this.src = img.src;
    this.stepsPerClick = options.stepsPerClick ?? parseInt(img.dataset.stepsPerClick) ?? 1;
    this.frames = [];
    this.current = -1;
    this.started = false;
    this.done = false;
    // Prevent emitting completion more than once per instance
    this._gifCompletedEmitted = false;

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
    });
    this.ctx = this.canvas.getContext("2d");

    this.progressWrap = document.createElement("div");
    Object.assign(this.progressWrap.style, {
      display: "none",
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
    } catch (err) {
      console.error("GifStepper failed to load:", this.src, err);
    }
  }

  _advance() {
    if (!this.frames.length || this.done) return;

    if (!this.started) {
      this.started = true;
      this.progressWrap.style.display = "block";
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
  }

  setStepsPerClick(n) {
    this.stepsPerClick = n;
  }

  // Auto-init all [data-gif-stepper] images in the document
  static initAll(root = document) {
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
