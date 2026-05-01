import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { SlashCommand } from "../types";
import { ensureWhitelisted } from "../utils/gate";
import { recordModStat } from "../storage/modstats";

const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("unban")
    .setDescription("Unban a user from this server.")
    .addStringOption((o) =>
      o
        .setName("user_id")
        .setDescription("The user ID to unban")
        .setRequired(true),
    )
    .addStringOption((o) =>
      o
        .setName("reason")
        .setDescription("Reason for the unban")
        .setRequired(false)
        .setMaxLength(512),
    )
    .setDMPermission(false),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!(await ensureWhitelisted(interaction, "ban"))) return;
    if (!interaction.guild || !interaction.guildId) return;

    const userId = interaction.options.getString("user_id", true).trim();
    const reason =
      interaction.options.getString("reason") ?? "Unbanned by moderator";

    if (!/^\d{15,25}$/.test(userId)) {
      await interaction.reply({
        content: "That doesn't look like a valid user ID.",
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    const ban = await interaction.guild.bans.fetch(userId).catch(() => null);
    if (!ban) {
      await interaction.editReply("That user isn't currently banned.");
      return;
    }

    try {
      await interaction.guild.bans.remove(
        userId,
        `${reason} — by ${interaction.user.tag}`,
      );
    } catch {
      await interaction.editReply("Failed to unban that user.");
      return;
    }

    await recordModStat({
      guildId: interaction.guildId,
      modId: interaction.user.id,
      targetId: userId,
      action: "unban",
      delta: -1,
      reason,
    });

    await interaction.editReply(
      `🔓 Unbanned **${ban.user.tag}** (\`${userId}\`). Reason: ${reason}`,
    );
  },
};

export default command;
