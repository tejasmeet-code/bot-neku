import { promises as fs } from "node:fs";
import path from "node:path";
import type { GuildMember } from "discord.js";

export interface StaffRoleEntry {
  roleId: string;
  position: number; // 1 = highest
}

export type InfractionType =
  | "warning"
  | "strike"
  | "demotion"
  | "termination";

export interface InfractionEntry {
  id: string;
  type: InfractionType;
  at: number;
  byUserId: string;
  reason: string;
  expiresAt?: number;
}

export interface PromotionEntry {
  fromRoleId: string | null;
  toRoleId: string;
  at: number;
  byUserId: string;
  reason?: string;
}

export interface DemotionEntry {
  fromRoleId: string;
  toRoleId: string | null; // null = terminated
  at: number;
  byUserId: string;
  reason?: string;
}

export interface StaffProfile {
  userId: string;
  firstJoinedAt: number;
  currentRoleId: string | null;
  positionHistory: { roleId: string; fromAt: number; toAt: number | null }[];
  promotions: PromotionEntry[];
  demotions: DemotionEntry[];
  infractions: InfractionEntry[];
  terminated: boolean;
  terminatedAt?: number;
}

export interface GuildStaff {
  roles: StaffRoleEntry[];
  profiles: Record<string, StaffProfile>;
}

const DATA_DIR = path.resolve(process.cwd(), ".data");
const FILE_PATH = path.join(DATA_DIR, "staff.json");

let cache: Record<string, GuildStaff> | null = null;
let writeQueue: Promise<void> = Promise.resolve();

async function load(): Promise<Record<string, GuildStaff>> {
  if (cache) return cache;
  try {
    const raw = await fs.readFile(FILE_PATH, "utf8");
    cache = JSON.parse(raw) as Record<string, GuildStaff>;
  } catch {
    cache = {};
  }
  return cache;
}

async function persist(data: Record<string, GuildStaff>): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(FILE_PATH, JSON.stringify(data, null, 2), "utf8");
}

function ensureGuild(
  data: Record<string, GuildStaff>,
  guildId: string,
): GuildStaff {
  if (!data[guildId]) data[guildId] = { roles: [], profiles: {} };
  return data[guildId];
}

function queueWrite(data: Record<string, GuildStaff>): Promise<void> {
  writeQueue = writeQueue.then(() => persist(data)).catch(() => {});
  return writeQueue;
}

// ---------------- Roles ----------------

export async function listStaffRoles(
  guildId: string,
): Promise<StaffRoleEntry[]> {
  const data = await load();
  const g = data[guildId];
  if (!g) return [];
  return [...g.roles].sort((a, b) => a.position - b.position);
}

export async function getRoleEntry(
  guildId: string,
  roleId: string,
): Promise<StaffRoleEntry | null> {
  const roles = await listStaffRoles(guildId);
  return roles.find((r) => r.roleId === roleId) ?? null;
}

export async function addStaffRole(
  guildId: string,
  roleId: string,
  position?: number,
): Promise<{ added: boolean; entry: StaffRoleEntry }> {
  const data = await load();
  const g = ensureGuild(data, guildId);
  const existing = g.roles.find((r) => r.roleId === roleId);
  if (existing) return { added: false, entry: existing };

  let pos: number;
  if (typeof position === "number" && position > 0) {
    // Shift any role at this or lower position down by 1.
    pos = Math.floor(position);
    for (const r of g.roles) {
      if (r.position >= pos) r.position += 1;
    }
  } else {
    // Default = lowest + 1.
    const max = g.roles.reduce((m, r) => Math.max(m, r.position), 0);
    pos = max + 1;
  }

  const entry: StaffRoleEntry = { roleId, position: pos };
  g.roles.push(entry);
  await queueWrite(data);
  return { added: true, entry };
}

export async function removeStaffRole(
  guildId: string,
  roleId: string,
): Promise<boolean> {
  const data = await load();
  const g = data[guildId];
  if (!g) return false;
  const idx = g.roles.findIndex((r) => r.roleId === roleId);
  if (idx === -1) return false;
  const removed = g.roles.splice(idx, 1)[0]!;
  // Compact positions of anything that was below.
  for (const r of g.roles) {
    if (r.position > removed.position) r.position -= 1;
  }
  await queueWrite(data);
  return true;
}

export async function reorderStaffRole(
  guildId: string,
  roleId: string,
  newPosition: number,
): Promise<boolean> {
  const data = await load();
  const g = data[guildId];
  if (!g) return false;
  const r = g.roles.find((x) => x.roleId === roleId);
  if (!r) return false;
  const oldPos = r.position;
  if (newPosition === oldPos) return true;
  for (const other of g.roles) {
    if (other.roleId === roleId) continue;
    if (newPosition < oldPos && other.position >= newPosition && other.position < oldPos) {
      other.position += 1;
    } else if (newPosition > oldPos && other.position <= newPosition && other.position > oldPos) {
      other.position -= 1;
    }
  }
  r.position = newPosition;
  await queueWrite(data);
  return true;
}

// ---------------- Profiles ----------------

export async function getProfile(
  guildId: string,
  userId: string,
): Promise<StaffProfile | null> {
  const data = await load();
  return data[guildId]?.profiles[userId] ?? null;
}

export async function listProfiles(
  guildId: string,
): Promise<StaffProfile[]> {
  const data = await load();
  const g = data[guildId];
  if (!g) return [];
  return Object.values(g.profiles);
}

function newProfile(userId: string, now: number): StaffProfile {
  return {
    userId,
    firstJoinedAt: now,
    currentRoleId: null,
    positionHistory: [],
    promotions: [],
    demotions: [],
    infractions: [],
    terminated: false,
  };
}

/**
 * Reconcile a member's stored profile to match the staff role they currently
 * hold in Discord. Creates the profile on first detection. Idempotent.
 */
export async function syncProfileFromMember(
  guildId: string,
  member: GuildMember,
): Promise<{ created: boolean; changed: boolean; profile: StaffProfile | null }> {
  const data = await load();
  const g = ensureGuild(data, guildId);
  const roles = [...g.roles].sort((a, b) => a.position - b.position);
  if (member.user.bot) return { created: false, changed: false, profile: null };

  // Find the highest staff role (lowest position number) the member currently has.
  const memberRoleIds = new Set(member.roles.cache.keys());
  const held = roles.find((r) => memberRoleIds.has(r.roleId)) ?? null;
  const now = Date.now();
  const existing = g.profiles[member.id];

  if (!existing) {
    if (!held) return { created: false, changed: false, profile: null };
    const profile = newProfile(member.id, now);
    profile.currentRoleId = held.roleId;
    profile.positionHistory.push({
      roleId: held.roleId,
      fromAt: now,
      toAt: null,
    });
    g.profiles[member.id] = profile;
    await queueWrite(data);
    return { created: true, changed: true, profile };
  }

  if (existing.currentRoleId === (held?.roleId ?? null)) {
    return { created: false, changed: false, profile: existing };
  }

  // Close out the previous open history entry, if any.
  const open = existing.positionHistory.find((e) => e.toAt === null);
  if (open) open.toAt = now;
  existing.currentRoleId = held?.roleId ?? null;
  if (held) {
    existing.positionHistory.push({
      roleId: held.roleId,
      fromAt: now,
      toAt: null,
    });
    if (existing.terminated) {
      existing.terminated = false;
      delete existing.terminatedAt;
    }
  }
  await queueWrite(data);
  return { created: false, changed: true, profile: existing };
}

export async function recordPromotion(
  guildId: string,
  userId: string,
  fromRoleId: string | null,
  toRoleId: string,
  byUserId: string,
  reason?: string,
): Promise<StaffProfile> {
  const data = await load();
  const g = ensureGuild(data, guildId);
  let profile = g.profiles[userId];
  const now = Date.now();
  if (!profile) {
    profile = newProfile(userId, now);
    g.profiles[userId] = profile;
  }
  profile.promotions.push({ fromRoleId, toRoleId, at: now, byUserId, reason });
  await queueWrite(data);
  return profile;
}

export async function recordDemotion(
  guildId: string,
  userId: string,
  fromRoleId: string,
  toRoleId: string | null,
  byUserId: string,
  reason?: string,
): Promise<StaffProfile> {
  const data = await load();
  const g = ensureGuild(data, guildId);
  let profile = g.profiles[userId];
  const now = Date.now();
  if (!profile) {
    profile = newProfile(userId, now);
    g.profiles[userId] = profile;
  }
  profile.demotions.push({ fromRoleId, toRoleId, at: now, byUserId, reason });
  if (toRoleId === null) {
    profile.terminated = true;
    profile.terminatedAt = now;
    profile.currentRoleId = null;
  }
  await queueWrite(data);
  return profile;
}

export async function recordInfraction(
  guildId: string,
  userId: string,
  type: InfractionType,
  byUserId: string,
  reason: string,
): Promise<InfractionEntry> {
  const data = await load();
  const g = ensureGuild(data, guildId);
  let profile = g.profiles[userId];
  const now = Date.now();
  if (!profile) {
    profile = newProfile(userId, now);
    g.profiles[userId] = profile;
  }
  const entry: InfractionEntry = {
    id: `${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    at: now,
    byUserId,
    reason,
  };
  if (type === "strike") entry.expiresAt = now + 14 * 24 * 60 * 60 * 1000;
  profile.infractions.push(entry);
  await queueWrite(data);
  return entry;
}

/**
 * Returns active (non-expired) infractions of a given type. Strikes drop off
 * after 14 days; warnings/demotions/terminations never expire by default.
 */
export function getActiveInfractions(
  profile: StaffProfile,
  type?: InfractionType,
  now: number = Date.now(),
): InfractionEntry[] {
  return profile.infractions.filter((i) => {
    if (type && i.type !== type) return false;
    if (i.expiresAt && i.expiresAt < now) return false;
    return true;
  });
}

export async function listAllProfiles(
  guildId: string,
): Promise<StaffProfile[]> {
  return listProfiles(guildId);
}

/** Remove a single infraction by id. Returns the removed entry or null. */
export async function removeInfraction(
  guildId: string,
  userId: string,
  infractionId: string,
): Promise<InfractionEntry | null> {
  const data = await load();
  const profile = data[guildId]?.profiles[userId];
  if (!profile) return null;
  const idx = profile.infractions.findIndex((i) => i.id === infractionId);
  if (idx === -1) return null;
  const removed = profile.infractions.splice(idx, 1)[0]!;
  await queueWrite(data);
  return removed;
}

/** Convenience: active strikes only (alias for getActiveInfractions(profile, "strike")). */
export function activeStrikes(
  infractions: InfractionEntry[],
  now: number = Date.now(),
): InfractionEntry[] {
  return infractions.filter((i) => {
    if (i.type !== "strike") return false;
    if (i.expiresAt && i.expiresAt < now) return false;
    return true;
  });
}

/**
 * Force-expire every currently active strike on a profile (used after an
 * auto-demotion so the same strikes don't trigger another demotion). Returns
 * the number of strikes that were active and got expired.
 */
export async function expireActiveStrikes(
  guildId: string,
  userId: string,
): Promise<number> {
  const data = await load();
  const profile = data[guildId]?.profiles[userId];
  if (!profile) return 0;
  const now = Date.now();
  let count = 0;
  for (const inf of profile.infractions) {
    if (inf.type !== "strike") continue;
    if (inf.expiresAt && inf.expiresAt <= now) continue;
    inf.expiresAt = now - 1;
    count += 1;
  }
  if (count > 0) await queueWrite(data);
  return count;
}
