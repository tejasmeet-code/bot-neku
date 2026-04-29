import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { SlashCommand } from "../types";
import { ensureWhitelisted } from "../utils/gate";

const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Ban a user from the server.")
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("The user to ban")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("Reason for the ban")
        .setRequired(false)
        .setMaxLength(512),
    )
    .addIntegerOption((option) =>
      option
        .setName("delete_days")
        .setDescription("Days of messages to delete (0-7)")
        .setMinValue(0)
        .setMaxValue(7)
        .setRequired(false),
    )
    .setDMPermission(false),
  async execute(interaction: ChatInputCommandInteraction) {
    if (!(await ensureWhitelisted(interaction, "ban"))) return;
    if (!interaction.guild) return;

    const target = interaction.options.getUser("user", true);
    const reason =
      interaction.options.getString("reason") ?? "No reason provided";
    const deleteDays = interaction.options.getInteger("delete_days") ?? 0;

    if (target.id === interaction.user.id) {
      await interaction.reply({
        content: "You can't ban yourself.",
        ephemeral: true,
      });
      return;
    }
    if (target.id === interaction.client.user.id) {
      await interaction.reply({
        content: "I can't ban myself.",
        ephemeral: true,
      });
      return;
    }

    const member = await interaction.guild.members
      .fetch(target.id)
      .catch(() => null);

    if (member) {
      if (!member.bannable) {
        await interaction.reply({
          content:
            "I can't ban that user. They may have a higher role than me, or I lack the Ban Members permission.",
          ephemeral: true,
        });
        return;
      }
      const invoker = await interaction.guild.members
        .fetch(interaction.user.id)
        .catch(() => null);
      if (
        invoker &&
        invoker.roles.highest.position <= member.roles.highest.position &&
        interaction.guild.ownerId !== invoker.id
      ) {
        await interaction.reply({
          content:
            "You can't ban a user with a role equal to or higher than your own.",
          ephemeral: true,
        });
        return;
      }
    }

    try {
      await interaction.guild.members.ban(target.id, {
        reason: `${reason} — by ${interaction.user.tag}`,
        deleteMessageSeconds: deleteDays * 86400,
      });
      await interaction.reply({
        content: `🔨 **${target.tag}** has been banned. Reason: ${reason}`,
        ephemeral: true,
      });
    } catch {
      await interaction.reply({
        content: "Failed to ban that user.",
        ephemeral: true,
      });
    }
  },
};

export default command;
