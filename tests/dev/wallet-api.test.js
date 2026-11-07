const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const PLAYER = "12345678-1234-4234-8234-123456789abc";
const source = fs.readFileSync(path.join(__dirname, "../../routes/api-wallet.js"), "utf8");

function walletRoute({
  rows = [],
  count = 12,
  countError = null,
  checkedAt = null,
  timeZone = "UTC",
  checkinError = null,
  voteResult = { status: "earned", action: "site_vote", amount: 500, balance: 56000 },
  voteError = null,
  signedUser = PLAYER,
  visitorId = null,
  activationResult = { status: "earned", action: "achievement", amount: 15000, balance: 15000 },
  activationError = null,
} = {}) {
  const handlers = {};
  const filters = [];
  const rpcCalls = [];
  const router = {
    get: (route, handler) => (handlers[route] = handler),
    post: (route, handler) => (handlers[route] = handler),
  };
  const db = {
    rpc: async (name, args) => {
      rpcCalls.push({ name, args });
      if (name === "record_site_vote_for") return { data: voteResult, error: voteError };
      if (name === "activate_wallet_for") return { data: activationResult, error: activationError };
      return { data: name === "get_wallet_for" ? 55500 : rows, error: null };
    },
    from: (table) => {
      if (table === "wallet_settings")
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: { day_boundary_tz: timeZone },
                error: null,
              }),
            }),
          }),
        };
      assert.equal(table, "wallet_ledger");
      return {
        select: (columns, options) => {
          if (columns === "created_at") {
            const query = {
              eq: (column, value) => {
                assert.equal(
                  value,
                  { player_id: PLAYER, kind: "earn", ref_type: "daily_checkin" }[column]
                );
                return query;
              },
              order: () => query,
              limit: async () => ({
                data: checkedAt ? [{ created_at: checkedAt }] : [],
                error: checkinError,
              }),
            };
            return query;
          }
          assert.equal(columns, "id");
          assert.equal(options.count, "exact");
          assert.equal(options.head, true);
          return {
            eq: async (column, player) => {
              filters.push([column, player]);
              return { count, error: countError };
            },
          };
        },
      };
    },
  };
  vm.runInNewContext(source, {
    module: { exports: {} },
    console: { error: () => {} },
    Date: class extends Date {
      constructor(value) {
        super(value === undefined ? "2026-11-06T00:30:00Z" : value);
      }
    },
    require: (name) => {
      if (name === "express") return { Router: () => router };
      if (name === "../js/utils/server-utils")
        return { getSupabase: () => db, requireSignedUser: () => signedUser };
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  return {
    handler: handlers["/wallet"],
    vote: handlers["/wallet/vote"],
    activate: handlers["/wallet/activate"],
    filters,
    rpcCalls,
    visitorId,
  };
}

async function request(route, query = {}, body = undefined) {
  const res = {
    statusCode: 200,
    set() {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
  };
  await route.handler({ query, body, signedCookies: { site_vote_visitor: route.visitorId } }, res);
  return res;
}

test("wallet returns the total count independently of page size and cursor", async () => {
  const route = walletRoute({ rows: [{ id: 8 }, { id: 7 }] });
  const res = await request(route, { limit: "1", before: "9" });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.transactionCount, 12);
  assert.equal(res.body.ledger.length, 1);
  assert.equal(res.body.nextBeforeId, 8);
  assert.deepEqual(route.filters, [["player_id", PLAYER]]);
});

test("empty wallet reports zero transactions", async () => {
  const res = await request(walletRoute({ count: 0 }));
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.transactionCount, 0);
  assert.equal(res.body.ledger.length, 0);
  assert.equal(res.body.checkedInToday, false);
});

test("activation uses only the signed account, never client-supplied credit data", async () => {
  const route = walletRoute();
  const res = await request(
    { handler: route.activate },
    {},
    { playerId: "other", amount: 999999, points: 999 }
  );
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.amount, 15000);
  assert.equal(route.rpcCalls.length, 1);
  assert.equal(route.rpcCalls[0].name, "activate_wallet_for");
  assert.equal(route.rpcCalls[0].args.p_player, PLAYER);
});

test("wallet reads never activate achievement credits", async () => {
  const route = walletRoute();
  await request(route);
  assert.ok(route.rpcCalls.every(({ name }) => name !== "activate_wallet_for"));
});

test("activation rejects guests and surfaces database failures", async () => {
  const guest = walletRoute({ signedUser: null });
  const rejected = await request({ handler: guest.activate });
  assert.equal(rejected.statusCode, 401);
  assert.equal(guest.rpcCalls.length, 0);
  const broken = walletRoute({ activationError: { message: "Database unavailable" } });
  const failed = await request({ handler: broken.activate });
  assert.equal(failed.statusCode, 500);
  assert.equal(failed.body.error, "Could not credit your achievements");
});

test("check-in state is independent of the history page and uses the configured day", async () => {
  const checkedAt = "2026-11-05T22:00:00Z";
  const utc = await request(walletRoute({ checkedAt }), { before: "1", limit: "1" });
  assert.equal(utc.body.checkedInToday, false);
  const pacific = await request(walletRoute({ checkedAt, timeZone: "America/Los_Angeles" }), {
    before: "1",
    limit: "1",
  });
  assert.equal(pacific.body.checkedInToday, true);
  const today = await request(walletRoute({ checkedAt: "2026-11-06T00:05:00Z" }));
  assert.equal(today.body.checkedInToday, true);
});

test("check-in query and invalid timezone errors are surfaced", async () => {
  for (const input of [{ checkinError: { message: "Query failed" } }, { timeZone: "invalid" }]) {
    const res = await request(walletRoute(input));
    assert.equal(res.statusCode, 500);
  }
});

test("count errors and missing counts are surfaced, not reported as zero", async () => {
  for (const input of [{ countError: { message: "Query failed" } }, { count: null }]) {
    const res = await request(walletRoute(input));
    assert.equal(res.statusCode, 500);
    assert.equal(res.body.error, "Could not load your chips");
  }
});

test("vote reward uses the type-aware RPC and ignores client amounts/actions", async () => {
  const route = walletRoute();
  const voteType = "/images/site-awards_pug.gif";
  const res = await request(
    { handler: route.vote, visitorId: route.visitorId },
    {},
    { voteType, action: "wall_post", amount: 999 }
  );
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.amount, 500);
  assert.equal(route.rpcCalls.length, 1);
  assert.equal(route.rpcCalls[0].name, "record_site_vote_for");
  assert.equal(route.rpcCalls[0].args.p_player, PLAYER);
  assert.equal(route.rpcCalls[0].args.p_visitor, null);
  assert.equal(route.rpcCalls[0].args.p_vote_type, voteType);
});

test("vote requests reject missing identity and invalid type inputs before awarding", async () => {
  for (const [options, body, status] of [
    [{ signedUser: null }, { voteType: "/images/site-awards_pug.gif" }, 409],
    [{}, {}, 400],
    [{}, { voteType: 123 }, 400],
  ]) {
    const route = walletRoute(options);
    const res = await request({ handler: route.vote }, {}, body);
    assert.equal(res.statusCode, status);
    assert.equal(route.rpcCalls.length, 0);
  }
});

test("anonymous votes use only the server-signed visitor cookie and never claim a reward", async () => {
  const visitorId = "abcdef12-1234-4234-8234-123456789abc";
  for (const status of ["recorded", "already_recorded"]) {
    const route = walletRoute({
      signedUser: null,
      visitorId,
      voteResult: { status, amount: 0, counted: status === "recorded" },
    });
    const res = await request(
      { handler: route.vote, visitorId },
      {},
      { voteType: "/images/site-awards_pug.gif", playerId: PLAYER, visitorId: PLAYER }
    );
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.amount, 0);
    assert.equal(res.body.counted, status === "recorded");
    assert.equal(route.rpcCalls[0].args.p_player, null);
    assert.equal(route.rpcCalls[0].args.p_visitor, visitorId);
  }
});

test("invalid visitor cookie cannot identify a signed-out voter", async () => {
  const route = walletRoute({ signedUser: null });
  const res = await request(
    { handler: route.vote, visitorId: "tampered" },
    {},
    { voteType: "/images/site-awards_pug.gif" }
  );
  assert.equal(res.statusCode, 409);
  assert.equal(route.rpcCalls.length, 0);
});

test("vote caps/replays pass through without invented credits and RPC failures surface", async () => {
  for (const status of ["daily_cap", "global_cap", "already_earned"]) {
    const counted = status !== "already_earned";
    const route = walletRoute({ voteResult: { status, amount: 0, balance: 56000, counted } });
    const res = await request(
      { handler: route.vote },
      {},
      { voteType: "/images/site-awards_pug.gif" }
    );
    assert.equal(res.body.status, status);
    assert.equal(res.body.amount, 0);
    assert.equal(res.body.counted, counted);
    assert.equal(route.rpcCalls[0].name, "record_site_vote_for");
  }
  const route = walletRoute({ voteError: { message: "Database unavailable" } });
  const res = await request(
    { handler: route.vote },
    {},
    { voteType: "/images/site-awards_pug.gif" }
  );
  assert.equal(res.statusCode, 500);
});

test("page loads establish a stable signed visitor cookie before vote requests", () => {
  const server = fs.readFileSync(path.join(__dirname, "../../server.js"), "utf8");
  const middleware = server
    .split("// Establish visitor identity on page load,")[1]
    .split("// Server middleware:")[0];
  let handler;
  vm.runInNewContext(middleware.slice(middleware.indexOf("app.use(")), {
    app: {
      use: (fn) => {
        handler = fn;
      },
    },
    wantsNavData: (req) => req.path === "/brispace",
    randomUUID: () => PLAYER,
    process: { env: { NODE_ENV: "production" } },
  });
  for (const [method, url, visitorId, shouldSet] of [
    ["GET", "/brispace", null, true],
    ["GET", "/brispace", PLAYER, false],
    ["GET", "/brispace", false, true],
    ["POST", "/api/wallet/vote", null, false],
    ["GET", "/images/pig.gif", null, false],
  ]) {
    const cookies = [];
    let nextCalled = false;
    handler(
      { method, path: url, signedCookies: { site_vote_visitor: visitorId } },
      { cookie: (...args) => cookies.push(args) },
      () => {
        nextCalled = true;
      }
    );
    assert.equal(nextCalled, true);
    assert.equal(cookies.length, shouldSet ? 1 : 0);
    if (shouldSet) {
      const [name, value, options] = cookies[0];
      assert.equal(name, "site_vote_visitor");
      assert.equal(value, PLAYER);
      assert.equal(options.signed, true);
      assert.equal(options.httpOnly, true);
      assert.equal(options.secure, true);
      assert.equal(options.sameSite, "lax");
      assert.equal(options.path, "/");
      assert.equal(options.maxAge, 365 * 24 * 60 * 60 * 1000);
    }
  }
});

test("unknown vote types rejected by Postgres are client errors", async () => {
  const route = walletRoute({ voteError: { code: "22023" } });
  const res = await request({ handler: route.vote }, {}, { voteType: "/images/unknown.gif" });
  assert.equal(res.statusCode, 400);
});

test("SQL vote allow-list matches every built-in site award", () => {
  const base = fs.readFileSync(path.join(__dirname, "../../js/pages/base-page.js"), "utf8");
  const catalog = base.split("const siteAwardsImages = [")[1].split("];")[0];
  const images = [...catalog.matchAll(/img: "([^"]+)"/g)].map((match) => match[1]).sort();
  const sql = fs.readFileSync(
    path.join(__dirname, "../../sql/2026_11_05_wallet_site_rewards.sql"),
    "utf8"
  );
  const allowed = [...sql.matchAll(/'(\/images\/site-awards[^']+)'/g)]
    .map((match) => match[1])
    .sort();
  assert.deepEqual(allowed, images);
});

function wallRoute({ ownWall = false, reward = null, rewardError = null } = {}) {
  const target = ownWall ? PLAYER : "abcdef12-1234-4234-8234-123456789abc";
  const entry = { id: "fedcba12-1234-4234-8234-123456789abc", target_user_id: target };
  const handlers = {};
  const filters = [];
  const router = {};
  for (const method of ["get", "post", "patch", "delete"]) {
    router[method] = (route, handler) => (handlers[`${method}:${route}`] = handler);
  }
  const db = {
    from(table) {
      const query = {
        select: () => query,
        insert: () => query,
        eq: (key, value) => {
          if (table === "wallet_ledger") filters.push([key, value]);
          return query;
        },
        single: async () => ({ data: entry, error: null }),
        maybeSingle: async () =>
          table === "wallet_ledger"
            ? { data: reward, error: rewardError }
            : { data: { id: target, username: "test", display_name: "Test" }, error: null },
      };
      return query;
    },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../../routes/api-users.js"), "utf8"), {
    module: { exports: {} },
    __dirname: path.join(__dirname, "../../routes"),
    console: { error() {}, warn() {} },
    require(name) {
      if (name === "express") return { Router: () => router };
      if (name === "../js/utils/server-utils")
        return { getSupabase: () => db, requireSignedUser: () => PLAYER };
      if (name === "../js/utils/notification-delivery")
        return { createAndDeliverNotification: async () => {} };
      if (name === "fs") return { readdirSync: () => [] };
      if (name === "path") return path;
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  return {
    filters,
    handler: (req, res) =>
      handlers["post:/users/:id/wall"]({ params: { id: target }, body: { message: "hello" } }, res),
  };
}

test("wall response includes only the confirmed reward for that entry", async () => {
  const route = wallRoute({ reward: { amount: 2500, balance_after: 6000 } });
  const res = await request(route);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.walletReward.amount, 2500);
  assert.equal(res.body.walletReward.balance, 6000);
  assert.deepEqual(route.filters, [
    ["player_id", PLAYER],
    ["kind", "earn"],
    ["ref_type", "wall_post"],
    ["ref_id", res.body.entry.id],
  ]);
});

test("own-wall and capped posts return no invented reward", async () => {
  for (const ownWall of [true, false]) {
    const route = wallRoute({ ownWall });
    const res = await request(route);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.walletReward, null);
    if (ownWall) assert.equal(route.filters.length, 0);
  }
});

test("saved wall posts report reward lookup errors without claiming the post failed", async () => {
  const res = await request(wallRoute({ rewardError: { message: "Query failed" } }));
  assert.equal(res.body.ok, true);
  assert.equal(res.body.walletReward, null);
  assert.match(res.body.walletRewardError, /Comment posted/);
});
