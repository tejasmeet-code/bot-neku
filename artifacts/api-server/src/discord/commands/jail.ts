import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { SlashCommand } from "../types";
import { ensureWhitelisted } from "../utils/gate";
import { applyJailToMember, ensureJailRole } from "../storage/jail";
import { recordModStat } from "../storage/modstats";
import { bumpModAction } from "../storage/quota";
import { getGuildConfig } from "../storage/config";

const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("jail")
    .setDescription(
      "Restrict a user from accessing any channel by giving them the Jailed role.",
    )
    .addUserOption((o) =>
      o.setName("user").setDescription("The user to jail").setRequired(true),
    )
    .addStringOption((o) =>
      o
        .setName("reason")
        .setDescription("Reason for the jail")
        .setRequired(false)
        .setMaxLength(512),
    )
    .setDMPermission(false),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!(await ensureWhitelisted(interaction, "jail"))) return;
    if (!interaction.guild || !interaction.guildId) return;

    const target = interaction.options.getUser("user", true);
    const reason =
      interaction.options.getString("reason") ?? "No reason provided";

    if (target.id === interaction.user.id) {
      await interaction.reply({
        content: "You can't jail yourself.",
        ephemeral: true,
      });
      return;
    }
    if (target.id === interaction.client.user.id) {
      await interaction.reply({
        content: "I can't jail myself.",
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    const member = await interaction.guild.members
      .fetch(target.id)
      .catch(() => null);
    if (!member) {
      await interaction.editReply("That user isn't in this server.");
      return;
    }
    if (!member.manageable) {
      await interaction.editReply(
        "I can't jail that user. They may have a higher role than me, or I lack the Manage Roles permission.",
      );
      return;
    }

    const roleId = await ensureJailRole(interaction.guild);
    if (!roleId) {
      await interaction.editReply(
        "Couldn't create or find the Jailed role. I need the Manage Roles and Manage Channels permissions.",
      );
      return;
    }

    if (member.roles.cache.has(roleId)) {
      await interaction.editReply(
        `**${target.tag}** is already jailed.`,
      );
      return;
    }

    const me = interaction.guild.members.me;
    if (!me) {
      await interaction.editReply("I couldn't read my own member info.");
      return;
    }

    let removed = 0;
    let couldNotRemove = 0;
    try {
      const result = await applyJailToMember(member, roleId, me, reason);
      removed = result.removed.length;
      couldNotRemove = result.couldNotRemove.length;
    } catch {
      await interaction.editReply(
        "Failed to apply the Jailed role. Make sure my role is above the user's roles and I have **Manage Roles**.",
      );
      return;
    }

    await recordModStat({
      guildId: interaction.guildId,
      modId: interaction.user.id,
      targetId: target.id,
      action: "jail",
      delta: 1,
      reason,
    });
    const cfg = await getGuildConfig(interaction.guildId);
    await bumpModAction(
      interaction.guildId,
      interaction.user.id,
      cfg.quotaConfig?.weekStartDay ?? 0,
    );

    const stripNote =
      removed > 0
        ? ` Removed **${removed}** role${removed === 1 ? "" : "s"} and stashed them for /unjail.`
        : "";
    const warnNote =
      couldNotRemove > 0
        ? ` ⚠️ **${couldNotRemove}** role${couldNotRemove === 1 ? "" : "s"} couldn't be removed because they're above mine.`
        : "";

    await interaction.editReply(
      `🔒 **${target.tag}** has been jailed. Reason: ${reason}.${stripNote}${warnNote}`,
    );
  },
};

export default command;
