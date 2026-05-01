import type { Guild, GuildMember, Role, User } from "discord.js";
import { logger } from "../../lib/logger";

export interface DmTarget {
  user?: User | null;
  member?: GuildMember | null;
  role?: Role | null;
  everyone?: boolean;
}

export interface DmResult {
  sent: number;
  failed: number;
  label: string;
  total: number;
}

export const DM_INTERVAL_MS = 1500;
export const MAX_RECIPIENTS_HARD_CAP = 5000;

// When DMing roles or @everyone, send in groups of this many at once
export const DM_GROUP_SIZE = 3;
// Random wait between groups, in milliseconds (3-4 minutes)
export const DM_GROUP_INTERVAL_MIN_MS = 3 * 60 * 1000;
export const DM_GROUP_INTERVAL_MAX_MS = 4 * 60 * 1000;

/**
 * Resolve a target (user, role, or everyone) to a deduped map of users.
 * Filters out bots automatically.
 */
export async function resolveDmRecipients(
  guild: Guild,
  target: DmTarget,
): Promise<{ users: Map<string, User>; label: string }> {
  if (target.everyone) {
    const members = await guild.members.fetch().catch((err) => {
      logger.warn({ err }, "Failed to fetch members for DM");
      throw new Error(
        "I couldn't load the server's member list. Make sure the **Server Members Intent** is enabled in the Discord Developer Portal.",
      );
    });
    const users = new Map<string, User>();
    for (const m of members.values()) {
      if (!m.user.bot) users.set(m.user.id, m.user);
    }
    return { users, label: "everyone" };
  }

  if (target.role) {
    await guild.members.fetch().catch((err) => {
      logger.warn({ err }, "Failed to fetch members for role DM");
      throw new Error(
        "I couldn't load the server's member list. Make sure the **Server Members Intent** is enabled in the Discord Developer Portal.",
      );
    });
    const role = await guild.roles.fetch(target.role.id).catch(() => null);
    if (!role) throw new Error("Couldn't find that role.");
    const users = new Map<string, User>();
    for (const m of role.members.values()) {
      if (!m.user.bot) users.set(m.user.id, m.user);
    }
    return { users, label: `role @${role.name}` };
  }

  if (target.member) {
    const u = target.member.user;
    if (u.bot) return { users: new Map(), label: u.tag };
    return { users: new Map([[u.id, u]]), label: u.tag };
  }

  if (target.user) {
    if (target.user.bot) return { users: new Map(), label: target.user.tag };
    return { users: new Map([[target.user.id, target.user]]), label: target.user.tag };
  }

  throw new Error("No DM target provided.");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Send a message to every user in the map with a delay between sends so we
 * don't trip Discord's per-bot DM rate limits. Returns sent/failed counts.
 */
export async function sendDmsToUsers(
  users: Map<string, User>,
  content: string,
  intervalMs: number = DM_INTERVAL_MS,
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;
  let i = 0;
  const total = users.size;
  for (const user of users.values()) {
    try {
      await user.send(content);
      sent++;
    } catch (err) {
      failed++;
      logger.debug({ err, userId: user.id }, "DM failed");
    }
    i++;
    if (i < total && intervalMs > 0) await sleep(intervalMs);
  }
  return { sent, failed };
}

/**
 * Estimate of how long a DM run will take, in seconds.
 */
export function estimateDmSeconds(count: number, intervalMs = DM_INTERVAL_MS): number {
  if (count <= 1) return 0;
  return Math.round(((count - 1) * intervalMs) / 1000);
}

/**
 * Send DMs in groups (e.g. 3 at a time) with a random delay between groups.
 * Used for role / everyone broadcasts so we don't trip Discord's anti-spam.
 */
export async function sendDmsInGroups(
  users: Map<string, User>,
  content: string,
  groupSize: number = DM_GROUP_SIZE,
  minIntervalMs: number = DM_GROUP_INTERVAL_MIN_MS,
  maxIntervalMs: number = DM_GROUP_INTERVAL_MAX_MS,
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;
  const arr = Array.from(users.values());
  const total = arr.length;
  for (let i = 0; i < total; i += groupSize) {
    const chunk = arr.slice(i, i + groupSize);
    const results = await Promise.allSettled(
      chunk.map((u) => u.send(content)),
    );
    for (let j = 0; j < results.length; j++) {
      const r = results[j];
      if (r.status === "fulfilled") {
        sent++;
      } else {
        failed++;
        logger.debug(
          { err: r.reason, userId: chunk[j]?.id },
          "Grouped DM failed",
        );
      }
    }
    if (i + groupSize < total) {
      const span = Math.max(0, maxIntervalMs - minIntervalMs);
      const delay = minIntervalMs + Math.floor(Math.random() * (span + 1));
      await sleep(delay);
    }
  }
  return { sent, failed };
}

/**
 * Estimate of how long a grouped DM run will take, in seconds.
 * Uses the average of min/max group interval.
 */
export function estimateGroupedDmSeconds(
  count: number,
  groupSize: number = DM_GROUP_SIZE,
  minIntervalMs: number = DM_GROUP_INTERVAL_MIN_MS,
  maxIntervalMs: number = DM_GROUP_INTERVAL_MAX_MS,
): number {
  if (count <= groupSize) return 0;
  const groups = Math.ceil(count / groupSize);
  const avgMs = (minIntervalMs + maxIntervalMs) / 2;
  return Math.round(((groups - 1) * avgMs) / 1000);
}
