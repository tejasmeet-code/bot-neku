import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
  type GuildMember,
  type Collection,
} from "discord.js";
import type { SlashCommand } from "../types";

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
    if (!interaction.inGuild() || !interaction.guild) {
      await interaction.reply({
        content: "This command can only be used in a server.",
        ephemeral: true,
      });
      return;
    }

    const message = interaction.options.getString("message", true);
    const target = interaction.options.getMentionable("target");
    const everyone = interaction.options.getBoolean("everyone") ?? false;

    if (!target && !everyone) {
      await interaction.reply({
        content:
          "Pick a target — either a user/role with `target`, or set `everyone:true`.",
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    const guild = interaction.guild;
    const signature = `\n\n— sent by ${interaction.user.tag} from **${guild.name}**`;
    const payload = `${message}${signature}`;

    let members: Collection<string, GuildMember>;
    let label: string;

    try {
      if (everyone || (target && "id" in target && target.id === guild.id)) {
        // @everyone or `everyone:true`
        members = await guild.members.fetch();
        label = "everyone";
      } else if (target && "user" in target) {
        // Single user (GuildMember)
        const single = target as GuildMember;
        members = new Map([[single.id, single]]) as unknown as Collection<
          string,
          GuildMember
        >;
        label = single.user.tag;
      } else if (target && "members" in target) {
        // Role — fetch the full member list, then filter to role holders.
        await guild.members.fetch();
        const role = target;
        members = role.members;
        label = `role @${role.name}`;
      } else {
        await interaction.editReply(
          "Couldn't understand that target. Try a user, a role, or set `everyone:true`.",
        );
        return;
      }
    } catch (err) {
      const msg =
        err instanceof Error && /intent/i.test(err.message)
          ? "I couldn't load the member list. Enable the **Server Members Intent** for the bot in the Discord Developer Portal, then try again."
          : "Couldn't load the member list for this server.";
      await interaction.editReply(msg);
      return;
    }

    const recipients = members.filter((m) => !m.user.bot);
    if (recipients.size === 0) {
      await interaction.editReply("No human recipients matched that target.");
      return;
    }

    if (recipients.size > 50) {
      await interaction.editReply(
        `This would DM **${recipients.size}** members. To prevent abuse, mass-DM is capped at 50 recipients per command. Narrow the target to a smaller role.`,
      );
      return;
    }

    let sent = 0;
    let failed = 0;
    for (const member of recipients.values()) {
      try {
        await member.send(payload);
        sent++;
      } catch {
        failed++;
      }
    }

    await interaction.editReply(
      `📬 Sent to **${sent}** member${sent === 1 ? "" : "s"} (${label}). ${failed > 0 ? `Failed for **${failed}** (DMs closed or blocked).` : ""}`.trim(),
    );
  },
};

export default command;
