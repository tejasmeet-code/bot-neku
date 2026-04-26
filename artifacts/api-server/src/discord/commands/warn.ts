import {
  SlashCommandBuilder,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { SlashCommand } from "../types";
import {
  addWarning,
  clearWarnings,
  getWarnings,
} from "../storage/warnings";
import { ensureWhitelisted } from "../utils/gate";

const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Warn a member, view their warnings, or clear them.")
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription("Issue a warning to a user.")
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("The user to warn")
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName("reason")
            .setDescription("Reason for the warning")
            .setRequired(true)
            .setMaxLength(512),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("list")
        .setDescription("List a user's warnings.")
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("The user to look up")
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("clear")
        .setDescription("Clear all warnings for a user.")
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("The user to clear")
            .setRequired(true),
        ),
    )
    .setDMPermission(false),
  async execute(interaction: ChatInputCommandInteraction) {
    if (!(await ensureWhitelisted(interaction, "warn"))) return;
    if (!interaction.guildId) return;

    const sub = interaction.options.getSubcommand();
    const target = interaction.options.getUser("user", true);
    const guildId = interaction.guildId;

    if (sub === "add") {
      if (target.bot) {
        await interaction.reply({
          content: "You can't warn a bot.",
          ephemeral: true,
        });
        return;
      }
      if (target.id === interaction.user.id) {
        await interaction.reply({
          content: "You can't warn yourself.",
          ephemeral: true,
        });
        return;
      }
      const reason = interaction.options.getString("reason", true);
      const warning = await addWarning({
        guildId,
        userId: target.id,
        moderatorId: interaction.user.id,
        reason,
      });
      const total = (await getWarnings(guildId, target.id)).length;

      // Try to DM the user about the warning (best-effort).
      target
        .send(
          `You received a warning in **${interaction.guild?.name}**.\nReason: ${reason}\nTotal warnings: ${total}`,
        )
        .catch(() => {});

      await interaction.reply({
        content: `⚠️ **${target.tag}** has been warned. Reason: ${reason}\nThey now have **${total}** warning${total === 1 ? "" : "s"}.`,
        ephemeral: true,
      });
      return;
    }

    if (sub === "list") {
      const warnings = await getWarnings(guildId, target.id);
      if (warnings.length === 0) {
        await interaction.reply({
          content: `**${target.tag}** has no warnings.`,
          ephemeral: true,
        });
        return;
      }
      const embed = new EmbedBuilder()
        .setTitle(`Warnings for ${target.tag}`)
        .setColor(0xfee75c)
        .setThumbnail(target.displayAvatarURL({ size: 128 }))
        .setDescription(
          warnings
            .slice(-15)
            .map(
              (w, i) =>
                `**${i + 1}.** <t:${Math.floor(w.timestamp / 1000)}:f> by <@${w.moderatorId}>\n> ${w.reason}`,
            )
            .join("\n\n"),
        )
        .setFooter({
          text: `${warnings.length} total warning${warnings.length === 1 ? "" : "s"}`,
        });
      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }

    if (sub === "clear") {
      const removed = await clearWarnings(guildId, target.id);
      if (removed === 0) {
        await interaction.reply({
          content: `**${target.tag}** had no warnings to clear.`,
          ephemeral: true,
        });
        return;
      }
      await interaction.reply({
        content: `🧹 Cleared **${removed}** warning${removed === 1 ? "" : "s"} for **${target.tag}**.`,
        ephemeral: true,
      });
      return;
    }
  },
};

export default command;
