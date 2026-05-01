import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { SlashCommand } from "../types";
import { ensureWhitelisted } from "../utils/gate";
import { recordModStat } from "../storage/modstats";
import { bumpModAction } from "../storage/quota";
import { getGuildConfig } from "../storage/config";
import { createCase } from "../storage/cases";
import { sendPunishmentDM } from "../utils/punishDM";
import { successEmbed, errorEmbed } from "../utils/embedStyle";

const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Ban a user from the server.")
    .addUserOption((option) =>
      option.setName("user").setDescription("The user to ban").setRequired(true),
    )
    .addStringOption((option) =>
      option.setName("reason").setDescription("Reason for the ban").setRequired(false).setMaxLength(512),
    )
    .addIntegerOption((option) =>
      option.setName("delete_days").setDescription("Days of messages to delete (0-7)").setMinValue(0).setMaxValue(7).setRequired(false),
    )
    .addStringOption((option) =>
      option.setName("proof").setDescription("Link to proof (image/video URL)").setRequired(false),
    )
    .setDMPermission(false),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!(await ensureWhitelisted(interaction, "ban"))) return;
    if (!interaction.guild || !interaction.guildId) return;

    const target = interaction.options.getUser("user", true);
    const reason = interaction.options.getString("reason") ?? "No reason provided";
    const deleteDays = interaction.options.getInteger("delete_days") ?? 0;
    const proof = interaction.options.getString("proof");

    if (target.id === interaction.user.id) {
      await interaction.reply({ content: "You can't ban yourself.", ephemeral: true });
      return;
    }
    if (target.id === interaction.client.user.id) {
      await interaction.reply({ content: "I can't ban myself.", ephemeral: true });
      return;
    }

    const member = await interaction.guild.members.fetch(target.id).catch(() => null);
    if (member) {
      if (!member.bannable) {
        await interaction.reply({ embeds: [errorEmbed("Cannot ban", "I don't have permission to ban that user.")], ephemeral: true });
        return;
      }
      const invoker = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
      if (invoker && invoker.roles.highest.position <= member.roles.highest.position && interaction.guild.ownerId !== invoker.id) {
        await interaction.reply({ embeds: [errorEmbed("Cannot ban", "You can't ban someone with an equal or higher role.")], ephemeral: true });
        return;
      }
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      // Create case FIRST so we have the real case number for the DM
      const caseEntry = await createCase({
        guildId: interaction.guildId,
        action: "ban",
        moderatorId: interaction.user.id,
        targetId: target.id,
        reason,
        proof,
      });

      // DM before ban so message is delivered while user is reachable
      await sendPunishmentDM(target, {
        action: "ban",
        serverName: interaction.guild.name,
        reason,
        caseNumber: caseEntry.case_number,
        guildId: interaction.guildId,
        proof,
      });

      await interaction.guild.members.ban(target.id, {
        reason: `[Case #${caseEntry.case_number}] ${reason} — by ${interaction.user.tag}`,
        deleteMessageSeconds: deleteDays * 86400,
      });

      await recordModStat({ guildId: interaction.guild.id, modId: interaction.user.id, targetId: target.id, action: "ban", delta: 1, reason });
      const cfg = await getGuildConfig(interaction.guild.id);
      await bumpModAction(interaction.guild.id, interaction.user.id, cfg.quotaConfig?.weekStartDay ?? 0);

      await interaction.editReply({
        embeds: [successEmbed(`Banned — Case #${caseEntry.case_number}`, `**${target.tag}** has been banned.\n**Reason:** ${reason}`)],
      });
    } catch {
      if (interaction.deferred) {
        await interaction.editReply({ embeds: [errorEmbed("Ban failed", "Could not ban that user.")] });
      } else {
        await interaction.reply({ embeds: [errorEmbed("Ban failed", "Could not ban that user.")], ephemeral: true });
      }
    }
  },
};

export default command;
