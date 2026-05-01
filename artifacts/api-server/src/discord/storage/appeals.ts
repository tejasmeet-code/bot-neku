import { supabase } from "./supabase";

export interface Appeal {
  id: number;
  guild_id: string;
  case_number: number;
  user_id: string;
  punishment_type: string;
  why_happened: string;
  defense: string;
  proof: string | null;
  status: "pending" | "accepted" | "rejected";
  reviewed_by: string | null;
  created_at: string;
}

export async function createAppeal(input: {
  guildId: string;
  caseNumber: number;
  userId: string;
  punishmentType: string;
  whyHappened: string;
  defense: string;
  proof?: string | null;
}): Promise<Appeal> {
  const { data, error } = await supabase
    .from("appeals")
    .insert({
      guild_id: input.guildId,
      case_number: input.caseNumber,
      user_id: input.userId,
      punishment_type: input.punishmentType,
      why_happened: input.whyHappened,
      defense: input.defense,
      proof: input.proof ?? null,
    })
    .select()
    .single();

  if (error || !data) throw new Error(`Failed to create appeal: ${error?.message}`);
  return data as Appeal;
}

export async function getAppeal(id: number): Promise<Appeal | null> {
  const { data, error } = await supabase
    .from("appeals")
    .select("*")
    .eq("id", id)
    .single();
  if (error || !data) return null;
  return data as Appeal;
}

export async function updateAppealStatus(
  id: number,
  status: "accepted" | "rejected",
  reviewedBy: string,
): Promise<Appeal | null> {
  const { data, error } = await supabase
    .from("appeals")
    .update({ status, reviewed_by: reviewedBy })
    .eq("id", id)
    .select()
    .single();
  if (error || !data) return null;
  return data as Appeal;
}

export async function listPendingAppeals(guildId: string): Promise<Appeal[]> {
  const { data, error } = await supabase
    .from("appeals")
    .select("*")
    .eq("guild_id", guildId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return data as Appeal[];
}

export async function hasOpenAppeal(guildId: string, userId: string): Promise<boolean> {
  const { count } = await supabase
    .from("appeals")
    .select("*", { count: "exact", head: true })
    .eq("guild_id", guildId)
    .eq("user_id", userId)
    .eq("status", "pending");
  return (count ?? 0) > 0;
}
