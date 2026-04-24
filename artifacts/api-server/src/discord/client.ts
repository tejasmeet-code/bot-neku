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

function buildClient(intents: GatewayIntentBits[]): Client {
  const options: ClientOptions = { intents };
  const client = new Client(options);
  const commandMap = getCommandMap();

  client.once(Events.ClientReady, (c) => {
    logger.info({ tag: c.user.tag }, "Discord bot ready");
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
    try {
      await command.execute(interaction);
    } catch (err) {
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
    }
  });

  client.on(Events.MessageCreate, (message) => {
    handlePrefixMessage(message).catch((err) => {
      logger.error({ err }, "Prefix message handler failed");
    });
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
