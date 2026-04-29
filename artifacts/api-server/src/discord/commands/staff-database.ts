import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { SlashCommand } from "../types";
import { listStaffRoles } from "../storage/staff";
import { COLORS, EMOJI, prettyEmbed } from "../utils/embedStyle";

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

    const roles = await listStaffRoles(interaction.guildId);
    if (roles.length === 0) {
      await interaction.editReply({
        embeds: [
          prettyEmbed({
            title: `${EMOJI.list} Staff Database`,
            description:
              `${EMOJI.info} No staff roles have been registered yet. Use \`/staff-role-add\` to add one.`,
            color: COLORS.neutral,
          }),
        ],
      });
      return;
    }

    const guild = interaction.guild;
    const members = await guild.members.fetch().catch(() => null);
    if (!members) {
      await interaction.editReply({
        embeds: [
          prettyEmbed({
            title: `${EMOJI.fail} Cannot Load Staff`,
            description:
              "Couldn't fetch the member list. Make sure the **Server Members Intent** is enabled.",
            color: COLORS.danger,
          }),
        ],
      });
      return;
    }

    let totalStaff = 0;
    const fields = roles.map((r) => {
      const role = guild.roles.cache.get(r.roleId);
      const roleName = role?.name ?? "Unknown role";
      const holders = members.filter(
        (m) => !m.user.bot && m.roles.cache.has(r.roleId),
      );
      totalStaff += holders.size;

      const lines = [...holders.values()]
        .sort((a, b) =>
          a.displayName.localeCompare(b.displayName, undefined, {
            sensitivity: "base",
          }),
        )
        .slice(0, 25)
        .map((m) => `${EMOJI.bullet} ${m.displayName} \`(${m.user.tag})\``);
      const value =
        lines.length === 0
          ? "*nobody*"
          : lines.join("\n") +
            (holders.size > 25 ? `\n…and **${holders.size - 25}** more` : "");

      return {
        name: `${EMOJI.role} #${r.position} — ${roleName} • ${holders.size} member${holders.size === 1 ? "" : "s"}`,
        value,
        inline: false,
      };
    });

    const embed = prettyEmbed({
      title: `${EMOJI.shield} Staff Database — ${guild.name}`,
      description: `${EMOJI.users} **${totalStaff}** staff member${totalStaff === 1 ? "" : "s"} across **${roles.length}** role${roles.length === 1 ? "" : "s"}`,
      color: COLORS.staff,
      fields,
      thumbnail: guild.iconURL({ size: 256 }) ?? undefined,
      footer: `Server ID: ${guild.id}`,
    });

    await interaction.editReply({
      embeds: [embed],
      // Suppress role/user pings so listing the staff database doesn't
      // ping every staff member or role.
      allowedMentions: { parse: [] },
    });
  },
};

export default command;
