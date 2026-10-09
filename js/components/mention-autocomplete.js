const TOKEN_REGEX = /(?:^|[^a-z0-9_])@([a-z0-9_-]{1,32})$/i;
const DEBOUNCE_MS = 200;

let instanceCount = 0;

/**
 * @ dropdown for a textarea. Suggests published profiles by username or display name
 * and inserts "@username ".
 */
export class MentionAutocomplete {
  constructor(textarea, { endpoint = "/api/users/mention-search" } = {}) {
    this.textarea = textarea;
    this.endpoint = endpoint;
    this.users = [];
    this.activeIndex = -1;
    this.tokenStart = -1;
    this.debounceTimer = null;
    this.blurTimer = null;
    this.requestSeq = 0;
    this.abortController = null;
    this.listId = `mention-list-${++instanceCount}`;

    this.list = document.createElement("ul");
    this.list.id = this.listId;
    this.list.className = "mention-autocomplete";
    this.list.setAttribute("role", "listbox");
    this.list.setAttribute("aria-label", "People to tag");
    this.list.hidden = true;
    textarea.insertAdjacentElement("afterend", this.list);
    textarea.parentElement?.classList.add("mention-autocomplete-host");

    textarea.setAttribute("aria-autocomplete", "list");
    textarea.setAttribute("aria-controls", this.listId);
    textarea.setAttribute("aria-expanded", "false");

    this.onInput = () => this.handleInput();
    this.onKeyDown = (e) => this.handleKeyDown(e);
    this.onBlur = () => {
      this.blurTimer = setTimeout(() => this.close(), 150);
    };
    this.onListMouseDown = (e) => e.preventDefault();
    this.onListClick = (e) => {
      const option = e.target.closest("[data-index]");
      if (option) this.select(Number(option.dataset.index));
    };

    textarea.addEventListener("input", this.onInput);
    textarea.addEventListener("keydown", this.onKeyDown);
    textarea.addEventListener("blur", this.onBlur);
    this.list.addEventListener("mousedown", this.onListMouseDown);
    this.list.addEventListener("click", this.onListClick);
  }

  handleInput() {
    const caret = this.textarea.selectionStart;
    const match = this.textarea.value.slice(0, caret).match(TOKEN_REGEX);
    clearTimeout(this.debounceTimer);
    if (!match) {
      this.close();
      return;
    }
    const query = match[1];
    this.tokenStart = caret - query.length - 1;
    this.debounceTimer = setTimeout(() => this.search(query), DEBOUNCE_MS);
  }

  async search(query) {
    const seq = ++this.requestSeq;
    this.abortController?.abort();
    this.abortController = new AbortController();
    try {
      const resp = await fetch(`${this.endpoint}?q=${encodeURIComponent(query)}`, {
        credentials: "include",
        signal: this.abortController.signal,
      });
      if (!resp.ok) throw new Error(resp.statusText);
      const { users } = await resp.json();
      if (seq !== this.requestSeq) return;
      this.users = users || [];
      this.activeIndex = this.users.length ? 0 : -1;
      this.render();
    } catch (err) {
      if (err.name !== "AbortError") this.close();
    }
  }

  render() {
    this.list.replaceChildren();
    if (!this.users.length) {
      this.close();
      return;
    }
    this.users.forEach((user, i) => {
      const li = document.createElement("li");
      li.id = `${this.listId}-${i}`;
      li.className = "mention-autocomplete__option";
      li.setAttribute("role", "option");
      li.dataset.index = String(i);

      const img = document.createElement("img");
      img.className = "mention-autocomplete__avatar";
      img.src = user.headshot || "/images/headshot.jpg";
      img.alt = "";

      const name = document.createElement("span");
      name.className = "mention-autocomplete__name";
      name.textContent = user.display_name || user.username;

      const handle = document.createElement("span");
      handle.className = "mention-autocomplete__username";
      handle.textContent = `@${user.username}`;

      li.append(img, name, handle);
      this.list.appendChild(li);
    });
    this.list.style.top = `${this.textarea.offsetTop + this.textarea.offsetHeight}px`;
    this.list.hidden = false;
    this.textarea.setAttribute("aria-expanded", "true");
    this.highlight();
  }

  highlight() {
    [...this.list.children].forEach((li, i) => {
      const active = i === this.activeIndex;
      li.classList.toggle("is-active", active);
      li.setAttribute("aria-selected", active ? "true" : "false");
      if (active) li.scrollIntoView({ block: "nearest" });
    });
    if (this.activeIndex >= 0) {
      this.textarea.setAttribute("aria-activedescendant", `${this.listId}-${this.activeIndex}`);
    } else {
      this.textarea.removeAttribute("aria-activedescendant");
    }
  }

  handleKeyDown(e) {
    if (this.list.hidden) return;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        this.activeIndex = (this.activeIndex + 1) % this.users.length;
        this.highlight();
        break;
      case "ArrowUp":
        e.preventDefault();
        this.activeIndex = (this.activeIndex - 1 + this.users.length) % this.users.length;
        this.highlight();
        break;
      case "Enter":
      case "Tab":
        if (this.activeIndex < 0) return;
        e.preventDefault();
        this.select(this.activeIndex);
        break;
      case "Escape":
        e.preventDefault();
        this.close();
        break;
    }
  }

  select(index) {
    const user = this.users[index];
    if (!user || this.tokenStart < 0) return;
    const caret = this.textarea.selectionStart;
    this.textarea.setRangeText(`@${user.username} `, this.tokenStart, caret, "end");
    this.textarea.focus();
    this.close();
  }

  close() {
    clearTimeout(this.debounceTimer);
    this.requestSeq++;
    this.users = [];
    this.activeIndex = -1;
    this.list.hidden = true;
    this.list.replaceChildren();
    this.textarea.setAttribute("aria-expanded", "false");
    this.textarea.removeAttribute("aria-activedescendant");
  }

  cleanup() {
    clearTimeout(this.debounceTimer);
    clearTimeout(this.blurTimer);
    this.abortController?.abort();
    this.textarea.removeEventListener("input", this.onInput);
    this.textarea.removeEventListener("keydown", this.onKeyDown);
    this.textarea.removeEventListener("blur", this.onBlur);
    this.list.removeEventListener("mousedown", this.onListMouseDown);
    this.list.removeEventListener("click", this.onListClick);
    this.list.remove();
  }
}
