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
import { logger } from "../../lib/logger";

const MAX_RECIPIENTS = 50;

interface Recipients {
  users: Map<string, User>;
  label: string;
}

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

    const payload = message;

    let recipients: Recipients;
    try {
      recipients = await resolveRecipients(interaction, target, everyoneFlag);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await interaction.editReply(msg);
      return;
    }

    // Drop bots and the invoker themselves.
    for (const id of [...recipients.users.keys()]) {
      const u = recipients.users.get(id)!;
      if (u.bot) recipients.users.delete(id);
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

    let sent = 0;
    let failed = 0;
    for (const user of recipients.users.values()) {
      try {
        await user.send(payload);
        sent++;
      } catch (err) {
        failed++;
        logger.debug({ err, userId: user.id }, "DM failed");
      }
    }

    const failNote =
      failed > 0
        ? ` Failed for **${failed}** (DMs closed or blocked).`
        : "";
    await interaction.editReply(
      `📬 Sent to **${sent}** member${sent === 1 ? "" : "s"} (${recipients.label}).${failNote}`,
    );
  },
};

async function resolveRecipients(
  interaction: ChatInputCommandInteraction,
  target: unknown,
  everyoneFlag: boolean,
): Promise<Recipients> {
  const guild = interaction.guild!;
  const targetObj =
    target && typeof target === "object" ? (target as Record<string, unknown>) : null;
  const targetId =
    targetObj && typeof targetObj.id === "string" ? targetObj.id : null;
  const wantsEveryone = everyoneFlag || targetId === guild.id;

  if (wantsEveryone) {
    const members = await fetchAllMembers(interaction);
    const users = new Map<string, User>();
    for (const m of members.values()) users.set(m.user.id, m.user);
    return { users, label: "everyone" };
  }

  if (target && isUser(target)) {
    return {
      users: new Map([[target.id, target]]),
      label: target.tag,
    };
  }

  if (target && isGuildMember(target)) {
    return {
      users: new Map([[target.user.id, target.user]]),
      label: target.user.tag,
    };
  }

  if (target && isRole(target)) {
    // Make sure we have all members cached for the role.
    await fetchAllMembers(interaction);
    const role = await guild.roles.fetch(target.id).catch(() => null);
    if (!role) {
      throw new Error("Couldn't find that role.");
    }
    const users = new Map<string, User>();
    for (const m of role.members.values()) users.set(m.user.id, m.user);
    return { users, label: `role @${role.name}` };
  }

  throw new Error(
    "Couldn't understand that target. Try a user, a role, or set `everyone:true`.",
  );
}

async function fetchAllMembers(interaction: ChatInputCommandInteraction) {
  try {
    return await interaction.guild!.members.fetch();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ err: msg }, "Failed to fetch guild members for /dm");
    throw new Error(
      "I couldn't load the server's member list. Enable the **Server Members Intent** for the bot in the Discord Developer Portal (Bot → Privileged Gateway Intents), then restart the bot.",
    );
  }
}

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
