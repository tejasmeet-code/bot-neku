import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { SlashCommand } from "../types";
import { addWarning, clearWarnings, getWarnings } from "../storage/warnings";
import { ensureWhitelisted } from "../utils/gate";
import { COLORS, EMOJI, prettyEmbed, successEmbed, warnEmbed, infoEmbed, errorEmbed } from "../utils/embedStyle";
import { recordModStat } from "../storage/modstats";
import { bumpModAction } from "../storage/quota";
import { getGuildConfig } from "../storage/config";
import { createCase } from "../storage/cases";
import { sendPunishmentDM } from "../utils/punishDM";

const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Warn a member, view their warnings, or clear them.")
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription("Issue a warning to a user.")
        .addUserOption((o) => o.setName("user").setDescription("The user to warn").setRequired(true))
        .addStringOption((o) => o.setName("reason").setDescription("Reason for the warning").setRequired(true).setMaxLength(512))
        .addStringOption((o) => o.setName("proof").setDescription("Link to proof (optional)").setRequired(false)),
    )
    .addSubcommand((sub) =>
      sub
        .setName("list")
        .setDescription("List a user's warnings.")
        .addUserOption((o) => o.setName("user").setDescription("The user to look up").setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName("clear")
        .setDescription("Clear all warnings for a user.")
        .addUserOption((o) => o.setName("user").setDescription("The user to clear").setRequired(true)),
    )
    .setDMPermission(false),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!(await ensureWhitelisted(interaction, "warn"))) return;
    if (!interaction.guildId || !interaction.guild) return;

    const sub = interaction.options.getSubcommand();
    const target = interaction.options.getUser("user", true);
    const guildId = interaction.guildId;

    if (sub === "add") {
      if (target.bot) { await interaction.reply({ content: "You can't warn a bot.", ephemeral: true }); return; }
      if (target.id === interaction.user.id) { await interaction.reply({ content: "You can't warn yourself.", ephemeral: true }); return; }

      const reason = interaction.options.getString("reason", true);
      const proof = interaction.options.getString("proof");

      await addWarning({ guildId, userId: target.id, moderatorId: interaction.user.id, reason });

      const caseEntry = await createCase({
        guildId,
        action: "warn",
        moderatorId: interaction.user.id,
        targetId: target.id,
        reason,
        proof,
      });

      await recordModStat({ guildId, modId: interaction.user.id, targetId: target.id, action: "warn", delta: 1, reason });
      const cfg = await getGuildConfig(guildId);
      await bumpModAction(guildId, interaction.user.id, cfg.quotaConfig?.weekStartDay ?? 0);

      const total = (await getWarnings(guildId, target.id)).length;

      await sendPunishmentDM(target, {
        action: "warn",
        serverName: interaction.guild.name,
        reason,
        caseNumber: caseEntry.case_number,
        guildId,
        proof,
      });

      await interaction.reply({
        embeds: [warnEmbed(
          `${target.tag} warned — Case #${caseEntry.case_number}`,
          `**Reason:** ${reason}\nThey now have **${total}** warning${total === 1 ? "" : "s"}.`,
        )],
        ephemeral: true,
      });
      return;
    }

    if (sub === "list") {
      const warnings = await getWarnings(guildId, target.id);
      if (warnings.length === 0) {
        await interaction.reply({ embeds: [infoEmbed("No warnings", `**${target.tag}** has a clean record.`)], ephemeral: true });
        return;
      }
      const embed = prettyEmbed({
        title: `${EMOJI.warn} Warnings for ${target.tag}`,
        color: COLORS.warning,
        thumbnail: target.displayAvatarURL({ size: 128 }),
        description: warnings
          .slice(-15)
          .map((w, i) => `**${i + 1}.** ${EMOJI.clock} <t:${Math.floor(w.timestamp / 1000)}:f>\n> ${w.reason}`)
          .join("\n\n"),
        footer: `${warnings.length} total warning${warnings.length === 1 ? "" : "s"}`,
      });
      await interaction.reply({ embeds: [embed], ephemeral: true, allowedMentions: { parse: [] } });
      return;
    }

    if (sub === "clear") {
      const removed = await clearWarnings(guildId, target.id);
      for (let i = 0; i < removed; i++) {
        await recordModStat({ guildId, modId: interaction.user.id, targetId: target.id, action: "unwarn", delta: -1, reason: "Cleared via /warn clear" });
      }
      if (removed === 0) {
        await interaction.reply({ embeds: [infoEmbed("Nothing to clear", `**${target.tag}** had no warnings.`)], ephemeral: true });
        return;
      }
      await interaction.reply({ embeds: [successEmbed("Warnings cleared", `Removed **${removed}** warning${removed === 1 ? "" : "s"} for **${target.tag}**.`)], ephemeral: true });
      return;
    }
  },
};

export default command;
