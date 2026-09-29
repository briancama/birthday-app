// Copies production content into the DEV Supabase project with auth identifiers scrubbed,
// so real site data is browsable locally via dev auto-login (no phone OTP needed).
//
// Usage:
//   npm run db:pull                            # dry run: report drift + row counts only
//   npm run db:pull -- --yes                   # actually write to the dev project
//   npm run db:pull -- --yes --skip-missing-columns   # pull even if dev lacks prod columns
//
// Prod is the schema source of truth: if prod has columns dev lacks, the script
// prints the ALTER TABLE SQL to bring dev up to date and aborts (no data dropped).
//
// Requires in .env:
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE            (dev project — write target)
//   PROD_SUPABASE_URL / PROD_SUPABASE_SERVICE_ROLE  (prod project — read only)
//
// Scrubbing: users.phone_number → null, users.firebase_uid → "pulled-<original-user-id>"
// (unique per user, useless for auth). push_subscriptions are never copied.

require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");

// Order matters: parents before children (FKs). push_subscriptions intentionally excluded.
const TABLES = [
  "users",
  "user_profile",
  "challenges",
  "assignments",
  "achievements",
  "user_achievements",
  "events",
  "event_rsvps",
  "competition_placements",
  "guestbook",
  "profile_wall",
  "user_favorite_songs",
  "notifications",
  "app_settings",
  "page_views",
  "recipe_categories",
  "recipes",
  "recipe_competitions",
  "recipe_competition_entries",
  "recipe_competition_judgments",
  "recipe_competition_favorites",
  "recipe_comments",
  "cocktail_competitions",
  "cocktail_entries",
  "cocktail_judgments",
  "cocktail_favorites",
];

// Delete in reverse dependency order before re-inserting.
const CONFLICT_KEYS = {
  user_profile: "user_id",
  user_favorite_songs: "user_id",
  recipe_categories: "slug",
  app_settings: "setting_key",
};
// GENERATED ALWAYS identity PKs reject explicit values; nothing references them, so regenerate.
const STRIP_ID_TABLES = new Set(["app_settings"]);
const PAGE_SIZE = 1000;

function client(url, key) {
  return createClient(url, key, { auth: { persistSession: false } });
}

async function fetchAll(db, table) {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await db
      .from(table)
      .select("*")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...data);
    if (data.length < PAGE_SIZE) return rows;
  }
}

function scrub(table, rows) {
  if (STRIP_ID_TABLES.has(table)) rows = rows.map(({ id, ...rest }) => rest);
  if (table !== "users") return rows;
  return rows.map((r) => ({ ...r, phone_number: null, firebase_uid: `pulled-${r.id}` }));
}

// Dev/prod schema drift: prod is source of truth. If prod has columns dev lacks,
// we print the ALTER TABLE SQL to fix dev and abort (see --skip-missing-columns).
async function fetchColumnTypes(url, key) {
  const res = await fetch(`${url}/rest/v1/`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`schema introspection failed: HTTP ${res.status}`);
  const spec = await res.json();
  const map = {};
  for (const [name, def] of Object.entries(spec.definitions || {})) {
    map[name] = {};
    for (const [col, p] of Object.entries(def.properties || {})) {
      map[name][col] = p.format || p.type || "text";
    }
  }
  return map;
}

function diffSchemas(devTypes, prodTypes) {
  const missing = [];
  for (const table of TABLES) {
    if (!devTypes[table]) {
      missing.push({ table, column: "(entire table)", type: null });
      continue;
    }
    for (const [col, type] of Object.entries(prodTypes[table] || {})) {
      if (!(col in devTypes[table])) missing.push({ table, column: col, type });
    }
  }
  return missing;
}

async function main() {
  const write = process.argv.includes("--yes");
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE, PROD_SUPABASE_URL, PROD_SUPABASE_SERVICE_ROLE } =
    process.env;
  if (!PROD_SUPABASE_URL || !PROD_SUPABASE_SERVICE_ROLE) {
    console.error("Missing PROD_SUPABASE_URL / PROD_SUPABASE_SERVICE_ROLE in .env");
    process.exit(1);
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
    console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE (dev target) in .env");
    process.exit(1);
  }
  if (SUPABASE_URL === PROD_SUPABASE_URL) {
    console.error("Refusing to run: dev target URL equals prod URL.");
    process.exit(1);
  }

  const prod = client(PROD_SUPABASE_URL, PROD_SUPABASE_SERVICE_ROLE);
  const dev = client(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

  console.log(`Source: ${PROD_SUPABASE_URL}`);
  console.log(`Target: ${SUPABASE_URL} ${write ? "(WRITING)" : "(dry run — pass --yes to write)"}`);

  const snapshots = {};
  const skipMissing = process.argv.includes("--skip-missing-columns");
  const [devTypes, prodTypes] = await Promise.all([
    fetchColumnTypes(SUPABASE_URL, SUPABASE_SERVICE_ROLE),
    fetchColumnTypes(PROD_SUPABASE_URL, PROD_SUPABASE_SERVICE_ROLE),
  ]);
  const drift = diffSchemas(devTypes, prodTypes);
  if (drift.length && !skipMissing) {
    console.error("\nDev schema is behind prod. Apply this in the dev SQL editor, then re-run");
    console.error("(and save it as a /sql migration file per convention):\n");
    for (const { table, column, type } of drift) {
      if (!type)
        console.error(`-- table "${table}" is missing entirely; find/create its migration`);
      else console.error(`ALTER TABLE public.${table} ADD COLUMN IF NOT EXISTS ${column} ${type};`);
    }
    console.error("\n(Or re-run with --skip-missing-columns to pull without those columns.)");
    process.exit(1);
  }
  if (drift.length) {
    console.warn(
      `Proceeding without prod-only columns: ${drift.map((d) => `${d.table}.${d.column}`).join(", ")}`
    );
  }

  for (const table of TABLES) {
    let rows = scrub(table, await fetchAll(prod, table));
    if (skipMissing && devTypes[table]) {
      rows = rows.map((r) => {
        const out = {};
        for (const c of Object.keys(r)) if (c in devTypes[table]) out[c] = r[c];
        return out;
      });
    }
    snapshots[table] = rows;
    console.log(`  ${table}: ${rows.length} rows`);
  }

  if (!write) return console.log("Dry run complete. Nothing written.");

  // Clear children first so FK constraints don't block deletes.
  // push_subscriptions is cleared too (dev rows FK-reference dev users) but never copied from prod.
  for (const table of ["push_subscriptions", ...[...TABLES].reverse()]) {
    const key = CONFLICT_KEYS[table] || "id";
    const { error } = await dev.from(table).delete().not(key, "is", null);
    if (error) throw new Error(`clearing ${table}: ${error.message}`);
  }

  for (const table of TABLES) {
    const rows = snapshots[table];
    for (let i = 0; i < rows.length; i += PAGE_SIZE) {
      const { error } = await dev.from(table).insert(rows.slice(i, i + PAGE_SIZE));
      if (error) throw new Error(`inserting ${table}: ${error.message}`);
    }
    console.log(`  wrote ${table} (${rows.length})`);
  }

  console.log("Done. Log in locally with dev auto-login, e.g. ?devUserId=<username>.");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
