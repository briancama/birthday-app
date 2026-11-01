// Chips wallet check against the DEV Supabase project (no local server needed).
// Covers idempotent replay, insufficient funds, concurrent debits, earn caps,
// RLS with server-minted JWTs, and the contest leaderboard (scored from the ledger).
//
//   npm run verify:wallet
//
// Needs SUPABASE_URL / SUPABASE_SERVICE_ROLE / SUPABASE_JWT_SECRET in .env and the
// dev url + publishable key in js/config.js. Creates throwaway wtest_* users, rules,
// and contests, and deletes them (and their ledger rows) at the end.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..", "..");
require(path.join(ROOT, "node_modules", "dotenv")).config({
  path: path.join(ROOT, ".env"),
  quiet: true,
});
const { createClient } = require("@supabase/supabase-js");
const { getSupabase, mintSupabaseJwt } = require(path.join(ROOT, "js", "utils", "server-utils"));

// Dev project = the first url/key pair in js/config.js (the isLocal branch)
const config = fs.readFileSync(path.join(ROOT, "js", "config.js"), "utf8");
const DEV_URL = (config.match(/url:\s*"([^"]+)"/) || [])[1];
const DEV_ANON_KEY = (config.match(/key:\s*"([^"]+)"/) || [])[1];

if (!DEV_URL || process.env.SUPABASE_URL !== DEV_URL) {
  console.error("Refusing to run: SUPABASE_URL is not the dev project from js/config.js.");
  process.exit(1);
}
if (!process.env.SUPABASE_JWT_SECRET) {
  console.error("SUPABASE_JWT_SECRET is not set in .env (needed for the RLS checks).");
  process.exit(1);
}

const db = getSupabase();
const RUN = crypto.randomBytes(3).toString("hex");
const created = { users: [], rules: [], contests: [] };
let failures = 0;

const check = (label, ok, extra = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${extra ? `  (${extra})` : ""}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const plusMs = (iso, ms) => new Date(Date.parse(iso) + ms).toISOString();

async function makeUser(tag, { isadmin = false } = {}) {
  const username = `wtest_${RUN}_${tag}`;
  const { data, error } = await db
    .from("users")
    .insert({ username, display_name: `Wallet Test ${tag}`, isadmin })
    .select("id")
    .single();
  if (error) throw new Error(`create user ${tag}: ${error.message}`);
  created.users.push(data.id);
  return data.id;
}

function asPlayer(userId) {
  const { token } = mintSupabaseJwt(userId);
  return createClient(DEV_URL, DEV_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

const adjust = (player, amount, idem = null) =>
  db.rpc("admin_adjust", { p_player: player, p_amount: amount, p_memo: "verify", p_idem: idem });
const balanceOf = async (player) =>
  Number((await db.rpc("get_wallet_for", { p_player: player })).data);
const ledgerOf = async (player) =>
  (await db.from("wallet_ledger").select("*").eq("player_id", player).order("id")).data || [];
const lastLedgerTime = async (player) => {
  const rows = await ledgerOf(player);
  return rows[rows.length - 1].created_at;
};

async function addRule(suffix, fields) {
  const action = `wtest_${RUN}_${suffix}`;
  const { error } = await db.from("earn_rules").insert({ action, ...fields });
  if (error) throw new Error(`create rule ${suffix}: ${error.message}`);
  created.rules.push(action);
  return action;
}

async function idempotency() {
  console.log("\n-- Idempotency");
  const a = await makeUser("idem");
  const first = await adjust(a, 1000, `verify:${RUN}:k1`);
  const replay = await adjust(a, 1000, `verify:${RUN}:k1`);
  check("first write returns new balance", first.data === 1000, JSON.stringify(first));
  check("replay returns the original result", replay.data === 1000);
  check("replay wrote nothing", (await ledgerOf(a)).length === 1 && (await balanceOf(a)) === 1000);

  const racers = await Promise.all(
    Array.from({ length: 10 }, () => adjust(a, 500, `verify:${RUN}:k2`))
  );
  check(
    "10 concurrent same-key calls all succeed",
    racers.every((r) => !r.error),
    racers.find((r) => r.error)?.error?.message
  );
  check(
    "…and all return the same balance",
    racers.every((r) => r.data === 1500)
  );
  check(
    "…and only one ledger row was written",
    (await ledgerOf(a)).length === 2 && (await balanceOf(a)) === 1500
  );
}

async function insufficientFunds() {
  console.log("\n-- Insufficient funds");
  const a = await makeUser("broke");
  await adjust(a, 300);
  const { error } = await adjust(a, -301);
  check(
    "overdraft raises WL001 insufficient_funds",
    error && error.code === "WL001",
    error?.message
  );
  check("balance unchanged after overdraft", (await balanceOf(a)) === 300);
  check("no ledger row for the failed debit", (await ledgerOf(a)).length === 1);
}

async function concurrentDebits() {
  console.log("\n-- Concurrent debits");
  const b = await makeUser("race");
  await adjust(b, 1000);
  const results = await Promise.all(
    Array.from({ length: 20 }, (_, i) => adjust(b, -100, `verify:${RUN}:debit:${i}`))
  );
  const ok = results.filter((r) => !r.error).length;
  const broke = results.filter((r) => r.error && r.error.code === "WL001").length;
  check("exactly 10 of 20 debits succeed", ok === 10, `ok=${ok}`);
  check("the other 10 fail with insufficient_funds", broke === 10, `broke=${broke}`);
  const rows = await ledgerOf(b);
  const sum = rows.reduce((t, r) => t + Number(r.amount), 0);
  check("final balance is 0", (await balanceOf(b)) === 0);
  check("sum(ledger) == balance", sum === 0, `sum=${sum}`);
  check(
    "balance_after never negative",
    rows.every((r) => r.balance_after >= 0)
  );
  check(
    "balance_after values form a clean chain",
    rows.every(
      (r, i) => i === 0 || r.balance_after === rows[i - 1].balance_after + Number(r.amount)
    )
  );
}

async function earnCaps() {
  console.log("\n-- Earn caps");
  const c = await makeUser("earner");
  const client = asPlayer(c);
  const earn = async (action, ref = null) => {
    const { data, error } = await client.rpc("earn_chips", { p_action: action, p_ref_id: ref });
    if (error) throw new Error(`earn_chips ${action}: ${error.message}`);
    return data;
  };

  const daily = await addRule("daily", { amount: 100, daily_cap: 2 });
  const life = await addRule("life", { amount: 100, lifetime_cap: 1 });
  const byRef = await addRule("ref", { amount: 100 });
  const off = await addRule("off", { amount: 100, active: false });

  const d = [await earn(daily), await earn(daily), await earn(daily)].map((r) => r.status);
  check("per-action daily cap", d.join() === "earned,earned,daily_cap", d.join());
  const l = [await earn(life), await earn(life)].map((r) => r.status);
  check("lifetime cap", l.join() === "earned,lifetime_cap", l.join());

  const ref1 = crypto.randomUUID();
  const r = [
    await earn(byRef, ref1),
    await earn(byRef, ref1),
    await earn(byRef, crypto.randomUUID()),
  ];
  check(
    "same ref_id can't pay twice",
    r.map((x) => x.status).join() === "earned,already_earned,earned"
  );

  check(
    "unknown action is a clean result",
    (await earn(`wtest_${RUN}_nope`)).status === "unknown_action"
  );
  check("inactive rule is a clean result", (await earn(off)).status === "inactive");

  const rows = (await ledgerOf(c)).filter((x) => x.kind === "earn");
  check(
    "earn rows record the action in ref_type",
    rows.every((x) => x.ref_type.startsWith(`wtest_${RUN}_`))
  );
  check("capped calls wrote nothing", rows.length === 5 && (await balanceOf(c)) === 500);

  const { data: settings } = await db.from("wallet_settings").select("*").single();
  const max = settings && settings.max_earn_per_player_per_day;
  if (!max || max <= 501) {
    console.log("SKIP  global cap (max_earn_per_player_per_day must be > 501 units)");
    return;
  }
  const big = await addRule("big", { amount: max - 500 });
  const g1 = await earn(big);
  const g2 = await earn(byRef, crypto.randomUUID());
  check("global cap allows reaching the max exactly", g1.status === "earned", g1.status);
  check("global cap blocks the next earn", g2.status === "global_cap", g2.status);
  check("global cap result carries the balance", g2.balance === max && g2.amount === 0);
}

async function rls() {
  console.log("\n-- RLS and privileges");
  const a = await makeUser("rls_a");
  const b = await makeUser("rls_b");
  const admin = await makeUser("rls_admin", { isadmin: true });
  await adjust(a, 700);
  await adjust(b, 900);
  const A = asPlayer(a);
  const anon = createClient(DEV_URL, DEV_ANON_KEY, { auth: { persistSession: false } });

  const own = await A.rpc("get_wallet");
  check(
    "get_wallet returns the caller's balance",
    own.data === 700,
    JSON.stringify(own.error || own.data)
  );
  const ledger = await A.rpc("get_ledger", { p_limit: 5 });
  check(
    "get_ledger returns the caller's rows",
    !ledger.error && ledger.data.length === 1 && ledger.data[0].amount === 700
  );

  const wallets = await A.from("wallets").select("player_id");
  check(
    "wallets: only own row visible",
    !wallets.error && wallets.data.every((w) => w.player_id === a) && wallets.data.length === 1
  );
  const otherLedger = await A.from("wallet_ledger").select("id").eq("player_id", b);
  check("ledger: other player's rows hidden", !otherLedger.error && otherLedger.data.length === 0);

  const writes = await Promise.all([
    A.from("wallet_ledger").insert({
      player_id: a,
      amount: 100,
      balance_after: 800,
      kind: "earn",
      idempotency_key: `x:${RUN}`,
    }),
    A.from("wallets").update({ balance: 999999 }).eq("player_id", a).select(),
    A.from("wallets").delete().eq("player_id", b).select(),
    A.from("earn_rules").insert({ action: `x_${RUN}`, amount: 1 }),
  ]);
  check(
    "no client writes to wallet tables",
    writes.every((w) => w.error),
    writes.map((w) => (w.error ? "denied" : "ALLOWED")).join(",")
  );
  check(
    "balance untouched by write attempts",
    (await balanceOf(a)) === 700 && (await balanceOf(b)) === 900
  );

  const internal = await Promise.all([
    A.rpc("wallet_apply", {
      p_player: a,
      p_amount: 100000,
      p_kind: "grant",
      p_idem: `x:${RUN}:apply`,
    }),
    A.rpc("get_wallet_for", { p_player: b }),
    A.rpc("get_ledger_for", { p_player: b }),
    A.rpc("earn_chips_for", { p_player: b, p_action: "daily_checkin" }),
    A.rpc("grant_starting_chips", { p_amount: 100000, p_player: a }),
  ]);
  check(
    "internal / *_for functions not callable by players",
    internal.every((r) => r.error),
    internal.map((r) => (r.error ? "denied" : "ALLOWED")).join(",")
  );

  const notAdmin = await A.rpc("admin_adjust", { p_player: a, p_amount: 5000, p_memo: "hack" });
  check(
    "non-admin admin_adjust rejected",
    notAdmin.error && /admin_only/.test(notAdmin.error.message)
  );
  await A.from("users").update({ isadmin: true }).eq("id", a);
  const { data: me } = await db.from("users").select("isadmin").eq("id", a).single();
  check("player can't make themselves admin", me.isadmin === false);

  const anonWallet = await anon.rpc("get_wallet");
  check("anon can't call get_wallet", !!anonWallet.error);
  const anonRows = await anon.from("wallet_ledger").select("id").limit(1);
  check("anon sees no ledger rows", !!anonRows.error || anonRows.data.length === 0);

  const byAdmin = await asPlayer(admin).rpc("admin_adjust", {
    p_player: a,
    p_amount: 50,
    p_memo: "bonus",
  });
  check(
    "isadmin player can admin_adjust",
    byAdmin.data === 750,
    JSON.stringify(byAdmin.error || byAdmin.data)
  );
  const adjRow = (await ledgerOf(a)).pop();
  check(
    "adjustment records kind/ref_type/admin id",
    adjRow.kind === "adjustment" && adjRow.ref_type === "admin" && adjRow.ref_id === admin
  );
}

async function contestLeaderboard() {
  console.log("\n-- Contest leaderboard (from the ledger)");
  const e = await makeUser("lb_e");
  const f = await makeUser("lb_f");
  const g = await makeUser("lb_g");
  const viewer = asPlayer(e);

  await adjust(e, 1000);
  await adjust(f, 500);
  const start = plusMs(await lastLedgerTime(f), 1);
  await sleep(20);
  await adjust(e, 300);
  await adjust(f, -200);
  await adjust(g, 700);
  const end = plusMs(await lastLedgerTime(g), 1);
  await sleep(20);
  await adjust(e, 5000);

  const { data: contest } = await db
    .from("contests")
    .insert({ name: `wtest ${RUN} ended`, starts_at: start, ends_at: end })
    .select("id")
    .single();
  created.contests.push(contest.id);
  const lb = await viewer.rpc("contest_leaderboard", { p_contest_id: contest.id });
  check("players can read the leaderboard", !lb.error, lb.error?.message);
  const byId = Object.fromEntries((lb.data || []).map((r) => [r.player_id, r]));
  check("gain = end - start (E +300)", byId[e]?.gain === 300 && byId[e]?.start_net_worth === 1000);
  check("negative gain (F -200)", byId[f]?.gain === -200);
  check(
    "no ledger rows at start = baseline 0 (G +700)",
    byId[g]?.start_net_worth === 0 && byId[g]?.gain === 700
  );
  check("ranked by gain", byId[g]?.rank < byId[e]?.rank && byId[e]?.rank < byId[f]?.rank);

  const { data: live } = await db
    .from("contests")
    .insert({
      name: `wtest ${RUN} live`,
      starts_at: start,
      ends_at: plusMs(new Date().toISOString(), 3_600_000),
    })
    .select("id")
    .single();
  created.contests.push(live.id);
  const liveLb = await viewer.rpc("contest_leaderboard", { p_contest_id: live.id });
  const liveE = (liveLb.data || []).find((r) => r.player_id === e);
  check(
    "live contest uses current net worth",
    liveE?.end_net_worth === 6300 && liveE?.gain === 5300,
    JSON.stringify(liveE)
  );
}

async function startingGrant() {
  console.log("\n-- Starting grant (scoped to one test user)");
  const h = await makeUser("grant");
  const first = await db.rpc("grant_starting_chips", { p_amount: 2500, p_player: h });
  const again = await db.rpc("grant_starting_chips", { p_amount: 2500, p_player: h });
  check(
    "grant pays once",
    first.data === 1 && again.data === 0,
    JSON.stringify([first, again].map((x) => x.error || x.data))
  );
  check("grant balance", (await balanceOf(h)) === 2500);
}

async function cleanup() {
  const users = created.users;
  if (users.length) {
    await db.from("wallet_ledger").delete().in("player_id", users);
    await db.from("wallets").delete().in("player_id", users);
    const { error } = await db.from("users").delete().in("id", users);
    if (error) console.warn(`cleanup: could not delete test users: ${error.message}`);
  }
  if (created.rules.length) await db.from("earn_rules").delete().in("action", created.rules);
  if (created.contests.length) await db.from("contests").delete().in("id", created.contests);
}

(async () => {
  try {
    await idempotency();
    await insufficientFunds();
    await concurrentDebits();
    await earnCaps();
    await rls();
    await contestLeaderboard();
    await startingGrant();
  } catch (err) {
    failures++;
    console.error(`\nERROR  ${err.message}`);
  } finally {
    await cleanup();
  }
  console.log(failures ? `\n${failures} check(s) failed` : "\nAll wallet checks passed");
  process.exit(failures ? 1 : 0);
})();
