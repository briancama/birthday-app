# Challenges

## What it is

Progressive challenge system for event participants: users get a queue of assigned challenges, reveal and complete them in sequence, and can trigger challenges for each other. Includes a submission workshop and an admin approval pipeline for user-created challenges.

## How it works

- **Progressive reveal** — titles show as "Challenge N" until revealed; only the current incomplete challenge can be revealed. Shared reveal/lock logic lives in `js/utils/challenge-state.js` (used by both client and EJS SSR).
- **Active cap & queue** — a user has at most **2 active** challenges; the rest sit dormant. Other users trigger a dormant one via `POST /api/users/:id/challenge` (sends a notification). Users can swap an active challenge back to dormant and pull the next via `POST /api/assignments/:id/swap`.
- **Brian mode** — challenges tagged `brian_mode: 'vs'` or `'with'` auto-create a mirrored assignment for the `brianc` user: `vs` = inverse outcome, `with` = same outcome. `challenges.vs_user` supports vs-challenges against arbitrary users.
- **Outcomes** — completing sets `outcome` (`success`/`failure`) and `completed_at`; success on assigned challenges is worth 5 points on the scoreboard.
- **Submissions** — users create challenges in the workshop (`/challenges-submit`); rows are inserted into `challenges` with `approval_status: pending`, `created_by`, and optional `suggested_for`. Admins approve/deny at `/admin-approvals` and manage per-user assignments.
- **`home_only`** — flag restricting where a challenge can be completed.
- Assignment writes go through `assignment-service.js` using the `update_challenge_assignments` RPC (optimistic locking, `updated_at`/`updated_by` tracking, `assigned_at` preservation).

## Key files

| File                                                                                                  | Role                                    |
| ----------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `js/pages/dashboard.js`, `js/pages/challenges.js`                                                     | Participant surfaces                    |
| `js/pages/challenges-submit.js`                                                                       | Submission workshop (+ scam easter egg) |
| `js/pages/admin-approvals.js`, `js/components/submission.js`, `js/components/challenge-assignment.js` | Admin approval + assignment management  |
| `js/components/challenge-card.js`, `challenge-list.js`                                                | Card rendering (EventTarget components) |
| `js/services/assignment-service.js`, `challenge-loader.js`                                            | Data operations                         |
| `js/utils/challenge-state.js`                                                                         | Reveal/lock state (shared client/SSR)   |
| `templates/partials/challenge-card.ejs`, `challenge-list.ejs`                                         | SSR equivalents                         |
| `routes/api-users.js`                                                                                 | Trigger/swap/count endpoints            |

## Data

`challenges` (text PK, `brian_mode`, `vs_user`, `home_only`, approval workflow columns), `assignments` (`active`, `triggered_at`, `outcome`, lock columns). See [../DATABASE.md](../DATABASE.md).

## Feature flags

`app_settings`: `event_started` gates dashboard challenges; `challenges_enabled` can disable the system (default on).

## Achievement hooks

`first_challenge`, `three_challenges`, `all_assigned_completed` (RPC-based), `one_submission_created`/`three_submissions_created`, `social_butterfly` (trigger 5+ different users), `the_challenger`.
