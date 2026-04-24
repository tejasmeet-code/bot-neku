import { promises as fs } from "node:fs";
import path from "node:path";

export const PERM_WHITELIST: ReadonlySet<string> = new Set([
  "1181221352393420856",
  "1384512046200127570",
]);

export const WHITELISTED_COMMANDS = [
  "ban",
  "mute",
  "unmute",
  "warn",
  "dm",
  "say",
] as const;

export type WhitelistedCommand = (typeof WHITELISTED_COMMANDS)[number];

interface WhitelistShape {
  // perGuild[guildId][commandName] = [userId, ...]
  perGuild: Record<string, Record<string, string[]>>;
}

const DATA_DIR = path.resolve(process.cwd(), ".data");
const FILE_PATH = path.join(DATA_DIR, "whitelist.json");

let cache: WhitelistShape | null = null;
let writeQueue: Promise<void> = Promise.resolve();

async function load(): Promise<WhitelistShape> {
  if (cache) return cache;
  try {
    const raw = await fs.readFile(FILE_PATH, "utf8");
    const parsed = JSON.parse(raw) as WhitelistShape;
    cache = {
      perGuild:
        parsed.perGuild && typeof parsed.perGuild === "object"
          ? parsed.perGuild
          : {},
    };
  } catch {
    cache = { perGuild: {} };
  }
  return cache;
}

async function persist(data: WhitelistShape): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(FILE_PATH, JSON.stringify(data, null, 2), "utf8");
}

function ensureBucket(
  data: WhitelistShape,
  guildId: string,
  command: string,
): string[] {
  if (!data.perGuild[guildId]) data.perGuild[guildId] = {};
  if (!data.perGuild[guildId][command]) data.perGuild[guildId][command] = [];
  return data.perGuild[guildId][command];
}

export async function isWhitelisted(
  command: WhitelistedCommand,
  guildId: string,
  userId: string,
): Promise<boolean> {
  if (PERM_WHITELIST.has(userId)) return true;
  const data = await load();
  return data.perGuild[guildId]?.[command]?.includes(userId) ?? false;
}

export async function addToWhitelist(
  command: WhitelistedCommand,
  guildId: string,
  userId: string,
): Promise<boolean> {
  const data = await load();
  const bucket = ensureBucket(data, guildId, command);
  if (bucket.includes(userId)) return false;
  bucket.push(userId);
  writeQueue = writeQueue.then(() => persist(data)).catch(() => {});
  await writeQueue;
  return true;
}

export async function removeFromWhitelist(
  command: WhitelistedCommand,
  guildId: string,
  userId: string,
): Promise<boolean> {
  const data = await load();
  const bucket = data.perGuild[guildId]?.[command];
  if (!bucket) return false;
  const idx = bucket.indexOf(userId);
  if (idx === -1) return false;
  bucket.splice(idx, 1);
  writeQueue = writeQueue.then(() => persist(data)).catch(() => {});
  await writeQueue;
  return true;
}

export async function listWhitelist(
  command: WhitelistedCommand,
  guildId: string,
): Promise<string[]> {
  const data = await load();
  return [...(data.perGuild[guildId]?.[command] ?? [])];
}
