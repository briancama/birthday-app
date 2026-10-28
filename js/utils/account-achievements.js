async function buildAccountAchievements(supabase, userId) {
  if (!supabase) throw new Error("Achievement service unavailable");
  if (!userId) throw new Error("Sign in to view achievements");

  const [catalogResult, awardsResult] = await Promise.all([
    supabase
      .from("achievements")
      .select(
        "id,key,name,description,points,image_url,metadata,is_visitor_eligible,show_on_profile"
      )
      .order("created_at", { ascending: true })
      .order("id", { ascending: true }),
    supabase.from("user_achievements").select("achievement_id").eq("user_id", userId),
  ]);
  if (catalogResult.error) throw catalogResult.error;
  if (awardsResult.error) throw awardsResult.error;

  const awardedIds = new Set((awardsResult.data || []).map((row) => row.achievement_id));
  const earned = [];
  const locked = [];
  let secretCount = 0;

  for (const achievement of catalogResult.data || []) {
    if (awardedIds.has(achievement.id)) {
      const walktober = /^walktober_(\d{4})_/.exec(achievement.key);
      const ladder = /^walktober_\d{4}_(streak|goal_days)_(\d+)$/.exec(achievement.key);
      earned.push({
        name: achievement.name || achievement.key || "Achievement",
        description: achievement.description || "",
        points: achievement.points || 0,
        image_url: achievement.image_url || null,
        counts_toward_rank: achievement.is_visitor_eligible === true,
        walktober_year: walktober ? Number(walktober[1]) : null,
        ladder: ladder ? ladder[1] : null,
        tier: ladder ? Number(ladder[2]) : null,
      });
    } else if (
      achievement.is_visitor_eligible === true &&
      achievement.show_on_profile !== false &&
      !/^walktober_\d{4}_/.test(achievement.key)
    ) {
      if (achievement.metadata?.hidden === true) {
        secretCount += 1;
      } else {
        const hint = achievement.metadata?.hint;
        locked.push({
          hint: typeof hint === "string" ? hint.replace(/\s+/g, " ").trim() : "",
        });
      }
    }
  }

  return { earned, locked, secretCount, total: earned.length + locked.length };
}

module.exports = { buildAccountAchievements };
