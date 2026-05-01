import type { Client } from "discord.js";
import { logger } from "../../lib/logger";
import { listGuildQuota, currentWeekStart, setWeekAction } from "../storage/quota";
import { getGuildConfig } from "../storage/config";
import { listStaffRoles } from "../storage/staff";
import { getStreak, resetStreak, incrementStreak } from "../storage/quota-streaks";
import { recordModStat } from "../storage/modstats";
import { prettyEmbed, COLORS } from "./embedStyle";
import { ChannelType } from "discord.js";

/**
 * Returns ms until next Friday 23:59 IST (UTC+5:30 → 18:29 UTC Friday).
 */
function msUntilFridayCheck(now = Date.now()): number {
  const d = new Date(now);
  const day = d.getUTCDay(); // 0=Sun … 5=Fri
  const daysUntilFriday = (5 - day + 7) % 7 || 7;
  const next = new Date(d);
  next.setUTCDate(d.getUTCDate() + daysUntilFriday);
  next.setUTCHours(18, 29, 0, 0);
  if (next.getTime() <= now) next.setUTCDate(next.getUTCDate() + 7);
  return next.getTime() - now;
}

async function runQuotaCheck(client: Client): Promise<void> {
  logger.info("quotaScheduler: Running Friday quota check");

  for (const guild of client.guilds.cache.values()) {
    try {
      const cfg = await getGuildConfig(guild.id);
      if (!cfg.quotaConfig) continue;

      const { weekStartDay } = cfg.quotaConfig;
      const weekStart = currentWeekStart(weekStartDay);
      const allQuota = await listGuildQuota(guild.id);
      const staffRoles = await listStaffRoles(guild.id);
      const staffRoleIds = new Set(staffRoles.map((r) => r.roleId));

      // Use the dedicated infractions channel (set via /config → Infractions)
      const infChannelId = cfg.channels.infractions;
      const infChannel = infChannelId ? guild.channels.cache.get(infChannelId) : null;

      for (const [userId, userQuota] of Object.entries(allQuota)) {
        const member = await guild.members.fetch(userId).catch(() => null);
        if (!member) continue;

        const isStaff = staffRoles.length === 0 || member.roles.cache.some((r) => staffRoleIds.has(r.id));
        if (!isStaff) continue;

        // --- Role-wise quota resolution ---
        // Find the staff member's highest-position staff role that has a role-specific quota.
        // Fall back to the global quotaConfig if no role-specific target is set.
        let msgReq = cfg.quotaConfig.messages;
        let modReq = cfg.quotaConfig.modActions;
        let quotaSource = "global";

        if (cfg.roleQuotas && Object.keys(cfg.roleQuotas).length > 0) {
          // Sort staff roles by position descending to get the highest applicable role first
          const sortedRoles = staffRoles.slice().sort((a, b) => {
            const aRole = guild.roles.cache.get(a.roleId);
            const bRole = guild.roles.cache.get(b.roleId);
            return (bRole?.position ?? 0) - (aRole?.position ?? 0);
          });
          for (const staffRole of sortedRoles) {
            if (member.roles.cache.has(staffRole.roleId) && cfg.roleQuotas[staffRole.roleId]) {
              const rq = cfg.roleQuotas[staffRole.roleId]!;
              msgReq = rq.messages;
              modReq = rq.modActions;
              quotaSource = `<@&${staffRole.roleId}>`;
              break;
            }
          }
        }

        const thisWeek = userQuota.weekly.find((w) => w.weekStart === weekStart);
        const metMessages = (thisWeek?.messages ?? 0) >= msgReq;
        const metModActions = (thisWeek?.modActions ?? 0) >= modReq;
        const metQuota = metMessages && metModActions;

        if (metQuota) {
          await resetStreak(guild.id, userId, weekStart);
          await setWeekAction(guild.id, userId, weekStart, "none", true);

          if (infChannel && infChannel.type === ChannelType.GuildText) {
            await (infChannel as any).send({
              embeds: [prettyEmbed({
                title: "✅ Quota Met",
                color: COLORS.success,
                description:
                  `<@${userId}> met their quota this week.\n` +
                  `Messages: **${thisWeek?.messages ?? 0}/${msgReq}** | Mod Actions: **${thisWeek?.modActions ?? 0}/${modReq}**\n` +
                  `Target source: ${quotaSource}`,
              })],
            }).catch(() => {});
          }
          continue;
        }

        // Failed quota — calculate streak and apply action
        const streak = await incrementStreak(guild.id, userId, weekStart);
        let action: "warning" | "strike" | "termination";
        if (streak === 1) action = "warning";
        else if (streak === 2) action = "strike";
        else action = "termination";

        await setWeekAction(guild.id, userId, weekStart, action, false);

        await recordModStat({
          guildId: guild.id,
          modId: "SYSTEM",
          targetId: userId,
          action: "warn",
          delta: -1,
          reason: `Automated quota ${action} (week ${new Date(weekStart).toDateString()})`,
        });

        const actionLabel =
          action === "warning" ? "⚠️ Warning" :
          action === "strike" ? "❗ Strike" :
          "🚫 Termination";

        const embed = prettyEmbed({
          title: `📋 Quota Fail — ${actionLabel}`,
          color:
            action === "warning" ? COLORS.warning :
            action === "strike" ? COLORS.danger :
            COLORS.neutral,
          fields: [
            { name: "Staff Member", value: `<@${userId}>`, inline: true },
            { name: "Action", value: actionLabel, inline: true },
            { name: "Consecutive Fails", value: String(streak), inline: true },
            { name: "Messages", value: `${thisWeek?.messages ?? 0}/${msgReq}`, inline: true },
            { name: "Mod Actions", value: `${thisWeek?.modActions ?? 0}/${modReq}`, inline: true },
            { name: "Target Source", value: quotaSource, inline: true },
          ],
          footer: `Week starting ${new Date(weekStart).toUTCString()} | ${
            streak === 1 ? "Week 1 fail — Warning issued" :
            streak === 2 ? "Week 2 consecutive fail — Strike issued" :
            "Week 3+ consecutive fail — Termination issued"
          }`,
        });

        if (infChannel && infChannel.type === ChannelType.GuildText) {
          await (infChannel as any).send({ embeds: [embed] }).catch(() => {});
        }

        const actionDescriptions: Record<typeof action, string> = {
          warning: "You have received a **⚠️ Warning** for failing to meet your weekly quota.",
          strike: "You have received an **❗ Strike** for failing to meet quota 2 consecutive weeks.",
          termination: "You have been **🚫 Terminated** for failing to meet quota 3 consecutive weeks.",
        };

        member.send({
          embeds: [prettyEmbed({
            title: `Quota ${actionLabel}`,
            color: action === "termination" ? COLORS.danger : COLORS.warning,
            description: actionDescriptions[action],
            fields: [
              { name: "Messages This Week", value: `${thisWeek?.messages ?? 0}/${msgReq}`, inline: true },
              { name: "Mod Actions This Week", value: `${thisWeek?.modActions ?? 0}/${modReq}`, inline: true },
              { name: "Consecutive Fails", value: String(streak), inline: true },
            ],
            footer: `Server: ${guild.name}`,
          })],
        }).catch(() => {});

        logger.info({ guildId: guild.id, userId, action, streak, quotaSource }, "quotaScheduler: action applied");
      }
    } catch (err) {
      logger.error({ err, guildId: guild.id }, "quotaScheduler: guild check failed");
    }
  }

  logger.info("quotaScheduler: Friday check complete");
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
