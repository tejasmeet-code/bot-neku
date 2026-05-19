import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import type { SlashCommand } from "../types";
import { prettyEmbed, COLORS, CE } from "../utils/embedStyle";

const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("coinflip")
    .setDescription("Flip a coin.")
    .addStringOption(o => o.setName("call").setDescription("Your call").setRequired(false).addChoices(
      { name: "Heads", value: "heads" },
      { name: "Tails", value: "tails" },
    ))
    .setDMPermission(false),

  async execute(interaction: ChatInputCommandInteraction) {
    const call = interaction.options.getString("call");
    const result = Math.random() < 0.5 ? "heads" : "tails";
    const won = call !== null ? call === result : null;

    const desc = call !== null
      ? `You called **${call}** — it landed on **${result}**!\n${won ? `${CE.success.str} You win!` : `${CE.error.str} You lose!`}`
      : `It landed on **${result}**!`;

    await interaction.reply({
      embeds: [prettyEmbed({
        title: result === "heads" ? "Heads!" : "Tails!",
        description: desc,
        color: result === "heads" ? COLORS.success : COLORS.warning,
      })],
    });
  },
};

export default command;