import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { SlashCommand } from "../types";
import { getCommands } from "../registry";
import { COLORS, EMOJI, prettyEmbed } from "../utils/embedStyle";

const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("List all available commands."),
  async execute(interaction: ChatInputCommandInteraction) {
    const commands = getCommands().filter((c) => !c.globalWhitelistOnly);
    const lines = commands
      .map((c) => `${EMOJI.bullet} **/${c.data.name}** — ${c.data.description}`)
      .join("\n");
    const embed = prettyEmbed({
      title: `${EMOJI.list} Bot Commands`,
      description: lines,
      color: COLORS.primary,
      footer: `${commands.length} commands available`,
    });
    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};

export default command;
