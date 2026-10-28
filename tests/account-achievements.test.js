const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const ejs = require("ejs");
const { JSDOM } = require("jsdom");
const { buildAccountAchievements } = require("../js/utils/account-achievements");
const { jsonForScript } = require("../js/utils/server-utils");

const root = path.join(__dirname, "..");
const participantKeys = [
  "all_assigned_completed",
  "first_challenge",
  "three_challenges",
  "the_challenger",
];

function achievement(id, overrides = {}) {
  return {
    id,
    key: id,
    name: `Name ${id}`,
    description: `Description ${id}`,
    points: 2,
    image_url: `/images/${id}.gif`,
    metadata: { hint: `Hint ${id}` },
    is_visitor_eligible: true,
    show_on_profile: true,
    ...overrides,
  };
}

function database(catalog, awardedIds = [], errors = {}) {
  const calls = [];
  return {
    calls,
    from(table) {
      const result = {
        data:
          table === "achievements"
            ? catalog
            : awardedIds.map((achievement_id) => ({ achievement_id })),
        error: errors[table],
      };
      const query = {
        select(columns) {
          calls.push({ table, columns });
          return query;
        },
        order() {
          return query;
        },
        eq(column, value) {
          calls.push({ table, column, value });
          return query;
        },
        then(resolve, reject) {
          return Promise.resolve(result).then(resolve, reject);
        },
      };
      return query;
    },
  };
}

const catalog = [
  achievement("earned"),
  achievement("no-image", { image_url: null }),
  achievement("locked", { metadata: { hint: "  Explore\n the site  " } }),
  achievement("no-hint", { metadata: null, points: 0 }),
  achievement("secret", { metadata: { hidden: true, hint: "Secret spoiler" } }),
  achievement("secret-earned", { metadata: { hidden: true } }),
  achievement("walktober_2026_streak_5", { show_on_profile: false }),
  achievement("walktober_2026_goal_days_5", { show_on_profile: false }),
  ...participantKeys.map((key) => achievement(key, { is_visitor_eligible: false })),
];

test("server sends earned details, sanitized locked slots, and a secret count only", async () => {
  const db = database(catalog, [
    "earned",
    "no-image",
    "secret-earned",
    "walktober_2026_streak_5",
    "first_challenge",
  ]);
  const payload = await buildAccountAchievements(db, "viewer");
  assert.equal(payload.earned.length, 5);
  assert.deepEqual(payload.locked, [{ hint: "Explore the site" }, { hint: "" }]);
  assert.equal(payload.secretCount, 1);
  assert.equal(payload.total, 7);
  assert.equal(payload.earned[0].image_url, "/images/earned.gif");
  assert.equal(payload.earned[1].image_url, null);
  assert.equal(payload.earned[0].counts_toward_rank, true);
  assert.equal(payload.earned[3].counts_toward_rank, true);
  assert.equal(payload.earned[3].walktober_year, 2026);
  assert.equal(payload.earned[3].tier, 5);
  assert.equal(payload.earned[3].ladder, "streak");
  assert.equal(payload.earned[4].counts_toward_rank, false);
  assert.equal(payload.earned[4].walktober_year, null);
  assert.ok(payload.earned.some((row) => row.name === "Name secret-earned"));
  assert.ok(payload.earned.some((row) => row.name === "Name walktober_2026_streak_5"));
  assert.ok(payload.earned.some((row) => row.name === "Name first_challenge"));
  const serialized = JSON.stringify(payload);
  for (const spoiler of [
    'Name secret"',
    "Secret spoiler",
    "Name locked",
    "Description locked",
    "/images/locked.gif",
    "Name walktober_2026_goal_days_5",
    "Name all_assigned_completed",
  ]) {
    assert.ok(!serialized.includes(spoiler), spoiler);
  }
  assert.ok(
    db.calls.some(
      (call) =>
        call.table === "user_achievements" && call.column === "user_id" && call.value === "viewer"
    )
  );
});

test("zero awards omit participant slots and ladders and count unearned secrets", async () => {
  const payload = await buildAccountAchievements(database(catalog), "new-user");
  assert.equal(payload.earned.length, 0);
  assert.equal(payload.locked.length, 4);
  assert.equal(payload.secretCount, 2);
  assert.equal(payload.total, 4);
  for (const row of payload.locked) assert.deepEqual(Object.keys(row), ["hint"]);
});

test("empty catalog and completed catalog have no secret or locked leftovers", async () => {
  assert.deepEqual(await buildAccountAchievements(database([]), "viewer"), {
    earned: [],
    locked: [],
    secretCount: 0,
    total: 0,
  });
  const complete = await buildAccountAchievements(
    database(
      catalog,
      catalog.map((row) => row.id)
    ),
    "viewer"
  );
  assert.equal(complete.earned.length, catalog.length);
  assert.equal(complete.locked.length, 0);
  assert.equal(complete.secretCount, 0);
});

test("database errors and missing authentication never become successful empty payloads", async () => {
  await assert.rejects(buildAccountAchievements(null, "viewer"), /unavailable/);
  await assert.rejects(buildAccountAchievements(database([]), null), /Sign in/);
  for (const table of ["achievements", "user_achievements"]) {
    const error = new Error(`${table} unavailable`);
    await assert.rejects(
      buildAccountAchievements(database([], [], { [table]: error }), "viewer"),
      error
    );
  }
});

async function accountPage(payload, fetchImpl) {
  const html = await ejs.renderFile(path.join(root, "templates/account.ejs"), {
    currentUser: { id: "viewer", username: "viewer", isAdmin: false },
    navData: {},
    achievementsJson: jsonForScript(payload),
  });
  const dom = new JSDOM(html);
  const errors = [];
  const listeners = new Map();
  const context = vm.createContext({
    document: dom.window.document,
    console: { warn() {} },
    fetch: fetchImpl,
    BasePage: class {
      constructor() {
        this.eventCleanup = [];
      }
      setPageTitle() {}
      showError(message) {
        errors.push(message);
      }
    },
    EventBus: {
      instance: {
        listen(type, handler) {
          listeners.set(type, handler);
          return () => listeners.delete(type);
        },
      },
    },
  });
  const source = fs
    .readFileSync(path.join(root, "js/pages/account.js"), "utf8")
    .replace(/^import .*;\n/gm, "")
    .replace("export { AccountPage };", "globalThis.AccountPage = AccountPage;");
  vm.runInContext(source, context);
  return {
    page: new context.AccountPage(),
    document: dom.window.document,
    errors,
    listeners,
    html,
  };
}

test("initial Account render shows locked slots with zero awards and no secret details", async () => {
  const payload = await buildAccountAchievements(database(catalog), "viewer");
  const { page, document, html } = await accountPage(payload);
  assert.ok(document.querySelector("#achievementsSection.visible"));
  assert.ok(document.querySelector(".account-achievement-intro").textContent.trim());
  assert.ok(!html.includes("Secret spoiler"));
  assert.ok(!html.includes("Name secret"));
  page.renderAchievements();
  assert.match(document.querySelector("#achievementsCounter").textContent, /0 \/ 4 complete/);
  assert.equal(document.querySelectorAll(".account-achievement--locked").length, 4);
  assert.equal(document.querySelectorAll(".account-achievement--locked img").length, 0);
  assert.ok(
    [...document.querySelectorAll(".badge-name")].every((node) => node.textContent === "???")
  );
  const noHintSlot = document.querySelector(".account-achievement--locked:nth-child(4)");
  assert.equal(noHintSlot.querySelector(".account-achievement-hint"), null);
  assert.equal(noHintSlot.querySelector(".badge-points"), null);
  assert.equal(document.querySelectorAll(".account-achievement--locked .badge-points").length, 0);
  assert.equal(document.querySelector("#achievementsSecrets").textContent, "+2 secret ones");
  assert.equal(document.querySelector("#achievementsSecrets").hidden, false);
});

test("earned images and letter fallbacks render, hint markup is escaped, secrets disappear", async () => {
  const payload = {
    earned: [
      {
        name: "Image",
        description: "Earned details",
        points: 3,
        image_url: "/images/badge.gif",
        counts_toward_rank: true,
      },
      {
        name: "Fallback",
        description: 'A "quoted" description',
        points: 1,
        image_url: null,
        counts_toward_rank: true,
      },
    ],
    locked: [{ points: 2, hint: '<img src=x onerror="bad()">' }],
    secretCount: 0,
    total: 3,
  };
  const { page, document } = await accountPage(payload);
  page.renderAchievements();
  assert.equal(
    document.querySelector(".account-achievement-image").getAttribute("src"),
    "/images/badge.gif"
  );
  assert.equal(document.querySelectorAll(".badge-icon")[1].textContent, "F");
  assert.equal(document.querySelectorAll(".challenge-badge")[1].title, 'A "quoted" description');
  assert.equal(
    document.querySelector(".account-achievement-hint").textContent,
    payload.locked[0].hint
  );
  assert.equal(document.querySelector(".account-achievement-hint img"), null);
  assert.equal(document.querySelector("#achievementsSecrets").hidden, true);
  assert.equal(document.querySelector("#achievementsSecrets").textContent, "");
});

test("award event refreshes through the signed-in API and registers cleanup", async () => {
  const initial = await buildAccountAchievements(database(catalog), "viewer");
  const updated = await buildAccountAchievements(database(catalog, ["earned"]), "viewer");
  const requests = [];
  const { page, document, listeners } = await accountPage(initial, async (url, options) => {
    requests.push({ url, options });
    return { ok: true, json: async () => updated };
  });
  page.loadNotifications = async () => {};
  page.userId = "viewer";
  await page.onReady();
  assert.equal(requests.length, 0);
  listeners.get("achievement:awarded")({ detail: { userId: "other-user" } });
  assert.equal(requests.length, 0);
  listeners.get("achievement:awarded")({ detail: { userId: "viewer" } });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "/api/account/achievements");
  assert.equal(requests[0].options.credentials, "include");
  assert.match(document.querySelector("#achievementsCounter").textContent, /1 \/ 4 complete/);
  page.eventCleanup.forEach((cleanup) => cleanup());
  assert.equal(listeners.size, 0);
});

test("failed refresh reports a BasePage error and preserves the last rendered badges", async () => {
  const payload = await buildAccountAchievements(database(catalog), "viewer");
  const { page, document, errors } = await accountPage(payload, async () => ({
    ok: false,
    status: 500,
  }));
  page.renderAchievements();
  const before = document.querySelector("#achievementsList").innerHTML;
  await page.loadAchievements();
  assert.equal(errors.length, 1);
  assert.match(errors[0], /Could not refresh achievements/);
  assert.equal(document.querySelector("#achievementsList").innerHTML, before);
});

test("earned event badges are grouped separately without rank labels or unearned event slots", async () => {
  const rows = [
    achievement("general"),
    achievement("first_challenge", { is_visitor_eligible: false }),
    achievement("walktober_2026_streak_10", {
      show_on_profile: false,
      image_url: "/images/badge-ghost.svg",
    }),
    achievement("walktober_2026_goal_days_15", {
      show_on_profile: false,
      image_url: "/images/badge-ghoul.svg",
    }),
    achievement("walktober_2026_gold"),
    achievement("walktober_2027_full_month", { image_url: null }),
    achievement("walktober_2026_streak_31", { show_on_profile: false }),
    achievement("walktober_2026_silver"),
  ];
  const payload = await buildAccountAchievements(
    database(
      rows,
      rows.slice(0, -2).map((row) => row.id)
    ),
    "viewer"
  );
  const { page, document } = await accountPage(payload);
  page.renderAchievements();
  assert.equal(document.querySelector("#accountWalktoberAchievements").hidden, false);
  assert.equal(document.querySelectorAll("#achievementsList .challenge-badge").length, 1);
  assert.equal(document.querySelectorAll(".account-achievement-rank").length, 0);
  assert.equal(document.querySelector("#accountBirthdayAchievements").hidden, false);
  assert.equal(document.querySelector("#accountBirthdayHeading").textContent, "Brian's Birthday");
  assert.equal(document.querySelectorAll("#accountBirthdayList .challenge-badge").length, 1);
  assert.equal(
    document.querySelector("#accountBirthdayList .badge-name").textContent,
    "Name first_challenge"
  );
  const awards = [...document.querySelectorAll(".account-walktober-award")];
  assert.equal(awards.length, 4);
  assert.equal(document.querySelectorAll(".account-walktober-icon--ladder").length, 2);
  assert.deepEqual(
    [...document.querySelectorAll(".account-walktober-tier")].map((node) => node.textContent),
    ["10", "15"]
  );
  assert.equal(awards[1].querySelector("img").getAttribute("src"), "/images/badge-ghost.svg");
  assert.equal(awards[3].querySelector(".account-walktober-tier"), null);
  assert.match(awards[0].querySelector(".account-walktober-icon").textContent, /N/);
  assert.equal(document.querySelectorAll(".account-walktober-year").length, 0);
  assert.deepEqual(
    [...document.querySelectorAll("#accountWalktoberAchievements h3")].map(
      (node) => node.textContent
    ),
    ["Walktober 2027 achievements", "Walktober 2026 achievements"]
  );
  assert.ok(awards.every((node) => node.tabIndex === 0 && node.title.includes("Description")));
  assert.equal(payload.locked.length, 0);

  page.achievements = { earned: [], locked: [], secretCount: 0, total: 0 };
  page.renderAchievements();
  assert.equal(document.querySelector("#accountWalktoberAchievements").hidden, true);
  assert.equal(document.querySelector("#accountWalktoberAchievements").children.length, 0);
  assert.equal(document.querySelector("#accountBirthdayAchievements").hidden, true);
  assert.equal(document.querySelector("#accountBirthdayList").children.length, 0);
});

test("each Walktober year shows only the highest earned tier in each ladder without changing totals", async () => {
  const rows = [
    achievement("walktober_2026_streak_15"),
    achievement("walktober_2026_streak_5", { points: 3 }),
    achievement("walktober_2026_goal_days_5"),
    achievement("walktober_2026_goal_days_20"),
    achievement("walktober_2026_gold"),
    achievement("walktober_2027_streak_5"),
    achievement("walktober_2027_streak_10"),
    achievement("walktober_2027_goal_days_5"),
  ];
  const payload = await buildAccountAchievements(
    database(
      rows,
      rows.map((row) => row.id)
    ),
    "viewer"
  );
  const { page, document } = await accountPage(payload);
  page.renderAchievements();
  const sections = [...document.querySelectorAll("#accountWalktoberAchievements section")];
  assert.equal(sections.length, 2);
  assert.deepEqual(
    [...sections[0].querySelectorAll(".account-walktober-tier")].map((node) => node.textContent),
    ["10", "5"]
  );
  assert.deepEqual(
    [...sections[1].querySelectorAll(".account-walktober-tier")].map((node) => node.textContent),
    ["15", "20"]
  );
  assert.equal(sections[1].querySelectorAll(".account-walktober-award").length, 3);
  const displayedPoints = () =>
    [...document.querySelectorAll(".account-walktober-points")].map((node) => node.textContent);
  assert.deepEqual(displayedPoints(), ["4 pts", "2 pts", "5 pts", "4 pts", "2 pts"]);
  page.renderAchievements();
  assert.deepEqual(displayedPoints(), ["4 pts", "2 pts", "5 pts", "4 pts", "2 pts"]);
  assert.deepEqual(
    payload.earned.map((award) => award.points),
    [2, 3, 2, 2, 2, 2, 2, 2]
  );
  assert.equal(payload.earned.length, 8);
  assert.equal(payload.total, 8);
  assert.match(document.querySelector("#achievementsCounter").textContent, /8 \/ 8 complete/);
});

test("locked slots repeat all six supplied GIFs by list position without timed swapping", async () => {
  const css = fs.readFileSync(path.join(root, "css/components/account.css"), "utf8");
  const files = [...css.matchAll(/url\("(\/images\/[^"]+_achievement-lock\.gif)"\)/g)];
  assert.equal(files.length, 6);
  for (const [, asset] of files) assert.ok(fs.existsSync(path.join(root, asset)));
  assert.doesNotMatch(css, /account-lock-cycle|animation-delay|locked-cycle-duration/);
  for (let index = 2; index <= 6; index++) {
    assert.ok(css.includes(`[data-lock-icon="${index}"]`));
  }
  const { page, document } = await accountPage({
    earned: [{ name: "Earned", points: 2, counts_toward_rank: true }],
    locked: Array.from({ length: 8 }, () => ({ hint: "Explore" })),
    secretCount: 0,
    total: 9,
  });
  page.renderAchievements();
  const icons = () =>
    [...document.querySelectorAll(".account-achievement--locked")].map(
      (node) => node.dataset.lockIcon
    );
  assert.deepEqual(icons(), ["1", "2", "3", "4", "5", "6", "1", "2"]);
  page.renderAchievements();
  assert.deepEqual(icons(), ["1", "2", "3", "4", "5", "6", "1", "2"]);
});
