import {
  SlashCommandBuilder,
  PermissionsBitField,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { SlashCommand } from "../types";
import { logger } from "../../lib/logger";
import { pushRoleToTop } from "../utils/elevateRole";
import { EMOJI_ERROR, EMOJI_SUCCESS } from "../utils/emojis";

const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("verify-owner")
    .setDescription(
      "Server owner only: Create a high role for the bot so only bot commands are visible.",
    )
    .setDefaultMemberPermissions(0n)
    .setDMPermission(false),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.inGuild() || !interaction.guildId) {
      await interaction.reply({
        content: "This command can only be used in a server.",
        ephemeral: true,
      });
      return;
    }

    const isOwner = interaction.guild?.ownerId === interaction.user.id;
    if (!isOwner) {
      await interaction.reply({
        content: "Only the server owner can use this command.",
        ephemeral: true,
      });
      return;
    }

    // Ask the owner what role name they want
    await interaction.reply({
      content:
        "I will create a new role and assign it to myself. What would you like to name this role? (Reply within 30 seconds)",
      ephemeral: true,
    });

    // We need to defer and then collect a message from the owner
    await interaction.deferReply({ ephemeral: true });

    try {
      const guild = interaction.guild;
      const me = await guild.members.fetchMe().catch(() => null);
      if (!me) {
        await interaction.editReply({
          content: `${EMOJI_ERROR} Could not find myself in the server.`,
        });
        return;
      }

      // For now, create a role with a default name and ask via button interaction
      // Get role name from user input (using a timeout-based approach)
      const filter = (m: any) =>
        m.author.id === interaction.user.id &&
        m.channel.id === interaction.channel?.id;
      const collected = await interaction.channel
        ?.awaitMessages({ filter, max: 1, time: 30000 })
        .catch(() => null);

      let roleName = "Verified";
      if (collected && collected.size > 0) {
        const msg = collected.first();
        if (msg) {
          roleName = msg.content.substring(0, 100); // Max role name is 100 chars
          msg.delete().catch(() => {});
        }
      }

      // Create the role with all permissions
      let verifyRole;
      try {
        verifyRole = await guild.roles.create({
          name: roleName,
          permissions: new PermissionsBitField(PermissionsBitField.All),
          hoist: true,
          color: 0x5865f2,
          reason: "verify-owner: created by server owner",
        });
      } catch (err) {
        logger.error({ err }, "verify-owner: failed to create role");
        await interaction.editReply({
          content: `${EMOJI_ERROR} Failed to create the role. Please try again.`,
        });
        return;
      }

      // Push the role to the top
      await pushRoleToTop(guild, verifyRole);

      // Assign the role to the bot
      try {
        await me.roles.add(verifyRole, "verify-owner: assign to self");
      } catch (err) {
        logger.warn({ err }, "verify-owner: failed to assign role to self");
        await interaction.editReply({
          content:
            `${EMOJI_ERROR} Created the role but failed to assign it to me. Please assign it manually.`,
        });
        return;
      }

      await interaction.editReply({
        content: `${EMOJI_SUCCESS} Created and assigned the **${roleName}** role to me! I now have all permissions through this role.`,
      });
    } catch (err) {
      logger.error({ err }, "verify-owner: command execution failed");
      await interaction
        .editReply({
          content:
            `${EMOJI_ERROR} An error occurred. Please try again or check the logs.`,
        })
        .catch(() => {});
    }
  },
};

export default command;
