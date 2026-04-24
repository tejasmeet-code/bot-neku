import {
  SlashCommandBuilder,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { SlashCommand } from "../types";
import { getCommands } from "../registry";

const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("List all available commands."),
  async execute(interaction: ChatInputCommandInteraction) {
    const commands = getCommands();
    const embed = new EmbedBuilder()
      .setTitle("Bot Commands")
      .setColor(0x5865f2)
      .setDescription(
        commands
          .map((c) => `**/${c.data.name}** — ${c.data.description}`)
          .join("\n"),
      )
      .setFooter({ text: `${commands.length} commands available` });
    await interaction.reply({ embeds: [embed] });
  },
};

export default command;
