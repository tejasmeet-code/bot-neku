import { supabase } from "./supabase";

export type CaseAction = "ban" | "unban" | "mute" | "unmute" | "warn" | "jail" | "kick" | "ban-request";

export interface Case {
  id: number;
  guild_id: string;
  case_number: number;
  action: CaseAction;
  moderator_id: string;
  target_id: string;
  reason: string;
  proof: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

const caseCounterCache = new Map<string, number>();

export async function getNextCaseNumber(guildId: string): Promise<number> {
  const { data, error } = await supabase
    .from("cases")
    .select("case_number")
    .eq("guild_id", guildId)
    .order("case_number", { ascending: false })
    .limit(1)
    .single();

  if (error || !data) return 1;
  return data.case_number + 1;
}

export async function createCase(input: {
  guildId: string;
  action: CaseAction;
  moderatorId: string;
  targetId: string;
  reason: string;
  proof?: string | null;
}): Promise<Case> {
  const caseNumber = await getNextCaseNumber(input.guildId);

  const { data, error } = await supabase
    .from("cases")
    .insert({
      guild_id: input.guildId,
      case_number: caseNumber,
      action: input.action,
      moderator_id: input.moderatorId,
      target_id: input.targetId,
      reason: input.reason,
      proof: input.proof ?? null,
      active: true,
    })
    .select()
    .single();

  if (error || !data) throw new Error(`Failed to create case: ${error?.message}`);
  caseCounterCache.set(input.guildId, caseNumber);
  return data as Case;
}

export async function getCase(guildId: string, caseNumber: number): Promise<Case | null> {
  const { data, error } = await supabase
    .from("cases")
    .select("*")
    .eq("guild_id", guildId)
    .eq("case_number", caseNumber)
    .single();

  if (error || !data) return null;
  return data as Case;
}

export async function editCase(
  guildId: string,
  caseNumber: number,
  updates: { reason?: string; active?: boolean },
): Promise<Case | null> {
  const { data, error } = await supabase
    .from("cases")
    .update(updates)
    .eq("guild_id", guildId)
    .eq("case_number", caseNumber)
    .select()
    .single();

  if (error || !data) return null;
  return data as Case;
}

export async function listCases(guildId: string, targetId?: string): Promise<Case[]> {
  let q = supabase.from("cases").select("*").eq("guild_id", guildId);
  if (targetId) q = q.eq("target_id", targetId);
  const { data, error } = await q.order("case_number", { ascending: false }).limit(50);
  if (error || !data) return [];
  return data as Case[];
}

export async function deactivateCase(guildId: string, caseNumber: number): Promise<void> {
  await supabase
    .from("cases")
    .update({ active: false })
    .eq("guild_id", guildId)
    .eq("case_number", caseNumber);
}
