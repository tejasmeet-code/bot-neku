import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type GuildMember,
} from "discord.js";
import type { SlashCommand } from "../types";
import { listStaffRoles } from "../storage/staff";
import { COLORS, EMOJI, prettyEmbed } from "../utils/embedStyle";
import { summarizeMod } from "../storage/modstats";
import { getGuildConfig } from "../storage/config";
import { logger } from "../../lib/logger";

const FIELD_VALUE_LIMIT = 1024;
const FIELDS_PER_EMBED = 25;
const EMBED_TOTAL_LIMIT = 5800; // a little under Discord's 6000-char ceiling

interface SectionField {
  name: string;
  value: string;
  inline: false;
}

/**
 * Pack a list of pre-rendered lines into one or more embed fields, each
 * capped at FIELD_VALUE_LIMIT chars. Subsequent fields get a "(cont.)"
 * suffix on the role name for clarity.
 */
function packFields(
  baseName: string,
  lines: string[],
  emptyText: string,
): SectionField[] {
  if (lines.length === 0) {
    return [{ name: baseName, value: emptyText, inline: false }];
  }
  const out: SectionField[] = [];
  let current = "";
  let part = 1;
  for (const line of lines) {
    const candidate = current ? `${current}\n${line}` : line;
    if (candidate.length > FIELD_VALUE_LIMIT) {
      out.push({
        name: part === 1 ? baseName : `${baseName} (cont. ${part})`,
        value: current || line.slice(0, FIELD_VALUE_LIMIT),
        inline: false,
      });
      current = line.length > FIELD_VALUE_LIMIT ? line.slice(0, FIELD_VALUE_LIMIT) : line;
      part += 1;
    } else {
      current = candidate;
    }
  }
  if (current) {
    out.push({
      name: part === 1 ? baseName : `${baseName} (cont. ${part})`,
      value: current,
      inline: false,
    });
  }
  return out;
}

const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("staff-database")
    .setDescription(
      "Show every staff role and the people who currently hold it.",
    )
    .setDMPermission(false),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.inGuild() || !interaction.guildId || !interaction.guild) {
      await interaction.reply({ content: "Run this in a server.", ephemeral: true });
      return;
    }
    await interaction.deferReply();

    try {
      const guild = interaction.guild;
      const guildId = interaction.guildId;

      const roles = await listStaffRoles(guildId);
      if (roles.length === 0) {
        await interaction.editReply({
          embeds: [
            prettyEmbed({
              title: `${EMOJI.list} Staff Database`,
              description: `${EMOJI.info} No staff roles have been registered yet. Use \`/staff-role-add\` to add one.`,
              color: COLORS.neutral,
            }),
          ],
        });
        return;
      }

      const members = await guild.members.fetch().catch((err) => {
        logger.warn({ err, guildId }, "staff-database: members.fetch failed");
        return null;
      });
      if (!members) {
        await interaction.editReply({
          embeds: [
            prettyEmbed({
              title: `${EMOJI.fail} Cannot Load Staff`,
              description:
                "Couldn't fetch the member list. Make sure the **Server Members Intent** is enabled in the bot's Discord developer portal.",
              color: COLORS.danger,
            }),
          ],
        });
        return;
      }

      const cfg = await getGuildConfig(guildId);
      const weekStartDay = cfg.quotaConfig?.weekStartDay ?? 0;

      let totalStaff = 0;
      const allFields: SectionField[] = [];

      for (const r of roles) {
        const role = guild.roles.cache.get(r.roleId);
        const roleName = role?.name ?? "Unknown role";
        const holders: GuildMember[] = [...members.values()].filter(
          (m) => !m.user.bot && m.roles.cache.has(r.roleId),
        );
        totalStaff += holders.length;

        const sorted = [...holders].sort((a, b) =>
          a.displayName.localeCompare(b.displayName, undefined, {
            sensitivity: "base",
          }),
        );

        // Pull this-week modstats in parallel, but cap at 50 holders per role
        // to keep the call cheap; anyone past 50 is still listed without stats.
        const STAT_CAP = 50;
        const statTargets = sorted.slice(0, STAT_CAP);
        const stats = await Promise.all(
          statTargets.map((m) =>
            summarizeMod(guildId, m.id, "this_week", weekStartDay).catch(() => ({
              total: 0,
              positive: 0,
              negative: 0,
            })),
          ),
        );
        const lines = sorted.map((m, i) => {
          if (i < stats.length) {
            const s = stats[i]!;
            return `${EMOJI.bullet} <@${m.id}> · \`${m.user.tag}\` — **${s.total}** mod (${s.positive}+/${s.negative}-)`;
          }
          return `${EMOJI.bullet} <@${m.id}> · \`${m.user.tag}\``;
        });

        const baseName = `${EMOJI.role} #${r.position} — ${roleName} • ${holders.length} member${holders.length === 1 ? "" : "s"}`;
        const packed = packFields(baseName, lines, "*nobody*");
        for (const f of packed) allFields.push(f);
      }

      // Discord caps at 25 fields per embed and ~6000 chars total. Trim if needed.
      let trimmed = false;
      let runningChars = 0;
      const finalFields: SectionField[] = [];
      for (const f of allFields) {
        if (finalFields.length >= FIELDS_PER_EMBED) {
          trimmed = true;
          break;
        }
        const cost = f.name.length + f.value.length;
        if (runningChars + cost > EMBED_TOTAL_LIMIT) {
          trimmed = true;
          break;
        }
        runningChars += cost;
        finalFields.push(f);
      }

      const description =
        `${EMOJI.users} **${totalStaff}** staff member${totalStaff === 1 ? "" : "s"} across **${roles.length}** role${roles.length === 1 ? "" : "s"}` +
        (trimmed
          ? `\n\n_Some roles were truncated because the embed hit Discord's size limits._`
          : "");

      const embed = prettyEmbed({
        title: `${EMOJI.shield} Staff Database — ${guild.name}`,
        description,
        color: COLORS.staff,
        fields: finalFields,
        thumbnail: guild.iconURL({ size: 256 }) ?? undefined,
        footer: `Server ID: ${guild.id}`,
      });

      await interaction.editReply({
        embeds: [embed],
        // Suppress role/user pings so listing the staff database doesn't
        // ping every staff member or role.
        allowedMentions: { parse: [] },
      });
    } catch (err) {
      logger.error({ err, guildId: interaction.guildId }, "staff-database failed");
      try {
        await interaction.editReply({
          embeds: [
            prettyEmbed({
              title: `${EMOJI.fail} Couldn't build the staff database`,
              description:
                "Something went wrong while building the embed. The server log has the details.",
              color: COLORS.danger,
            }),
          ],
        });
      } catch {
        /* nothing left to do */
      }
    }
  },
};

export default command;
