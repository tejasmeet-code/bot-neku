import { promises as fs } from "node:fs";
import { DATA_DIR, dataFile } from "../../lib/paths";

export interface GuildManagers {
  roleIds: string[];
  userIds: string[];
}

export interface GuildModules {
  staffMgmt: boolean;
  quota: boolean;
  auditLog: boolean;
  moderation: boolean;
  infractions: boolean;
  appeals: boolean;
}

export interface GuildChannels {
  promotions?: string;
  demotions?: string;
  botNotifications?: string;
  performance?: string;
  moderation?: string;
  infractions?: string;
  appeals?: string;
  /**
   * Channel where the auto-updating staff tier report is pinned. Set via
   * `/staff-update-report channel:#x`.
   */
  staffReport?: string;
}

/**
 * State for the auto-updating staff tier report message in this guild.
 * `messageId` is the message we keep editing every 2h so the report is in
 * place. `channelId` mirrors `channels.staffReport` at the time of the post
 * so we can detect if the channel was changed.
 */
export interface StaffReportState {
  channelId: string;
  messageId: string;
}

export interface QuotaConfig {
  messages: number;
  modActions: number;
  weekStartDay: number; // 0 = Sunday
}

/** Per-role quota override — keyed by Discord role ID */
export interface RoleQuota {
  messages: number;
  modActions: number;
}

export interface GuildConfig {
  managers: GuildManagers;
  modules: GuildModules;
  channels: GuildChannels;
  moduleRoles?: Record<string, string[]>;
  roleQuotas?: Record<string, RoleQuota>;
  quotaWhitelistRoles?: string[];
  quotaConfig?: QuotaConfig;
  staffReportState?: StaffReportState;
}

const DEFAULTS: GuildConfig = {
  managers: { roleIds: [], userIds: [] },
  modules: { staffMgmt: true, quota: true, auditLog: true, moderation: true, infractions: true, appeals: true },
  channels: {},
  moduleRoles: {},
};

const FILE_PATH = dataFile("config.json");

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
      moderation: c?.modules?.moderation ?? true,
      infractions: c?.modules?.infractions ?? true,
      appeals: c?.modules?.appeals ?? true,
    },
    channels: { ...(c?.channels ?? {}) },
    moduleRoles: { ...(c?.moduleRoles ?? {}) },
    roleQuotas: { ...(c?.roleQuotas ?? {}) },
    quotaWhitelistRoles: [...(c?.quotaWhitelistRoles ?? [])],
    quotaConfig: c?.quotaConfig,
    staffReportState: c?.staffReportState,
  };
}

/**
 * Convenience helpers for the auto-updating staff report job and the
 * `/staff-update-report` command.
 */
export async function setStaffReportChannel(
  guildId: string,
  channelId: string,
): Promise<GuildConfig> {
  return updateGuildConfig(guildId, (c) => ({
    ...c,
    channels: { ...c.channels, staffReport: channelId },
  }));
}

export async function clearStaffReportChannel(
  guildId: string,
): Promise<GuildConfig> {
  return updateGuildConfig(guildId, (c) => {
    const next = { ...c, channels: { ...c.channels } };
    delete next.channels.staffReport;
    delete next.staffReportState;
    return next;
  });
}

export async function setStaffReportState(
  guildId: string,
  state: StaffReportState | undefined,
): Promise<GuildConfig> {
  return updateGuildConfig(guildId, (c) => {
    const next = { ...c };
    if (state) next.staffReportState = state;
    else delete next.staffReportState;
    return next;
  });
}

export async function listGuildsWithStaffReportChannel(): Promise<
  { guildId: string; channelId: string }[]
> {
  const data = await load();
  const out: { guildId: string; channelId: string }[] = [];
  for (const [guildId, cfg] of Object.entries(data)) {
    const ch = cfg.channels?.staffReport;
    if (ch) out.push({ guildId, channelId: ch });
  }
  return out;
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
