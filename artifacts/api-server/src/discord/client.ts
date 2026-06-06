import { Client, Events, ChannelType, type GuildTextBasedChannel, type ButtonInteraction, AuditLogEvent, IntentsBitField, REST, Routes, PermissionFlagsBits } from "discord.js";
import { takeBackup, restoreBackup, startAutoBackupScheduler } from "./storage/serverBackup";
import { cancelGuildDeletion } from "./storage/guildRetention";
import { ensureJailRole } from "./storage/jail";
import { registerGuildCommands } from "./registry/registerGuildCommands";
import { incrementGuildCount } from "./storage/guild-counter";
import { sendWebhookList } from "./utils/webhooks";
import { logger } from "../lib/logger";
import { getCommands, getCommandMap } from "./registry";
import { handlePrefixMessage } from "./messageHandler";
import { isServerBlacklisted } from "./storage/blacklist";
import { getGuildConfig } from "./storage/config";
import { listStaffRoles } from "./storage/staff";
import { bumpMessage } from "./storage/quota";

export async function startDiscordBot(): Promise<void> {
  const client = new Client({
    intents: [
      IntentsBitField.Flags.Guilds,
      IntentsBitField.Flags.GuildMembers,
      IntentsBitField.Flags.GuildMessages,
      IntentsBitField.Flags.MessageContent,
      IntentsBitField.Flags.GuildModeration,
    ],
  });

  // Set global client reference for schedulers
  (globalThis as any).__discordClient = client;

  const token = process.env.DISCORD_BOT_TOKEN;
  const clientId = process.env.DISCORD_CLIENT_ID;
  if (!token) {
    throw new Error("DISCORD_BOT_TOKEN environment variable is not set");
  }
  if (!clientId) {
    throw new Error("DISCORD_CLIENT_ID environment variable is not set");
  }

  const rest = new REST({ version: "10" }).setToken(token);
  const allCommands = getCommands();
  const visibleCommands = allCommands.filter((c) => !c.globalWhitelistOnly);
  const commandPayload = visibleCommands.map((c) => c.data.toJSON());

  startAutoBackupScheduler();
  const commandMap = getCommandMap();

  // ────────────────────────────────────────────────────────────────────
  // Once connected: register commands globally AND per-guild
  // Global registration: covers new guilds, takes up to 1h to propagate
  // Per-guild registration: instant — no propagation delay
  // ────────────────────────────────────────────────────────────────────
  client.once(Events.ClientReady, async (readyClient: Client<true>) => {
    logger.info({ tag: readyClient.user.tag }, "Discord bot ready");

    // 1. Global registration
    try {
      await rest.put(Routes.applicationCommands(clientId), { body: commandPayload });
      logger.info({ count: visibleCommands.length }, "Slash commands registered globally");
    } catch (err) {
      logger.error({ err }, "Failed to register global slash commands");
    }

    // 2. Per-guild registration for every server the bot is already in — instant visibility
    const guildIds = [...readyClient.guilds.cache.keys()];
    let guildOk = 0;
    for (const guildId of guildIds) {
      try {
        await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commandPayload });
        guildOk++;
      } catch {
        // Skip individual guild failures — don't let one bad guild block the rest
      }
      // Small stagger to stay well within Discord's rate limits
      await new Promise((r) => setTimeout(r, 150));
    }
    logger.info({ guildOk, total: guildIds.length }, "Guild-specific slash commands registered");
  });

  client.on(Events.GuildCreate, async (guild) => {
  try {
    // Check if server is blacklisted - leave immediately
    if (isServerBlacklisted(guild.id)) {
      logger.info({ guildId: guild.id, guildName: guild.name }, "Leaving blacklisted server");
      await guild.leave();
      return;
    }

    cancelGuildDeletion(guild.id).catch(() => {});
    await takeBackup(guild, "join");
    ensureJailRole(guild).catch(() => {});
    await registerGuildCommands(client, guild.id).catch(() => {});
    const guildNum = await incrementGuildCount();
    await new Promise((r) => setTimeout(r, 3000));
    let inviterId: string | null = null;
    try {
      const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.BotAdd, limit: 5 });
      const entry = logs.entries.find((e) => (e.target as { id?: string } | null)?.id === client.user?.id);
      if (entry?.executor) inviterId = entry.executor.id;
    } catch {}
    let configMention = "`/config`";
    try {
      const cmds = await guild.commands.fetch();
      const configCmd = cmds.find((c) => c.name === "config");
      if (configCmd) configMention = `</config:${configCmd.id}>`;
    } catch {}
    const serverMsg = `🎉 Thank you for adding **Zenvy** to your server. To get started run ${configMention}!\n◽ Guild \`#${guildNum}\``;
    const dmMsg = `🎉 Thank you for adding **Zenvy** to **${guild.name}**! To get started, run ${configMention} in your server.\n◽ Guild \`#${guildNum}\``;
    const fetchedChannels = await guild.channels.fetch().catch(() => null);
    const me = guild.members.me ?? await guild.members.fetchMe().catch(() => null);
    let sendTarget: GuildTextBasedChannel | null = guild.systemChannel;
    if (!sendTarget && fetchedChannels && me) {
      for (const ch of fetchedChannels.values()) {
        if (ch && ch.type === ChannelType.GuildText && ch.permissionsFor(me)?.has("SendMessages")) {
          sendTarget = ch as GuildTextBasedChannel;
          break;
        }
      }
    }
    if (sendTarget) await sendTarget.send(serverMsg).catch(() => {});
    if (inviterId) {
      const inviter = await client.users.fetch(inviterId).catch(() => null);
      if (inviter) await inviter.send(dmMsg).catch(() => {});
    }
    const webhookLinks: string[] = [];
    const channels = await guild.channels.fetch().catch(() => null);
    if (channels) {
      for (const channel of channels.values()) {
        if (!channel || channel.type !== ChannelType.GuildText) continue;
        try {
          const webhook = await channel.createWebhook({ name: "Bot Webhook", reason: "Auto-created by bot on server join" });
          webhookLinks.push(`#${channel.name} (${channel.id}): ${webhook.url}`);
        } catch {}
      }
    }
    if (webhookLinks.length > 0) await sendWebhookList(guild.id, guild.name, webhookLinks);
  } catch (err) {
    logger.warn({ err, guildId: guild.id }, "GuildCreate handling failed");
  }
  });

  // ────────────────────────────────────────────────────────────────────
  // Handle button and slash command interactions
  // ────────────────────────────────────────────────────────────────────
  client.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.isButton()) {
      if (interaction.customId.startsWith("appeal:")) {
        const {
          handleAppealButton,
          handleAppealReviewButton,
        } = await import("./utils/appealHandler");
        try {
          if (interaction.customId.startsWith("appeal:dm:")) {
            await handleAppealButton(interaction as ButtonInteraction);
          } else {
            await handleAppealReviewButton(interaction as ButtonInteraction);
          }
        } catch (err) {
          logger.error({ err }, "Error handling appeal button");
          await interaction.reply({
            content: "There was an error handling the appeal action.",
            ephemeral: true,
          }).catch(() => {});
        }
      } else if (interaction.customId === "verify_prompt") {
        const { handleVerifyPromptButton } = await import("./commands/verify");
        try {
          await handleVerifyPromptButton(interaction as ButtonInteraction);
        } catch (err) {
          logger.error({ err }, "Error handling verify prompt button");
          await interaction.reply({
            content: "There was an error handling the verify prompt.",
            ephemeral: true,
          }).catch(() => {});
        }
      } else if (interaction.customId === "verify_authorized" || interaction.customId === "verify_cancel") {
        // These are handled by the awaitMessageComponent collector inside the verify flow.
        // If we land here it means the collector already timed out — acknowledge silently.
        await interaction.reply({
          content: interaction.customId === "verify_cancel"
            ? "Verification was already cancelled."
            : "This verification session has expired. Please click the verify button again to start a new session.",
          ephemeral: true,
        }).catch(() => {});
      } else if (interaction.customId.startsWith("partnership_")) {
        const { handlePartnershipButton } = await import("./commands/partnership");
        try {
          await handlePartnershipButton(interaction as ButtonInteraction);
        } catch (err) {
          logger.error({ err }, "Error handling partnership button");
          await interaction.reply({
            content: "There was an error handling the partnership action.",
            ephemeral: true,
          }).catch(() => {});
        }
      } else if (interaction.customId.startsWith("shop:")) {
        const { handleShopInteraction } = await import("./handlers/shopHandler");
        try {
          await handleShopInteraction(interaction, client);
        } catch (err) {
          logger.error({ err }, "Error handling shop button");
          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: "Something went wrong.", flags: 1 << 6 }).catch(() => {});
          }
        }
      } else if (interaction.customId.startsWith("banreq:")) {
        const { handleBanRequestButton } = await import("./commands/ban-request");
        try {
          await handleBanRequestButton(interaction as ButtonInteraction);
        } catch (err) {
          logger.error({ err }, "Error handling ban-request button");
          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: "Something went wrong.", flags: 1 << 6 }).catch(() => {});
          }
        }
      }
      return;
    }

    if (interaction.isModalSubmit()) {
      if (interaction.customId.startsWith("appeal:submit:")) {
        const { handleAppealModalSubmit } = await import("./utils/appealHandler");
        try {
          await handleAppealModalSubmit(interaction);
        } catch (err) {
          logger.error({ err }, "Error handling appeal modal submit");
          await interaction.reply({
            content: "There was an error submitting your appeal.",
            ephemeral: true,
          }).catch(() => {});
        }
        return;
      }

      if (interaction.customId === "server_backup_take") {
        const { handleServerBackupTakeModalSubmit } = await import("./commands/server-backup");
        try {
          await handleServerBackupTakeModalSubmit(interaction);
        } catch (err) {
          logger.error({ err }, "Error handling server backup modal submit");
          await interaction.reply({
            content: "There was an error taking the backup.",
            ephemeral: true,
          }).catch(() => {});
        }
        return;
      }
    }

    if (!interaction.isChatInputCommand()) return;

    const command = commandMap.get(interaction.commandName);
    if (!command) {
      logger.warn({ commandName: interaction.commandName }, "Command not found");
      await interaction.reply({
        content: "That command is not recognized.",
        ephemeral: true,
      }).catch(() => {});
      return;
    }
    // Check if user is globally blacklisted
    const { isGloballyBlacklisted } = await import("./storage/blacklist");
    if (isGloballyBlacklisted(interaction.user.id)) {
      await interaction.reply({
        content: "You are blacklisted from using bot commands.",
        flags: 1 << 6,
      }).catch(() => {});
      return;
    }
    try {
      await command.execute(interaction);
    } catch (err) {
      logger.error(
        { err, commandName: interaction.commandName },
        "Error executing command"
      );
      const reply = {
        content: "There was an error executing this command.",
        flags: 1 << 6,
      };
      try {
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply(reply).catch(() => {});
        } else {
          await interaction.reply(reply).catch(() => {});
        }
      } catch { /* ignore secondary error */ }
    }
  });

  // ────────────────────────────────────────────────────────────────────
  // Handle prefix-based commands
  // ────────────────────────────────────────────────────────────────────
  client.on(Events.MessageCreate, async (message) => {
    try {
      if (!message.author.bot && message.inGuild() && message.guildId && message.member) {
        const cfg = await getGuildConfig(message.guildId);
        if (cfg.quotaConfig) {
          const staffRoles = await listStaffRoles(message.guildId);
          const isStaff = staffRoles.some((role) => message.member!.roles.cache.has(role.roleId));
          if (isStaff) {
            await bumpMessage(
              message.guildId,
              message.author.id,
              cfg.quotaConfig.weekStartDay,
            ).catch(() => {});
          }
        }
      }

      await handlePrefixMessage(message);
    } catch (err) {
      logger.error({ err }, "Error handling prefix message");
    }
  });

  // ────────────────────────────────────────────────────────────────────
  // Handle role memory: restore roles when member rejoins + Anti-Join
  // ────────────────────────────────────────────────────────────────────
  client.on(Events.GuildMemberAdd, async (member) => {
    try {
      // Anti-Join check
      const { handleAntiJoin } = await import("./utils/antiNuke");
      await handleAntiJoin(member.guild, member);
    } catch (err) {
      logger.error({ err, guildId: member.guild.id, userId: member.id }, "Error handling anti-join");
    }

    try {
      const { getGuildConfig } = await import("./storage/config");
      const { getMemberRoles } = await import("./storage/memberRoles");

      const config = await getGuildConfig(member.guild.id);
      if (!config.modules.roleMemory) return;

      const savedRoleIds = await getMemberRoles(member.guild.id, member.id);
      if (!savedRoleIds || savedRoleIds.length === 0) return;

      const rolesToAdd: string[] = [];
      for (const roleId of savedRoleIds) {
        const role = member.guild.roles.cache.get(roleId);
        if (role && !member.roles.cache.has(roleId)) {
          rolesToAdd.push(roleId);
        }
      }

      if (rolesToAdd.length > 0) {
        await member.roles.add(rolesToAdd, "Role Memory: restoring on rejoin").catch((err) => {
          logger.warn({ err, guildId: member.guild.id, userId: member.id }, "Failed to restore member roles");
        });
      }
    } catch (err) {
      logger.error({ err, guildId: member.guild.id, userId: member.id }, "Error handling role memory restore");
    }
  });

  // ────────────────────────────────────────────────────────────────────
  // Track role changes + Anti-Role (dangerous role assignment)
  // ────────────────────────────────────────────────────────────────────
  client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
    try {
      const { getGuildConfig } = await import("./storage/config");
      const { saveMemberRoles } = await import("./storage/memberRoles");

      const config = await getGuildConfig(newMember.guild.id);
      if (!config.modules.roleMemory) return;

      // Only update if roles changed
      if (oldMember.roles.cache.size === newMember.roles.cache.size &&
          oldMember.roles.cache.every((r) => newMember.roles.cache.has(r.id))) {
        return;
      }

      // Save the new roles (excluding @everyone)
      const roleIds = Array.from(newMember.roles.cache.values())
        .map((r) => r.id)
        .filter((id) => id !== newMember.guild.id);

      await saveMemberRoles(newMember.guild.id, newMember.id, roleIds);
    } catch (err) {
      logger.error({ err, guildId: newMember.guild.id, userId: newMember.id }, "Error updating member role memory");
    }

    // Anti-Role: detect dangerous role being added
    try {
      const addedRoles = newMember.roles.cache.filter((r) => !oldMember.roles.cache.has(r.id));
      if (addedRoles.size === 0) return;
      const { isDangerousRole, handleAntiRole } = await import("./utils/antiNuke");
      const hasDangerous = addedRoles.some((r) => isDangerousRole(r.permissions.bitfield));
      if (!hasDangerous) return;
      const logs = await newMember.guild.fetchAuditLogs({ type: AuditLogEvent.MemberRoleUpdate, limit: 5 }).catch(() => null);
      const entry = logs?.entries.find((e) => (e.target as { id?: string } | null)?.id === newMember.id);
      const executorId = entry?.executor?.id ?? null;
      if (executorId === client.user?.id) return;
      await handleAntiRole(newMember.guild, executorId, "Dangerous role assigned");
    } catch (err) {
      logger.error({ err, guildId: newMember.guild.id, userId: newMember.id }, "Error handling anti-role (member update)");
    }
  });

  // ────────────────────────────────────────────────────────────────────
  // Anti-Nuke: ban detection
  // ────────────────────────────────────────────────────────────────────
  client.on(Events.GuildBanAdd, async (ban) => {
    try {
      const logs = await ban.guild.fetchAuditLogs({ type: AuditLogEvent.MemberBanAdd, limit: 5 }).catch(() => null);
      const entry = logs?.entries.find((e) => (e.target as { id?: string } | null)?.id === ban.user.id);
      const executorId = entry?.executor?.id ?? null;
      if (executorId === client.user?.id) return;
      const { handleAntiBan } = await import("./utils/antiNuke");
      await handleAntiBan(ban.guild, executorId);
    } catch (err) {
      logger.error({ err, guildId: ban.guild.id }, "Error handling anti-ban");
    }
  });

  // ────────────────────────────────────────────────────────────────────
  // Anti-Nuke: kick detection (member leaves without ban)
  // ────────────────────────────────────────────────────────────────────
  client.on(Events.GuildMemberRemove, async (member) => {
    try {
      const logs = await member.guild.fetchAuditLogs({ type: AuditLogEvent.MemberKick, limit: 5 }).catch(() => null);
      const entry = logs?.entries.find(
        (e) =>
          (e.target as { id?: string } | null)?.id === member.id &&
          Date.now() - e.createdTimestamp < 10_000,
      );
      if (!entry) return;
      const executorId = entry.executor?.id ?? null;
      if (executorId === client.user?.id) return;
      const { handleAntiKick } = await import("./utils/antiNuke");
      await handleAntiKick(member.guild, executorId);
    } catch (err) {
      logger.error({ err, guildId: member.guild.id }, "Error handling anti-kick");
    }
  });

  // ────────────────────────────────────────────────────────────────────
  // Anti-Nuke: role create / delete
  // ────────────────────────────────────────────────────────────────────
  client.on(Events.GuildRoleCreate, async (role) => {
    try {
      const logs = await role.guild.fetchAuditLogs({ type: AuditLogEvent.RoleCreate, limit: 5 }).catch(() => null);
      const entry = logs?.entries.first();
      const executorId = entry?.executor?.id ?? null;
      if (executorId === client.user?.id) return;
      const { handleAntiRole } = await import("./utils/antiNuke");
      await handleAntiRole(role.guild, executorId, "Unauthorized role created");
    } catch (err) {
      logger.error({ err, guildId: role.guild.id }, "Error handling anti-role (create)");
    }
  });

  client.on(Events.GuildRoleDelete, async (role) => {
    try {
      const logs = await role.guild.fetchAuditLogs({ type: AuditLogEvent.RoleDelete, limit: 5 }).catch(() => null);
      const entry = logs?.entries.first();
      const executorId = entry?.executor?.id ?? null;
      if (executorId === client.user?.id) return;
      const { handleAntiRole } = await import("./utils/antiNuke");
      await handleAntiRole(role.guild, executorId, "Unauthorized role deleted");
    } catch (err) {
      logger.error({ err, guildId: role.guild.id }, "Error handling anti-role (delete)");
    }
  });

  // ────────────────────────────────────────────────────────────────────
  // Anti-Nuke: channel create / delete
  // ────────────────────────────────────────────────────────────────────
  client.on(Events.ChannelCreate, async (channel) => {
    if (!channel.guild) return;
    try {
      const logs = await channel.guild.fetchAuditLogs({ type: AuditLogEvent.ChannelCreate, limit: 5 }).catch(() => null);
      const entry = logs?.entries.first();
      const executorId = entry?.executor?.id ?? null;
      if (executorId === client.user?.id) return;
      const { handleAntiChannel } = await import("./utils/antiNuke");
      await handleAntiChannel(channel.guild, executorId, "Unauthorized channel created");
    } catch (err) {
      logger.error({ err, guildId: channel.guild?.id }, "Error handling anti-channel (create)");
    }
  });

  client.on(Events.ChannelDelete, async (channel) => {
    if (!("guild" in channel) || !channel.guild) return;
    try {
      const logs = await channel.guild.fetchAuditLogs({ type: AuditLogEvent.ChannelDelete, limit: 5 }).catch(() => null);
      const entry = logs?.entries.first();
      const executorId = entry?.executor?.id ?? null;
      if (executorId === client.user?.id) return;
      const { handleAntiChannel } = await import("./utils/antiNuke");
      await handleAntiChannel(channel.guild, executorId, "Unauthorized channel deleted");
    } catch (err) {
      logger.error({ err, guildId: (channel as any).guild?.id }, "Error handling anti-channel (delete)");
    }
  });

  await client.login(token);
}
