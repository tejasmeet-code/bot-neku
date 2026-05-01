import { supabase } from "./supabase";

export interface QuotaStreak {
  guild_id: string;
  user_id: string;
  consecutive_fails: number;
  last_check_week: number;
}

export async function getStreak(guildId: string, userId: string): Promise<QuotaStreak> {
  const { data } = await supabase
    .from("quota_streaks")
    .select("*")
    .eq("guild_id", guildId)
    .eq("user_id", userId)
    .single();

  return data ?? { guild_id: guildId, user_id: userId, consecutive_fails: 0, last_check_week: 0 };
}

export async function resetStreak(guildId: string, userId: string, weekStart: number): Promise<void> {
  await supabase.from("quota_streaks").upsert({
    guild_id: guildId,
    user_id: userId,
    consecutive_fails: 0,
    last_check_week: weekStart,
  }, { onConflict: "guild_id,user_id" });
}

export async function incrementStreak(guildId: string, userId: string, weekStart: number): Promise<number> {
  const current = await getStreak(guildId, userId);
  const newCount = current.consecutive_fails + 1;
  await supabase.from("quota_streaks").upsert({
    guild_id: guildId,
    user_id: userId,
    consecutive_fails: newCount,
    last_check_week: weekStart,
  }, { onConflict: "guild_id,user_id" });
  return newCount;
}
