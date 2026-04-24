import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
  type GuildMember,
  type User,
  type Role,
} from "discord.js";
import type { SlashCommand } from "../types";
import { ensureWhitelisted } from "../utils/gate";
import {
  MAX_RECIPIENTS,
  resolveDmRecipients,
  sendDmsToUsers,
  type DmTarget,
} from "../utils/dmCore";

const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("dm")
    .setDescription("DM a user, every member with a role, or @everyone.")
    .addStringOption((option) =>
      option
        .setName("message")
        .setDescription("The message to send")
        .setRequired(true)
        .setMaxLength(1800),
    )
    .addMentionableOption((option) =>
      option
        .setName("target")
        .setDescription("A user, role, or @everyone")
        .setRequired(false),
    )
    .addBooleanOption((option) =>
      option
        .setName("everyone")
        .setDescription("DM every non-bot member of the server")
        .setRequired(false),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false),
  async execute(interaction: ChatInputCommandInteraction) {
    if (!(await ensureWhitelisted(interaction, "dm"))) return;
    if (!interaction.guild || !interaction.guildId) return;

    const message = interaction.options.getString("message", true);
    const target = interaction.options.getMentionable("target");
    const everyoneFlag = interaction.options.getBoolean("everyone") ?? false;

    if (!target && !everyoneFlag) {
      await interaction.reply({
        content:
          "Pick a target — either a user/role with `target`, or set `everyone:true`.",
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    const guild = interaction.guild;
    const wantsEveryone =
      everyoneFlag ||
      (target && typeof target === "object" && "id" in target &&
        (target as { id: string }).id === guild.id);

    const dmTarget: DmTarget = { everyone: !!wantsEveryone };
    if (!wantsEveryone && target) {
      if (isRole(target)) dmTarget.role = target;
      else if (isGuildMember(target)) dmTarget.member = target;
      else if (isUser(target)) dmTarget.user = target;
    }

    let recipients: { users: Map<string, User>; label: string };
    try {
      recipients = await resolveDmRecipients(guild, dmTarget);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await interaction.editReply(msg);
      return;
    }

    if (recipients.users.size === 0) {
      await interaction.editReply(
        `No human recipients matched **${recipients.label}**.`,
      );
      return;
    }

    if (recipients.users.size > MAX_RECIPIENTS) {
      await interaction.editReply(
        `This would DM **${recipients.users.size}** members. To prevent abuse, mass-DM is capped at ${MAX_RECIPIENTS} per command. Narrow the target.`,
      );
      return;
    }

    const { sent, failed } = await sendDmsToUsers(recipients.users, message);
    const failNote =
      failed > 0 ? ` Failed for **${failed}** (DMs closed or blocked).` : "";
    await interaction.editReply(
      `📬 Sent to **${sent}** member${sent === 1 ? "" : "s"} (${recipients.label}).${failNote}`,
    );
  },
};

function isUser(t: unknown): t is User {
  return (
    typeof t === "object" &&
    t !== null &&
    "username" in t &&
    !("user" in t) &&
    !("members" in t)
  );
}

function isGuildMember(t: unknown): t is GuildMember {
  return typeof t === "object" && t !== null && "user" in t;
}

function isRole(t: unknown): t is Role {
  return typeof t === "object" && t !== null && "members" in t;
}

export default command;
