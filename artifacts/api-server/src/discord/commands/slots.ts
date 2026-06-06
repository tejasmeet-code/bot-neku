import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { SlashCommand } from "../types";

const SYMBOLS = ["🍒", "🍋", "🍇", "🔔", "💎", "7️⃣"];

function spin(): string {
  return SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
}

const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("slots")
    .setDescription("Pull the slot machine."),
  async execute(interaction: ChatInputCommandInteraction) {
    const reels = [spin(), spin(), spin()];
    const allMatch = reels[0] === reels[1] && reels[1] === reels[2];
    const twoMatch =
      !allMatch &&
      (reels[0] === reels[1] ||
        reels[1] === reels[2] ||
        reels[0] === reels[2]);

    let outcome: string;
    if (allMatch && reels[0] === "7️⃣") outcome = "🎉 **JACKPOT!** 🎉";
    else if (allMatch) outcome = "✨ **Big win!** ✨";
    else if (twoMatch) outcome = "🙂 Small win.";
    else outcome = "💀 No luck. Try again.";

    await interaction.reply(
      `🎰  | ${reels.join(" | ")} |  🎰\n${outcome}`,
    );
  },
};

export default command;
