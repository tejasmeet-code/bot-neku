import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  ChannelType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  RoleSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  type ChatInputCommandInteraction,
  type MessageActionRowComponentBuilder,
  type Role,
} from "discord.js";
import type { SlashCommand } from "../types";
import {
  getGuildConfig,
  updateGuildConfig,
  type GuildConfig,
  type RoleQuota,
} from "../storage/config";
import { isAdminOrOwner } from "../utils/staffPerms";
import { PERM_WHITELIST } from "../storage/whitelist";
import {
  addStaffRole,
  listStaffRoles,
  removeStaffRole,
} from "../storage/staff";

type Row = ActionRowBuilder<MessageActionRowComponentBuilder>;

interface ModuleDef {
  id: string;
  label: string;
  emoji: string;
  moduleKey: keyof GuildConfig["modules"];
  channelKey: keyof GuildConfig["channels"] | null;
  description: string;
}

const MODULE_DEFS: ModuleDef[] = [
  {
    id: "moderation",
    label: "Moderation",
    emoji: "🔨",
    moduleKey: "moderation",
    channelKey: "moderation",
    description: "Ban, mute, jail, and warn actions.",
  },
  {
    id: "infractions",
    label: "Infractions",
    emoji: "⚠️",
    moduleKey: "infractions",
    channelKey: "infractions",
    description: "Strike/infraction log channel for warnings.",
  },
  {
    id: "promotions",
    label: "Promotions/Demotions",
    emoji: "📈",
    moduleKey: "staffMgmt",
    channelKey: "promotions",
    description: "Promotion and demotion announcements.",
  },
  {
    id: "appeals",
    label: "Appeals",
    emoji: "📋",
    moduleKey: "appeals",
    channelKey: "appeals",
    description: "Punishment appeal review channel.",
  },
  {
    id: "staff",
    label: "Staff",
    emoji: "👥",
    moduleKey: "staffMgmt",
    channelKey: null,
    description: "Manage staff roles and hierarchy.",
  },
  {
    id: "quota",
    label: "Quota",
    emoji: "📊",
    moduleKey: "quota",
    channelKey: null,
    description: "Weekly message and mod-action quota targets.",
  },
];

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function mainDropdownRow(): Row {
  const sel = new StringSelectMenuBuilder()
    .setCustomId("cfg:module:select")
    .setPlaceholder("Select a Module to Configure")
    .addOptions(
      MODULE_DEFS.map((m) => ({
        label: m.label,
        value: m.id,
        emoji: m.emoji,
        description: m.description,
      })),
    );
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(sel);
}

function closeRow(): Row {
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("cfg:close")
      .setLabel("Close")
      .setStyle(ButtonStyle.Danger),
  );
}

function backRow(): Row {
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("cfg:back")
      .setLabel("← Back")
      .setStyle(ButtonStyle.Secondary),
  );
}

function buildOverviewEmbed(cfg: GuildConfig): EmbedBuilder {
  const moduleLines = MODULE_DEFS.map((m) => {
    const on = cfg.modules[m.moduleKey];
    return `${on ? "🟢" : "🔴"} **${m.label}**`;
  });
  return new EmbedBuilder()
    .setTitle("⚙️ Server Configuration")
    .setColor(0x5865f2)
    .setDescription(
      "Use the dropdown below to configure a module.\n\n" + moduleLines.join("\n"),
    )
    .setFooter({ text: "Administrators always have access." });
}

function buildModuleEmbed(cfg: GuildConfig, mod: ModuleDef): EmbedBuilder {
  const enabled = cfg.modules[mod.moduleKey];
  const channel = mod.channelKey ? cfg.channels[mod.channelKey] : null;
  const roles = cfg.moduleRoles?.[mod.id] ?? [];

  const e = new EmbedBuilder()
    .setTitle(`${mod.emoji} ${mod.label}`)
    .setColor(enabled ? 0x57f287 : 0xed4245)
    .addFields(
      { name: "Status", value: enabled ? "🟢 Enabled" : "🔴 Disabled", inline: true },
    );

  if (mod.channelKey !== null) {
    e.addFields({
      name: "Channel",
      value: channel ? `<#${channel}>` : "*Not set*",
      inline: true,
    });
  }

  e.addFields({
    name: "Permitted Roles",
    value: roles.length > 0 ? roles.map((r) => `<@&${r}>`).join(", ") : "*All staff (none set)*",
    inline: false,
  });

  return e;
}

function moduleActionRows(cfg: GuildConfig, mod: ModuleDef): Row[] {
  const enabled = cfg.modules[mod.moduleKey];
  const rows: Row[] = [];

  const actionRow = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`cfg:mod:toggle:${mod.id}`)
      .setLabel(enabled ? "✅ Enabled — Click to Disable" : "❌ Disabled — Click to Enable")
      .setStyle(enabled ? ButtonStyle.Success : ButtonStyle.Danger),
  );

  if (mod.channelKey !== null) {
    actionRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`cfg:mod:setchannel:${mod.id}`)
        .setLabel("Set Channel")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("📌"),
    );
  }

  actionRow.addComponents(
    new ButtonBuilder()
      .setCustomId(`cfg:mod:setroles:${mod.id}`)
      .setLabel("Set Permissions")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("🔐"),
  );

  rows.push(actionRow);
  rows.push(backRow());
  return rows;
}

function channelPickRows(mod: ModuleDef): Row[] {
  const sel = new ChannelSelectMenuBuilder()
    .setCustomId(`cfg:mod:channelset:${mod.id}`)
    .setPlaceholder(`Pick the channel for ${mod.label}`)
    .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    .setMinValues(1)
    .setMaxValues(1);

  const clearRow = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`cfg:mod:channelclear:${mod.id}`)
      .setLabel("Clear Channel")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`cfg:mod:view:${mod.id}`)
      .setLabel("← Back")
      .setStyle(ButtonStyle.Secondary),
  );

  return [
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(sel),
    clearRow,
  ];
}

function rolePickRows(mod: ModuleDef): Row[] {
  const sel = new RoleSelectMenuBuilder()
    .setCustomId(`cfg:mod:roleset:${mod.id}`)
    .setPlaceholder(`Pick permitted roles for ${mod.label}`)
    .setMinValues(0)
    .setMaxValues(10);

  const clearRow = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`cfg:mod:roleclear:${mod.id}`)
      .setLabel("Clear Roles")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`cfg:mod:view:${mod.id}`)
      .setLabel("← Back")
      .setStyle(ButtonStyle.Secondary),
  );

  return [
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(sel),
    clearRow,
  ];
}

function buildQuotaEmbed(c: GuildConfig): EmbedBuilder {
  const e = new EmbedBuilder().setTitle("📊 Quota Configuration").setColor(0x5865f2);
  if (c.quotaConfig) {
    e.addFields(
      { name: "Global — Messages / week", value: String(c.quotaConfig.messages), inline: true },
      { name: "Global — Mod actions / week", value: String(c.quotaConfig.modActions), inline: true },
      { name: "Week starts on", value: WEEKDAYS[c.quotaConfig.weekStartDay] ?? "Sunday", inline: true },
    );
    const rqEntries = Object.entries(c.roleQuotas ?? {});
    if (rqEntries.length > 0) {
      e.addFields({
        name: "📌 Per-Role Overrides",
        value: rqEntries.map(([roleId, rq]) => `<@&${roleId}>: **${rq.messages}** msgs / **${rq.modActions}** mod actions`).join("\n"),
        inline: false,
      });
    }
    const wl = c.quotaWhitelistRoles ?? [];
    e.addFields({
      name: "🚫 Quota Whitelist (exempt from check)",
      value: wl.length > 0 ? wl.map((r) => `<@&${r}>`).join(", ") : "*None — all staff are checked*",
      inline: false,
    });
  } else {
    e.setDescription("Quota is **not configured**. Press *Set Targets* to define weekly goals.");
  }
  return e;
}

function quotaRows(c: GuildConfig): Row[] {
  const row1 = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("cfg:quotaSet")
      .setLabel(c.quotaConfig ? "Edit Targets" : "Set Targets")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("cfg:quotaDay")
      .setLabel("Week Start Day")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!c.quotaConfig),
    new ButtonBuilder()
      .setCustomId("cfg:quotaRoleTarget")
      .setLabel("Per-Role Targets")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("🎭")
      .setDisabled(!c.quotaConfig),
    new ButtonBuilder()
      .setCustomId("cfg:quotaClear")
      .setLabel("Clear Quota")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!c.quotaConfig),
  );
  const row2 = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("cfg:quotaWhitelist")
      .setLabel("Manage Whitelist")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("🚫")
      .setDisabled(!c.quotaConfig),
  );
  return [row1, row2, backRow()];
}

function whitelistManageRows(c: GuildConfig, roleNameMap: Map<string, string>): Row[] {
  const addSel = new RoleSelectMenuBuilder()
    .setCustomId("cfg:quotaWhitelistAdd")
    .setPlaceholder("Add roles to quota whitelist (exempt from Friday check)")
    .setMinValues(1)
    .setMaxValues(10);

  const wl = c.quotaWhitelistRoles ?? [];
  const rmSel = new StringSelectMenuBuilder()
    .setCustomId("cfg:quotaWhitelistRemove")
    .setPlaceholder("Remove a role from the whitelist")
    .setMinValues(1)
    .setMaxValues(1);

  if (wl.length > 0) {
    rmSel.addOptions(wl.slice(0, 25).map((r) => ({
      label: roleNameMap.get(r) ?? `Role ${r}`,
      value: r,
      description: `ID: ${r}`,
    })));
  } else {
    rmSel.addOptions({ label: "(whitelist is empty)", value: "_noop", default: true }).setDisabled(true);
  }

  return [
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(addSel),
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(rmSel),
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("cfg:quotaWhitelistClearAll")
        .setLabel("Clear All")
        .setStyle(ButtonStyle.Danger)
        .setDisabled(wl.length === 0),
      new ButtonBuilder()
        .setCustomId("cfg:mod:view:quota")
        .setLabel("← Back")
        .setStyle(ButtonStyle.Secondary),
    ),
  ];
}

function roleQuotaPickRows(): Row[] {
  const sel = new RoleSelectMenuBuilder()
    .setCustomId("cfg:quotaRoleSelect")
    .setPlaceholder("Select a role to set its quota target")
    .setMinValues(1)
    .setMaxValues(1);
  return [
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(sel),
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("cfg:mod:view:quota")
        .setLabel("← Back")
        .setStyle(ButtonStyle.Secondary),
    ),
  ];
}

function roleQuotaModal(role: Role, existing?: RoleQuota): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`cfg:quotaRoleModal:${role.id}`)
    .setTitle(`Quota for @${role.name}`)
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("messages")
          .setLabel("Messages per week for this role")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setValue(String(existing?.messages ?? 50)),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("modActions")
          .setLabel("Mod actions per week for this role")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setValue(String(existing?.modActions ?? 5)),
      ),
    );
}

function weekStartRows(c: GuildConfig): Row[] {
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
        .setCustomId("cfg:mod:view:quota")
        .setLabel("← Back")
        .setStyle(ButtonStyle.Secondary),
    ),
  ];
}

function quotaModal(c: GuildConfig): ModalBuilder {
  return new ModalBuilder()
    .setCustomId("cfg:quotaModal")
    .setTitle("Set Weekly Quota Targets")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("messages")
          .setLabel("Messages per week")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setValue(String(c.quotaConfig?.messages ?? 50)),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("modActions")
          .setLabel("Mod actions per week")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setValue(String(c.quotaConfig?.modActions ?? 5)),
      ),
    );
}

async function staffRolesView(guildId: string): Promise<{ embed: EmbedBuilder; rows: Row[] }> {
  const roles = await listStaffRoles(guildId);
  const embed = new EmbedBuilder()
    .setTitle("👥 Staff Roles")
    .setColor(0x5865f2)
    .setDescription(
      roles.length === 0
        ? "*No staff roles registered yet.* Use the picker below to add one."
        : roles.map((r) => `**${r.position}.** <@&${r.roleId}>`).join("\n"),
    );

  const addSel = new RoleSelectMenuBuilder()
    .setCustomId("cfg:staffRoleAdd")
    .setPlaceholder("Add a staff role")
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
    rmSel.addOptions({ label: "(no roles)", value: "_noop", default: true }).setDisabled(true);
  }

  return {
    embed,
    rows: [
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(addSel),
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(rmSel),
      backRow(),
    ],
  };
}

const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("config")
    .setDescription("Open the bot configuration menu for this server.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.inGuild() || !interaction.guildId) {
      await interaction.reply({ content: "Run this in a server.", ephemeral: true });
      return;
    }
    if (!isAdminOrOwner(interaction) && !PERM_WHITELIST.has(interaction.user.id)) {
      await interaction.reply({ content: "Only administrators can change the config.", ephemeral: true });
      return;
    }

    const guildId = interaction.guildId;
    let cfg = await getGuildConfig(guildId);

    const reply = await interaction.reply({
      embeds: [buildOverviewEmbed(cfg)],
      components: [mainDropdownRow(), closeRow()],
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
          await i.update({ content: "Configuration closed.", embeds: [], components: [] });
          return;
        }

        if (id === "cfg:back") {
          cfg = await getGuildConfig(guildId);
          await i.update({ embeds: [buildOverviewEmbed(cfg)], components: [mainDropdownRow(), closeRow()] });
          return;
        }

        if (id === "cfg:module:select" && i.isStringSelectMenu()) {
          const modId = i.values[0]!;
          cfg = await getGuildConfig(guildId);

          if (modId === "staff") {
            const view = await staffRolesView(guildId);
            await i.update({ embeds: [view.embed], components: view.rows });
            return;
          }

          if (modId === "quota") {
            await i.update({ embeds: [buildQuotaEmbed(cfg)], components: quotaRows(cfg) });
            return;
          }

          const mod = MODULE_DEFS.find((m) => m.id === modId);
          if (!mod) return;
          await i.update({ embeds: [buildModuleEmbed(cfg, mod)], components: moduleActionRows(cfg, mod) });
          return;
        }

        if (id.startsWith("cfg:mod:view:")) {
          const modId = id.slice("cfg:mod:view:".length);
          cfg = await getGuildConfig(guildId);

          if (modId === "staff") {
            const view = await staffRolesView(guildId);
            await i.update({ embeds: [view.embed], components: view.rows });
            return;
          }
          if (modId === "quota") {
            await i.update({ embeds: [buildQuotaEmbed(cfg)], components: quotaRows(cfg) });
            return;
          }

          const mod = MODULE_DEFS.find((m) => m.id === modId);
          if (!mod) return;
          await i.update({ embeds: [buildModuleEmbed(cfg, mod)], components: moduleActionRows(cfg, mod) });
          return;
        }

        if (id.startsWith("cfg:mod:toggle:")) {
          const modId = id.slice("cfg:mod:toggle:".length);
          const mod = MODULE_DEFS.find((m) => m.id === modId);
          if (!mod) return;
          cfg = await updateGuildConfig(guildId, (c) => {
            c.modules[mod.moduleKey] = !c.modules[mod.moduleKey];
            return c;
          });
          await i.update({ embeds: [buildModuleEmbed(cfg, mod)], components: moduleActionRows(cfg, mod) });
          return;
        }

        if (id.startsWith("cfg:mod:setchannel:")) {
          const modId = id.slice("cfg:mod:setchannel:".length);
          const mod = MODULE_DEFS.find((m) => m.id === modId);
          if (!mod || !mod.channelKey) return;
          await i.update({
            embeds: [buildModuleEmbed(cfg, mod).setDescription("Select a channel below:")],
            components: channelPickRows(mod),
          });
          return;
        }

        if (id.startsWith("cfg:mod:channelset:") && i.isChannelSelectMenu()) {
          const modId = id.slice("cfg:mod:channelset:".length);
          const mod = MODULE_DEFS.find((m) => m.id === modId);
          if (!mod || !mod.channelKey) return;
          const channelId = i.values[0]!;
          const key = mod.channelKey;
          cfg = await updateGuildConfig(guildId, (c) => {
            c.channels[key] = channelId;
            return c;
          });
          await i.update({ embeds: [buildModuleEmbed(cfg, mod)], components: moduleActionRows(cfg, mod) });
          return;
        }

        if (id.startsWith("cfg:mod:channelclear:")) {
          const modId = id.slice("cfg:mod:channelclear:".length);
          const mod = MODULE_DEFS.find((m) => m.id === modId);
          if (!mod || !mod.channelKey) return;
          const key = mod.channelKey;
          cfg = await updateGuildConfig(guildId, (c) => {
            delete c.channels[key];
            return c;
          });
          await i.update({ embeds: [buildModuleEmbed(cfg, mod)], components: moduleActionRows(cfg, mod) });
          return;
        }

        if (id.startsWith("cfg:mod:setroles:")) {
          const modId = id.slice("cfg:mod:setroles:".length);
          const mod = MODULE_DEFS.find((m) => m.id === modId);
          if (!mod) return;
          await i.update({
            embeds: [buildModuleEmbed(cfg, mod).setDescription("Select permitted roles below:")],
            components: rolePickRows(mod),
          });
          return;
        }

        if (id.startsWith("cfg:mod:roleset:") && i.isRoleSelectMenu()) {
          const modId = id.slice("cfg:mod:roleset:".length);
          const mod = MODULE_DEFS.find((m) => m.id === modId);
          if (!mod) return;
          const roleIds = Array.from(i.values);
          cfg = await updateGuildConfig(guildId, (c) => {
            if (!c.moduleRoles) c.moduleRoles = {};
            c.moduleRoles[modId] = roleIds;
            return c;
          });
          await i.update({ embeds: [buildModuleEmbed(cfg, mod)], components: moduleActionRows(cfg, mod) });
          return;
        }

        if (id.startsWith("cfg:mod:roleclear:")) {
          const modId = id.slice("cfg:mod:roleclear:".length);
          const mod = MODULE_DEFS.find((m) => m.id === modId);
          if (!mod) return;
          cfg = await updateGuildConfig(guildId, (c) => {
            if (!c.moduleRoles) c.moduleRoles = {};
            c.moduleRoles[modId] = [];
            return c;
          });
          await i.update({ embeds: [buildModuleEmbed(cfg, mod)], components: moduleActionRows(cfg, mod) });
          return;
        }

        if (id === "cfg:quotaSet") {
          await i.showModal(quotaModal(cfg));
          try {
            const submit = await i.awaitModalSubmit({
              filter: (s) => s.customId === "cfg:quotaModal" && s.user.id === i.user.id,
              time: 5 * 60 * 1000,
            });
            const messages = parseInt(submit.fields.getTextInputValue("messages"), 10);
            const modActions = parseInt(submit.fields.getTextInputValue("modActions"), 10);
            if (!Number.isFinite(messages) || messages < 0 || !Number.isFinite(modActions) || modActions < 0) {
              await submit.reply({ content: "Both values must be non-negative integers.", ephemeral: true });
              return;
            }
            cfg = await updateGuildConfig(guildId, (c) => {
              const day = c.quotaConfig?.weekStartDay ?? 0;
              c.quotaConfig = { messages, modActions, weekStartDay: day };
              return c;
            });
            if (submit.isFromMessage()) {
              await submit.update({ embeds: [buildQuotaEmbed(cfg)], components: quotaRows(cfg) });
            } else {
              await submit.reply({
                content: `Quota set: **${messages}** messages / **${modActions}** mod actions per week.`,
                ephemeral: true,
              });
            }
          } catch {
            // timed out or dismissed
          }
          return;
        }

        if (id === "cfg:quotaClear") {
          cfg = await updateGuildConfig(guildId, (c) => { delete c.quotaConfig; return c; });
          await i.update({ embeds: [buildQuotaEmbed(cfg)], components: quotaRows(cfg) });
          return;
        }

        if (id === "cfg:quotaDay") {
          await i.update({ embeds: [buildQuotaEmbed(cfg)], components: weekStartRows(cfg) });
          return;
        }

        if (id === "cfg:quotaWhitelist") {
          const roleNameMap = new Map(
            (i.guild?.roles.cache.map((r) => [r.id, r.name]) ?? []),
          );
          await i.update({
            embeds: [
              new EmbedBuilder()
                .setTitle("🚫 Quota Whitelist")
                .setColor(0x5865f2)
                .setDescription(
                  "Roles on this list are **completely skipped** during the Friday quota check — they won't receive warnings, strikes, or terminations.\n\n" +
                  "Use the role picker to add roles, or the dropdown to remove them.",
                )
                .addFields({
                  name: "Currently Whitelisted",
                  value: (cfg.quotaWhitelistRoles ?? []).length > 0
                    ? (cfg.quotaWhitelistRoles ?? []).map((r) => `<@&${r}>`).join(", ")
                    : "*None*",
                }),
            ],
            components: whitelistManageRows(cfg, roleNameMap),
          });
          return;
        }

        if (id === "cfg:quotaWhitelistAdd" && i.isRoleSelectMenu()) {
          const toAdd = Array.from(i.values);
          cfg = await updateGuildConfig(guildId, (c) => {
            const current = new Set(c.quotaWhitelistRoles ?? []);
            for (const r of toAdd) current.add(r);
            c.quotaWhitelistRoles = [...current];
            return c;
          });
          const roleNameMap = new Map(i.guild?.roles.cache.map((r) => [r.id, r.name]) ?? []);
          await i.update({
            embeds: [
              new EmbedBuilder()
                .setTitle("🚫 Quota Whitelist")
                .setColor(0x57f287)
                .setDescription(`Added ${toAdd.map((r) => `<@&${r}>`).join(", ")} to the whitelist.`)
                .addFields({
                  name: "Currently Whitelisted",
                  value: (cfg.quotaWhitelistRoles ?? []).length > 0
                    ? (cfg.quotaWhitelistRoles ?? []).map((r) => `<@&${r}>`).join(", ")
                    : "*None*",
                }),
            ],
            components: whitelistManageRows(cfg, roleNameMap),
          });
          return;
        }

        if (id === "cfg:quotaWhitelistRemove" && i.isStringSelectMenu()) {
          const toRemove = i.values[0]!;
          if (toRemove !== "_noop") {
            cfg = await updateGuildConfig(guildId, (c) => {
              c.quotaWhitelistRoles = (c.quotaWhitelistRoles ?? []).filter((r) => r !== toRemove);
              return c;
            });
          }
          const roleNameMap = new Map(i.guild?.roles.cache.map((r) => [r.id, r.name]) ?? []);
          await i.update({
            embeds: [
              new EmbedBuilder()
                .setTitle("🚫 Quota Whitelist")
                .setColor(0x5865f2)
                .setDescription("Role removed from the whitelist.")
                .addFields({
                  name: "Currently Whitelisted",
                  value: (cfg.quotaWhitelistRoles ?? []).length > 0
                    ? (cfg.quotaWhitelistRoles ?? []).map((r) => `<@&${r}>`).join(", ")
                    : "*None*",
                }),
            ],
            components: whitelistManageRows(cfg, roleNameMap),
          });
          return;
        }

        if (id === "cfg:quotaWhitelistClearAll") {
          cfg = await updateGuildConfig(guildId, (c) => {
            c.quotaWhitelistRoles = [];
            return c;
          });
          const roleNameMap = new Map(i.guild?.roles.cache.map((r) => [r.id, r.name]) ?? []);
          await i.update({
            embeds: [
              new EmbedBuilder()
                .setTitle("🚫 Quota Whitelist")
                .setColor(0xed4245)
                .setDescription("Whitelist cleared. All staff roles will now be checked on Fridays."),
            ],
            components: whitelistManageRows(cfg, roleNameMap),
          });
          return;
        }

        if (id === "cfg:quotaRoleTarget") {
          await i.update({
            embeds: [buildQuotaEmbed(cfg).setDescription("Select a role to set its specific quota target.\nThis overrides the global target for members of that role.")],
            components: roleQuotaPickRows(),
          });
          return;
        }

        if (id === "cfg:quotaRoleSelect" && i.isRoleSelectMenu()) {
          const roleId = i.values[0]!;
          const role = i.guild?.roles.cache.get(roleId);
          if (!role) return;
          const existing = cfg.roleQuotas?.[roleId];
          await i.showModal(roleQuotaModal(role, existing));
          try {
            const submit = await i.awaitModalSubmit({
              filter: (s) => s.customId === `cfg:quotaRoleModal:${roleId}` && s.user.id === i.user.id,
              time: 5 * 60 * 1000,
            });
            const messages = parseInt(submit.fields.getTextInputValue("messages"), 10);
            const modActions = parseInt(submit.fields.getTextInputValue("modActions"), 10);
            if (!Number.isFinite(messages) || messages < 0 || !Number.isFinite(modActions) || modActions < 0) {
              await submit.reply({ content: "Both values must be non-negative integers.", ephemeral: true });
              return;
            }
            cfg = await updateGuildConfig(guildId, (c) => {
              if (!c.roleQuotas) c.roleQuotas = {};
              c.roleQuotas[roleId] = { messages, modActions };
              return c;
            });
            if (submit.isFromMessage()) {
              await submit.update({ embeds: [buildQuotaEmbed(cfg)], components: quotaRows(cfg) });
            } else {
              await submit.reply({
                content: `Set quota for <@&${roleId}>: **${messages}** msgs / **${modActions}** mod actions per week.`,
                ephemeral: true,
              });
            }
          } catch {
            // timed out or dismissed
          }
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
          await i.update({ embeds: [buildQuotaEmbed(cfg)], components: quotaRows(cfg) });
          return;
        }

        if (id === "cfg:staffRoleAdd" && i.isRoleSelectMenu()) {
          const roleId = i.values[0];
          if (roleId) await addStaffRole(guildId, roleId).catch(() => {});
          const view = await staffRolesView(guildId);
          await i.update({ embeds: [view.embed], components: view.rows });
          return;
        }

        if (id === "cfg:staffRoleRemove" && i.isStringSelectMenu()) {
          const roleId = i.values[0];
          if (roleId && roleId !== "_noop") await removeStaffRole(guildId, roleId).catch(() => {});
          const view = await staffRolesView(guildId);
          await i.update({ embeds: [view.embed], components: view.rows });
          return;
        }
      } catch {
        if (!i.replied && !i.deferred) {
          await i.reply({ content: "Something went wrong.", ephemeral: true }).catch(() => {});
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
