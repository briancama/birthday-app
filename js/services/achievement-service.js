import { EventBus } from "../events/event-bus.js";
import { appState } from "../app.js";

class AchievementService {
  constructor() {
    this.initialized = false;
  }

  async init() {
    if (this.initialized) return;
    this.initialized = true;

    // Listen to EventBus and window-level triggers
    EventBus.instance.listen("challenge:completed-success", (e) => this.onChallengeCompleted(e));
    EventBus.instance.listen("challenge:submitted", (e) => this.onChallengeSubmitted(e));
    EventBus.instance.listen("gif:completed", (e) => this.onGifCompleted(e));
    EventBus.instance.listen("cocktail:favorite:toggled", (e) => this.onFavoriteToggled(e));
    EventBus.instance.listen("user:guestbook:sign", (e) => this.onGuestbookSign(e));
    EventBus.instance.listen("event:rsvp", (e) => this.onEventRsvp(e));

    // Also listen for simple DOM events (useful for inline scripts)
    window.addEventListener("achievement:trigger", (e) => {
      const key = e.detail?.key;
      if (key) this.awardByKey(key, { details: e.detail });
    });

    // Fallback: listen for window-level gif completion events (in case EventBus isn't available)
    window.addEventListener("gif:completed", (e) => {
      try {
        // Normalize to EventBus-style event object
        this.onGifCompleted(e);
      } catch (err) {
        console.warn("AchievementService: gif:completed handler error", err);
      }
    });
  }

  async onChallengeCompleted(e) {
    try {
      const userId = appState.getUserId();
      if (!userId) return;
      // Use server-side RPC to atomically award when all assigned are completed
      try {
        const supabase = appState.getSupabase();
        const { data, error } = await supabase.rpc("rpc_award_when_all_assigned_completed", {
          p_user_id: userId,
        });
        if (error) throw error;
        const row = Array.isArray(data) ? data[0] : data;
        if (row && row.awarded) {
          // fetch achievement metadata
          const { data: ach, error: achErr } = await supabase
            .from("achievements")
            .select("id,key,name,points")
            .eq("id", row.achievement_id)
            .maybeSingle();
          if (!achErr && ach) {
            EventBus.instance.emit("achievement:awarded", {
              userId,
              achievementKey: ach.key,
              name: ach.name,
              points: ach.points,
              details: { total_assigned: row.total_assigned, total_completed: row.total_completed },
            });
          }
        }
      } catch (rpcErr) {
        console.warn("AchievementService: rpc_award_when_all_assigned_completed error", rpcErr);
      }
    } catch (err) {
      console.warn("AchievementService: onChallengeCompleted error", err);
    }
  }

  async onGuestbookSign(e) {
    try {
      const userId = appState.getUserId();
      const commentId = e.detail?.commentId;
      console.debug("AchievementService.onGuestbookSign", { userId, commentId });
      if (!userId) {
        console.debug("AchievementService.onGuestbookSign: no userId, skipping");
        return;
      }
      const supabase = appState.getSupabase();
      try {
        const { data, error } = await supabase.rpc("rpc_award_on_comment_threshold", {
          p_user_id: userId,
          p_threshold: 3,
        });
        console.debug("rpc_award_on_comment_threshold result", { data, error });
        if (error) throw error;
        const row = Array.isArray(data) ? data[0] : data;
        if (row && row.awarded) {
          const { data: ach, error: achErr } = await supabase
            .from("achievements")
            .select("id,key,name,points")
            .eq("id", row.achievement_id)
            .maybeSingle();
          if (!achErr && ach) {
            EventBus.instance.emit("achievement:awarded", {
              userId,
              achievementKey: ach.key,
              name: ach.name,
              points: ach.points,
              details: { comment_count: row.comment_count },
            });
          }
        } else {
          console.debug("rpc_award_on_comment_threshold: not awarded", { row });
          // still award first_comment (non-threshold) if not using RPC? keep previous behavior for first_comment
          // award first_comment if not already awarded
          await this.awardByKey("first_comment", { details: { commentId } });
        }
      } catch (rpcErr) {
        console.warn("AchievementService: rpc_award_on_comment_threshold error", rpcErr);
        // fallback to client-side first comment award
        await this.awardByKey("first_comment", { details: { commentId } });
      }
    } catch (err) {
      console.warn("AchievementService: onGuestbookSign error", err);
    }
  }

  async onFavoriteToggled(e) {
    try {
      const userId = appState.getUserId();
      if (!userId) return;
      const favorited = e.detail?.favorited;
      if (favorited) {
        // Favorites are part of the cocktail competition; do not award achievements for them.
        // kept intentionally empty to avoid awarding 'first_favorite'
      }
    } catch (err) {
      console.warn("AchievementService: onFavoriteToggled error", err);
    }
  }

  async onEventRsvp(e) {
    // Placeholder for RSVP-related achievements
  }

  async onChallengeSubmitted(e) {
    try {
      const userId = e.detail?.userId || appState.getUserId();
      if (!userId) return;
      // Award based on counts stored in DB: look for achievements with metadata.trigger = 'challenge:submitted'
      const supabase = appState.getSupabase();
      const metadataTrigger = "challenge:submitted";

      // Find achievements configured for this trigger
      const { data: achievements, error } = await supabase
        .from("achievements")
        .select("id,key,points,metadata")
        .filter("metadata->>trigger", "eq", metadataTrigger);
      if (error) throw error;
      if (!achievements || achievements.length === 0) return;

      // Count user's submitted challenges
      const { data: challenges, error: cntErr } = await supabase
        .from("challenges")
        .select("id")
        .eq("created_by", userId);
      if (cntErr) throw cntErr;
      const submittedCount = Array.isArray(challenges) ? challenges.length : 0;

      for (const a of achievements) {
        const threshold = a.metadata?.threshold || (a.metadata?.threshold === 0 ? 0 : null);
        if (threshold && submittedCount >= threshold) {
          await this.awardByKey(a.key, { details: { submittedCount } });
        }
      }
    } catch (err) {
      console.warn("AchievementService: onChallengeSubmitted error", err);
    }
  }

  async onGifCompleted(e) {
    try {
      const userId = appState.getUserId();
      if (!userId) return;
      // Award a one-off achievement for completing the GIF stepper
      await this.awardByKey("gif_master", { details: { src: e.detail?.src } });
    } catch (err) {
      console.warn("AchievementService: onGifCompleted error", err);
    }
  }

  async checkAndAwardCountBased(userId, metadataTrigger, fallbackKey) {
    try {
      const supabase = appState.getSupabase();
      // Find achievements with metadata.trigger = metadataTrigger
      const { data: achievements, error } = await supabase
        .from("achievements")
        .select("id,key,points,metadata")
        .filter("metadata->>trigger", "eq", metadataTrigger);
      if (error) throw error;
      if (!achievements || achievements.length === 0) return;

      // Count user's successful assignments
      const { data: assignments, error: cntErr } = await supabase
        .from("assignments")
        .select("id")
        .eq("user_id", userId)
        .eq("outcome", "success");
      if (cntErr) throw cntErr;
      const completed = Array.isArray(assignments) ? assignments.length : 0;

      for (const a of achievements) {
        const threshold = a.metadata?.threshold || (a.metadata?.threshold === 0 ? 0 : null);
        if (threshold && completed >= threshold) {
          await this.awardByKey(a.key, { details: { completed } });
        } else if (!threshold && fallbackKey) {
          // fallback award for first completion
          if (completed >= 1) await this.awardByKey(fallbackKey, { details: { completed } });
        }
      }
    } catch (err) {
      console.warn("AchievementService: checkAndAwardCountBased error", err);
    }
  }

  async hasAwarded(userId, achievementId) {
    const supabase = appState.getSupabase();
    const { data, error } = await supabase
      .from("user_achievements")
      .select("id")
      .eq("user_id", userId)
      .eq("achievement_id", achievementId)
      .limit(1)
      .maybeSingle();
    if (error) {
      console.warn("hasAwarded query error", error);
      return false;
    }
    return !!data;
  }

  async awardByKey(key, { details = {} } = {}) {
    try {
      const supabase = appState.getSupabase();
      const userId = appState.getUserId();
      if (!userId) return null;

      const { data: ach, error: achErr } = await supabase
        .from("achievements")
        .select("id,key,name,points")
        .eq("key", key)
        .maybeSingle();
      if (achErr) throw achErr;
      if (!ach) return null;

      // Check existing award
      const { data: existing, error: exErr } = await supabase
        .from("user_achievements")
        .select("id")
        .eq("user_id", userId)
        .eq("achievement_id", ach.id)
        .limit(1)
        .maybeSingle();
      if (exErr) throw exErr;
      if (existing) return null; // already awarded

      // Insert award
      const { data: inserted, error: insertErr } = await supabase
        .from("user_achievements")
        .insert([
          {
            user_id: userId,
            achievement_id: ach.id,
            details: details || {},
          },
        ])
        .select()
        .maybeSingle();
      if (insertErr) throw insertErr;

      // Emit UI event
      EventBus.instance.emit("achievement:awarded", {
        userId,
        achievementKey: ach.key,
        name: ach.name,
        points: ach.points,
        details,
      });

      // Also call window event for compatibility
      window.dispatchEvent(
        new CustomEvent("achievement:awarded", { detail: { achievement: ach } })
      );

      return inserted;
    } catch (err) {
      console.error("AchievementService awardByKey error", err);
      return null;
    }
  }
}

export const achievementService = new AchievementService();
