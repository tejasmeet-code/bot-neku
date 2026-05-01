import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { SlashCommand } from "../types";
import { ensureWhitelisted } from "../utils/gate";
import { getWarnings, clearWarnings } from "../storage/warnings";
import { recordModStat } from "../storage/modstats";
import { promises as fs } from "node:fs";
import path from "node:path";

interface Warning {
  id: string;
  guildId: string;
  userId: string;
  moderatorId: string;
  reason: string;
  timestamp: number;
}

const FILE_PATH = path.resolve(process.cwd(), ".data", "warnings.json");

async function removeOneWarning(
  guildId: string,
  userId: string,
): Promise<Warning | null> {
  let parsed: { warnings: Warning[] };
  try {
    const raw = await fs.readFile(FILE_PATH, "utf8");
    parsed = JSON.parse(raw) as { warnings: Warning[] };
    if (!Array.isArray(parsed.warnings)) parsed.warnings = [];
  } catch {
    return null;
  }
  // Find the most recent warning for this user in this guild
  let bestIdx = -1;
  let bestTs = -Infinity;
  parsed.warnings.forEach((w, i) => {
    if (w.guildId !== guildId || w.userId !== userId) return;
    if (w.timestamp > bestTs) {
      bestTs = w.timestamp;
      bestIdx = i;
    }
  });
  if (bestIdx === -1) return null;
  const removed = parsed.warnings.splice(bestIdx, 1)[0]!;
  await fs.writeFile(FILE_PATH, JSON.stringify(parsed, null, 2), "utf8");
  return removed;
}

const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("unwarn")
    .setDescription("Remove a warning from a user (most recent, or all).")
    .addUserOption((o) =>
      o.setName("user").setDescription("The warned user").setRequired(true),
    )
    .addBooleanOption((o) =>
      o
        .setName("all")
        .setDescription("Remove all warnings instead of just the latest")
        .setRequired(false),
    )
    .setDMPermission(false),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!(await ensureWhitelisted(interaction, "warn"))) return;
    if (!interaction.guildId) return;

    const target = interaction.options.getUser("user", true);
    const all = interaction.options.getBoolean("all") ?? false;

    if (all) {
      const removed = await clearWarnings(interaction.guildId, target.id);
      if (removed === 0) {
        await interaction.reply({
          content: `**${target.tag}** had no warnings.`,
          ephemeral: true,
        });
        return;
      }
      for (let i = 0; i < removed; i++) {
        await recordModStat({
          guildId: interaction.guildId,
          modId: interaction.user.id,
          targetId: target.id,
          action: "unwarn",
          delta: -1,
          reason: "Cleared by /unwarn",
        });
      }
      await interaction.reply({
        content: `🧹 Cleared **${removed}** warning${removed === 1 ? "" : "s"} for **${target.tag}**.`,
        ephemeral: true,
      });
      return;
    }

    const before = await getWarnings(interaction.guildId, target.id);
    if (before.length === 0) {
      await interaction.reply({
        content: `**${target.tag}** has no warnings.`,
        ephemeral: true,
      });
      return;
    }

    const removed = await removeOneWarning(interaction.guildId, target.id);
    if (!removed) {
      await interaction.reply({
        content: "Couldn't remove a warning.",
        ephemeral: true,
      });
      return;
    }

    await recordModStat({
      guildId: interaction.guildId,
      modId: interaction.user.id,
      targetId: target.id,
      action: "unwarn",
      delta: -1,
      reason: `Removed warning: ${removed.reason}`,
    });

    const remaining = (await getWarnings(interaction.guildId, target.id)).length;
    await interaction.reply({
      content: `🧹 Removed the latest warning for **${target.tag}**. They now have **${remaining}** warning${remaining === 1 ? "" : "s"}.`,
      ephemeral: true,
    });
  },
};

export default command;
