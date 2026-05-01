import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type User,
} from "discord.js";
import { prettyEmbed, COLORS } from "./embedStyle";
import type { CaseAction } from "../storage/cases";

const ACTION_LABELS: Partial<Record<CaseAction, string>> = {
  ban: "banned",
  mute: "muted",
  warn: "warned",
  jail: "jailed",
  kick: "kicked",
};

const ACTION_COLORS: Partial<Record<CaseAction, number>> = {
  ban: COLORS.danger,
  mute: COLORS.warning,
  warn: COLORS.warning,
  jail: COLORS.neutral,
  kick: COLORS.danger,
};

/**
 * Send a punishment DM to the target user with an appeal button.
 */
export async function sendPunishmentDM(
  target: User,
  opts: {
    action: CaseAction;
    serverName: string;
    reason: string;
    caseNumber: number;
    guildId: string;
    proof?: string | null;
  },
): Promise<void> {
  const label = ACTION_LABELS[opts.action] ?? opts.action;
  const color = ACTION_COLORS[opts.action] ?? COLORS.neutral;

  const embed = prettyEmbed({
    title: `You have been ${label}`,
    color,
    fields: [
      { name: "Server", value: opts.serverName, inline: true },
      { name: "Case", value: `#${opts.caseNumber}`, inline: true },
      { name: "Reason", value: opts.reason, inline: false },
      ...(opts.proof ? [{ name: "Proof", value: opts.proof, inline: false }] : []),
    ],
    footer: "If you believe this was a mistake, click Appeal below.",
  });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`appeal:dm:${opts.guildId}:${opts.caseNumber}`)
      .setLabel("Appeal this Punishment")
      .setStyle(ButtonStyle.Secondary),
  );

  await target.send({ embeds: [embed], components: [row] }).catch(() => {});
}
