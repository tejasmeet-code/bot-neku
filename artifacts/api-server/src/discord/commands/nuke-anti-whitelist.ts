import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { SlashCommand } from "../types";
import { PERM_WHITELIST } from "../storage/whitelist";
import {
  addServerToAntiWhitelist,
  removeServerFromAntiWhitelist,
  listAntiWhitelistedServers,
} from "../storage/nuke-anti-whitelist";

const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("nuke-anti-whitelist")
    .setDescription("Manage servers protected from nuke command")
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription("Add a server to the nuke anti-whitelist")
        .addStringOption((option) =>
          option
            .setName("server-id")
            .setDescription("The server ID to protect from nuke")
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Remove a server from the nuke anti-whitelist")
        .addStringOption((option) =>
          option
            .setName("server-id")
            .setDescription("The server ID to unprotect")
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("list")
        .setDescription("List all servers in the nuke anti-whitelist"),
    )
    .setDMPermission(false),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!PERM_WHITELIST.has(interaction.user.id)) {
      await interaction.reply({
        content: "You aren't allowed to use this command.",
        ephemeral: true,
      });
      return;
    }

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "add") {
      const serverId = interaction.options.getString("server-id", true);

      if (!/^\d+$/.test(serverId)) {
        await interaction.reply({
          content: "Invalid server ID format.",
          ephemeral: true,
        });
        return;
      }

      const added = await addServerToAntiWhitelist(serverId);

      if (!added) {
        await interaction.reply({
          content: `Server **${serverId}** is already in the anti-whitelist.`,
          ephemeral: true,
        });
        return;
      }

      await interaction.reply({
        content: `✅ Server **${serverId}** added to nuke anti-whitelist. The nuke command will not work in this server.`,
        ephemeral: true,
      });
    } else if (subcommand === "remove") {
      const serverId = interaction.options.getString("server-id", true);

      if (!/^\d+$/.test(serverId)) {
        await interaction.reply({
          content: "Invalid server ID format.",
          ephemeral: true,
        });
        return;
      }

      const removed = await removeServerFromAntiWhitelist(serverId);

      if (!removed) {
        await interaction.reply({
          content: `Server **${serverId}** is not in the anti-whitelist.`,
          ephemeral: true,
        });
        return;
      }

      await interaction.reply({
        content: `✅ Server **${serverId}** removed from nuke anti-whitelist. The nuke command can now work in this server.`,
        ephemeral: true,
      });
    } else if (subcommand === "list") {
      const servers = await listAntiWhitelistedServers();

      if (servers.length === 0) {
        await interaction.reply({
          content: "The nuke anti-whitelist is empty.",
          ephemeral: true,
        });
        return;
      }

      const list = servers.map((id) => `• **${id}**`).join("\n");
      await interaction.reply({
        content: `📋 Servers in nuke anti-whitelist (${servers.length}):\n${list}`,
        ephemeral: true,
      });
    }
  },
};

export default command;
