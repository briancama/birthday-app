// UserDisplay component: renders a user avatar and display name as a link to their profile
// Usage: createUserDisplay({ id, username, display_name, headshot }) => HTMLElement

export function createUserDisplay(user) {
  const container = document.createElement("div");
  container.className = "user-display-card";

  const link = document.createElement("a");
  link.href = `/users/${user.username || user.id}`;
  link.className = "user-display-link";

  const img = document.createElement("img");
  img.className = "user-display-avatar";
  img.src = user.headshot || "/images/headshot.jpg";
  img.alt = `${user.display_name || user.username || "User"} avatar`;
  img.setAttribute("data-headshot", `user-${user.id}`);

  const name = document.createElement("div");
  name.className = "user-display-name";
  name.textContent = user.display_name || user.username || "User";

  link.appendChild(name);
  link.appendChild(img);
  container.appendChild(link);
  return container;
}
