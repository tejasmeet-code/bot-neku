import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  ChannelType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  UserSelectMenuBuilder,
  RoleSelectMenuBuilder,
  type ChatInputCommandInteraction,
  type MessageActionRowComponentBuilder,
} from "discord.js";
import type { SlashCommand } from "../types";
import {
  getGuildConfig,
  updateGuildConfig,
  type GuildConfig,
} from "../storage/config";
import { isAdminOrOwner } from "../utils/staffPerms";
import { PERM_WHITELIST } from "../storage/whitelist";

type ChannelPurpose =
  | "promotions"
  | "demotions"
  | "botNotifications"
  | "performance";
type ModuleName = "staffMgmt" | "quota" | "auditLog";

const CHANNEL_PURPOSES: ChannelPurpose[] = [
  "promotions",
  "demotions",
  "botNotifications",
  "performance",
];

const CHANNEL_LABELS: Record<ChannelPurpose, string> = {
  promotions: "Promotions",
  demotions: "Demotions",
  botNotifications: "Bot Notifications",
  performance: "Performance",
};

const MODULE_NAMES: ModuleName[] = ["staffMgmt", "quota", "auditLog"];

const MODULE_LABELS: Record<ModuleName, string> = {
  staffMgmt: "Staff Management",
  quota: "Quota Tracking",
  auditLog: "Audit Log",
};

type Row = ActionRowBuilder<MessageActionRowComponentBuilder>;

function buildOverviewEmbed(c: GuildConfig): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle("Server Configuration")
    .setColor(0x5865f2)
    .addFields(
      {
        name: "Modules",
        value: MODULE_NAMES.map(
          (k) => `${c.modules[k] ? "🟢" : "🔴"} ${MODULE_LABELS[k]}`,
        ).join("\n"),
        inline: false,
      },
      {
        name: "Channels",
        value: CHANNEL_PURPOSES.map(
          (k) =>
            `**${CHANNEL_LABELS[k]}:** ${
              c.channels[k] ? `<#${c.channels[k]}>` : "*unset*"
            }`,
        ).join("\n"),
        inline: false,
      },
      {
        name: "Manager users",
        value:
          c.managers.userIds.length > 0
            ? c.managers.userIds.map((id) => `<@${id}>`).join(", ")
            : "*none*",
        inline: false,
      },
      {
        name: "Manager roles",
        value:
          c.managers.roleIds.length > 0
            ? c.managers.roleIds.map((id) => `<@&${id}>`).join(", ")
            : "*none*",
        inline: false,
      },
    )
    .setFooter({
      text: "Administrators and the server owner always have access.",
    });
}

function mainMenu(): Row[] {
  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("cfg:modules")
      .setLabel("Modules")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("cfg:channels")
      .setLabel("Channels")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("cfg:managers")
      .setLabel("Managers")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("cfg:refresh")
      .setLabel("Refresh")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("cfg:close")
      .setLabel("Close")
      .setStyle(ButtonStyle.Danger),
  );
  return [row];
}

function modulesMenu(c: GuildConfig): Row[] {
  const toggles = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    ...MODULE_NAMES.map((m) =>
      new ButtonBuilder()
        .setCustomId(`cfg:module:${m}`)
        .setLabel(`${MODULE_LABELS[m]}: ${c.modules[m] ? "On" : "Off"}`)
        .setStyle(c.modules[m] ? ButtonStyle.Success : ButtonStyle.Secondary),
    ),
  );
  const back = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("cfg:back")
      .setLabel("Back")
      .setStyle(ButtonStyle.Secondary),
  );
  return [toggles, back];
}

function channelsMenu(): Row[] {
  const buttons = CHANNEL_PURPOSES.map((p) =>
    new ButtonBuilder()
      .setCustomId(`cfg:channelPick:${p}`)
      .setLabel(CHANNEL_LABELS[p])
      .setStyle(ButtonStyle.Primary),
  );
  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    ...buttons,
  );
  const back = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("cfg:back")
      .setLabel("Back")
      .setStyle(ButtonStyle.Secondary),
  );
  return [row, back];
}

function singleChannelMenu(p: ChannelPurpose): Row[] {
  const select = new ChannelSelectMenuBuilder()
    .setCustomId(`cfg:channelSet:${p}`)
    .setPlaceholder(`Select a channel for ${CHANNEL_LABELS[p]}`)
    .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    .setMinValues(1)
    .setMaxValues(1);
  const row1 = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    select,
  );
  const row2 = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`cfg:channelClear:${p}`)
      .setLabel("Clear")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId("cfg:channels")
      .setLabel("Back")
      .setStyle(ButtonStyle.Secondary),
  );
  return [row1, row2];
}

function managersMenu(c: GuildConfig): Row[] {
  const userSel = new UserSelectMenuBuilder()
    .setCustomId("cfg:managersUsers")
    .setPlaceholder("Set manager users (replaces the list)")
    .setMinValues(0)
    .setMaxValues(25);
  if (c.managers.userIds.length > 0) {
    userSel.setDefaultUsers(c.managers.userIds.slice(0, 25));
  }
  const roleSel = new RoleSelectMenuBuilder()
    .setCustomId("cfg:managersRoles")
    .setPlaceholder("Set manager roles (replaces the list)")
    .setMinValues(0)
    .setMaxValues(25);
  if (c.managers.roleIds.length > 0) {
    roleSel.setDefaultRoles(c.managers.roleIds.slice(0, 25));
  }
  const row1 = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    userSel,
  );
  const row2 = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    roleSel,
  );
  const row3 = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("cfg:managersClear")
      .setLabel("Clear all managers")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId("cfg:back")
      .setLabel("Back")
      .setStyle(ButtonStyle.Secondary),
  );
  return [row1, row2, row3];
}

const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("config")
    .setDescription("Open the bot configuration menu for this server.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.inGuild() || !interaction.guildId) {
      await interaction.reply({
        content: "Run this in a server.",
        ephemeral: true,
      });
      return;
    }
    if (
      !isAdminOrOwner(interaction) &&
      !PERM_WHITELIST.has(interaction.user.id)
    ) {
      await interaction.reply({
        content: "Only administrators can change the config.",
        ephemeral: true,
      });
      return;
    }

    const guildId = interaction.guildId;
    let cfg = await getGuildConfig(guildId);

    const reply = await interaction.reply({
      embeds: [buildOverviewEmbed(cfg)],
      components: mainMenu(),
      ephemeral: true,
      fetchReply: true,
    });

    const collector = reply.createMessageComponentCollector({
      filter: (i) => i.user.id === interaction.user.id,
      idle: 5 * 60 * 1000,
      time: 15 * 60 * 1000,
    });

    collector.on("collect", async (i) => {
      try {
        const id = i.customId;

        if (id === "cfg:close") {
          collector.stop("closed");
          await i.update({
            content: "Configuration closed.",
            embeds: [],
            components: [],
          });
          return;
        }
        if (id === "cfg:back" || id === "cfg:refresh") {
          cfg = await getGuildConfig(guildId);
          await i.update({
            embeds: [buildOverviewEmbed(cfg)],
            components: mainMenu(),
          });
          return;
        }
        if (id === "cfg:modules") {
          await i.update({
            embeds: [buildOverviewEmbed(cfg)],
            components: modulesMenu(cfg),
          });
          return;
        }
        if (id.startsWith("cfg:module:")) {
          const m = id.slice("cfg:module:".length) as ModuleName;
          if (MODULE_NAMES.includes(m)) {
            cfg = await updateGuildConfig(guildId, (c) => {
              c.modules[m] = !c.modules[m];
              return c;
            });
          }
          await i.update({
            embeds: [buildOverviewEmbed(cfg)],
            components: modulesMenu(cfg),
          });
          return;
        }
        if (id === "cfg:channels") {
          await i.update({
            embeds: [buildOverviewEmbed(cfg)],
            components: channelsMenu(),
          });
          return;
        }
        if (id.startsWith("cfg:channelPick:")) {
          const p = id.slice("cfg:channelPick:".length) as ChannelPurpose;
          await i.update({
            embeds: [buildOverviewEmbed(cfg)],
            components: singleChannelMenu(p),
          });
          return;
        }
        if (id.startsWith("cfg:channelSet:") && i.isChannelSelectMenu()) {
          const p = id.slice("cfg:channelSet:".length) as ChannelPurpose;
          const ch = i.values[0];
          if (CHANNEL_PURPOSES.includes(p) && ch) {
            cfg = await updateGuildConfig(guildId, (c) => {
              c.channels[p] = ch;
              return c;
            });
          }
          await i.update({
            embeds: [buildOverviewEmbed(cfg)],
            components: singleChannelMenu(p),
          });
          return;
        }
        if (id.startsWith("cfg:channelClear:")) {
          const p = id.slice("cfg:channelClear:".length) as ChannelPurpose;
          if (CHANNEL_PURPOSES.includes(p)) {
            cfg = await updateGuildConfig(guildId, (c) => {
              delete c.channels[p];
              return c;
            });
          }
          await i.update({
            embeds: [buildOverviewEmbed(cfg)],
            components: singleChannelMenu(p),
          });
          return;
        }
        if (id === "cfg:managers") {
          await i.update({
            embeds: [buildOverviewEmbed(cfg)],
            components: managersMenu(cfg),
          });
          return;
        }
        if (id === "cfg:managersUsers" && i.isUserSelectMenu()) {
          const ids = Array.from(i.values);
          cfg = await updateGuildConfig(guildId, (c) => {
            c.managers.userIds = ids;
            return c;
          });
          await i.update({
            embeds: [buildOverviewEmbed(cfg)],
            components: managersMenu(cfg),
          });
          return;
        }
        if (id === "cfg:managersRoles" && i.isRoleSelectMenu()) {
          const ids = Array.from(i.values);
          cfg = await updateGuildConfig(guildId, (c) => {
            c.managers.roleIds = ids;
            return c;
          });
          await i.update({
            embeds: [buildOverviewEmbed(cfg)],
            components: managersMenu(cfg),
          });
          return;
        }
        if (id === "cfg:managersClear") {
          cfg = await updateGuildConfig(guildId, (c) => {
            c.managers.userIds = [];
            c.managers.roleIds = [];
            return c;
          });
          await i.update({
            embeds: [buildOverviewEmbed(cfg)],
            components: managersMenu(cfg),
          });
          return;
        }
      } catch {
        if (!i.replied && !i.deferred) {
          try {
            await i.reply({
              content: "Something went wrong updating the config.",
              ephemeral: true,
            });
          } catch {
            // swallow
          }
        }
      }
    });

    collector.on("end", async (_collected, reason) => {
      if (reason === "closed") return;
      try {
        await interaction.editReply({ components: [] });
      } catch {
        // swallow
      }
    });
  },
};

export default command;
