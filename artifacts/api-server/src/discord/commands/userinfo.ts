import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { SlashCommand } from "../types";
import { COLORS, EMOJI, prettyEmbed } from "../utils/embedStyle";

const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("userinfo")
    .setDescription("Show information about a user.")
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("The user to look up (defaults to you)")
        .setRequired(false),
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    const target = interaction.options.getUser("user") ?? interaction.user;
    const member = await interaction.guild?.members.fetch(target.id).catch(() => null);

    const fields = [
      { name: `${EMOJI.bot} User ID`, value: `\`${target.id}\``, inline: true },
      {
        name: `${EMOJI.cal} Account Created`,
        value: `<t:${Math.floor(target.createdTimestamp / 1000)}:R>`,
        inline: true,
      },
    ];

    if (member?.joinedTimestamp) {
      fields.push({
        name: `${EMOJI.party} Joined Server`,
        value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`,
        inline: true,
      });
    }

    if (member && member.roles.cache.size > 1) {
      const roleNames = member.roles.cache
        .filter((r) => r.id !== interaction.guild?.id)
        .sort((a, b) => b.position - a.position)
        .map((r) => `\`${r.name}\``)
        .slice(0, 15)
        .join(" ");
      fields.push({
        name: `${EMOJI.role} Roles (${member.roles.cache.size - 1})`,
        value: roleNames || "None",
        inline: false,
      });
    }

    const embed = prettyEmbed({
      title: `${EMOJI.user} ${member?.displayName ?? target.username}`,
      color: COLORS.info,
      thumbnail: target.displayAvatarURL({ size: 256 }),
      fields,
      footer: target.bot ? "🤖 Bot account" : `Tag: ${target.tag}`,
    });

    await interaction.reply({ embeds: [embed], allowedMentions: { parse: [] } });
  },
};

export default command;
