import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { SlashCommand } from "../types";
import { ensureWhitelisted } from "../utils/gate";
import {
  ensureJailRole,
  getJailRoleId,
  releaseJailFromMember,
} from "../storage/jail";
import { recordModStat } from "../storage/modstats";

const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("unjail")
    .setDescription("Release a jailed user (removes the Jailed role).")
    .addUserOption((o) =>
      o
        .setName("user")
        .setDescription("The user to release")
        .setRequired(true),
    )
    .addStringOption((o) =>
      o
        .setName("reason")
        .setDescription("Reason for the release")
        .setRequired(false)
        .setMaxLength(512),
    )
    .setDMPermission(false),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!(await ensureWhitelisted(interaction, "jail"))) return;
    if (!interaction.guild || !interaction.guildId) return;

    const target = interaction.options.getUser("user", true);
    const reason =
      interaction.options.getString("reason") ?? "Released by moderator";

    await interaction.deferReply({ ephemeral: true });
    const member = await interaction.guild.members
      .fetch(target.id)
      .catch(() => null);
    if (!member) {
      await interaction.editReply("That user isn't in this server.");
      return;
    }

    const roleId =
      (await getJailRoleId(interaction.guildId)) ??
      (await ensureJailRole(interaction.guild));
    if (!roleId) {
      await interaction.editReply(
        "No Jailed role exists yet for this server.",
      );
      return;
    }
    if (!member.roles.cache.has(roleId)) {
      await interaction.editReply(`**${target.tag}** isn't jailed.`);
      return;
    }
    if (!member.manageable) {
      await interaction.editReply(
        "I can't modify that user's roles (role hierarchy or missing permission).",
      );
      return;
    }

    const me = interaction.guild.members.me;
    if (!me) {
      await interaction.editReply("I couldn't read my own member info.");
      return;
    }

    let restored = 0;
    let missing = 0;
    let aboveBot = 0;
    try {
      const result = await releaseJailFromMember(member, roleId, me, reason);
      restored = result.restored;
      missing = result.missing;
      aboveBot = result.aboveBot;
    } catch {
      await interaction.editReply("Failed to remove the Jailed role.");
      return;
    }

    // Reversal — counts as -1 modstat for the moderator who originally jailed
    // them is impossible to attribute, so we register the reversal under the
    // moderator who issued the unjail. This intentionally subtracts from the
    // releaser's score per the requested behaviour.
    await recordModStat({
      guildId: interaction.guildId,
      modId: interaction.user.id,
      targetId: target.id,
      action: "unjail",
      delta: -1,
      reason,
    });

    const restoreNotes: string[] = [];
    if (restored > 0)
      restoreNotes.push(
        `restored **${restored}** stashed role${restored === 1 ? "" : "s"}`,
      );
    if (missing > 0)
      restoreNotes.push(
        `**${missing}** role${missing === 1 ? "" : "s"} no longer exist`,
      );
    if (aboveBot > 0)
      restoreNotes.push(
        `**${aboveBot}** role${aboveBot === 1 ? "" : "s"} are above mine and were skipped`,
      );

    const tail = restoreNotes.length > 0 ? ` (${restoreNotes.join(", ")})` : "";

    await interaction.editReply(
      `🔓 **${target.tag}** has been released from jail. Reason: ${reason}${tail}`,
    );
  },
};

export default command;
