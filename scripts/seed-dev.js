// Idempotent dev fixtures: a few users, challenges, assignments, and an event
// so a fresh dev database is immediately usable with dev auto-login.
//
// Usage: npm run seed   (targets SUPABASE_URL in .env; refuses if it looks like prod)
//
// Does NOT seed the achievements catalog — that comes from /sql migrations.

require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");

// Fixed UUIDs so re-running upserts instead of duplicating.
const U = {
  brianc: "00000000-0000-4000-8000-000000000001",
  alice: "00000000-0000-4000-8000-000000000002",
  bob: "00000000-0000-4000-8000-000000000003",
  visitor: "00000000-0000-4000-8000-000000000004",
};

const users = [
  {
    id: U.brianc,
    username: "brianc",
    display_name: "Brian",
    user_type: "participant",
    isAdmin: true,
  },
  {
    id: U.alice,
    username: "alice",
    display_name: "Alice Dev",
    user_type: "participant",
    isAdmin: false,
  },
  { id: U.bob, username: "bob", display_name: "Bob Dev", user_type: "participant", isAdmin: false },
  {
    id: U.visitor,
    username: "visitor1",
    display_name: "Brian Fan #1",
    user_type: "visitor",
    isAdmin: false,
  },
];

const profiles = [
  {
    user_id: U.alice,
    status: "testing locally",
    hometown: "Devtown",
    is_published: true,
    top_n: [],
  },
  { user_id: U.bob, status: "also testing", is_published: true, top_n: [] },
];

const challenges = [
  {
    id: "seed-c1",
    title: "First Seed Challenge",
    description: "Do the thing.",
    type: "assigned",
    approval_status: "approved",
    home_only: false,
  },
  {
    id: "seed-c2",
    title: "Beat Brian (seed)",
    description: "Compete against Brian.",
    type: "assigned",
    brian_mode: "vs",
    approval_status: "approved",
    home_only: false,
  },
  {
    id: "seed-c3",
    title: "Team Up (seed)",
    description: "Work with Brian.",
    type: "assigned",
    brian_mode: "with",
    approval_status: "approved",
    home_only: false,
  },
];

const assignments = [
  {
    id: "10000000-0000-4000-8000-000000000001",
    user_id: U.alice,
    challenge_id: "seed-c1",
    active: true,
  },
  {
    id: "10000000-0000-4000-8000-000000000002",
    user_id: U.alice,
    challenge_id: "seed-c2",
    active: false,
  },
  {
    id: "10000000-0000-4000-8000-000000000003",
    user_id: U.bob,
    challenge_id: "seed-c1",
    active: true,
  },
];

const events = [
  {
    id: "20000000-0000-4000-8000-000000000001",
    title: "Seed Event",
    description: "A local test event.",
    date: new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10),
    time_label: "7pm-ish",
    location: "Localhost Lounge",
  },
];

async function main() {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE, PROD_SUPABASE_URL } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
    console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE in .env");
    process.exit(1);
  }
  if (PROD_SUPABASE_URL && SUPABASE_URL === PROD_SUPABASE_URL) {
    console.error("Refusing to seed: SUPABASE_URL matches PROD_SUPABASE_URL.");
    process.exit(1);
  }

  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });

  async function upsert(table, rows, onConflict = "id") {
    const { error } = await db.from(table).upsert(rows, { onConflict });
    if (error) throw new Error(`${table}: ${error.message}`);
    console.log(`  upserted ${rows.length} → ${table}`);
  }

  console.log(`Seeding ${SUPABASE_URL}`);
  await upsert("users", users);
  await upsert("user_profile", profiles, "user_id");
  await upsert("challenges", challenges);
  await upsert("assignments", assignments);
  await upsert("events", events);

  console.log("Done. Try: http://localhost:8000/dashboard?devUserId=alice");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
