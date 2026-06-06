import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import type { SlashCommand } from "../types";
import { prettyEmbed, buildBullets, COLORS, CE } from "../utils/embedStyle";
import { readGuildCount } from "../storage/guild-counter";

const DEV_ID = "1181221352393420856";

const command: SlashCommand = {
  globalWhitelistOnly: true,
  data: new SlashCommandBuilder()
    .setName("servercount")
    .setDescription("Shows how many servers Zenvy is in. [Dev only]")
    .setDMPermission(true),

  async execute(interaction: ChatInputCommandInteraction) {
    if (interaction.user.id !== DEV_ID) {
      await interaction.reply({ content: "This command is restricted to the bot developer." , flags: 1 << 6 });
      return;
    }

    const live = interaction.client.guilds.cache.size;
    const allTime = await readGuildCount();

    await interaction.reply({
      embeds: [prettyEmbed({
        title: "Server Count",
        description: `${CE.information.str}\n\n${buildBullets([
          { label: "Currently in",   value: `**${live.toLocaleString()}** servers` },
          { label: "All-time joins", value: `**${allTime.toLocaleString()}** servers` },
        ])}`,
        color: COLORS.info,
        footer: `Zenvy • Dev only`,
      })],
      flags: 1 << 6,
    });
  },
};

export default command;
