import {
  ChannelType,
  type Message,
  type Role,
  type User,
} from "discord.js";
import { logger } from "../lib/logger";
import { isWhitelisted, PERM_WHITELIST } from "./storage/whitelist";
import {
  DM_INTERVAL_MS,
  MAX_RECIPIENTS_HARD_CAP,
  estimateDmSeconds,
  resolveDmRecipients,
  sendDmsToUsers,
  type DmTarget,
} from "./utils/dmCore";
import { PermissionFlagsBits } from "discord.js";

const PREFIX = "?n";

/**
 * Handle prefix-based DM command:  ?n {message} {@user|@role|@everyone}
 * On invocation: deletes the trigger message, sends DMs, then DMs the
 * executor whether it succeeded.
 */
export async function handlePrefixMessage(message: Message): Promise<void> {
  if (message.author.bot) return;
  if (!message.inGuild()) return;
  const content = message.content?.trim();
  if (!content) return;
  if (!content.toLowerCase().startsWith(PREFIX)) return;

  // Must be exactly the prefix followed by whitespace (so "?normal text" doesn't trigger)
  const rest = content.slice(PREFIX.length);
  if (rest.length > 0 && !/^\s/.test(rest)) return;

  const guild = message.guild;
  const author = message.author;

  // Permission gate: same as /dm — admins/owners/whitelist allowed.
  const member = message.member;
  const isOwner = guild.ownerId === author.id;
  const isAdmin =
    member?.permissions.has(PermissionFlagsBits.Administrator) ?? false;
  const allowed =
    isOwner ||
    isAdmin ||
    PERM_WHITELIST.has(author.id) ||
    (await isWhitelisted("dm", guild.id, author.id));

  // Try to delete the trigger message no matter what (so the command isn't visible).
  message.delete().catch(() => {});

  if (!allowed) {
    author
      .send(`You aren't allowed to use \`${PREFIX}\` in **${guild.name}**.`)
      .catch(() => {});
    return;
  }

  // Build the DM target.
  const everyone = message.mentions.everyone;
  const role: Role | undefined = message.mentions.roles.first();
  const userMention: User | undefined = message.mentions.users.first();

  if (!everyone && !role && !userMention) {
    author
      .send(
        `Couldn't find a target in your \`${PREFIX}\` message. Mention a user, a role, or @everyone.`,
      )
      .catch(() => {});
    return;
  }

  // Strip the prefix and any mentions to get the message body.
  let body = rest
    .replace(/<@!?(\d+)>/g, "")
    .replace(/<@&(\d+)>/g, "")
    .replace(/@everyone/g, "")
    .replace(/@here/g, "")
    .trim();

  if (!body) {
    author
      .send(
        `Your \`${PREFIX}\` message was empty. Format: \`${PREFIX} <message> <@user|@role|@everyone>\``,
      )
      .catch(() => {});
    return;
  }

  if (body.length > 1800) body = body.slice(0, 1800);

  const target: DmTarget = {};
  if (everyone) target.everyone = true;
  else if (role) target.role = role;
  else if (userMention) target.user = userMention;

  let recipients: { users: Map<string, User>; label: string };
  try {
    recipients = await resolveDmRecipients(guild, target);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    author.send(msg).catch(() => {});
    return;
  }

  if (recipients.users.size === 0) {
    author
      .send(`No human recipients matched **${recipients.label}**.`)
      .catch(() => {});
    return;
  }

  if (recipients.users.size > MAX_RECIPIENTS_HARD_CAP) {
    author
      .send(
        `That would DM **${recipients.users.size}** members, over the safety cap of ${MAX_RECIPIENTS_HARD_CAP}. Narrow the target.`,
      )
      .catch(() => {});
    return;
  }

  const total = recipients.users.size;
  if (total > 1) {
    const secs = estimateDmSeconds(total, DM_INTERVAL_MS);
    author
      .send(
        `📬 \`${PREFIX}\` started — sending to **${total}** members (${recipients.label}). ETA ~${formatSeconds(secs)}.`,
      )
      .catch(() => {});
  }

  const { sent, failed } = await sendDmsToUsers(
    recipients.users,
    body,
    DM_INTERVAL_MS,
  );

  // Confirm to the executor over DM.
  const failNote =
    failed > 0 ? ` Failed for **${failed}** (DMs closed or blocked).` : "";
  const where =
    message.channel.type === ChannelType.GuildText
      ? ` in #${message.channel.name}`
      : "";
  author
    .send(
      `📬 \`${PREFIX}\` ran${where}. Sent to **${sent}** member${sent === 1 ? "" : "s"} (${recipients.label}).${failNote}`,
    )
    .catch((err) => {
      logger.debug({ err }, "Failed to DM executor with ?n confirmation");
    });
}

function formatSeconds(s: number): string {
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem === 0 ? `${m}m` : `${m}m ${rem}s`;
}
