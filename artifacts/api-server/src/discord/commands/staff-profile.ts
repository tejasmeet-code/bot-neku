import {
  EmbedBuilder,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type Client,
  type Guild,
} from "discord.js";
import type { SlashCommand } from "../types";
import {
  getProfile,
  listStaffRoles,
  syncProfileFromMember,
} from "../storage/staff";
import { getQuota } from "../storage/quota";
import { getGuildConfig } from "../storage/config";
import { getConnectedGuildId } from "../storage/connections";
import { summarizeMod } from "../storage/modstats";
import { logger } from "../../lib/logger";

const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("staff-profile")
    .setDescription(
      "Staff profile: promotions, demotions, join date, main-server modstats & messages.",
    )
    .setDMPermission(false)
    .addUserOption((o) =>
      o
        .setName("user")
        .setDescription("Staff member (defaults to you)")
        .setRequired(false),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.inGuild() || !interaction.guildId || !interaction.guild) {
      await interaction.reply({
        content: "Run this in a server.",
        ephemeral: true,
      });
      return;
    }

    const target =
      interaction.options.getUser("user", false) ?? interaction.user;
    if (target.bot) {
      await interaction.reply({
        content: "Bots can't have staff profiles.",
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply();

    try {
      const sourceGuild = interaction.guild;
      const sourceMember = await sourceGuild.members
        .fetch(target.id)
        .catch(() => null);
      if (sourceMember) {
        await syncProfileFromMember(interaction.guildId, sourceMember).catch(
          () => {},
        );
      }

      // Resolve "main" server — the one whose modstats and messages we count.
      const main = await resolveMainGuild(interaction.client, sourceGuild);

      const profile = await getProfile(interaction.guildId, target.id);
      const roles = await listStaffRoles(interaction.guildId);

      const heldEntry =
        sourceMember &&
        roles.find((r) => sourceMember.roles.cache.has(r.roleId));
      const currentRoleLine = heldEntry
        ? `<@&${heldEntry.roleId}> (position **${heldEntry.position}**)`
        : profile?.terminated
          ? "*terminated*"
          : "*not on staff*";

      // Promotions / demotions counts and recent entries (this server's record).
      const promoCount = profile?.promotions.length ?? 0;
      const demoCount = profile?.demotions.length ?? 0;
      const recentPromos = profile
        ? [...profile.promotions].sort((a, b) => b.at - a.at).slice(0, 3)
        : [];
      const recentDemos = profile
        ? [...profile.demotions].sort((a, b) => b.at - a.at).slice(0, 3)
        : [];

      // Join date — prefer Discord join date in the **main** server.
      let joinedAt: number | null = null;
      let joinedSource = "this server";
      if (main.guild) {
        const mainMember = await main.guild.members
          .fetch(target.id)
          .catch(() => null);
        if (mainMember?.joinedTimestamp) {
          joinedAt = mainMember.joinedTimestamp;
          joinedSource = main.label;
        }
      }
      if (joinedAt === null && sourceMember?.joinedTimestamp) {
        joinedAt = sourceMember.joinedTimestamp;
      }

      // Modstats & messages — pulled from the **main** server's data.
      const mainGuildId = main.guild?.id ?? interaction.guildId;
      const mainCfg = await getGuildConfig(mainGuildId);
      const weekStartDay = mainCfg.quotaConfig?.weekStartDay ?? 0;

      const [modAllTime, mainQuota] = await Promise.all([
        summarizeMod(mainGuildId, target.id, "all_time", weekStartDay),
        getQuota(mainGuildId, target.id),
      ]);
      const totalMessages = mainQuota.weekly.reduce(
        (sum, w) => sum + w.messages,
        0,
      );

      // Build the embed.
      const embed = new EmbedBuilder()
        .setTitle(`👤 Staff Profile — ${target.tag}`)
        .setColor(0x9b59b6)
        .setThumbnail(
          target.displayAvatarURL({ size: 256, extension: "png" }),
        )
        .setDescription(
          `<@${target.id}> · ${currentRoleLine}` +
            (profile?.terminated ? "\n*This staff member has been terminated.*" : ""),
        )
        .addFields(
          {
            name: "📈 Promotions",
            value: String(promoCount),
            inline: true,
          },
          {
            name: "📉 Demotions",
            value: String(demoCount),
            inline: true,
          },
          {
            name: "📅 Joined",
            value: joinedAt
              ? `<t:${Math.floor(joinedAt / 1000)}:F>\n*<t:${Math.floor(joinedAt / 1000)}:R>* — ${joinedSource}`
              : "Unknown",
            inline: false,
          },
          {
            name: `🛠️ Modstats — ${main.label}`,
            value:
              `Total: **${modAllTime.total}**` +
              ` · Positive: **${modAllTime.positive}** · Negative: **${modAllTime.negative}**`,
            inline: false,
          },
          {
            name: `💬 Messages — ${main.label}`,
            value: `**${totalMessages.toLocaleString()}** (lifetime tracked)`,
            inline: false,
          },
        );

      if (recentPromos.length > 0) {
        embed.addFields({
          name: "🔺 Recent promotions",
          value: recentPromos
            .map(
              (p) =>
                `• <@&${p.toRoleId}> by <@${p.byUserId}> · <t:${Math.floor(p.at / 1000)}:R>`,
            )
            .join("\n"),
          inline: false,
        });
      }
      if (recentDemos.length > 0) {
        embed.addFields({
          name: "🔻 Recent demotions",
          value: recentDemos
            .map(
              (d) =>
                `• ${d.toRoleId ? `to <@&${d.toRoleId}>` : "*terminated*"} by <@${d.byUserId}> · <t:${Math.floor(d.at / 1000)}:R>`,
            )
            .join("\n"),
          inline: false,
        });
      }

      embed.setFooter({
        text: main.guild
          ? `Main server: ${main.guild.name}`
          : "No main server connected — showing this server's data.",
      });
      embed.setTimestamp(new Date());

      await interaction.editReply({
        embeds: [embed],
        allowedMentions: { parse: [] },
      });
    } catch (err) {
      logger.error(
        { err, guildId: interaction.guildId, target: target.id },
        "staff-profile failed",
      );
      try {
        await interaction.editReply(
          "❌ Couldn't build that staff profile. The server log has the details.",
        );
      } catch {
        /* nothing else to do */
      }
    }
  },
};

interface MainGuildResolution {
  guild: Guild | null;
  label: string;
}

/**
 * Find the "main" guild for a given source guild:
 *  - If the source guild is itself the main side of a connection, use it.
 *  - Else if the source guild is the staff side, use the connected main guild.
 *  - Else fall back to the source guild and label it as "this server".
 */
async function resolveMainGuild(
  client: Client,
  sourceGuild: Guild,
): Promise<MainGuildResolution> {
  const link = await getConnectedGuildId(sourceGuild.id);
  if (!link) {
    return { guild: sourceGuild, label: "this server" };
  }
  if (link.mainGuildId === sourceGuild.id) {
    return { guild: sourceGuild, label: `main (${sourceGuild.name})` };
  }
  const mainGuild = await client.guilds
    .fetch(link.mainGuildId)
    .catch(() => null);
  if (!mainGuild) {
    return { guild: sourceGuild, label: "this server (main unreachable)" };
  }
  return { guild: mainGuild, label: `main (${mainGuild.name})` };
}

export default command;
