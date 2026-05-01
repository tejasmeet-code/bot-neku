import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { SlashCommand } from "../types";
import { COLORS, EMOJI, prettyEmbed } from "../utils/embedStyle";

const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("avatar")
    .setDescription("Show a user's avatar.")
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("The user to show (defaults to you)")
        .setRequired(false),
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    const target = interaction.options.getUser("user") ?? interaction.user;
    const url = target.displayAvatarURL({ size: 1024 });
    const embed = prettyEmbed({
      title: `${EMOJI.spark} ${target.username}'s avatar`,
      color: COLORS.warning,
      image: url,
      url,
      footer: `Tap the title for the full-size image`,
    });
    await interaction.reply({ embeds: [embed] });
  },
};

export default command;
