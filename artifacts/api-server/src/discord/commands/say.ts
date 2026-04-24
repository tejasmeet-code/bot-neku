import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { SlashCommand } from "../types";

const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("say")
    .setDescription("Make the bot repeat a message.")
    .addStringOption((option) =>
      option
        .setName("message")
        .setDescription("What should I say?")
        .setRequired(true)
        .setMaxLength(2000),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  async execute(interaction: ChatInputCommandInteraction) {
    const message = interaction.options.getString("message", true);
    await interaction.reply({
      content: "Sent.",
      ephemeral: true,
    });
    const channel = interaction.channel;
    if (channel && channel.isSendable()) {
      await channel.send(message);
    }
  },
};

export default command;
