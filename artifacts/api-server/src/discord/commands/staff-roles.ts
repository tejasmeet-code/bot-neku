import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { SlashCommand } from "../types";
import { listStaffRoles } from "../storage/staff";
import { COLORS, EMOJI, prettyEmbed, infoEmbed } from "../utils/embedStyle";

const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("staff-roles")
    .setDescription("List the staff roles registered for this server.")
    .setDMPermission(false),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.inGuild() || !interaction.guildId || !interaction.guild) {
      await interaction.reply({
        content: "Run this in a server.",
        ephemeral: true,
      });
      return;
    }
    const roles = await listStaffRoles(interaction.guildId);
    if (roles.length === 0) {
      await interaction.reply({
        embeds: [
          infoEmbed(
            "No Staff Roles",
            "Use `/staff-role-add` to register one.",
          ),
        ],
        ephemeral: true,
      });
      return;
    }
    const guild = interaction.guild;
    const lines = roles.map((r) => {
      const role = guild.roles.cache.get(r.roleId);
      const name = role?.name ?? "Unknown role";
      return `${EMOJI.role} **#${r.position}** — ${name}`;
    });
    const embed = prettyEmbed({
      title: `${EMOJI.shield} Staff Roles — ${guild.name}`,
      description: lines.join("\n"),
      color: COLORS.staff,
      thumbnail: guild.iconURL({ size: 256 }) ?? undefined,
      footer: `${roles.length} role${roles.length === 1 ? "" : "s"} • #1 = highest`,
    });
    await interaction.reply({
      embeds: [embed],
      allowedMentions: { parse: [] },
    });
  },
};

export default command;
