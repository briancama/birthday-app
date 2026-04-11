-- Account Center Notifications V1 (April 2026)
--
-- Purpose:
-- 1) Formalize current notification payload shape for social activity.
-- 2) Add an index optimized for unread badge and unread list queries.
--
-- Notes:
-- - Existing `notifications` table remains source of truth.
-- - Payload is JSONB and should include:
--   {
--     "version": 1,
--     "type": "wall_post_received|top8_added|top8_removed|...",
--     "from_user": "<uuid>",
--     "from_username": "<string>",
--     "from_display_name": "<string>",
--     ...feature-specific fields...
--   }

CREATE INDEX IF NOT EXISTS notifications_user_unread_created_at_idx
  ON notifications(user_id, read, created_at DESC);
