# Birthday Game Hub — Copilot Agent Instructions

## Project Context
This is a birthday weekend party game website built in plain HTML/JS with a Supabase backend. Players are pre-assigned a fixed list of challenges. The goal is to build two things tonight:
1. A `hub.html` page — a broadcast screen meant to be displayed on a shared screen at the house
2. Modifications to the existing character select / challenge screen to enforce the 2-challenge cap and trigger challenges correctly

Do not suggest React, TypeScript, or any framework. Plain HTML, CSS, and vanilla JS only. Use the Supabase JS client (already initialized in the project) for all database interactions.

---

## Database Schema (Supabase)

### `challenges`
| Column | Type | Notes |
|---|---|---|
| `id` | text (PK) | |
| `title` | text | |
| `description` | text | |
| `type` | text | `'assigned'` or `'competition'` |
| `home_only` | boolean | **ADD THIS** — set via admin dashboard, indicates challenge must be done at the house |
| `brian_mode` | text | `'vs'` or `'with'` — nullable |
| `success_metric` | text | nullable |
| `suggested_for` | uuid (FK → users) | the user this challenge is assigned to |
| `vs_user` | uuid (FK → users) | nullable opponent |
| `approval_status` | text | `'pending'`, `'approved'`, `'denied'` |

### `assignments`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid (PK) | |
| `user_id` | uuid (FK → users) | |
| `challenge_id` | text (FK → challenges) | |
| `assigned_at` | timestamptz | when the challenge was pre-loaded onto the user |
| `triggered_at` | timestamptz | **ADD THIS** — set when someone challenges this user, null = dormant |
| `completed_at` | timestamptz | set when challenge is completed |
| `outcome` | text | `'success'` or `'failure'` |
| `active` | boolean | general active flag |
| `updated_at` | timestamptz | |
| `updated_by` | uuid (FK → users) | |

### Challenge States (derived from assignments)
- **Dormant** — `triggered_at` IS NULL
- **Active** — `triggered_at` IS NOT NULL and `completed_at` IS NULL
- **Completed** — `completed_at` IS NOT NULL

### 2-Challenge Cap Query
A user is "at capacity" when:
```sql
SELECT COUNT(*) FROM assignments
WHERE user_id = :targetUserId
AND triggered_at IS NOT NULL
AND completed_at IS NULL
```
returns 2 or more. This user cannot be challenged again until they complete one.

---

## Schema Migrations Needed
Before building, add these two columns:

```sql
-- Add home_only flag to challenges
ALTER TABLE public.challenges
ADD COLUMN home_only boolean NOT NULL DEFAULT false;

-- Add triggered_at to assignments
ALTER TABLE public.assignments
ADD COLUMN triggered_at timestamp with time zone NULL;
```

---

## Feature 1: DB Migrations & Challenge Triggering Logic

### Triggering a Challenge
When a player is challenged via the character select screen, find their next dormant assignment and trigger it:

```js
async function triggerNextChallenge(targetUserId, challengedByUserId) {
  // 1. Check active challenge count
  const { count } = await supabase
    .from('assignments')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', targetUserId)
    .not('triggered_at', 'is', null)
    .is('completed_at', null);

  if (count >= 2) {
    // Show UI warning — this user is at capacity, should not be reachable
    // but guard anyway
    return { error: 'User is at challenge capacity' };
  }

  // 2. Get next dormant assignment (oldest assigned_at first)
  const { data: next } = await supabase
    .from('assignments')
    .select('id')
    .eq('user_id', targetUserId)
    .is('triggered_at', null)
    .is('completed_at', null)
    .order('assigned_at', { ascending: true })
    .limit(1)
    .single();

  if (!next) return { error: 'No dormant challenges remaining' };

  // 3. Trigger it
  const { error } = await supabase
    .from('assignments')
    .update({
      triggered_at: new Date().toISOString(),
      updated_by: challengedByUserId,
      updated_at: new Date().toISOString()
    })
    .eq('id', next.id);

  return { error };
}
```

---

## Feature 2: Character Select Screen Updates

### Cap Enforcement
- When rendering player cards on the character select screen, query each player's active challenge count
- If a player has 2 active challenges, render their card as **disabled** — visually greyed out, not clickable
- Show a small badge or tooltip: "2 active challenges"
- Players with 0 or 1 active challenges remain selectable as normal

### On Player Selected
1. Call `triggerNextChallenge(targetUserId, currentUserId)`
2. On success: show a confirmation flash — e.g. "[Player] has been challenged!"
3. On error (capacity): show a warning — should not happen if card was disabled, but guard anyway

---

## Feature 3: hub.html — The Broadcast Screen

This is a new standalone page (`hub.html`) meant to be displayed on a TV or laptop at the house. It is read-only — no interactions except an initial "Start Hub" button to satisfy browser autoplay policy for audio.

### Layout
```
+-----------------------------------------------+
|         🎉 BIRTHDAY GAME HUB  🎉              |
+-------------------+---------------------------+
|                   |                           |
|   PLAYER BOARD    |      ACTIVITY FEED        |
|   (grid of cards) |   (scrolling event log)   |
|                   |                           |
+-------------------+---------------------------+
```

### Player Board
- Grid of player cards, one per participant
- Each card shows:
  - Player avatar/name (match existing character select aesthetic)
  - Active challenge count as a badge: `0`, `1`, or `2`
  - Visual state:
    - 0 active → neutral/idle style
    - 1 active → mild highlight
    - 2 active → strong highlight or pulsing border (at capacity)
  - A 🏠 icon if any of their current active challenges are `home_only = true`
- Cards update in real time via Supabase `onSnapshot` / realtime subscription on `assignments`

### Activity Feed
- Scrolling list of the last 10–15 events, newest at top
- Event types to display:
  - 🎯 **Challenged** — "[Player A] was challenged by [Player B]"
  - ✅ **Completed** — "[Player] completed a challenge"
  - 🏠 **Home challenge active** — "[Player] has a home challenge waiting"
- Each event shows a relative timestamp ("just now", "2 min ago")
- New events trigger:
  1. The entry animates in (slide down or fade)
  2. A sound effect plays (see Audio section)

### Audio
- On page load, show a single "Start Hub 🎉" button before anything renders
- On click, initialize the audio context and start all Supabase listeners
- This satisfies browser autoplay policy
- Sound file: `/sounds/challenge.mp3` (short, punchy — source this yourself)
- Play the sound on every new "Challenged" event in the feed:
```js
const challengeSound = new Audio('/sounds/challenge.mp3');
function playAlert() {
  challengeSound.currentTime = 0;
  challengeSound.play();
}
```

### Realtime Subscription
Subscribe to `assignments` table changes. On any INSERT or UPDATE:
1. Re-fetch affected player's active challenge count → update their card
2. Determine event type from the change (triggered_at set = challenged, completed_at set = completed)
3. Prepend new event to the activity feed
4. Play sound if event type is "challenged"

```js
supabase
  .channel('assignments-hub')
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'assignments'
  }, (payload) => {
    handleAssignmentChange(payload);
  })
  .subscribe();
```

---

## Feature 4: Admin Dashboard Addition
On the challenge creation/edit form, add a **"Home Only 🏠"** toggle (checkbox or switch). This writes to `challenges.home_only`. No other dashboard changes needed.

---

## Visual & Aesthetic Notes
- Match the existing site's visual style — do not introduce a new design language
- The hub page should feel like a "spectator screen" — high contrast, readable from across a room, larger text than normal
- Player cards on the hub should be larger and more visual than on the character select screen
- Avoid small text on the hub — assume it's being read from 6–10 feet away

---

## Out of Scope (do not build)
- Location detection of any kind
- Push notifications
- Any server-side code beyond what Supabase handles
- Authentication changes
- Any new pages other than `hub.html`
- Swap / reroll mechanic for challenges

---

## Definition of Done
- [ ] Two SQL migrations applied (`home_only`, `triggered_at`)
- [ ] `triggerNextChallenge()` function implemented and wired to character select
- [ ] Character select disables players at 2 active challenges
- [ ] `hub.html` exists and renders player board + activity feed
- [ ] Realtime subscription updates player cards live
- [ ] Audio plays on challenge events
- [ ] Admin dashboard has home_only toggle
