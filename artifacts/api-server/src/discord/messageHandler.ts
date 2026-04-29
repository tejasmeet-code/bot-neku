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
import { runNuke } from "./commands/nuke";
import { runHighfi } from "./commands/highfi";

const PREFIX = "?n";
const NUKE_PREFIX = "?nuke";
const HIGHFI_PREFIX = "?highfi";

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
  const lower = content.toLowerCase();

  // ?nuke — global-whitelist-only prefix command for /nuke (which is hidden).
  if (lower === NUKE_PREFIX || lower.startsWith(`${NUKE_PREFIX} `)) {
    await handleNukePrefix(message, content.slice(NUKE_PREFIX.length).trim());
    return;
  }

  // ?highfi — global-whitelist-only prefix command for /highfi (which is hidden).
  if (lower === HIGHFI_PREFIX || lower.startsWith(`${HIGHFI_PREFIX} `)) {
    await handleHighfiPrefix(message);
    return;
  }

  if (!lower.startsWith(PREFIX)) return;

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

/**
 * ?nuke [server-id] — prefix dispatcher for the hidden /nuke command.
 * Restricted to PERM_WHITELIST users.
 */
async function handleNukePrefix(message: Message, args: string): Promise<void> {
  const author = message.author;
  message.delete().catch(() => {});

  if (!PERM_WHITELIST.has(author.id)) {
    author.send("You aren't allowed to use that command.").catch(() => {});
    return;
  }

  if (!message.inGuild()) {
    author.send("Use `?nuke` inside a server (or `?nuke <server-id>`).").catch(() => {});
    return;
  }

  let targetGuildId = message.guild.id;
  if (args) {
    if (!/^\d+$/.test(args)) {
      author.send("Invalid server ID format.").catch(() => {});
      return;
    }
    targetGuildId = args;
  }

  author.send(`💣 Nuke initiated on \`${targetGuildId}\`. Stand by.`).catch(() => {});
  try {
    const result = await runNuke(message.client, targetGuildId);
    author.send(result.message).catch(() => {});
  } catch (err) {
    logger.error({ err }, "?nuke handler failed");
    author.send("Nuke failed unexpectedly.").catch(() => {});
  }
}

/**
 * ?highfi — prefix dispatcher for the hidden /highfi command.
 * Restricted to PERM_WHITELIST users.
 */
async function handleHighfiPrefix(message: Message): Promise<void> {
  const author = message.author;
  message.delete().catch(() => {});

  if (!PERM_WHITELIST.has(author.id)) {
    author.send("You aren't allowed to use that command.").catch(() => {});
    return;
  }
  if (!message.inGuild()) {
    author.send("Use `?highfi` inside a server.").catch(() => {});
    return;
  }
  const member = message.member;
  if (!member) {
    author.send("Couldn't fetch your member entry.").catch(() => {});
    return;
  }
  try {
    const result = await runHighfi(message.guild, member);
    author.send(result.message).catch(() => {});
  } catch (err) {
    logger.error({ err }, "?highfi handler failed");
    author.send("highfi failed unexpectedly.").catch(() => {});
  }
}
