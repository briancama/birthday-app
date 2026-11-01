// Chips wallet API for the EJS site. All money logic lives in Postgres
// (sql/2026_10_29_chips_wallet.sql); these routes only call the service-role
// *_for RPCs for the cookie-signed user. Amounts are units (1 chip = 100).
const express = require("express");
const router = express.Router();
const { getSupabase, requireSignedUser, isAdminUser } = require("../js/utils/server-utils");

const supabase = getSupabase();
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_LEDGER_LIMIT = 10;
const MAX_LEDGER_LIMIT = 50;
const MAX_ADJUST_UNITS = 100_000_000;
// The only earn action the site exposes for now; the client never picks the action.
const CHECKIN_ACTION = "daily_checkin";

function signedPlayer(req, res) {
  const userId = requireSignedUser(req);
  if (!userId || !UUID_REGEX.test(userId)) {
    res.status(401).json({ error: "Sign in to see your chips" });
    return null;
  }
  return userId;
}

function sendRpcError(res, error, fallback) {
  if (error && error.code === "WL001") {
    return res.status(409).json({ error: "Not enough chips", code: "insufficient_funds" });
  }
  console.error(fallback, error);
  return res.status(500).json({ error: fallback });
}

async function loadWallet(playerId, { limit = DEFAULT_LEDGER_LIMIT, beforeId = null } = {}) {
  const [balanceResult, ledgerResult] = await Promise.all([
    supabase.rpc("get_wallet_for", { p_player: playerId }),
    supabase.rpc("get_ledger_for", {
      p_player: playerId,
      p_limit: limit + 1,
      p_before_id: beforeId,
    }),
  ]);
  if (balanceResult.error) throw balanceResult.error;
  if (ledgerResult.error) throw ledgerResult.error;
  const rows = ledgerResult.data || [];
  const ledger = rows.slice(0, limit);
  return {
    balance: Number(balanceResult.data) || 0,
    ledger,
    nextBeforeId: rows.length > limit ? ledger[ledger.length - 1].id : null,
  };
}

// GET /api/wallet?limit=10&before=<ledger id>
router.get("/wallet", async (req, res) => {
  res.set("Cache-Control", "private, no-store");
  const playerId = signedPlayer(req, res);
  if (!playerId) return;
  const limit = Math.min(
    Math.max(parseInt(req.query.limit, 10) || DEFAULT_LEDGER_LIMIT, 1),
    MAX_LEDGER_LIMIT
  );
  const beforeId = /^\d+$/.test(String(req.query.before || "")) ? Number(req.query.before) : null;
  try {
    return res.json(await loadWallet(playerId, { limit, beforeId }));
  } catch (error) {
    return sendRpcError(res, error, "Could not load your chips");
  }
});

// POST /api/wallet/checkin -> { status, action, amount, balance }
router.post("/wallet/checkin", async (req, res) => {
  res.set("Cache-Control", "private, no-store");
  const playerId = signedPlayer(req, res);
  if (!playerId) return;
  const { data, error } = await supabase.rpc("earn_chips_for", {
    p_player: playerId,
    p_action: CHECKIN_ACTION,
  });
  if (error) return sendRpcError(res, error, "Could not check in");
  return res.json(data);
});

// POST /api/wallet/adjust (admin) { userId, amount (units), memo, idempotencyKey? }
router.post("/wallet/adjust", async (req, res) => {
  res.set("Cache-Control", "private, no-store");
  const adminId = signedPlayer(req, res);
  if (!adminId) return;
  if (!(await isAdminUser(adminId))) return res.status(403).json({ error: "Admins only" });

  const { userId, amount, memo, idempotencyKey } = req.body || {};
  if (!UUID_REGEX.test(String(userId || ""))) {
    return res.status(400).json({ error: "userId must be a user id" });
  }
  if (!Number.isInteger(amount) || amount === 0 || Math.abs(amount) > MAX_ADJUST_UNITS) {
    return res.status(400).json({ error: "amount must be a non-zero whole number of units" });
  }
  if (typeof memo !== "string" || !memo.trim()) {
    return res.status(400).json({ error: "memo is required" });
  }
  if (idempotencyKey != null && (typeof idempotencyKey !== "string" || !idempotencyKey.trim())) {
    return res.status(400).json({ error: "idempotencyKey must be a non-empty string" });
  }

  const { data, error } = await supabase.rpc("admin_adjust", {
    p_player: userId,
    p_amount: amount,
    p_memo: memo.trim().slice(0, 500),
    p_idem: idempotencyKey ? `adjust:${idempotencyKey.trim()}` : null,
    p_actor: adminId,
  });
  if (error) return sendRpcError(res, error, "Could not adjust chips");
  return res.json({ balance: Number(data) || 0 });
});

module.exports = router;
