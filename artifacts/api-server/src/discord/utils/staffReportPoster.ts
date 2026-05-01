import {
  ChannelType,
  type Client,
  type GuildTextBasedChannel,
} from "discord.js";
import { logger } from "../../lib/logger";
import {
  clearStaffReportChannel,
  getGuildConfig,
  listGuildsWithStaffReportChannel,
  setStaffReportState,
} from "../storage/config";
import { buildStaffReportEmbed } from "./staffReportBuilder";

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

export type PostStaffReportResult =
  | {
      ok: true;
      action: "edited" | "posted";
      channelId: string;
      messageId: string;
    }
  | {
      ok: false;
      reason:
        | "no-channel-configured"
        | "channel-not-found"
        | "channel-not-text"
        | "no-permissions"
        | "build-failed-no-roles"
        | "build-failed-no-guild";
      detail?: string;
    };

/**
 * Build the staff tier report embed for a guild and either post a fresh
 * message in the configured channel or edit the previously posted one.
 * Persists the message id so subsequent calls (every 2h or via
 * `/staff-update-report`) keep editing the same message.
 */
export async function postOrEditStaffReport(
  client: Client,
  guildId: string,
): Promise<PostStaffReportResult> {
  const cfg = await getGuildConfig(guildId);
  const channelId = cfg.channels.staffReport;
  if (!channelId) return { ok: false, reason: "no-channel-configured" };

  const built = await buildStaffReportEmbed(client, guildId);
  if (!built.ok) {
    return {
      ok: false,
      reason:
        built.reason === "no-roles"
          ? "build-failed-no-roles"
          : "build-failed-no-guild",
    };
  }

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel) {
    // Channel was deleted — drop the saved state so it stops trying.
    await clearStaffReportChannel(guildId).catch(() => {});
    return { ok: false, reason: "channel-not-found" };
  }
  if (
    channel.type !== ChannelType.GuildText &&
    channel.type !== ChannelType.GuildAnnouncement
  ) {
    return { ok: false, reason: "channel-not-text" };
  }
  const textChannel = channel as GuildTextBasedChannel;

  const state = cfg.staffReportState;
  // Try to edit the previous message if it still belongs to this channel.
  if (state && state.channelId === channelId) {
    try {
      const existing = await textChannel.messages.fetch(state.messageId);
      await existing.edit({
        embeds: [built.embed],
        allowedMentions: { parse: [] },
      });
      return {
        ok: true,
        action: "edited",
        channelId,
        messageId: state.messageId,
      };
    } catch (err) {
      // Fall through to posting a fresh message.
      logger.debug(
        { err, guildId, channelId, messageId: state.messageId },
        "staffReport: previous message gone, posting fresh",
      );
    }
  }

  try {
    const sent = await textChannel.send({
      embeds: [built.embed],
      allowedMentions: { parse: [] },
    });
    await setStaffReportState(guildId, {
      channelId,
      messageId: sent.id,
    });
    return { ok: true, action: "posted", channelId, messageId: sent.id };
  } catch (err) {
    logger.warn({ err, guildId, channelId }, "staffReport: send failed");
    return { ok: false, reason: "no-permissions" };
  }
}

/**
 * Run the staff report refresh for every guild that has a staff-report
 * channel configured. Failures on one guild don't block the others.
 */
export async function refreshAllStaffReports(client: Client): Promise<void> {
  const targets = await listGuildsWithStaffReportChannel();
  if (targets.length === 0) return;
  logger.info(
    { guilds: targets.length },
    "staffReport: refreshing auto-updating reports",
  );
  for (const { guildId } of targets) {
    try {
      const result = await postOrEditStaffReport(client, guildId);
      if (!result.ok) {
        logger.warn(
          { guildId, reason: result.reason },
          "staffReport: refresh failed for guild",
        );
      }
    } catch (err) {
      logger.warn({ err, guildId }, "staffReport: refresh threw for guild");
    }
  }
}

let intervalHandle: NodeJS.Timeout | null = null;

/**
 * Start the every-2h auto-refresh loop. Idempotent: calling twice does
 * nothing the second time.
 */
export function startStaffReportAutoUpdate(client: Client): void {
  if (intervalHandle) return;
  intervalHandle = setInterval(() => {
    refreshAllStaffReports(client).catch((err) =>
      logger.warn({ err }, "staffReport: auto-update interval threw"),
    );
  }, TWO_HOURS_MS);
  if (intervalHandle.unref) intervalHandle.unref();
  logger.info(
    { intervalHours: 2 },
    "staffReport: auto-update scheduler started",
  );
}
