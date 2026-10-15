// Admin-only judging controls on kit pages; the server re-checks admin on every action.
import { apiJson } from "./kit-utils.js";

const bar = document.querySelector("[data-kit-admin]");

bar?.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-admin-action]");
  if (!btn) return;
  if (btn.dataset.confirm && !confirm(btn.dataset.confirm)) return;
  const error = bar.querySelector("[data-admin-error]");
  btn.disabled = true;
  try {
    await apiJson(`/api/competitions/${bar.dataset.competitionId}/judging`, {
      method: "POST",
      body: { action: btn.dataset.adminAction },
    });
    location.reload();
  } catch (err) {
    btn.disabled = false;
    if (error) error.textContent = err.message;
  }
});
