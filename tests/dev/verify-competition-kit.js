// Competition Kit end-to-end check against the DEV database and a running local server.
// Walks a competition through hidden → judging → ended and checks privacy, nav, scoring,
// photos, and the rubric, then puts the competition back the way it found it.
//
//   npm run verify:kit                      (server on http://localhost:8000)
//   KIT_BASE=http://localhost:8100 npm run verify:kit -- on-a-stick
//
// Writes to dev: flips judging state (restored at the end) and saves one judgment from
// JUDGE onto AUTHOR's entry. AUTHOR needs an entry with a photo in the competition.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
require(path.join(ROOT, "node_modules", "dotenv")).config({
  path: path.join(ROOT, ".env"),
  quiet: true,
});
const { getSupabase } = require(path.join(ROOT, "js", "utils", "server-utils"));

const SLUG = process.argv[2] || "on-a-stick";
const BASE = process.env.KIT_BASE || "http://localhost:8000";
const AUTHOR = process.env.KIT_AUTHOR || "kawah";
const JUDGE = process.env.KIT_JUDGE || "tanyat";
const ADMIN = process.env.KIT_ADMIN || "brianc";

// Dev project = the first url/key pair in js/config.js (the isLocal branch)
const config = fs.readFileSync(path.join(ROOT, "js", "config.js"), "utf8");
const DEV_URL = (config.match(/url:\s*"([^"]+)"/) || [])[1];
const DEV_ANON_KEY = (config.match(/key:\s*"([^"]+)"/) || [])[1];

if (!DEV_URL || process.env.SUPABASE_URL !== DEV_URL) {
  console.error("Refusing to run: SUPABASE_URL is not the dev project from js/config.js.");
  process.exit(1);
}
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) {
  console.error(`Refusing to run: KIT_BASE must be a local server (got ${BASE}).`);
  process.exit(1);
}

const db = getSupabase();
let failures = 0;
const check = (label, ok, extra = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${extra ? `  (${extra})` : ""}`);
};

const cookies = {};
async function signIn(user) {
  const res = await fetch(`${BASE}/competitions/${SLUG}/rubric?devUserId=${user}`, {
    redirect: "manual",
  });
  cookies[user] = (res.headers.getSetCookie() || []).map((c) => c.split(";")[0]).join("; ");
  if (!cookies[user].includes("user_id=")) throw new Error(`Dev sign-in failed for ${user}`);
}

const request = (user, url, opts = {}) =>
  fetch(BASE + url, {
    redirect: "manual",
    ...opts,
    headers: { ...(opts.headers || {}), ...(user ? { cookie: cookies[user] } : {}) },
  });
const getJson = async (user, url) => (await request(user, url)).json();
const getHtml = async (user, url) => (await request(user, url)).text();
const send = (user, url, method, body) =>
  request(user, url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const navOf = (html) =>
  [...html.matchAll(/kit-nav__link[^>]*>\s*([^<]+?)\s*</g)].map((m) => m[1]).join(",");
const publicKey = (table) =>
  fetch(`${DEV_URL}/rest/v1/${table}`, {
    headers: { apikey: DEV_ANON_KEY, Authorization: `Bearer ${DEV_ANON_KEY}` },
  }).then((r) => r.json());

async function main() {
  for (const user of [AUTHOR, JUDGE, ADMIN]) await signIn(user);

  const start = await getJson(AUTHOR, `/api/competitions/${SLUG}`);
  const comp = start.competition;
  const entry = start.myEntry;
  if (!entry || !entry.image_url)
    throw new Error(`${AUTHOR} needs an entry with a photo in ${SLUG}`);
  const original = { voting_open: comp.voting_open, voting_closed_at: comp.voting_closed_at };
  const favoritesOn = comp.favorite_bonus > 0;
  const api = `/api/competitions/${comp.id}`;
  const photo = `/api/recipe-photos/${entry.recipe_id}?size=thumb`;
  const recipePage = `/competitions/${SLUG}/recipes/${entry.recipe_slug}`;
  const judging = (action) => send(ADMIN, `${api}/judging`, "POST", { action });

  try {
    console.log(`Checking ${SLUG} on ${BASE} (favorites ${favoritesOn ? "on" : "off"})\n`);

    await db
      .from("recipe_competitions")
      .update({ voting_open: false, voting_closed_at: null })
      .eq("id", comp.id);
    console.log("-- before judging");
    const judgeView = await getJson(JUDGE, `/api/competitions/${SLUG}`);
    check("judge sees no entries", judgeView.state === "hidden" && judgeView.entries.length === 0);
    check("judge still sees their own entry", !!judgeView.myEntry);
    check(
      "signed out sees nothing",
      (await getJson(null, `/api/competitions/${SLUG}`)).entries.length === 0
    );
    check(
      "judge page HTML leaks no title",
      !(await getHtml(JUDGE, `/competitions/${SLUG}/judge`)).includes(entry.title)
    );
    check(
      "nav: My Entry, Rubric",
      navOf(await getHtml(JUDGE, `/competitions/${SLUG}/enter`)) === "My Entry,Rubric"
    );
    const adminPage = await getHtml(ADMIN, `/competitions/${SLUG}/enter`);
    check("admin nav shows everything", navOf(adminPage) === "Judge,My Entry,Results,Rubric");
    check("admin bar offers Open judging", adminPage.includes('data-admin-action="open"'));
    check(
      "non-admin can't change judging",
      (await send(JUDGE, `${api}/judging`, "POST", { action: "open" })).status === 403
    );
    check("photo: author allowed", (await request(AUTHOR, photo)).status === 302);
    check("photo: judge blocked", (await request(JUDGE, photo)).status === 404);
    check("recipe page: author 200", (await request(AUTHOR, recipePage)).status === 200);
    check("recipe page: judge 404", (await request(JUDGE, recipePage)).status === 404);
    check(
      "AFewRecipes: judge redirected away",
      (await request(JUDGE, `/recipes/${entry.recipe_slug}`)).status === 302
    );
    check(
      "public key: entry hidden",
      (await publicKey(`recipe_competition_entries?select=id&id=eq.${entry.id}`)).length === 0
    );
    check(
      "public key: recipe hidden",
      (await publicKey(`recipes?select=id&id=eq.${entry.recipe_id}`)).length === 0
    );
    check(
      "public key: no registrations",
      (await publicKey("competition_registrations?select=dish_working_title")).length === 0
    );
    check(
      "public key: scoring view denied",
      (await publicKey("recipe_detail_view?select=slug&limit=1")).code === "42501"
    );

    check("admin opens judging", (await judging("open")).status === 200);
    console.log("\n-- judging open");
    const open = await getJson(JUDGE, `/api/competitions/${SLUG}`);
    const card = open.entries.find((e) => e.id === entry.id);
    const own = open.entries.find((e) => e.is_own);
    check("judge sees the author's dish card", !!card);
    check(
      "dish card has no photo, steps, or notes",
      card && !("image_url" in card) && !("steps" in card) && !("notes" in card)
    );
    check(
      "signed out still sees nothing",
      (await getJson(null, `/api/competitions/${SLUG}`)).entries.length === 0
    );
    check(
      "nav: Judge, My Entry, Rubric",
      navOf(await getHtml(JUDGE, `/competitions/${SLUG}/enter`)) === "Judge,My Entry,Rubric"
    );
    check("photo: judge still blocked", (await request(JUDGE, photo)).status === 404);
    check("recipe page: judge still 404", (await request(JUDGE, recipePage)).status === 404);
    const scores = Object.fromEntries(open.categories.map((c, i) => [c.key, i === 0 ? 5 : 4]));
    check(
      "judge scores the entry",
      (await send(JUDGE, `${api}/entries/${entry.id}/judgment`, "POST", { scores })).status === 200
    );
    if (own) {
      check(
        "own entry can't be scored",
        (await send(JUDGE, `${api}/entries/${own.id}/judgment`, "POST", { scores })).status === 403
      );
    }
    check(
      "missing category rejected",
      (await send(JUDGE, `${api}/entries/${entry.id}/judgment`, "POST", { scores: {} })).status ===
        400
    );
    if (!favoritesOn) {
      check(
        "favorites rejected",
        (await send(JUDGE, `${api}/favorite`, "POST", { entryId: entry.id })).status === 400
      );
      check(
        "judge page has no favorite button",
        !(await getHtml(JUDGE, `/competitions/${SLUG}/judge`)).includes("Make this my favorite")
      );
    }
    const forged = await send(AUTHOR, `${api}/entries/${entry.id}`, "PATCH", {
      title: entry.title,
      photoPath: "someone-else/x/1.jpg",
    });
    check("forged photo path rejected", forged.status === 400);

    check("admin ends judging", (await judging("close")).status === 200);
    console.log("\n-- judging ended");
    const results = await getHtml(null, `/competitions/${SLUG}/results`);
    check("results list the entry", results.includes(entry.title));
    check(
      "results copy matches favorites setting",
      results.includes("per favorite vote") === favoritesOn
    );
    const { data: board } = await db
      .from("competition_leaderboard_view")
      .select("avg_score, final_score")
      .eq("competition_id", comp.id);
    if (!favoritesOn) {
      check(
        "final score = judges' average",
        (board || []).every(
          (r) => r.final_score == null || Number(r.final_score) === Number(r.avg_score)
        )
      );
    }
    check(
      "nav: My Entry, Results, Rubric",
      navOf(await getHtml(JUDGE, `/competitions/${SLUG}/enter`)) === "My Entry,Results,Rubric"
    );
    check(
      "admin bar offers Reopen",
      (await getHtml(ADMIN, `/competitions/${SLUG}/enter`)).includes('data-admin-action="reopen"')
    );
    check(
      "signed out sees entries",
      (await getJson(null, `/api/competitions/${SLUG}`)).entries.length > 0
    );
    check("photo: public", (await request(null, photo)).status === 302);
    check("recipe page: public", (await request(null, recipePage)).status === 200);
    const afew = await getHtml(null, `/recipes/${entry.recipe_slug}`);
    check("AFewRecipes shows ingredient sections", afew.includes("recipe-ingredients"));
    check(
      "public key: recipe visible",
      (await publicKey(`recipes?select=id&id=eq.${entry.recipe_id}`)).length === 1
    );

    console.log("\n-- rubric");
    const rubric = await getHtml(null, `/competitions/${SLUG}/rubric`);
    const levels = open.categories.filter((c) => Array.isArray(c.levels) && c.levels.length);
    check(
      "rubric lists every category",
      open.categories.every((c) => rubric.includes(c.label))
    );
    check(
      "rubric shows level labels",
      levels.every((c) => rubric.includes(c.levels[0].label))
    );
    check("rubric favorites copy matches setting", rubric.includes("favorite") === favoritesOn);
  } finally {
    await db.from("recipe_competitions").update(original).eq("id", comp.id);
    console.log(
      `\nRestored judging state (voting_open ${original.voting_open}, closed ${original.voting_closed_at || "no"}).`
    );
  }

  console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
