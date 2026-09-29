# Easter Eggs

Hidden features, each usually tied to an achievement. (Spoilers, obviously.)

| Egg                  | Trigger                                                                                                              | Reward                                                 | Key files                                                                                         |
| -------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| **YTMND**            | Click letters spelling Y-T-M-N-D hidden in the event-info header (also surfaced for logged-in users on the homepage) | `ytmnd.html` overlay-reveal page + `ytmnd` achievement | `js/components/ytmnd-easter-egg.js`, `ytmnd.html`                                                 |
| **Scam simulator**   | Fake phishing dialog chain in the challenges-submit sidebar; validates against the user's real phone number          | `h4x0r` achievement                                    | `js/components/scam-reveal.js`, `DialogChain.js`, `templates/partials/sidebar-scam-container.ejs` |
| **Forgot phone**     | Phishing-flow variant                                                                                                | `forgot_phone` achievement                             | `sql/2026_03_31_add_forgot_phone_achievement.sql`                                                 |
| **Goblin king**      | Hidden discovery sequence                                                                                            | `goblin_king` achievement                              | `js/components/goblin-king.js`                                                                    |
| **Secret tracks**    | Find all 3 hidden audio tracks in the music player                                                                   | `secret_tracks` achievement                            | `js/components/secret-track-player.js`                                                            |
| **Site awards**      | Click 10 unique site-award GIFs                                                                                      | `site_popularity` achievement                          | award GIFs across pages                                                                           |
| **Ad completionist** | Click every catalog ad                                                                                               | `ad_completionist` achievement                         | see [media-slots.md](media-slots.md)                                                              |
| **GIF master**       | Complete all interactive GIF steppers                                                                                | `gif_master` achievement                               | `js/components/gif-stepper.js`                                                                    |

Related pages: `invitation.html` (view counter via `increment_page_views` RPC + guestbook with random animated images), `hub.html` (realtime hub, `sql/2026_03_17_hub_realtime_setup.sql`), `hello.html` (misc).

Achievement awarding for eggs goes through the standard RPC path — see [scoring-and-achievements.md](scoring-and-achievements.md).
