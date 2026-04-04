// DialogChain.js
// Generic dialog chain engine for Win98-style modal flows
// Usage: new DialogChain({ steps, onComplete }).start();

import { formatPhoneInput } from "../utils/phone-format.js";

export class DialogChain {
  static _running = false;
  constructor({ steps, onComplete }) {
    this.steps = steps;
    this.onComplete = onComplete;
  }

  async start() {
    if (DialogChain._running) return;
    DialogChain._running = true;
    try {
      for (const raw of this.steps) {
        const item = typeof raw === "string" ? { type: "alert", text: raw } : raw;
        const res = await this.showModal(item);
        if (!res || res.ok === false) {
          return; // abort chain
        }
      }
      if (typeof this.onComplete === "function") {
        await this.onComplete();
      }
    } catch (err) {
      console.error("DialogChain error:", err);
    } finally {
      DialogChain._running = false;
    }
  }

  showModal(item) {
    return new Promise((resolve) => {
      // Ensure Win98 CSS is loaded
      if (!document.querySelector("link[data-win98-dialog]")) {
        const l = document.createElement("link");
        l.rel = "stylesheet";
        l.href = "/css/components/win98-window.css";
        l.setAttribute("data-win98-dialog", "1");
        document.head.appendChild(l);
      }
      const overlay = document.createElement("div");
      overlay.style.position = "fixed";
      overlay.style.left = "0";
      overlay.style.top = "0";
      overlay.style.right = "0";
      overlay.style.bottom = "0";
      overlay.style.background = "rgba(255, 255, 255, 0.7)";
      overlay.style.display = "flex";
      overlay.style.alignItems = "center";
      overlay.style.justifyContent = "center";
      overlay.style.zIndex = "9999";
      overlay.style.padding = "16px 0";

      const win = document.createElement("div");
      win.className = "win98-window";

      const titlebar = document.createElement("div");
      titlebar.className = "win98-titlebar";
      const title = document.createElement("div");
      title.className = "win98-title";
      title.textContent = item.title || "Message";
      const closeBtn = document.createElement("div");
      closeBtn.className = "win98-close";
      closeBtn.textContent = "✖";
      closeBtn.addEventListener("click", () => {
        cleanup();
        resolve({ ok: false });
      });
      titlebar.appendChild(title);
      titlebar.appendChild(closeBtn);

      const content = document.createElement("div");
      content.className = "win98-content";
      let inputEl = null;
      if (item.type === "prompt") {
        const p = document.createElement("div");
        p.textContent = item.text || "";
        inputEl = document.createElement("input");
        inputEl.type = item.inputType || "text";
        inputEl.value = item.default || "";
        inputEl.style.boxSizing = "border-box";
        if (item.inputMode) {
          const mode = item.inputMode === "phone" ? "tel" : item.inputMode;
          inputEl.setAttribute("inputmode", mode);
        }
        if (item.placeholder) inputEl.setAttribute("placeholder", item.placeholder);

        const wantsPhoneFormat =
          item.inputMode === "tel" || item.inputMode === "phone" || item.format === "phone";
        if (wantsPhoneFormat) {
          if (!inputEl.getAttribute("placeholder")) {
            inputEl.setAttribute("placeholder", "(555) 555-5555");
          }
          inputEl.addEventListener("input", () => {
            try {
              const selStart = inputEl.selectionStart || 0;
              const prevLen = inputEl.value.length;
              inputEl.value = formatPhoneInput(inputEl.value);
              const newLen = inputEl.value.length;
              const delta = newLen - prevLen;
              inputEl.selectionStart = inputEl.selectionEnd = Math.max(0, selStart + delta);
            } catch (err) {
              // ignore formatting errors
            }
          });
        }

        content.appendChild(p);
        content.appendChild(inputEl);
      } else {
        const p = document.createElement("div");
        p.textContent = typeof item === "string" ? item : item.text || "";
        content.appendChild(p);
      }
      const buttons = document.createElement("div");
      buttons.className = "win98-buttons";
      const runValidator = async (val) => {
        if (!item.validate) return true;
        try {
          if (typeof item.validate === "function") {
            return await item.validate(val);
          }
          if (item.validate instanceof RegExp) return item.validate.test(val);
          if (typeof item.validate === "string") {
            const re = new RegExp(item.validate);
            return re.test(val);
          }
        } catch (e) {
          return false;
        }
        return false;
      };
      const showFailModal = (fail) => {
        return new Promise((res) => {
          const overlayF = document.createElement("div");
          overlayF.style.position = "fixed";
          overlayF.style.left = "0";
          overlayF.style.top = "0";
          overlayF.style.right = "0";
          overlayF.style.bottom = "0";
          overlayF.style.background = "rgba(255,255,255,0.7)";
          overlayF.style.display = "flex";
          overlayF.style.alignItems = "center";
          overlayF.style.justifyContent = "center";
          overlayF.style.zIndex = "10000";
          const w = document.createElement("div");
          w.className = "win98-window";
          const tb = document.createElement("div");
          tb.className = "win98-titlebar";
          const t = document.createElement("div");
          t.className = "win98-title";
          t.textContent = (fail && fail.title) || "Notice";
          const cb = document.createElement("div");
          cb.className = "win98-close";
          cb.textContent = "✖";
          cb.tabIndex = 0;
          cb.addEventListener("click", () => cleanupF());
          tb.appendChild(t);
          tb.appendChild(cb);
          const cont = document.createElement("div");
          cont.className = "win98-content";
          const txt = document.createElement("div");
          txt.textContent =
            (fail && (fail.text || fail.message)) || String(fail || "Invalid input");
          cont.appendChild(txt);
          const btns = document.createElement("div");
          btns.className = "win98-buttons";
          const closeBtn = document.createElement("button");
          closeBtn.className = "win98-btn";
          closeBtn.textContent = (fail && fail.closeText) || "CLOSE";
          closeBtn.addEventListener("click", () => cleanupF());
          btns.appendChild(closeBtn);
          w.appendChild(tb);
          w.appendChild(cont);
          w.appendChild(btns);
          overlayF.appendChild(w);
          document.body.appendChild(overlayF);
          setTimeout(() => closeBtn.focus(), 10);
          function cleanupF() {
            try {
              overlayF.remove();
            } catch (e) {}
            res();
          }
        });
      };
      const okBtn = document.createElement("button");
      okBtn.className = "win98-btn";
      okBtn.textContent = item.okText || "OK";
      okBtn.addEventListener("click", async () => {
        const val = inputEl ? inputEl.value : undefined;
        const valid = await runValidator(val);
        if (!valid) {
          cleanup();
          await showFailModal(item.validationFailed || { text: "Invalid input" });
          resolve({ ok: false, validationFailed: true });
          return;
        }
        if (item.type === "prompt") {
          cleanup();
          resolve({ ok: true, value: val });
        } else {
          cleanup();
          resolve({ ok: true });
        }
      });
      if (!item.hideCancel) {
        const cancelBtn = document.createElement("button");
        cancelBtn.className = "win98-btn";
        cancelBtn.textContent = item.cancelText || "CANCEL";
        cancelBtn.addEventListener("click", () => {
          cleanup();
          resolve({ ok: false });
        });
        buttons.appendChild(cancelBtn);
      }
      buttons.appendChild(okBtn);
      win.appendChild(titlebar);
      win.appendChild(content);
      win.appendChild(buttons);
      overlay.appendChild(win);
      document.body.appendChild(overlay);
      setTimeout(() => {
        if (inputEl) inputEl.focus();
        else okBtn.focus();
      }, 10);
      function cleanup() {
        try {
          overlay.remove();
        } catch (e) {}
      }
    });
  }
}
