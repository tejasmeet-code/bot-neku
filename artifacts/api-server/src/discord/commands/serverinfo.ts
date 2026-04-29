import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { SlashCommand } from "../types";
import { COLORS, EMOJI, prettyEmbed } from "../utils/embedStyle";

const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("serverinfo")
    .setDescription("Show information about this server."),
  async execute(interaction: ChatInputCommandInteraction) {
    const guild = interaction.guild;
    if (!guild) {
      await interaction.reply({
        content: "This command can only be used in a server.",
        ephemeral: true,
      });
      return;
    }

    const owner = await guild.fetchOwner();
    const channels = guild.channels.cache;
    const textCount = channels.filter((c) => c.type === 0).size;
    const voiceCount = channels.filter((c) => c.type === 2).size;

    const embed = prettyEmbed({
      title: `${EMOJI.server} ${guild.name}`,
      color: COLORS.success,
      thumbnail: guild.iconURL({ size: 256 }) ?? undefined,
      fields: [
        { name: `${EMOJI.crown} Owner`, value: owner.user.tag, inline: true },
        { name: `${EMOJI.users} Members`, value: `${guild.memberCount}`, inline: true },
        { name: `${EMOJI.role} Roles`, value: `${guild.roles.cache.size}`, inline: true },
        { name: `${EMOJI.channel} Text channels`, value: `${textCount}`, inline: true },
        { name: `🔊 Voice channels`, value: `${voiceCount}`, inline: true },
        {
          name: `${EMOJI.cal} Created`,
          value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`,
          inline: true,
        },
      ],
      footer: `Server ID: ${guild.id}`,
    });
    await interaction.reply({ embeds: [embed], allowedMentions: { parse: [] } });
  },
};

export default command;
