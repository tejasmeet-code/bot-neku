import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  ChannelType,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { SlashCommand } from "../types";
import { getGuildConfig, updateGuildConfig } from "../storage/config";
import { isAdminOrOwner } from "../utils/staffPerms";
import { PERM_WHITELIST } from "../storage/whitelist";

const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("config")
    .setDescription("Configure the bot for this server.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addSubcommandGroup((g) =>
      g
        .setName("manager")
        .setDescription("Manage who can run staff-management commands.")
        .addSubcommand((s) =>
          s
            .setName("add-user")
            .setDescription("Add a user as a manager.")
            .addUserOption((o) =>
              o.setName("user").setDescription("User").setRequired(true),
            ),
        )
        .addSubcommand((s) =>
          s
            .setName("remove-user")
            .setDescription("Remove a user as a manager.")
            .addUserOption((o) =>
              o.setName("user").setDescription("User").setRequired(true),
            ),
        )
        .addSubcommand((s) =>
          s
            .setName("add-role")
            .setDescription("Add a role whose holders are managers.")
            .addRoleOption((o) =>
              o.setName("role").setDescription("Role").setRequired(true),
            ),
        )
        .addSubcommand((s) =>
          s
            .setName("remove-role")
            .setDescription("Remove a manager role.")
            .addRoleOption((o) =>
              o.setName("role").setDescription("Role").setRequired(true),
            ),
        ),
    )
    .addSubcommandGroup((g) =>
      g
        .setName("channel")
        .setDescription("Configure where the bot posts messages.")
        .addSubcommand((s) =>
          s
            .setName("set")
            .setDescription("Set a channel for a specific bot purpose.")
            .addStringOption((o) =>
              o
                .setName("purpose")
                .setDescription("Channel purpose")
                .setRequired(true)
                .addChoices(
                  { name: "Promotions", value: "promotions" },
                  { name: "Demotions", value: "demotions" },
                  { name: "Bot Notifications", value: "botNotifications" },
                  { name: "Performance", value: "performance" },
                ),
            )
            .addChannelOption((o) =>
              o
                .setName("channel")
                .setDescription("Channel")
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                .setRequired(true),
            ),
        )
        .addSubcommand((s) =>
          s
            .setName("clear")
            .setDescription("Clear a configured channel.")
            .addStringOption((o) =>
              o
                .setName("purpose")
                .setDescription("Channel purpose")
                .setRequired(true)
                .addChoices(
                  { name: "Promotions", value: "promotions" },
                  { name: "Demotions", value: "demotions" },
                  { name: "Bot Notifications", value: "botNotifications" },
                  { name: "Performance", value: "performance" },
                ),
            ),
        ),
    )
    .addSubcommandGroup((g) =>
      g
        .setName("module")
        .setDescription("Toggle bot modules.")
        .addSubcommand((s) =>
          s
            .setName("toggle")
            .setDescription("Enable or disable a module.")
            .addStringOption((o) =>
              o
                .setName("name")
                .setDescription("Module")
                .setRequired(true)
                .addChoices(
                  { name: "Staff Management", value: "staffMgmt" },
                  { name: "Quota Tracking", value: "quota" },
                  { name: "Audit Log", value: "auditLog" },
                ),
            )
            .addBooleanOption((o) =>
              o
                .setName("enabled")
                .setDescription("On or off")
                .setRequired(true),
            ),
        ),
    )
    .addSubcommandGroup((g) =>
      g
        .setName("quota")
        .setDescription("Configure weekly quota requirements.")
        .addSubcommand((s) =>
          s
            .setName("set")
            .setDescription("Set weekly quota minimums.")
            .addIntegerOption((o) =>
              o
                .setName("messages")
                .setDescription("Min messages per week")
                .setMinValue(0)
                .setRequired(true),
            )
            .addIntegerOption((o) =>
              o
                .setName("modactions")
                .setDescription("Min mod actions per week")
                .setMinValue(0)
                .setRequired(true),
            )
            .addIntegerOption((o) =>
              o
                .setName("week-start-day")
                .setDescription("0=Sun, 1=Mon, …, 6=Sat (default 0)")
                .setMinValue(0)
                .setMaxValue(6)
                .setRequired(false),
            ),
        ),
    )
    .addSubcommand((s) =>
      s.setName("view").setDescription("View this server's configuration."),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.inGuild() || !interaction.guildId) {
      await interaction.reply({
        content: "Run this in a server.",
        ephemeral: true,
      });
      return;
    }
    if (!isAdminOrOwner(interaction) && !PERM_WHITELIST.has(interaction.user.id)) {
      await interaction.reply({
        content: "Only administrators can change the config.",
        ephemeral: true,
      });
      return;
    }

    const guildId = interaction.guildId;
    const group = interaction.options.getSubcommandGroup(false);
    const sub = interaction.options.getSubcommand(false);

    if (group === "manager") {
      if (sub === "add-user") {
        const u = interaction.options.getUser("user", true);
        await updateGuildConfig(guildId, (c) => {
          if (!c.managers.userIds.includes(u.id)) c.managers.userIds.push(u.id);
          return c;
        });
        await interaction.reply(`✅ <@${u.id}> is now a manager.`);
        return;
      }
      if (sub === "remove-user") {
        const u = interaction.options.getUser("user", true);
        await updateGuildConfig(guildId, (c) => {
          c.managers.userIds = c.managers.userIds.filter((x) => x !== u.id);
          return c;
        });
        await interaction.reply(`🗑️ <@${u.id}> is no longer a manager.`);
        return;
      }
      if (sub === "add-role") {
        const r = interaction.options.getRole("role", true);
        await updateGuildConfig(guildId, (c) => {
          if (!c.managers.roleIds.includes(r.id)) c.managers.roleIds.push(r.id);
          return c;
        });
        await interaction.reply(`✅ Members of <@&${r.id}> are now managers.`);
        return;
      }
      if (sub === "remove-role") {
        const r = interaction.options.getRole("role", true);
        await updateGuildConfig(guildId, (c) => {
          c.managers.roleIds = c.managers.roleIds.filter((x) => x !== r.id);
          return c;
        });
        await interaction.reply(`🗑️ <@&${r.id}> is no longer a manager role.`);
        return;
      }
    }

    if (group === "channel") {
      if (sub === "set") {
        const purpose = interaction.options.getString("purpose", true) as
          | "promotions"
          | "demotions"
          | "botNotifications"
          | "performance";
        const ch = interaction.options.getChannel("channel", true);
        await updateGuildConfig(guildId, (c) => {
          c.channels[purpose] = ch.id;
          return c;
        });
        await interaction.reply(`✅ Set **${purpose}** channel to <#${ch.id}>.`);
        return;
      }
      if (sub === "clear") {
        const purpose = interaction.options.getString("purpose", true) as
          | "promotions"
          | "demotions"
          | "botNotifications"
          | "performance";
        await updateGuildConfig(guildId, (c) => {
          delete c.channels[purpose];
          return c;
        });
        await interaction.reply(`🗑️ Cleared **${purpose}** channel.`);
        return;
      }
    }

    if (group === "module") {
      if (sub === "toggle") {
        const name = interaction.options.getString("name", true) as
          | "staffMgmt"
          | "quota"
          | "auditLog";
        const enabled = interaction.options.getBoolean("enabled", true);
        await updateGuildConfig(guildId, (c) => {
          c.modules[name] = enabled;
          return c;
        });
        await interaction.reply(
          `✅ Module **${name}** is now ${enabled ? "enabled" : "disabled"}.`,
        );
        return;
      }
    }

    if (group === "quota") {
      if (sub === "set") {
        const messages = interaction.options.getInteger("messages", true);
        const modActions = interaction.options.getInteger("modactions", true);
        const weekStartDay =
          interaction.options.getInteger("week-start-day", false) ?? 0;
        await updateGuildConfig(guildId, (c) => {
          c.quotaConfig = { messages, modActions, weekStartDay };
          return c;
        });
        await interaction.reply(
          `✅ Quota set: **${messages}** messages and **${modActions}** mod actions per week (week starts day ${weekStartDay}).`,
        );
        return;
      }
    }

    if (sub === "view") {
      const c = await getGuildConfig(guildId);
      const embed = new EmbedBuilder()
        .setTitle("Server Configuration")
        .setColor(0x5865f2)
        .addFields(
          {
            name: "Managers (users)",
            value:
              c.managers.userIds.map((id) => `<@${id}>`).join(", ") || "*none*",
            inline: false,
          },
          {
            name: "Manager roles",
            value:
              c.managers.roleIds.map((id) => `<@&${id}>`).join(", ") || "*none*",
            inline: false,
          },
          {
            name: "Modules",
            value:
              `Staff Mgmt: ${c.modules.staffMgmt ? "✅" : "❌"}\n` +
              `Quota: ${c.modules.quota ? "✅" : "❌"}\n` +
              `Audit Log: ${c.modules.auditLog ? "✅" : "❌"}`,
            inline: true,
          },
          {
            name: "Channels",
            value:
              [
                `Promotions: ${c.channels.promotions ? `<#${c.channels.promotions}>` : "*unset*"}`,
                `Demotions: ${c.channels.demotions ? `<#${c.channels.demotions}>` : "*unset*"}`,
                `Bot notifications: ${c.channels.botNotifications ? `<#${c.channels.botNotifications}>` : "*unset*"}`,
                `Performance: ${c.channels.performance ? `<#${c.channels.performance}>` : "*unset*"}`,
              ].join("\n"),
            inline: true,
          },
          {
            name: "Quota",
            value: c.quotaConfig
              ? `Messages: **${c.quotaConfig.messages}** • Mod actions: **${c.quotaConfig.modActions}** • Week starts day **${c.quotaConfig.weekStartDay}**`
              : "*unset*",
            inline: false,
          },
        );
      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }
  },
};

export default command;
