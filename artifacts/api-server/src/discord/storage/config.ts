import { promises as fs } from "node:fs";
import path from "node:path";

export interface GuildManagers {
  roleIds: string[];
  userIds: string[];
}

export interface GuildModules {
  staffMgmt: boolean;
  quota: boolean;
  auditLog: boolean;
}

export interface GuildChannels {
  promotions?: string;
  demotions?: string;
  botNotifications?: string;
  performance?: string;
}

export interface QuotaConfig {
  messages: number;
  modActions: number;
  weekStartDay: number; // 0 = Sunday
}

export interface GuildConfig {
  managers: GuildManagers;
  modules: GuildModules;
  channels: GuildChannels;
  quotaConfig?: QuotaConfig;
}

const DEFAULTS: GuildConfig = {
  managers: { roleIds: [], userIds: [] },
  modules: { staffMgmt: true, quota: true, auditLog: true },
  channels: {},
};

const DATA_DIR = path.resolve(process.cwd(), ".data");
const FILE_PATH = path.join(DATA_DIR, "config.json");

let cache: Record<string, GuildConfig> | null = null;
let writeQueue: Promise<void> = Promise.resolve();

async function load(): Promise<Record<string, GuildConfig>> {
  if (cache) return cache;
  try {
    const raw = await fs.readFile(FILE_PATH, "utf8");
    cache = JSON.parse(raw) as Record<string, GuildConfig>;
  } catch {
    cache = {};
  }
  return cache;
}

async function persist(data: Record<string, GuildConfig>): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(FILE_PATH, JSON.stringify(data, null, 2), "utf8");
}

function withDefaults(c: Partial<GuildConfig> | undefined): GuildConfig {
  return {
    managers: {
      roleIds: c?.managers?.roleIds ?? [],
      userIds: c?.managers?.userIds ?? [],
    },
    modules: {
      staffMgmt: c?.modules?.staffMgmt ?? true,
      quota: c?.modules?.quota ?? true,
      auditLog: c?.modules?.auditLog ?? true,
    },
    channels: { ...(c?.channels ?? {}) },
    quotaConfig: c?.quotaConfig,
  };
}

export async function getGuildConfig(guildId: string): Promise<GuildConfig> {
  const data = await load();
  return withDefaults(data[guildId]);
}

export async function updateGuildConfig(
  guildId: string,
  mutator: (c: GuildConfig) => GuildConfig,
): Promise<GuildConfig> {
  const data = await load();
  const current = withDefaults(data[guildId]);
  const next = mutator(current);
  data[guildId] = next;
  writeQueue = writeQueue.then(() => persist(data)).catch(() => {});
  await writeQueue;
  return next;
}

export { DEFAULTS as DEFAULT_GUILD_CONFIG };
