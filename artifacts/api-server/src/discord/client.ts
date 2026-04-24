import {
  Client,
  Events,
  GatewayIntentBits,
  REST,
  Routes,
} from "discord.js";
import { logger } from "../lib/logger";
import { getCommandMap, getCommands } from "./registry";

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
  const commandMap = getCommandMap();

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

  const client = new Client({
    intents: [GatewayIntentBits.Guilds],
  });

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

  client.on(Events.Error, (err) => {
    logger.error({ err }, "Discord client error");
  });

  await client.login(token);
}
