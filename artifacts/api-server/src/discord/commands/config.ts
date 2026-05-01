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
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
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
import {
  addStaffRole,
  listStaffRoles,
  removeStaffRole,
} from "../storage/staff";

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
  const row1 = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
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
      .setCustomId("cfg:quota")
      .setLabel("Quota")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("cfg:staffRoles")
      .setLabel("Staff Roles")
      .setStyle(ButtonStyle.Primary),
  );
  const row2 = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("cfg:refresh")
      .setLabel("Refresh")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("cfg:close")
      .setLabel("Close")
      .setStyle(ButtonStyle.Danger),
  );
  return [row1, row2];
}

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function quotaMenu(c: GuildConfig): Row[] {
  const setBtn = new ButtonBuilder()
    .setCustomId("cfg:quotaSet")
    .setLabel(c.quotaConfig ? "Edit quota" : "Set quota")
    .setStyle(ButtonStyle.Primary);
  const dayBtn = new ButtonBuilder()
    .setCustomId("cfg:quotaDay")
    .setLabel("Week start day")
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(!c.quotaConfig);
  const clearBtn = new ButtonBuilder()
    .setCustomId("cfg:quotaClear")
    .setLabel("Clear quota")
    .setStyle(ButtonStyle.Danger)
    .setDisabled(!c.quotaConfig);
  const row1 = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    setBtn,
    dayBtn,
    clearBtn,
  );
  const back = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("cfg:back")
      .setLabel("Back")
      .setStyle(ButtonStyle.Secondary),
  );
  return [row1, back];
}

function buildQuotaEmbed(c: GuildConfig): EmbedBuilder {
  const e = new EmbedBuilder().setTitle("Quota Config").setColor(0x5865f2);
  if (c.quotaConfig) {
    e.setDescription(
      `**Messages / week:** ${c.quotaConfig.messages}\n` +
        `**Mod actions / week:** ${c.quotaConfig.modActions}\n` +
        `**Week starts on:** ${WEEKDAYS[c.quotaConfig.weekStartDay] ?? "Sunday"}`,
    );
  } else {
    e.setDescription("Quota is **not set**. Press *Set quota* to define weekly targets.");
  }
  return e;
}

function quotaModal(c: GuildConfig): ModalBuilder {
  const messages = new TextInputBuilder()
    .setCustomId("messages")
    .setLabel("Messages per week (number)")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setValue(String(c.quotaConfig?.messages ?? 50));
  const modActions = new TextInputBuilder()
    .setCustomId("modActions")
    .setLabel("Mod actions per week (number)")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setValue(String(c.quotaConfig?.modActions ?? 5));
  return new ModalBuilder()
    .setCustomId("cfg:quotaModal")
    .setTitle("Set weekly quota")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(messages),
      new ActionRowBuilder<TextInputBuilder>().addComponents(modActions),
    );
}

function weekStartMenu(c: GuildConfig): Row[] {
  const sel = new StringSelectMenuBuilder()
    .setCustomId("cfg:quotaDaySet")
    .setPlaceholder("Pick the day the week starts on")
    .addOptions(
      WEEKDAYS.map((day, i) => ({
        label: day,
        value: String(i),
        default: c.quotaConfig?.weekStartDay === i,
      })),
    );
  return [
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(sel),
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("cfg:quota")
        .setLabel("Back")
        .setStyle(ButtonStyle.Secondary),
    ),
  ];
}

async function staffRolesMenu(guildId: string): Promise<{
  embed: EmbedBuilder;
  rows: Row[];
}> {
  const roles = await listStaffRoles(guildId);
  const lines = roles
    .map((r) => `**${r.position}.** <@&${r.roleId}>`)
    .join("\n");
  const embed = new EmbedBuilder()
    .setTitle("Staff Roles")
    .setColor(0x5865f2)
    .setDescription(
      roles.length === 0
        ? "*No staff roles registered yet.* Use the picker below to add one."
        : lines,
    );

  const addSel = new RoleSelectMenuBuilder()
    .setCustomId("cfg:staffRoleAdd")
    .setPlaceholder("Add a staff role (appended at the bottom)")
    .setMinValues(1)
    .setMaxValues(1);
  const rmSel = new StringSelectMenuBuilder()
    .setCustomId("cfg:staffRoleRemove")
    .setPlaceholder("Remove a staff role")
    .setMinValues(1)
    .setMaxValues(1);
  if (roles.length > 0) {
    rmSel.addOptions(
      roles.slice(0, 25).map((r) => ({
        label: `Position #${r.position}`,
        value: r.roleId,
        description: r.roleId,
      })),
    );
  } else {
    rmSel.addOptions({ label: "(no roles)", value: "_noop", default: true });
    rmSel.setDisabled(true);
  }

  return {
    embed,
    rows: [
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(addSel),
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(rmSel),
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("cfg:back")
          .setLabel("Back")
          .setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
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

        // -------- Quota panel --------
        if (id === "cfg:quota") {
          await i.update({
            embeds: [buildQuotaEmbed(cfg)],
            components: quotaMenu(cfg),
          });
          return;
        }
        if (id === "cfg:quotaSet") {
          await i.showModal(quotaModal(cfg));
          try {
            const submit = await i.awaitModalSubmit({
              filter: (s) =>
                s.customId === "cfg:quotaModal" && s.user.id === i.user.id,
              time: 5 * 60 * 1000,
            });
            const messages = parseInt(
              submit.fields.getTextInputValue("messages"),
              10,
            );
            const modActions = parseInt(
              submit.fields.getTextInputValue("modActions"),
              10,
            );
            if (
              !Number.isFinite(messages) ||
              messages < 0 ||
              !Number.isFinite(modActions) ||
              modActions < 0
            ) {
              await submit.reply({
                content: "Both values must be non-negative integers.",
                ephemeral: true,
              });
              return;
            }
            cfg = await updateGuildConfig(guildId, (c) => {
              const day = c.quotaConfig?.weekStartDay ?? 0;
              c.quotaConfig = { messages, modActions, weekStartDay: day };
              return c;
            });
            if (submit.isFromMessage()) {
              await submit.update({
                embeds: [buildQuotaEmbed(cfg)],
                components: quotaMenu(cfg),
              });
            } else {
              await submit.reply({
                content: `Quota updated: **${messages}** msgs / **${modActions}** mod actions per week.`,
                ephemeral: true,
              });
            }
          } catch {
            // Timed out or dismissed; leave the panel as-is.
          }
          return;
        }
        if (id === "cfg:quotaClear") {
          cfg = await updateGuildConfig(guildId, (c) => {
            delete c.quotaConfig;
            return c;
          });
          await i.update({
            embeds: [buildQuotaEmbed(cfg)],
            components: quotaMenu(cfg),
          });
          return;
        }
        if (id === "cfg:quotaDay") {
          await i.update({
            embeds: [buildQuotaEmbed(cfg)],
            components: weekStartMenu(cfg),
          });
          return;
        }
        if (id === "cfg:quotaDaySet" && i.isStringSelectMenu()) {
          const day = Number(i.values[0]);
          if (Number.isFinite(day) && day >= 0 && day <= 6) {
            cfg = await updateGuildConfig(guildId, (c) => {
              if (!c.quotaConfig) {
                c.quotaConfig = { messages: 50, modActions: 5, weekStartDay: day };
              } else {
                c.quotaConfig.weekStartDay = day;
              }
              return c;
            });
          }
          await i.update({
            embeds: [buildQuotaEmbed(cfg)],
            components: quotaMenu(cfg),
          });
          return;
        }

        // -------- Staff Roles panel --------
        if (id === "cfg:staffRoles") {
          const view = await staffRolesMenu(guildId);
          await i.update({ embeds: [view.embed], components: view.rows });
          return;
        }
        if (id === "cfg:staffRoleAdd" && i.isRoleSelectMenu()) {
          const roleId = i.values[0];
          if (roleId) {
            await addStaffRole(guildId, roleId).catch(() => {});
          }
          const view = await staffRolesMenu(guildId);
          await i.update({ embeds: [view.embed], components: view.rows });
          return;
        }
        if (id === "cfg:staffRoleRemove" && i.isStringSelectMenu()) {
          const roleId = i.values[0];
          if (roleId && roleId !== "_noop") {
            await removeStaffRole(guildId, roleId).catch(() => {});
          }
          const view = await staffRolesMenu(guildId);
          await i.update({ embeds: [view.embed], components: view.rows });
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
