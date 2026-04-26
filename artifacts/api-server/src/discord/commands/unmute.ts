import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { SlashCommand } from "../types";
import { ensureWhitelisted } from "../utils/gate";

const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("unmute")
    .setDescription("Remove a timeout (mute) from a user.")
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("The user to unmute")
        .setRequired(true),
    )
    .setDMPermission(false),
  async execute(interaction: ChatInputCommandInteraction) {
    if (!(await ensureWhitelisted(interaction, "unmute"))) return;
    if (!interaction.guild) return;

    const target = interaction.options.getUser("user", true);
    const member = await interaction.guild.members
      .fetch(target.id)
      .catch(() => null);

    if (!member) {
      await interaction.reply({
        content: "That user isn't in this server.",
        ephemeral: true,
      });
      return;
    }

    if (!member.isCommunicationDisabled()) {
      await interaction.reply({
        content: "That user isn't currently muted.",
        ephemeral: true,
      });
      return;
    }

    if (!member.moderatable) {
      await interaction.reply({
        content: "I can't unmute that user.",
        ephemeral: true,
      });
      return;
    }

    try {
      await member.timeout(null, `Unmuted by ${interaction.user.tag}`);
      await interaction.reply({
        content: `🔊 **${target.tag}** has been unmuted.`,
        ephemeral: true,
      });
    } catch {
      await interaction.reply({
        content: "Failed to unmute that user.",
        ephemeral: true,
      });
    }
  },
};

export default command;
