import {
  EMOTES_BY_ALIAS,
  EMOTES_BY_KEY,
  MAX_EMOTES_PER_COMMENT,
} from "../constants/wall-emotes.js";

const MENTION_PATTERN = "(?<mention>(?<=^|[^a-z0-9_])@[a-z0-9_-]{3,32})";
const CODE_PATTERN = "(?<code>:[a-z][a-z0-9_-]{0,31}:)";
const ALIAS_ALTERNATION = [...EMOTES_BY_ALIAS.keys()]
  .sort((a, b) => b.length - a.length)
  .map((a) => a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  .join("|");
const ALIAS_PATTERN = ALIAS_ALTERNATION
  ? `(?<=^|\\s)(?<alias>${ALIAS_ALTERNATION})(?=$|\\s|[.,!?])`
  : "";

const tokenRegexCache = new Map();

function getTokenRegex(mentions, emotes) {
  const cacheKey = `${mentions}|${emotes}`;
  if (!tokenRegexCache.has(cacheKey)) {
    const parts = [];
    if (mentions) parts.push(MENTION_PATTERN);
    if (emotes) parts.push(CODE_PATTERN, ALIAS_PATTERN);
    const source = parts.filter(Boolean).join("|");
    tokenRegexCache.set(cacheKey, source ? new RegExp(source, "gi") : null);
  }
  return tokenRegexCache.get(cacheKey);
}

function createEmoteImage(emote, typedText) {
  const img = document.createElement("img");
  img.className = "wall-emote";
  img.src = emote.src;
  img.alt = typedText;
  img.title = `:${emote.key}:`;
  img.width = emote.width;
  img.height = emote.height;
  img.decoding = "async";
  img.draggable = false;
  return img;
}

/** Appends message text to el, wrapping @mentions and/or swapping emote tokens for catalog GIFs. */
export function appendCommentMessage(el, message, { mentions = false, emotes = false } = {}) {
  const text = String(message ?? "");
  const regex = getTokenRegex(mentions, emotes);
  if (!regex) {
    el.appendChild(document.createTextNode(text));
    return;
  }

  let cursor = 0;
  let emoteCount = 0;
  for (const match of text.matchAll(regex)) {
    const { mention, code, alias } = match.groups;
    let node = null;
    if (mention) {
      node = document.createElement("span");
      node.className = "myspace-comment-mention";
      node.textContent = mention;
    } else if (emoteCount < MAX_EMOTES_PER_COMMENT) {
      const emote = code
        ? EMOTES_BY_KEY.get(code.slice(1, -1).toLowerCase())
        : EMOTES_BY_ALIAS.get(alias);
      if (emote) {
        node = createEmoteImage(emote, match[0]);
        emoteCount++;
      }
    }
    if (!node) continue;
    if (match.index > cursor) {
      el.appendChild(document.createTextNode(text.slice(cursor, match.index)));
    }
    el.appendChild(node);
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) el.appendChild(document.createTextNode(text.slice(cursor)));
}

/**
 * Shared MySpace-style comment card component.
 * Returns a .myspace-comment-card DOM element usable in any page.
 *
 * @param {object} opts
 * @param {string}   opts.name          — display name of the commenter
 * @param {string}   opts.message       — comment text
 * @param {string}   opts.date          — ISO date string or Date
 * @param {string}   opts.avatarSrc     — URL for the avatar image
 * @param {string}   opts.dataHeadshot  — value for data-headshot attribute
 * @param {string}   [opts.profileHref] — optional href to commenter profile
 * @param {string}   [opts.entryId]     — entry id (enables delete button)
 * @param {boolean}  [opts.canDelete]   — whether to show delete button
 * @param {function} [opts.onDelete]    — called with entryId when deleted
 * @param {boolean}  [opts.highlightMentions] — wrap @username tags in .myspace-comment-mention
 * @param {boolean}  [opts.renderEmotes] — swap :key: tokens and smiley aliases for catalog GIFs
 * @param {function} [opts.onReply]     — shows a Reply button; called on click
 */
export function createCommentCard({
  name,
  message,
  date,
  avatarSrc,
  dataHeadshot,
  profileHref,
  entryId,
  canDelete,
  onDelete,
  highlightMentions = false,
  renderEmotes = false,
  onReply,
}) {
  const dateText = new Date(date).toLocaleString([], {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  const card = document.createElement("div");
  card.className = "myspace-comment-card";
  if (entryId) card.dataset.entryId = entryId;

  // ── Sidebar: name + avatar ───────────────────────────────────────────
  const sidebar = document.createElement("div");
  sidebar.className = "myspace-comment-sidebar";

  const nameDiv = document.createElement("div");
  nameDiv.className = "myspace-comment-name";
  nameDiv.textContent = name || "Anonymous";

  const img = document.createElement("img");
  img.className = "myspace-comment-avatar";
  img.alt = "avatar";
  img.src = avatarSrc || "/images/headshot.jpg";
  img.setAttribute("data-headshot", dataHeadshot || "user-default");

  if (profileHref) {
    const profileLink = document.createElement("a");
    profileLink.className = "myspace-comment-profile-link";
    profileLink.href = profileHref;
    profileLink.setAttribute(
      "aria-label",
      `View ${(name || "Anonymous").trim() || "Anonymous"} profile`
    );
    profileLink.appendChild(nameDiv);
    profileLink.appendChild(img);
    sidebar.appendChild(profileLink);
  } else {
    sidebar.appendChild(nameDiv);
    sidebar.appendChild(img);
  }

  // ── Content: date + message ──────────────────────────────────────────
  const content = document.createElement("div");
  content.className = "myspace-comment-content";

  const header = document.createElement("div");
  header.className = "myspace-comment-header";

  const dateSpan = document.createElement("span");
  dateSpan.className = "myspace-comment-date";
  dateSpan.textContent = dateText;
  header.appendChild(dateSpan);

  if (onReply) {
    const replyBtn = document.createElement("button");
    replyBtn.type = "button";
    replyBtn.className = "myspace-comment-reply";
    replyBtn.textContent = "Reply";
    replyBtn.setAttribute("aria-label", `Reply to ${(name || "Anonymous").trim() || "Anonymous"}`);
    replyBtn.addEventListener("click", () => onReply(entryId));
    header.appendChild(replyBtn);
  }

  if (canDelete && onDelete) {
    const delBtn = document.createElement("button");
    delBtn.className = "myspace-comment-delete";
    delBtn.textContent = "✕";
    delBtn.setAttribute("aria-label", "Delete");
    delBtn.addEventListener("click", () => onDelete(entryId));
    header.appendChild(delBtn);
  }

  const msg = document.createElement("div");
  msg.className = "myspace-comment-message";
  if ((highlightMentions || renderEmotes) && message) {
    appendCommentMessage(msg, message, { mentions: highlightMentions, emotes: renderEmotes });
  } else {
    msg.textContent = message || "";
  }

  content.appendChild(header);
  content.appendChild(msg);

  card.appendChild(sidebar);
  card.appendChild(content);

  return card;
}
