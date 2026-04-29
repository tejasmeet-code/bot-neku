import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { SlashCommand } from "../types";
import { ensureWhitelisted } from "../utils/gate";

const UNIT_MS: Record<string, number> = {
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

const MAX_TIMEOUT_MS = 28 * 86_400_000; // Discord max: 28 days

function parseDuration(input: string): number | null {
  const match = /^(\d{1,5})\s*(s|m|h|d)$/i.exec(input.trim());
  if (!match) return null;
  const value = Number(match[1]);
  const unit = match[2].toLowerCase();
  const ms = value * UNIT_MS[unit];
  if (ms <= 0 || ms > MAX_TIMEOUT_MS) return null;
  return ms;
}

const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("mute")
    .setDescription("Timeout (mute) a user for a duration. Max 28 days.")
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("The user to mute")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("duration")
        .setDescription("How long, e.g. 30s, 10m, 2h, 1d")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("Reason for the mute")
        .setRequired(false)
        .setMaxLength(512),
    )
    .setDMPermission(false),
  async execute(interaction: ChatInputCommandInteraction) {
    if (!(await ensureWhitelisted(interaction, "mute"))) return;
    if (!interaction.guild) return;

    const target = interaction.options.getUser("user", true);
    const durationInput = interaction.options.getString("duration", true);
    const reason =
      interaction.options.getString("reason") ?? "No reason provided";

    const ms = parseDuration(durationInput);
    if (ms === null) {
      await interaction.reply({
        content:
          "Invalid duration. Use a number followed by `s`, `m`, `h`, or `d` (max 28d). Examples: `30s`, `10m`, `2h`, `7d`.",
        ephemeral: true,
      });
      return;
    }

    if (target.id === interaction.user.id) {
      await interaction.reply({
        content: "You can't mute yourself.",
        ephemeral: true,
      });
      return;
    }
    if (target.id === interaction.client.user.id) {
      await interaction.reply({
        content: "I can't mute myself.",
        ephemeral: true,
      });
      return;
    }

    const member = await interaction.guild.members
      .fetch(target.id)
      .catch(() => null);

    if (!member) {
      await interaction.reply({
        content: "That user isn't in this server.",
        ephemeral: true,
      });
      return;
    }

    if (!member.moderatable) {
      await interaction.reply({
        content:
          "I can't mute that user. They may have a higher role than me, or I lack the Moderate Members permission.",
        ephemeral: true,
      });
      return;
    }

    const invoker = await interaction.guild.members
      .fetch(interaction.user.id)
      .catch(() => null);
    if (
      invoker &&
      invoker.roles.highest.position <= member.roles.highest.position &&
      interaction.guild.ownerId !== invoker.id
    ) {
      await interaction.reply({
        content:
          "You can't mute a user with a role equal to or higher than your own.",
        ephemeral: true,
      });
      return;
    }

    try {
      await member.timeout(ms, `${reason} — by ${interaction.user.tag}`);
      const until = Math.floor((Date.now() + ms) / 1000);
      await interaction.reply({
        content: `🔇 **${target.tag}** has been muted until <t:${until}:R>. Reason: ${reason}`,
        ephemeral: true,
      });
    } catch {
      await interaction.reply({
        content: "Failed to mute that user.",
        ephemeral: true,
      });
    }
  },
};

export default command;
