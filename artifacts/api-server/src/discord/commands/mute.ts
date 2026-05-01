import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { SlashCommand } from "../types";
import { ensureWhitelisted } from "../utils/gate";
import { recordModStat } from "../storage/modstats";
import { bumpModAction } from "../storage/quota";
import { getGuildConfig } from "../storage/config";
import { createCase } from "../storage/cases";
import { sendPunishmentDM } from "../utils/punishDM";
import { successEmbed, errorEmbed } from "../utils/embedStyle";

const UNIT_MS: Record<string, number> = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 };
const MAX_TIMEOUT_MS = 28 * 86_400_000;

function parseDuration(input: string): number | null {
  const match = /^(\d{1,5})\s*(s|m|h|d)$/i.exec(input.trim());
  if (!match) return null;
  const ms = Number(match[1]) * UNIT_MS[match[2].toLowerCase()];
  if (ms <= 0 || ms > MAX_TIMEOUT_MS) return null;
  return ms;
}

const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("mute")
    .setDescription("Timeout (mute) a user for a duration. Max 28 days.")
    .addUserOption((o) => o.setName("user").setDescription("The user to mute").setRequired(true))
    .addStringOption((o) => o.setName("duration").setDescription("How long, e.g. 30s, 10m, 2h, 1d").setRequired(true))
    .addStringOption((o) => o.setName("reason").setDescription("Reason for the mute").setRequired(false).setMaxLength(512))
    .addStringOption((o) => o.setName("proof").setDescription("Link to proof (optional)").setRequired(false))
    .setDMPermission(false),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!(await ensureWhitelisted(interaction, "mute"))) return;
    if (!interaction.guild || !interaction.guildId) return;

    const target = interaction.options.getUser("user", true);
    const durationInput = interaction.options.getString("duration", true);
    const reason = interaction.options.getString("reason") ?? "No reason provided";
    const proof = interaction.options.getString("proof");

    const ms = parseDuration(durationInput);
    if (ms === null) {
      await interaction.reply({ content: "Invalid duration. Use e.g. `30s`, `10m`, `2h`, `7d` (max 28d).", ephemeral: true });
      return;
    }
    if (target.id === interaction.user.id) { await interaction.reply({ content: "You can't mute yourself.", ephemeral: true }); return; }
    if (target.id === interaction.client.user.id) { await interaction.reply({ content: "I can't mute myself.", ephemeral: true }); return; }

    const member = await interaction.guild.members.fetch(target.id).catch(() => null);
    if (!member) { await interaction.reply({ content: "That user isn't in this server.", ephemeral: true }); return; }
    if (!member.moderatable) { await interaction.reply({ embeds: [errorEmbed("Cannot mute", "I lack permission to mute that user.")], ephemeral: true }); return; }

    const invoker = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    if (invoker && invoker.roles.highest.position <= member.roles.highest.position && interaction.guild.ownerId !== invoker.id) {
      await interaction.reply({ embeds: [errorEmbed("Cannot mute", "You can't mute someone with an equal or higher role.")], ephemeral: true });
      return;
    }

    try {
      await member.timeout(ms, `${reason} — by ${interaction.user.tag}`);

      const caseEntry = await createCase({ guildId: interaction.guildId, action: "mute", moderatorId: interaction.user.id, targetId: target.id, reason, proof });

      await recordModStat({ guildId: interaction.guild.id, modId: interaction.user.id, targetId: target.id, action: "mute", delta: 1, reason });
      const cfg = await getGuildConfig(interaction.guild.id);
      await bumpModAction(interaction.guild.id, interaction.user.id, cfg.quotaConfig?.weekStartDay ?? 0);

      await sendPunishmentDM(target, { action: "mute", serverName: interaction.guild.name, reason, caseNumber: caseEntry.case_number, guildId: interaction.guildId, proof });

      const until = Math.floor((Date.now() + ms) / 1000);
      await interaction.reply({
        embeds: [successEmbed(`Muted — Case #${caseEntry.case_number}`, `**${target.tag}** is muted until <t:${until}:R>.\n**Reason:** ${reason}`)],
        ephemeral: true,
      });
    } catch {
      await interaction.reply({ embeds: [errorEmbed("Mute failed", "Could not mute that user.")], ephemeral: true });
    }
  },
};

export default command;
