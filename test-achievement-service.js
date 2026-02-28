/**
 * Test script for AchievementService
 * Run in the browser console after authenticating a test user.
 */

async function testAchievementService() {
  console.log("🧪 Testing AchievementService...");
  try {
    const { achievementService } = await import("./js/services/achievement-service.js");
    const { appState } = await import("./js/app.js");

    const userId = appState.getUserId();
    const supabase = appState.getSupabase();
    if (!userId || !supabase) {
      throw new Error("Not authenticated or Supabase not available");
    }

    await achievementService.init();
    console.log("✅ AchievementService initialized");

    // Try awarding the rickroll achievement (idempotent)
    console.log("🔔 Awarding rickroll achievement...");
    const res = await achievementService.awardByKey("rickroll", { details: { test: true } });
    console.log("Result:", res);

    // Check user_achievements for this user
    const { data, error } = await supabase
      .from("user_achievements")
      .select("id,achievement_id,awarded_at,details")
      .eq("user_id", userId)
      .order("awarded_at", { ascending: false })
      .limit(10);

    if (error) console.error("Query error:", error);
    else console.log("Recent awards:", data);

    console.log("🎉 AchievementService tests completed");
  } catch (err) {
    console.error("✖️ Test failed:", err);
  }
}

async function testAwardFirstComment() {
  console.log("🧪 Test awarding first_comment via guestbook flow...");
  try {
    const { addComment } = await import("./js/components/guestbook.js");
    const { appState } = await import("./js/app.js");
    const userId = appState.getUserId();
    const supabase = appState.getSupabase();
    if (!userId || !supabase) throw new Error("Not authenticated");

    const inserted = await addComment({
      name: "Test User",
      message: "Test comment from achievement test",
      user_id: userId,
    });
    console.log("Inserted comment:", inserted);

    // After insertion, AchievementService should receive event and award; poll for award
    const start = Date.now();
    let awarded = null;
    while (Date.now() - start < 5000) {
      const { data } = await supabase
        .from("user_achievements")
        .select("id,achievement_id")
        .eq("user_id", userId)
        .limit(10);
      if (data && data.length > 0) {
        awarded = data.find((d) => d.details && d.details.commentId == inserted.id) || data[0];
        if (awarded) break;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    console.log("Award detected:", awarded);
  } catch (err) {
    console.error("✖️ testAwardFirstComment failed:", err);
  }
}

async function testRpcAwardOnCommentThreshold() {
  console.log("🧪 Test RPC: rpc_award_on_comment_threshold");
  try {
    const { appState } = await import("./js/app.js");
    const supabase = appState.getSupabase();
    const userId = appState.getUserId();
    if (!userId || !supabase) throw new Error("Not authenticated");

    const { data, error } = await supabase.rpc("rpc_award_on_comment_threshold", {
      p_user_id: userId,
      p_threshold: 3,
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    console.log("RPC result:", row);
  } catch (err) {
    console.error("✖️ testRpcAwardOnCommentThreshold failed:", err);
  }
}

async function testRpcAwardWhenAllAssignedCompleted() {
  console.log("🧪 Test RPC: rpc_award_when_all_assigned_completed");
  try {
    const { appState } = await import("./js/app.js");
    const supabase = appState.getSupabase();
    const userId = appState.getUserId();
    if (!userId || !supabase) throw new Error("Not authenticated");

    const { data, error } = await supabase.rpc("rpc_award_when_all_assigned_completed", {
      p_user_id: userId,
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    console.log("RPC result:", row);
  } catch (err) {
    console.error("✖️ testRpcAwardWhenAllAssignedCompleted failed:", err);
  }
}

window.testRpcAwardOnCommentThreshold = testRpcAwardOnCommentThreshold;
window.testRpcAwardWhenAllAssignedCompleted = testRpcAwardWhenAllAssignedCompleted;

console.log(
  "🧪 Extra RPC test helpers loaded: testRpcAwardOnCommentThreshold(), testRpcAwardWhenAllAssignedCompleted()"
);

window.testAchievementService = testAchievementService;
window.testAwardFirstComment = testAwardFirstComment;

async function testMakeThreeComments() {
  console.log("🧪 Inserting up to 3 test comments (idempotent)...");
  try {
    const { addComment } = await import("./js/components/guestbook.js");
    const { appState } = await import("./js/app.js");
    const userId = appState.getUserId();
    const supabase = appState.getSupabase();
    if (!userId || !supabase) throw new Error("Not authenticated");

    // Check existing comments for this user
    const { data: existing, count } = await supabase
      .from("guestbook")
      .select("id", { count: "exact" })
      .eq("user_id", userId);
    const existingCount = Number(count || (Array.isArray(existing) ? existing.length : 0));
    console.log(`User currently has ${existingCount} comment(s)`);

    const toInsert = Math.max(0, 3 - existingCount);
    const inserted = [];
    if (toInsert > 0) {
      for (let i = 1; i <= toInsert; i++) {
        const res = await addComment({
          name: appState.getCurrentUser().display_name || "Test User",
          message: `Automated test comment (added ${i} of ${toInsert}) - ${Date.now()}`,
          user_id: userId,
        });
        inserted.push(res);
        console.log("Inserted comment:", res);
        // small delay
        await new Promise((r) => setTimeout(r, 250));
      }
    } else {
      console.log("No comments inserted — user already has 3 or more comments.");
    }

    // Call RPC to evaluate threshold-based awards (idempotent)
    try {
      const { data: rpcData, error: rpcErr } = await supabase.rpc(
        "rpc_award_on_comment_threshold",
        {
          p_user_id: userId,
          p_threshold: 3,
        }
      );
      if (rpcErr) console.warn("RPC error:", rpcErr);
      else console.log("RPC result:", rpcData);
    } catch (err) {
      console.warn("RPC invocation failed:", err);
    }

    // Poll for award
    const start = Date.now();
    let award = null;
    while (Date.now() - start < 10000) {
      const { data } = await supabase.from("user_achievements").select("*").eq("user_id", userId);
      if (data && data.length > 0) {
        award = data;
        break;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    console.log("Awards after test:", award);
    return { inserted, award };
  } catch (err) {
    console.error("✖️ testMakeThreeComments failed:", err);
    throw err;
  }
}

window.testMakeThreeComments = testMakeThreeComments;

console.log(
  "🧪 Achievement service test helpers loaded: testAchievementService(), testAwardFirstComment()"
);
