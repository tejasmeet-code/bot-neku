import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type GuildMember,
  type User,
  type Role,
} from "discord.js";
import type { SlashCommand } from "../types";
import { ensureWhitelisted } from "../utils/gate";
import { PERM_WHITELIST } from "../storage/whitelist";
import {
  DM_INTERVAL_MS,
  MAX_RECIPIENTS_HARD_CAP,
  estimateDmSeconds,
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

    // Check if trying to DM role or everyone
    const isRole = (t: unknown): t is Role =>
      typeof t === "object" && t !== null && "members" in t;
    const isGuildMember = (t: unknown): t is GuildMember =>
      typeof t === "object" && t !== null && "user" in t;
    const isUser = (t: unknown): t is User =>
      typeof t === "object" &&
      t !== null &&
      "username" in t &&
      !("user" in t) &&
      !("members" in t);

    const wantsEveryone =
      everyoneFlag ||
      (target && typeof target === "object" && "id" in target &&
        (target as { id: string }).id === interaction.guild.id);

    const targetIsRole = target && isRole(target);
    const targetIsMultiple = wantsEveryone || targetIsRole;

    // Only global whitelisted users can DM roles or everyone
    if (targetIsMultiple && !PERM_WHITELIST.has(interaction.user.id)) {
      await interaction.reply({
        content:
          "You can only DM individual users. Only globally whitelisted users can DM roles or @everyone.",
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    const guild = interaction.guild;

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

    if (recipients.users.size > MAX_RECIPIENTS_HARD_CAP) {
      await interaction.editReply(
        `This would DM **${recipients.users.size}** members, which is over the safety cap of ${MAX_RECIPIENTS_HARD_CAP}. Narrow the target.`,
      );
      return;
    }

    const total = recipients.users.size;
    const seconds = estimateDmSeconds(total, DM_INTERVAL_MS);
    if (total > 1) {
      await interaction.editReply(
        `📬 Sending to **${total}** member${total === 1 ? "" : "s"} (${recipients.label}). Estimated time: ~${formatSeconds(seconds)}. I'll edit this with the result when I'm done.`,
      );
    }

    const { sent, failed } = await sendDmsToUsers(
      recipients.users,
      message,
      DM_INTERVAL_MS,
    );
    const failNote =
      failed > 0 ? ` Failed for **${failed}** (DMs closed or blocked).` : "";
    await interaction.editReply(
      `📬 Sent to **${sent}** member${sent === 1 ? "" : "s"} (${recipients.label}).${failNote}`,
    );
  },
};

function formatSeconds(s: number): string {
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem === 0 ? `${m}m` : `${m}m ${rem}s`;
}

export default command;
