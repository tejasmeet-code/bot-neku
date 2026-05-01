import type { Client } from "discord.js";
import { logger } from "../../lib/logger";
import { listGuildQuota, currentWeekStart, setWeekAction, getRecentWeeks } from "../storage/quota";
import { getGuildConfig } from "../storage/config";
import { listStaffRoles } from "../storage/staff";
import { getStreak, resetStreak, incrementStreak } from "../storage/quota-streaks";
import { recordModStat } from "../storage/modstats";
import { prettyEmbed, COLORS } from "./embedStyle";
import { ChannelType } from "discord.js";

/**
 * Returns ms until next Friday 23:59 IST (UTC+5:30 = 18:29 UTC Friday).
 */
function msUntilFridayCheck(now = Date.now()): number {
  const d = new Date(now);
  // IST is UTC+5:30, so 23:59 IST = 18:29 UTC
  // Find next Friday
  const day = d.getUTCDay(); // 0=Sun, 5=Fri
  const daysUntilFriday = (5 - day + 7) % 7 || 7;
  const next = new Date(d);
  next.setUTCDate(d.getUTCDate() + daysUntilFriday);
  next.setUTCHours(18, 29, 0, 0);
  if (next.getTime() <= now) next.setUTCDate(next.getUTCDate() + 7);
  return next.getTime() - now;
}

async function runQuotaCheck(client: Client): Promise<void> {
  logger.info("Running Friday quota check");

  for (const guild of client.guilds.cache.values()) {
    try {
      const cfg = await getGuildConfig(guild.id);
      if (!cfg.quotaConfig) continue;

      const { messages: msgReq, modActions: modReq, weekStartDay } = cfg.quotaConfig;
      const weekStart = currentWeekStart(weekStartDay);
      const allQuota = await listGuildQuota(guild.id);

      // Get all staff user IDs (from staff roles)
      const staffRoles = await listStaffRoles(guild.id);
      const staffRoleIds = new Set(staffRoles.map((r) => r.roleId));

      const infChannelId = cfg.channels.botNotifications;
      const infChannel = infChannelId ? guild.channels.cache.get(infChannelId) : null;

      for (const [userId, userQuota] of Object.entries(allQuota)) {
        // Only process actual members
        const member = await guild.members.fetch(userId).catch(() => null);
        if (!member) continue;

        // Check if they're staff
        const isStaff = staffRoles.length === 0 || member.roles.cache.some((r) => staffRoleIds.has(r.id));
        if (!isStaff) continue;

        // Find this week's stats
        const thisWeek = userQuota.weekly.find((w) => w.weekStart === weekStart);
        const metMessages = (thisWeek?.messages ?? 0) >= msgReq;
        const metModActions = (thisWeek?.modActions ?? 0) >= modReq;
        const metQuota = metMessages && metModActions;

        if (metQuota) {
          // Reset consecutive fail streak
          await resetStreak(guild.id, userId, weekStart);
          await setWeekAction(guild.id, userId, weekStart, "none", true);

          // Log to channel
          if (infChannel && infChannel.type === ChannelType.GuildText) {
            await (infChannel as any).send({
              embeds: [prettyEmbed({
                title: "✅ Quota Met",
                color: COLORS.success,
                description: `<@${userId}> met their quota this week.\nMessages: **${thisWeek?.messages ?? 0}/${msgReq}** | Mod actions: **${thisWeek?.modActions ?? 0}/${modReq}**`,
              })],
            }).catch(() => {});
          }
          continue;
        }

        // Failed quota — determine action from streak
        const streak = await incrementStreak(guild.id, userId, weekStart);
        let action: "warning" | "strike" | "termination";
        if (streak === 1) action = "warning";
        else if (streak === 2) action = "strike";
        else action = "termination";

        await setWeekAction(guild.id, userId, weekStart, action, false);

        // Record modstat deduction (automated system)
        await recordModStat({ guildId: guild.id, modId: "SYSTEM", targetId: userId, action: "warn", delta: -1, reason: `Automated quota ${action} (week ${new Date(weekStart).toDateString()})` });

        const actionLabel = action === "warning" ? "⚠️ Warning" : action === "strike" ? "❗ Strike" : "🚫 Termination";
        const embed = prettyEmbed({
          title: `📋 Automated Quota ${actionLabel}`,
          color: action === "warning" ? COLORS.warning : action === "strike" ? COLORS.danger : COLORS.neutral,
          fields: [
            { name: "Staff Member", value: `<@${userId}>`, inline: true },
            { name: "Action", value: actionLabel, inline: true },
            { name: "Consecutive Fails", value: String(streak), inline: true },
            { name: "Messages", value: `${thisWeek?.messages ?? 0}/${msgReq}`, inline: true },
            { name: "Mod Actions", value: `${thisWeek?.modActions ?? 0}/${modReq}`, inline: true },
          ],
          footer: `Week starting ${new Date(weekStart).toUTCString()}`,
        });

        // Send to infraction channel
        if (infChannel && infChannel.type === ChannelType.GuildText) {
          await (infChannel as any).send({ embeds: [embed] }).catch(() => {});
        }

        // DM the staff member
        const actionDescriptions = {
          warning: "You have been given a **warning** for failing to meet your weekly quota.",
          strike: "You have been given a **strike** for failing to meet your weekly quota for the 2nd consecutive week.",
          termination: "You have been **automatically terminated** for failing to meet your weekly quota for the 3rd consecutive week.",
        };

        member.send({
          embeds: [prettyEmbed({
            title: `Quota ${actionLabel} — Automated`,
            color: action === "warning" ? COLORS.warning : COLORS.danger,
            description: actionDescriptions[action],
            fields: [
              { name: "Messages", value: `${thisWeek?.messages ?? 0}/${msgReq}`, inline: true },
              { name: "Mod Actions", value: `${thisWeek?.modActions ?? 0}/${modReq}`, inline: true },
            ],
            footer: `Server: ${guild.name}`,
          })],
        }).catch(() => {});

        logger.info({ guildId: guild.id, userId, action, streak }, "Quota check applied");
      }
    } catch (err) {
      logger.error({ err, guildId: guild.id }, "Quota check failed for guild");
    }
  }

  logger.info("Friday quota check complete");
}

let schedulerStarted = false;

export function startQuotaScheduler(client: Client): void {
  if (schedulerStarted) return;
  schedulerStarted = true;

  function scheduleNext(): void {
    const ms = msUntilFridayCheck();
    const nextDate = new Date(Date.now() + ms);
    logger.info({ nextCheck: nextDate.toUTCString(), msUntil: ms }, "quotaScheduler: next check scheduled");

    setTimeout(async () => {
      try {
        await runQuotaCheck(client);
      } catch (err) {
        logger.error({ err }, "quotaScheduler: runQuotaCheck threw");
      }
      scheduleNext();
    }, ms);
  }

  scheduleNext();
}
