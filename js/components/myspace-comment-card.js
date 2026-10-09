const MENTION_SPLIT_REGEX = /((?:^|[^a-z0-9_])@[a-z0-9_-]{3,32})/gi;

function appendMessageWithMentions(el, message) {
  String(message)
    .split(MENTION_SPLIT_REGEX)
    .forEach((part, i) => {
      if (!part) return;
      if (i % 2 === 0) {
        el.appendChild(document.createTextNode(part));
        return;
      }
      const at = part.indexOf("@");
      if (at > 0) el.appendChild(document.createTextNode(part.slice(0, at)));
      const tag = document.createElement("span");
      tag.className = "myspace-comment-mention";
      tag.textContent = part.slice(at);
      el.appendChild(tag);
    });
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
  if (highlightMentions && message) {
    appendMessageWithMentions(msg, message);
  } else {
    msg.textContent = message || "";
  }

  content.appendChild(header);
  content.appendChild(msg);

  card.appendChild(sidebar);
  card.appendChild(content);

  return card;
}
