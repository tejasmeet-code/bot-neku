import { promises as fs } from "node:fs";
import path from "node:path";

export type QuotaAction = "none" | "warning" | "strike" | "termination";

export interface WeekStat {
  weekStart: number; // epoch ms of week start (Sunday 00:00 UTC by default)
  messages: number;
  modActions: number;
  fulfilled: boolean;
  action: QuotaAction;
}

export interface UserQuota {
  weekly: WeekStat[];
}

const DATA_DIR = path.resolve(process.cwd(), ".data");
const FILE_PATH = path.join(DATA_DIR, "quota.json");

let cache: Record<string, Record<string, UserQuota>> | null = null;
let writeQueue: Promise<void> = Promise.resolve();

async function load(): Promise<Record<string, Record<string, UserQuota>>> {
  if (cache) return cache;
  try {
    const raw = await fs.readFile(FILE_PATH, "utf8");
    cache = JSON.parse(raw) as Record<string, Record<string, UserQuota>>;
  } catch {
    cache = {};
  }
  return cache;
}

async function persist(
  data: Record<string, Record<string, UserQuota>>,
): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(FILE_PATH, JSON.stringify(data, null, 2), "utf8");
}

function queueWrite(
  data: Record<string, Record<string, UserQuota>>,
): Promise<void> {
  writeQueue = writeQueue.then(() => persist(data)).catch(() => {});
  return writeQueue;
}

/** Compute the start of the current quota week (UTC midnight on weekStartDay). */
export function currentWeekStart(weekStartDay = 0, now = Date.now()): number {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  const diff = (d.getUTCDay() - weekStartDay + 7) % 7;
  d.setUTCDate(d.getUTCDate() - diff);
  return d.getTime();
}

function ensureWeek(
  q: UserQuota,
  weekStart: number,
): WeekStat {
  let w = q.weekly.find((x) => x.weekStart === weekStart);
  if (!w) {
    w = {
      weekStart,
      messages: 0,
      modActions: 0,
      fulfilled: false,
      action: "none",
    };
    q.weekly.push(w);
    // Cap history to last 12 weeks.
    q.weekly.sort((a, b) => b.weekStart - a.weekStart);
    if (q.weekly.length > 12) q.weekly.length = 12;
  }
  return w;
}

export async function bumpMessage(
  guildId: string,
  userId: string,
  weekStartDay = 0,
): Promise<void> {
  const data = await load();
  if (!data[guildId]) data[guildId] = {};
  if (!data[guildId][userId]) data[guildId][userId] = { weekly: [] };
  const w = ensureWeek(data[guildId][userId], currentWeekStart(weekStartDay));
  w.messages += 1;
  await queueWrite(data);
}

export async function bumpModAction(
  guildId: string,
  userId: string,
  weekStartDay = 0,
): Promise<void> {
  const data = await load();
  if (!data[guildId]) data[guildId] = {};
  if (!data[guildId][userId]) data[guildId][userId] = { weekly: [] };
  const w = ensureWeek(data[guildId][userId], currentWeekStart(weekStartDay));
  w.modActions += 1;
  await queueWrite(data);
}

export async function getQuota(
  guildId: string,
  userId: string,
): Promise<UserQuota> {
  const data = await load();
  return data[guildId]?.[userId] ?? { weekly: [] };
}

export async function listGuildQuota(
  guildId: string,
): Promise<Record<string, UserQuota>> {
  const data = await load();
  return { ...(data[guildId] ?? {}) };
}

export async function setWeekAction(
  guildId: string,
  userId: string,
  weekStart: number,
  action: QuotaAction,
  fulfilled: boolean,
): Promise<void> {
  const data = await load();
  if (!data[guildId]) data[guildId] = {};
  if (!data[guildId][userId]) data[guildId][userId] = { weekly: [] };
  const w = ensureWeek(data[guildId][userId], weekStart);
  w.action = action;
  w.fulfilled = fulfilled;
  await queueWrite(data);
}

/**
 * Decide the next escalation step for a user given their previous (consecutive)
 * unfulfilled weeks. The chain is: warning -> strike -> termination.
 * Any fulfilled week resets the chain.
 */
export function nextAction(
  weeks: WeekStat[],
  currentWeekStart: number,
): QuotaAction {
  // Order weeks oldest -> newest, excluding the current open week.
  const past = [...weeks]
    .filter((w) => w.weekStart < currentWeekStart)
    .sort((a, b) => a.weekStart - b.weekStart);
  let streak = 0;
  for (let i = past.length - 1; i >= 0; i--) {
    if (past[i].fulfilled) break;
    if (past[i].action === "none") break;
    streak += 1;
  }
  // streak reflects the consecutive prior unfulfilled-with-action weeks.
  if (streak === 0) return "warning";
  if (streak === 1) return "strike";
  return "termination";
}

// ---------------- Convenience helpers used by /quota and /profile ----------

export interface QuotaConfigLike {
  messages: number;
  modActions: number;
  weekStartDay: number;
}

export interface CurrentWeek {
  weekStart: number;
  messages: number;
  modActions: number;
}

export async function getCurrentWeek(
  guildId: string,
  userId: string,
  weekStartDay = 0,
): Promise<CurrentWeek> {
  const data = await load();
  const start = currentWeekStart(weekStartDay);
  const w = data[guildId]?.[userId]?.weekly.find((x) => x.weekStart === start);
  return {
    weekStart: start,
    messages: w?.messages ?? 0,
    modActions: w?.modActions ?? 0,
  };
}

export async function getRecentWeeks(
  guildId: string,
  userId: string,
  count = 4,
): Promise<WeekStat[]> {
  const q = await getQuota(guildId, userId);
  return [...q.weekly].sort((a, b) => b.weekStart - a.weekStart).slice(0, count);
}

export interface QuotaStatus {
  metThisWeek: boolean;
  consecutiveMissed: number;
  nextAction: QuotaAction;
}

export async function resolveQuotaStatus(
  guildId: string,
  userId: string,
  cfg: QuotaConfigLike,
): Promise<QuotaStatus> {
  const start = currentWeekStart(cfg.weekStartDay);
  const q = await getQuota(guildId, userId);
  const current = q.weekly.find((w) => w.weekStart === start);
  const metThisWeek =
    !!current &&
    current.messages >= cfg.messages &&
    current.modActions >= cfg.modActions;

  const past = [...q.weekly]
    .filter((w) => w.weekStart < start)
    .sort((a, b) => b.weekStart - a.weekStart);
  let consecutiveMissed = 0;
  for (const w of past) {
    if (w.fulfilled) break;
    if (w.action === "none" && w.messages === 0 && w.modActions === 0) break;
    consecutiveMissed += 1;
  }

  return {
    metThisWeek,
    consecutiveMissed,
    nextAction: nextAction(q.weekly, start),
  };
}
