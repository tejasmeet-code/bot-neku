import {
  ButtonInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
} from "discord.js";
import { createAppeal, updateAppealStatus, getAppeal, hasOpenAppeal } from "../storage/appeals";
import { getCase, editCase } from "../storage/cases";
import { getGuildConfig } from "../storage/config";
import { recordModStat } from "../storage/modstats";
import { COLORS, prettyEmbed, successEmbed, errorEmbed } from "./embedStyle";

/**
 * Called when a user clicks the "Appeal" button in their punishment DM.
 * customId format: appeal:dm:{guildId}:{caseNumber}
 */
export async function handleAppealButton(i: ButtonInteraction): Promise<void> {
  const parts = i.customId.split(":");
  const guildId = parts[2];
  const caseNumber = parseInt(parts[3], 10);

  if (await hasOpenAppeal(guildId, i.user.id)) {
    await i.reply({ content: "You already have a pending appeal. Please wait for it to be reviewed.", ephemeral: true });
    return;
  }

  const caseEntry = await getCase(guildId, caseNumber);

  const modal = new ModalBuilder()
    .setCustomId(`appeal:submit:${guildId}:${caseNumber}`)
    .setTitle("Submit an Appeal")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("punishment_type")
          .setLabel("What punishment are you appealing?")
          .setStyle(TextInputStyle.Short)
          .setValue(caseEntry?.action ?? "")
          .setRequired(true)
          .setMaxLength(50),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("why_happened")
          .setLabel("Why did this punishment happen?")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(500),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("defense")
          .setLabel("Why should this be overturned?")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(500),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("proof")
          .setLabel("Proof / evidence links (optional)")
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(200),
      ),
    );

  await i.showModal(modal);
}

/**
 * Called when the appeal modal is submitted.
 * customId format: appeal:submit:{guildId}:{caseNumber}
 */
export async function handleAppealModalSubmit(i: any): Promise<void> {
  const parts = i.customId.split(":");
  const guildId = parts[2];
  const caseNumber = parseInt(parts[3], 10);

  const punishmentType = i.fields.getTextInputValue("punishment_type");
  const whyHappened = i.fields.getTextInputValue("why_happened");
  const defense = i.fields.getTextInputValue("defense");
  const proof = i.fields.getTextInputValue("proof") || null;

  try {
    const appeal = await createAppeal({
      guildId,
      caseNumber,
      userId: i.user.id,
      punishmentType,
      whyHappened,
      defense,
      proof,
    });

    const cfg = await getGuildConfig(guildId);
    // Try to find a guild to send to — use botNotifications channel
    const appealChannelId = cfg.channels.botNotifications;

    if (appealChannelId) {
      const guild = i.client.guilds.cache.get(guildId);
      const channel = guild?.channels.cache.get(appealChannelId);
      if (channel && channel.type === ChannelType.GuildText) {
        const embed = prettyEmbed({
          title: `📋 Appeal #${appeal.id} — Case #${caseNumber}`,
          color: COLORS.warning,
          fields: [
            { name: "User", value: `<@${i.user.id}> (${i.user.tag})`, inline: true },
            { name: "Punishment Type", value: punishmentType, inline: true },
            { name: "Case #", value: String(caseNumber), inline: true },
            { name: "Why it happened", value: whyHappened, inline: false },
            { name: "Defense", value: defense, inline: false },
            ...(proof ? [{ name: "Proof", value: proof, inline: false }] : []),
          ],
          footer: "Use Accept or Reject to resolve this appeal",
        });

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`appeal:accept:${guildId}:${appeal.id}`)
            .setLabel("Accept Appeal")
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`appeal:reject:${guildId}:${appeal.id}`)
            .setLabel("Reject Appeal")
            .setStyle(ButtonStyle.Danger),
        );

        await (channel as any).send({ embeds: [embed], components: [row] });
      }
    }

    await i.reply({
      embeds: [successEmbed("Appeal submitted", `Your appeal (ID #${appeal.id}) has been submitted for review. You will be notified of the decision.`)],
      ephemeral: true,
    });
  } catch (err) {
    await i.reply({ embeds: [errorEmbed("Failed", "Could not submit your appeal. Please try again.")], ephemeral: true });
  }
}

/**
 * Handle appeal review buttons (Accept/Reject).
 * customId: appeal:accept|reject:{guildId}:{appealId}
 */
export async function handleAppealReviewButton(i: ButtonInteraction): Promise<void> {
  const parts = i.customId.split(":");
  const action = parts[1] as "accept" | "reject";
  const guildId = parts[2];
  const appealId = parseInt(parts[3], 10);

  const appeal = await getAppeal(appealId);
  if (!appeal) {
    await i.reply({ content: "Appeal not found.", ephemeral: true });
    return;
  }
  if (appeal.status !== "pending") {
    await i.reply({ content: `This appeal has already been ${appeal.status}.`, ephemeral: true });
    return;
  }

  const updated = await updateAppealStatus(appealId, action === "accept" ? "accepted" : "rejected", i.user.id);
  if (!updated) {
    await i.reply({ content: "Failed to update appeal.", ephemeral: true });
    return;
  }

  const color = action === "accept" ? COLORS.success : COLORS.danger;
  const label = action === "accept" ? "✅ Accepted" : "❌ Rejected";

  const updatedEmbed = EmbedBuilder.from(i.message.embeds[0])
    .setColor(color)
    .setFooter({ text: `${label} by ${i.user.tag}` });

  await i.update({ embeds: [updatedEmbed], components: [] });

  // If accepted — void the original case and deduct from mod stats
  if (action === "accept") {
    await editCase(guildId, appeal.case_number, { active: false });
    // Deduct 1 from the original moderator's stats
    const originalCase = await getCase(guildId, appeal.case_number);
    if (originalCase) {
      await recordModStat({
        guildId,
        modId: originalCase.moderator_id,
        targetId: originalCase.target_id,
        action: originalCase.action as any,
        delta: -1,
        reason: `Appeal #${appealId} accepted — case voided`,
      });
    }
  }

  // DM the user
  const user = await i.client.users.fetch(appeal.user_id).catch(() => null);
  if (user) {
    if (action === "accept") {
      user.send({
        embeds: [successEmbed(
          "Your appeal was accepted!",
          `Your appeal for **Case #${appeal.case_number}** (${appeal.punishment_type}) has been accepted and the punishment has been voided.`,
        )],
      }).catch(() => {});
    } else {
      user.send({
        embeds: [errorEmbed(
          "Your appeal was rejected",
          `Your appeal for **Case #${appeal.case_number}** (${appeal.punishment_type}) has been rejected.`,
        )],
      }).catch(() => {});
    }
  }
}
