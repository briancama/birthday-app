import { WALL_EMOTES } from "../constants/wall-emotes.js";

let instanceCount = 0;

/** Grid button that inserts ":key: " into a textarea at the caret. */
export class EmotePicker {
  constructor(host, textarea) {
    this.host = host;
    this.textarea = textarea;
    const panelId = `emote-picker-panel-${++instanceCount}`;

    this.toggle = document.createElement("button");
    this.toggle.type = "button";
    this.toggle.className = "emote-picker__toggle";
    this.toggle.setAttribute("aria-label", "Add emote");
    this.toggle.setAttribute("aria-haspopup", "true");
    this.toggle.setAttribute("aria-expanded", "false");
    this.toggle.setAttribute("aria-controls", panelId);
    const icon = WALL_EMOTES[0];
    if (icon) {
      const img = document.createElement("img");
      img.src = icon.src;
      img.alt = "";
      img.width = icon.width;
      img.height = icon.height;
      this.toggle.appendChild(img);
    }

    this.panel = document.createElement("div");
    this.panel.id = panelId;
    this.panel.className = "emote-picker__panel";
    this.panel.setAttribute("role", "group");
    this.panel.setAttribute("aria-label", "Emotes");
    this.panel.hidden = true;
    WALL_EMOTES.forEach((emote) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "emote-picker__option";
      btn.dataset.key = emote.key;
      btn.title = `:${emote.key}:`;
      const img = document.createElement("img");
      img.src = emote.src;
      img.alt = emote.label;
      img.width = emote.width;
      img.height = emote.height;
      img.loading = "lazy";
      btn.appendChild(img);
      this.panel.appendChild(btn);
    });

    host.append(this.toggle, this.panel);

    this.onToggleClick = () => (this.panel.hidden ? this.open() : this.close());
    this.onPanelClick = (e) => {
      const option = e.target.closest("[data-key]");
      if (option) this.insert(option.dataset.key);
    };
    this.onKeyDown = (e) => {
      if (e.key === "Escape" && !this.panel.hidden) {
        e.preventDefault();
        this.close();
        this.toggle.focus();
      }
    };
    this.onDocPointerDown = (e) => {
      if (!this.host.contains(e.target)) this.close();
    };

    this.toggle.addEventListener("click", this.onToggleClick);
    this.panel.addEventListener("click", this.onPanelClick);
    host.addEventListener("keydown", this.onKeyDown);
    document.addEventListener("pointerdown", this.onDocPointerDown);
  }

  open() {
    this.panel.hidden = false;
    this.toggle.setAttribute("aria-expanded", "true");
    this.panel.querySelector("button")?.focus();
  }

  close() {
    this.panel.hidden = true;
    this.toggle.setAttribute("aria-expanded", "false");
  }

  insert(key) {
    const { selectionStart, selectionEnd, value, maxLength } = this.textarea;
    const text = `:${key}: `;
    if (maxLength > 0 && value.length - (selectionEnd - selectionStart) + text.length > maxLength) {
      return;
    }
    this.textarea.setRangeText(text, selectionStart, selectionEnd, "end");
    this.close();
    this.textarea.focus();
    this.textarea.dispatchEvent(new Event("input", { bubbles: true }));
  }

  cleanup() {
    this.toggle.removeEventListener("click", this.onToggleClick);
    this.panel.removeEventListener("click", this.onPanelClick);
    this.host.removeEventListener("keydown", this.onKeyDown);
    document.removeEventListener("pointerdown", this.onDocPointerDown);
    this.toggle.remove();
    this.panel.remove();
  }
}
