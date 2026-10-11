const TOKEN_REGEX = /(?:^|[^a-z0-9_])@([a-z0-9_-]{1,32})$/i;
const DEBOUNCE_MS = 200;

let instanceCount = 0;

function renderUserOption(user) {
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

  return [img, name, handle];
}

/**
 * @ dropdown for a textarea. Suggests published profiles by username or display name
 * and inserts "@username ". Options swap in another single-char trigger and item source.
 */
export class MentionAutocomplete {
  constructor(
    textarea,
    {
      endpoint = "/api/users/mention-search",
      tokenRegex = TOKEN_REGEX,
      search = null,
      renderOption = renderUserOption,
      insertText = (user) => `@${user.username} `,
      ariaLabel = "People to tag",
      debounceMs = DEBOUNCE_MS,
    } = {}
  ) {
    this.textarea = textarea;
    this.endpoint = endpoint;
    this.tokenRegex = tokenRegex;
    this.searchItems = search || ((query) => this.fetchUsers(query));
    this.renderOption = renderOption;
    this.insertText = insertText;
    this.debounceMs = debounceMs;
    this.items = [];
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
    this.list.setAttribute("aria-label", ariaLabel);
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
    const match = this.textarea.value.slice(0, caret).match(this.tokenRegex);
    clearTimeout(this.debounceTimer);
    if (!match) {
      this.close();
      return;
    }
    const query = match[1];
    this.tokenStart = caret - query.length - 1;
    this.debounceTimer = setTimeout(() => this.search(query), this.debounceMs);
  }

  async fetchUsers(query) {
    this.abortController?.abort();
    this.abortController = new AbortController();
    const resp = await fetch(`${this.endpoint}?q=${encodeURIComponent(query)}`, {
      credentials: "include",
      signal: this.abortController.signal,
    });
    if (!resp.ok) throw new Error(resp.statusText);
    const { users } = await resp.json();
    return users;
  }

  async search(query) {
    const seq = ++this.requestSeq;
    try {
      const items = await this.searchItems(query);
      if (seq !== this.requestSeq) return;
      this.items = items || [];
      this.activeIndex = this.items.length ? 0 : -1;
      this.render();
    } catch (err) {
      if (err.name !== "AbortError") this.close();
    }
  }

  render() {
    this.list.replaceChildren();
    if (!this.items.length) {
      this.close();
      return;
    }
    this.items.forEach((item, i) => {
      const li = document.createElement("li");
      li.id = `${this.listId}-${i}`;
      li.className = "mention-autocomplete__option";
      li.setAttribute("role", "option");
      li.dataset.index = String(i);
      li.append(...this.renderOption(item));
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
        this.activeIndex = (this.activeIndex + 1) % this.items.length;
        this.highlight();
        break;
      case "ArrowUp":
        e.preventDefault();
        this.activeIndex = (this.activeIndex - 1 + this.items.length) % this.items.length;
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
    const item = this.items[index];
    if (!item || this.tokenStart < 0) return;
    const caret = this.textarea.selectionStart;
    this.textarea.setRangeText(this.insertText(item), this.tokenStart, caret, "end");
    this.textarea.focus();
    this.close();
    this.textarea.dispatchEvent(new Event("input", { bubbles: true }));
  }

  close() {
    clearTimeout(this.debounceTimer);
    this.requestSeq++;
    this.items = [];
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
