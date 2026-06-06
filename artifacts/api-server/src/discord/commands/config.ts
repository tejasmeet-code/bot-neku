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
  UserSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  type ChatInputCommandInteraction,
  type MessageActionRowComponentBuilder,
  type Role,
  type TextChannel,
} from "discord.js";
import type { SlashCommand } from "../types";
import {
  getGuildConfig,
  updateGuildConfig,
  getInfractionsConfig,
  getQuotaFailureConfig,
  getModerationConfig,
  getPromotionsConfig,
  getDemotionsConfig,
  getAppealsConfig,
  getLoaConfig,
  getStaffReportConfig,
  getPartnershipConfig,
  getAntiNukeConfig,
  type GuildConfig,
  type PartnershipConfig,
  type QuotaFailureConfig,
  type FailureAction,
  type RoleQuota,
  type AntiNukePunishment,
  type AntiNukeMiniId,
} from "../storage/config";
import { CE } from "../utils/embedStyle";
import { isAdminOrOwner } from "../utils/staffPerms";
import { PERM_WHITELIST } from "../storage/whitelist";
import { logger } from "../../lib/logger";
import { addStaffRole, listStaffRoles, removeStaffRole } from "../storage/staff";
import {
  getShopSettings, updateShopSettings, generateShopId,
  type GuildShopSettings, type ShopMiniConfig, type ShopStatus,
} from "../storage/shop";

type Row = ActionRowBuilder<MessageActionRowComponentBuilder>;

interface ModuleDef {
  id: string;
  label: string;
  emoji: { str: string; id: string; name: string };
  moduleKey: keyof GuildConfig["modules"];
  channelKey: keyof GuildConfig["channels"] | null;
  description: string;
}

const MODULE_DEFS: ModuleDef[] = [
  {
    id: "moderation",
    label: "Suspensions",
    emoji: CE.moderation,
    moduleKey: "moderation",
    channelKey: "moderation",
    description: "Ban, mute, kick, jail, and warn actions.",
  },
  {
    id: "infractions",
    label: "Infractions",
    emoji: CE.warning,
    moduleKey: "infractions",
    channelKey: "infractions",
    description: "Strike and infraction log channel.",
  },
  {
    id: "promotions",
    label: "Promotions",
    emoji: CE.promotion,
    moduleKey: "staffMgmt",
    channelKey: "promotions",
    description: "Staff promotion announcement channel.",
  },
  {
    id: "demotions",
    label: "Demotions",
    emoji: CE.demotion,
    moduleKey: "staffMgmt",
    channelKey: "demotions",
    description: "Staff demotion announcement channel.",
  },
  {
    id: "botNotifications",
    label: "Bot Notifications",
    emoji: CE.notifications,
    moduleKey: "moderation",
    channelKey: "botNotifications",
    description: "Channel for bot alerts and notifications.",
  },
  {
    id: "performance",
    label: "Staff Performance",
    emoji: CE.staff,
    moduleKey: "staffMgmt",
    channelKey: "performance",
    description: "Staff performance reviews and evaluations.",
  },
  {
    id: "appeals",
    label: "Appeals",
    emoji: CE.information,
    moduleKey: "appeals",
    channelKey: "appeals",
    description: "Punishment appeal review channel.",
  },
  {
    id: "partnership",
    label: "Partnerships",
    emoji: CE.link,
    moduleKey: "partnership",
    channelKey: "partnershipCheck",
    description: "Send partnership requests for approval and announce approved partners.",
  },
  {
    id: "verify",
    label: "Verification",
    emoji: CE.check,
    moduleKey: "verify",
    channelKey: "verifyChannel",
    description: "Channel for server verification prompts and role assignment.",
  },
  {
    id: "loa",
    label: "Leave of Absence",
    emoji: CE.members,
    moduleKey: "loa",
    channelKey: "loaLog",
    description: "Staff LOA requests and tracking.",
  },
  {
    id: "staff",
    label: "Staff",
    emoji: CE.admin,
    moduleKey: "staffMgmt",
    channelKey: "staffLog",
    description: "Manage staff roles and hierarchy.",
  },
  {
    id: "staffReport",
    label: "Staff Report",
    emoji: CE.settings,
    moduleKey: "staffMgmt",
    channelKey: "staffReport",
    description: "Auto-updating staff tier report channel.",
  },
  {
    id: "quota",
    label: "Message Quota",
    emoji: CE.moderation,
    moduleKey: "quota",
    channelKey: "quotaLog",
    description: "Weekly message and mod-action quota targets.",
  },
  {
    id: "banRequest",
    label: "Ban Request",
    emoji: CE.moderation,
    moduleKey: "banRequest",
    channelKey: "banRequest",
    description: "Channel where lower staff submit ban requests for senior review.",
  },
  {
    id: "antiNuke",
    label: "Anti-Nuke",
    emoji: CE.admin,
    moduleKey: "antiNuke",
    channelKey: null,
    description: "Protect the server from mass destructive actions and manage who can bypass anti-nuke checks.",
  },
  {
    id: "roleMemory",
    label: "Role Memory",
    emoji: CE.members,
    moduleKey: "roleMemory",
    channelKey: "roleMemoryLog",
    description: "Remember member roles and restore them when they rejoin.",
  },
];

/** Modules that have custom per-module settings beyond channel/roles. */
const MODULES_WITH_SETTINGS = new Set([
  "moderation",
  "infractions",
  "promotions",
  "demotions",
  "appeals",
  "partnership",
  "verify",
  "loa",
  "staffReport",
  "antiNuke",
]);

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// ── Shop config UI ────────────────────────────────────────────────────────────

function buildShopOverviewEmbed(ss: GuildShopSettings): EmbedBuilder {
  const shopList = Object.values(ss.shops);
  const shopLines = shopList.length > 0
    ? shopList.map((s) =>
        `• **${s.name}** — Ch: ${s.channelId ? `<#${s.channelId}>` : "*not set*"} · ${s.questions.length} question(s)`,
      ).join("\n")
    : "*No shops added yet — click **Add Shop** to create one.*";

  return new EmbedBuilder()
    .setTitle(`${CE.shoppingcart.str} Shop Module`)
    .setColor(ss.enabled ? 0x57f287 : 0xed4245)
    .addFields(
      { name: "Status", value: ss.enabled ? `${CE.success.str} Enabled` : `${CE.error.str} Disabled`, inline: true },
      { name: "Shops", value: `**${shopList.length}**`, inline: true },
      { name: "Mod Roles", value: ss.modRoleIds.length > 0 ? ss.modRoleIds.map((r) => `<@&${r}>`).join(", ") : "*None set*", inline: false },
      { name: "Admin Roles", value: ss.adminRoleIds.length > 0 ? ss.adminRoleIds.map((r) => `<@&${r}>`).join(", ") : "*None set*", inline: false },
      { name: "Log Channel", value: ss.logChannelId ? `<#${ss.logChannelId}>` : "*Not set*", inline: true },
      { name: "Transcript Channel", value: ss.transcriptChannelId ? `<#${ss.transcriptChannelId}>` : "*Not set*", inline: true },
      { name: "Customer Role", value: ss.customerRoleId ? `<@&${ss.customerRoleId}> *(given on first purchase)*` : "*Not set*", inline: false },
      { name: `${CE.information.str} Shops`, value: shopLines, inline: false },
    )
    .setFooter({ text: "Tickets: {shopname}-{username}-{no} | Set category per-shop for auto-sorting" });
}

function shopOverviewRows(ss: GuildShopSettings): Row[] {
  const rows: Row[] = [];

  const row1 = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("cfg:shop:toggle")
      .setLabel(ss.enabled ? "Enabled — Click to Disable" : "Disabled — Click to Enable")
      .setStyle(ss.enabled ? ButtonStyle.Success : ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId("cfg:shop:addShop")
      .setLabel("Add Shop")
      .setStyle(ButtonStyle.Primary)
      .setEmoji({ id: CE.shoppingcart.id, name: CE.shoppingcart.name }),
  );
  rows.push(row1);

  const row2 = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("cfg:shop:setModRoles")
      .setLabel("Set Mod Roles")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji({ id: CE.staff.id, name: CE.staff.name }),
    new ButtonBuilder()
      .setCustomId("cfg:shop:setAdminRoles")
      .setLabel("Set Admin Roles")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji({ id: CE.admin.id, name: CE.admin.name }),
    new ButtonBuilder()
      .setCustomId("cfg:shop:setLogChannel")
      .setLabel(ss.logChannelId ? "Change Log Channel" : "Set Log Channel")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji({ id: CE.notifications.id, name: CE.notifications.name }),
    new ButtonBuilder()
      .setCustomId("cfg:shop:setTranscriptChannel")
      .setLabel(ss.transcriptChannelId ? "Change Transcript Channel" : "Set Transcript Channel")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji({ id: CE.information.id, name: CE.information.name }),
  );
  rows.push(row2);

  const row3 = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("cfg:shop:setProofChannel")
      .setLabel(ss.proofChannelId ? "Change Proof Channel" : "Set Proof Channel")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji({ id: CE.information.id, name: CE.information.name }),
    new ButtonBuilder()
      .setCustomId("cfg:shop:setCustomerRole")
      .setLabel(ss.customerRoleId ? "Change Customer Role" : "Set Customer Role")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji({ id: CE.ltc.id, name: CE.ltc.name }),
    new ButtonBuilder()
      .setCustomId("cfg:shop:customerRoleClear")
      .setLabel("Clear Customer Role")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!ss.customerRoleId),
  );
  rows.push(row3);

  const shopList = Object.values(ss.shops);
  if (shopList.length > 0) {
    const sel = new StringSelectMenuBuilder()
      .setCustomId("cfg:shop:shopSelect")
      .setPlaceholder("Select a shop to configure")
      .addOptions(
        shopList.slice(0, 25).map((s) => ({
          label: s.name.slice(0, 25),
          value: s.id,
          description: `Channel: ${s.channelId ? "set" : "not set"} · ${s.questions.length} question(s)`,
        })),
      );
    rows.push(new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(sel));
  }

  rows.push(backRow());
  return rows;
}

function buildShopMiniEmbed(shop: ShopMiniConfig, _ss: GuildShopSettings): EmbedBuilder {
  const questionLines = shop.questions.length > 0
    ? shop.questions.map((q, i) => `**${i + 1}.** ${q}`).join("\n")
    : "*No questions set — default question will be used*";

  const embedSummary = [
    shop.embed.title ? `**Title:** ${shop.embed.title}` : null,
    shop.embed.description ? `**Description:** ${shop.embed.description.slice(0, 60)}...` : null,
    shop.embed.thumbnail ? `**Thumbnail:** set` : null,
    shop.embed.image ? `**Image:** set` : null,
    shop.embed.footer ? `**Footer:** ${shop.embed.footer}` : null,
    shop.embed.fields && shop.embed.fields.length > 0 ? `**Fields:** ${shop.embed.fields.length}` : null,
  ].filter(Boolean).join("\n") || "*No embed settings — a default embed will be used*";

  const statusDisplay = shop.status === "coming_soon"
    ? `${CE.limited.str} Coming Soon`
    : shop.status === "out_of_stock"
    ? `${CE.discount.str} Out of Stock`
    : `${CE.success.str} Active`;
  const statusColor = shop.status === "out_of_stock" ? 0xed4245 : shop.status === "coming_soon" ? 0xfee75c : 0x57f287;

  return new EmbedBuilder()
    .setTitle(`${CE.shoppingcart.str} Shop — ${shop.name}`)
    .setColor(statusColor)
    .addFields(
      { name: "Status", value: statusDisplay, inline: true },
      { name: "Channel", value: shop.channelId ? `<#${shop.channelId}>` : "*Not set*", inline: true },
      { name: "Ticket Category", value: shop.categoryId ? `<#${shop.categoryId}>` : "*None — created at root*", inline: true },
      { name: "Embed Posted", value: shop.messageId ? `${CE.success.str} Yes` : `${CE.error.str} Not posted`, inline: true },
      { name: `${CE.information.str} Questions (up to 5)`, value: questionLines, inline: false },
      { name: `${CE.settings.str} Embed Settings`, value: embedSummary, inline: false },
    )
    .setFooter({ text: `Shop ID: ${shop.id}` });
}

function shopMiniRows(shop: ShopMiniConfig): Row[] {
  const row1 = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`cfg:shop:mini:setChannel:${shop.id}`)
      .setLabel("Set Channel")
      .setStyle(ButtonStyle.Primary)
      .setEmoji({ id: CE.settings.id, name: CE.settings.name }),
    new ButtonBuilder()
      .setCustomId(`cfg:shop:mini:setCategory:${shop.id}`)
      .setLabel("Set Category")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji({ id: CE.admin.id, name: CE.admin.name }),
    new ButtonBuilder()
      .setCustomId(`cfg:shop:mini:editQuestions:${shop.id}`)
      .setLabel("Edit Questions")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji({ id: CE.information.id, name: CE.information.name }),
    new ButtonBuilder()
      .setCustomId(`cfg:shop:mini:editEmbed:${shop.id}`)
      .setLabel("Edit Embed")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji({ id: CE.notifications.id, name: CE.notifications.name }),
  );

  const row2 = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`cfg:shop:mini:postEmbed:${shop.id}`)
      .setLabel(shop.messageId ? "Re-Post Embed" : "Post Shop Embed")
      .setStyle(ButtonStyle.Success)
      .setEmoji({ id: CE.discount.id, name: CE.discount.name }),
    new ButtonBuilder()
      .setCustomId(`cfg:shop:mini:delete:${shop.id}`)
      .setLabel("Delete Shop")
      .setStyle(ButtonStyle.Danger)
      .setEmoji({ id: CE.termination.id, name: CE.termination.name }),
  );

  const statusSel = new StringSelectMenuBuilder()
    .setCustomId(`cfg:shop:mini:statusSet:${shop.id}`)
    .setPlaceholder(`Status: ${shop.status === "coming_soon" ? "Coming Soon" : shop.status === "out_of_stock" ? "Out of Stock" : "Active"}`)
    .addOptions(
      { label: "Active", value: "active", description: "Buy button shown — tickets can be opened", emoji: { id: CE.success.id, name: CE.success.name } },
      { label: "Coming Soon", value: "coming_soon", description: "No buy button — Coming Soon badge shown", emoji: { id: CE.limited.id, name: CE.limited.name } },
      { label: "Out of Stock", value: "out_of_stock", description: "No buy button — Out of Stock badge shown", emoji: { id: CE.discount.id, name: CE.discount.name } },
    );

  const backToShop = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("cfg:shop:overview")
      .setLabel("← Back to Shop Overview")
      .setStyle(ButtonStyle.Secondary),
  );

  return [row1, row2, new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(statusSel), backToShop];
}

// ── Utility rows ─────────────────────────────────────────────────────────────

function mainDropdownRow(): Row {
  const sel = new StringSelectMenuBuilder()
    .setCustomId("cfg:module:select")
    .setPlaceholder("Select a Module to Configure")
    .addOptions([
      ...MODULE_DEFS.map((m) => {
        const option: any = {
          label: m.label,
          value: m.id,
          description: m.description,
        };
        if (m.emoji?.id && m.emoji?.name) {
          option.emoji = { id: m.emoji.id, name: m.emoji.name };
        }
        return option;
      }),
      {
        label: "Shop",
        value: "shop",
        emoji: { id: CE.shoppingcart.id, name: CE.shoppingcart.name },
        description: "Sell services via ticketed shops with ratings and stats.",
      },
      {
        label: "Custom Prefix",
        value: "prefix",
        emoji: { id: CE.settings.id, name: CE.settings.name },
        description: "Set a custom command prefix for this server.",
      },
      {
        label: "Bot Profile",
        value: "botProfile",
        emoji: { id: CE.admin.id, name: CE.admin.name },
        description: "Change the bot's nickname and avatar in this server.",
      },
    ]);
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

// ── Overview embed ───────────────────────────────────────────────────────────

function buildOverviewEmbed(cfg: GuildConfig): EmbedBuilder {
  const moduleLines = MODULE_DEFS.map((m) => {
    const on = cfg.modules[m.moduleKey as keyof typeof cfg.modules] ?? false;
    return `${on ? CE.success.str : CE.error.str} **${m.label}**`;
  });
  const prefix = cfg.guildPrefix ?? "b?";
  return new EmbedBuilder()
    .setTitle("Config Menu")
    .setColor(0x5865f2)
    .setDescription(
      `${CE.settings.str} **Prefix:** \`${prefix}\` (DM: \`${prefix}n\`) — \`bp?nuke\` / \`bp?highfi\` are always fixed\n\n` +
      "Select a module to configure using the dropdown below.\n\n" + moduleLines.join("\n"),
    )
    .setFooter({ text: "Administrators always have access." });
}

// ── Settings summary (one-liner shown in the module embed) ───────────────────

function getModuleSettingsSummary(cfg: GuildConfig, modId: string): string | null {
  switch (modId) {
    case "infractions": {
      const s = getInfractionsConfig(cfg);
      return (
        `Expiry: **${s.strikeExpiryDays === 0 ? "Never" : `${s.strikeExpiryDays}d`}** • ` +
        `DM: ${s.dmOnInfraction ? CE.success.str : CE.error.str} • ` +
        `Auto-Demotion: ${s.autoDemotionEnabled ? CE.success.str : CE.error.str}`
      );
    }
    case "moderation": {
      const s = getModerationConfig(cfg);
      return `DM on action: ${s.dmOnAction ? CE.success.str : CE.error.str}`;
    }
    case "promotions": {
      const s = getPromotionsConfig(cfg);
      return `DM member: ${s.dmMember ? CE.success.str : CE.error.str}`;
    }
    case "demotions": {
      const s = getDemotionsConfig(cfg);
      return `DM member: ${s.dmMember ? CE.success.str : CE.error.str}`;
    }
    case "appeals": {
      const s = getAppealsConfig(cfg);
      return `Auto-close: ${s.autoCloseDays === 0 ? "*Disabled*" : `**${s.autoCloseDays}d**`}`;
    }
    case "loa": {
      const s = getLoaConfig(cfg);
      return (
        `Max: **${s.maxDurationDays === 0 ? "Unlimited" : `${s.maxDurationDays}d`}** • ` +
        `Require reason: ${s.requireReason ? CE.success.str : CE.error.str}`
      );
    }
    case "partnership": {
      const s = getPartnershipConfig(cfg);
      return (
        `Quota: **${s.quota}** approved partnerships
         • Failures: ${s.failureActions[1] ?? "none"}/${s.failureActions[2] ?? "none"}/${s.failureActions[3] ?? "none"}`
      );
    }
    case "quota": {
      const s = getQuotaFailureConfig(cfg);
      return `Failures: **${s.failure1}** / **${s.failure2}** / **${s.failure3plus}**`;
    }
    case "staffReport": {
      const s = getStaffReportConfig(cfg);
      return `Refresh every **${s.refreshIntervalHours}h**`;
    }
    case "antiNuke": {
      const s = getAntiNukeConfig(cfg);
      return (
        `Joins: ${s.antiJoin.enabled ? CE.success.str : CE.error.str} • ` +
        `Bans: ${s.antiBan.enabled ? CE.success.str : CE.error.str} • ` +
        `Kicks: ${s.antiKick.enabled ? CE.success.str : CE.error.str} • ` +
        `Roles: ${s.antiRole.enabled ? CE.success.str : CE.error.str} • ` +
        `Channels: ${s.antiChannel.enabled ? CE.success.str : CE.error.str} • ` +
        `Punishment: **${s.commonPunishment}**`
      );
    }
    default:
      return null;
  }
}

// ── Module embed ─────────────────────────────────────────────────────────────

function buildModuleEmbed(cfg: GuildConfig, mod: ModuleDef): EmbedBuilder {
  const enabled = cfg.modules[mod.moduleKey];
  const channel = mod.channelKey ? cfg.channels[mod.channelKey] : null;
  const roles = cfg.moduleRoles?.[mod.id] ?? [];

  const e = new EmbedBuilder()
    .setTitle(`${mod.emoji.str} ${mod.label}`)
    .setColor(enabled ? 0x57f287 : 0xed4245)
    .addFields(
      { name: "Status", value: enabled ? `${CE.success.str} Enabled` : `${CE.error.str} Disabled`, inline: true },
    );

  if (mod.channelKey !== null) {
    e.addFields({
      name: "Channel",
      value: channel ? `<#${channel}>` : "*Not set*",
      inline: true,
    });
  }

  if (mod.id === "appeals") {
    e.addFields({
      name: "Appeal Server Invite",
      value: cfg.appealServerInvite
        ? `[${cfg.appealServerInvite}](${cfg.appealServerInvite})\n-# Included in ban DMs so banned users can join and use /appeal`
        : "*Not set* — banned users cannot DM the bot without a shared server",
      inline: false,
    });
  }

  if (mod.id === "partnership") {
    e.addFields(
      {
        name: "Approval Channel",
        value: cfg.channels.partnershipCheck ? `<#${cfg.channels.partnershipCheck}>` : "*Not set*",
        inline: true,
      },
      {
        name: "Announcement Channel",
        value: cfg.channels.partnership ? `<#${cfg.channels.partnership}>` : "*Not set*",
        inline: true,
      },
    );
  }

  e.addFields({
    name: "Permitted Roles",
    value: roles.length > 0 ? roles.map((r) => `<@&${r}>`).join(", ") : "*All staff (none set)*",
    inline: false,
  });

  const summary = getModuleSettingsSummary(cfg, mod.id);
  if (summary) {
    e.addFields({ name: `${CE.settings.str} Settings`, value: summary, inline: false });
  }

  return e;
}

// ── Module action rows ────────────────────────────────────────────────────────

function moduleActionRows(cfg: GuildConfig, mod: ModuleDef): Row[] {
  const enabled = cfg.modules[mod.moduleKey];
  const rows: Row[] = [];

  const actionRow = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`cfg:mod:toggle:${mod.id}`)
      .setLabel(enabled ? "Enabled — Click to Disable" : "Disabled — Click to Enable")
      .setStyle(enabled ? ButtonStyle.Success : ButtonStyle.Danger),
  );

  if (mod.channelKey !== null) {
    actionRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`cfg:mod:setchannel:${mod.id}`)
        .setLabel(mod.id === "partnership" ? "Set Approval Channel" : "Set Channel")
        .setStyle(ButtonStyle.Primary)
        .setEmoji({ id: CE.settings.id, name: CE.settings.name }),
    );
  }

  // Partnership needs a second channel button for the announcement channel
  if (mod.id === "partnership") {
    actionRow.addComponents(
      new ButtonBuilder()
        .setCustomId("cfg:partnership:setAnnounce")
        .setLabel("Set Partnership Channel")
        .setStyle(ButtonStyle.Primary)
        .setEmoji({ id: CE.link.id, name: CE.link.name }),
    );
  }

  actionRow.addComponents(
    new ButtonBuilder()
      .setCustomId(`cfg:mod:setroles:${mod.id}`)
      .setLabel("Set Permissions")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji({ id: CE.admin.id, name: CE.admin.name }),
  );

  if (mod.id === "appeals") {
    actionRow.addComponents(
      new ButtonBuilder()
        .setCustomId("cfg:appeals:setInvite")
        .setLabel("Set Appeal Server")
        .setStyle(ButtonStyle.Primary)
        .setEmoji({ id: CE.information.id, name: CE.information.name }),
    );
  }

  if (MODULES_WITH_SETTINGS.has(mod.id)) {
    actionRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`cfg:settings:view:${mod.id}`)
        .setLabel("Settings")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji({ id: CE.settings.id, name: CE.settings.name }),
    );
  }

  rows.push(actionRow);
  rows.push(backRow());
  return rows;
}

// ── Channel / role picker rows ────────────────────────────────────────────────

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

// ── Per-module settings UI ────────────────────────────────────────────────────

function buildSettingsEmbed(cfg: GuildConfig, modId: string): EmbedBuilder {
  const mod = MODULE_DEFS.find((m) => m.id === modId);
  const e = new EmbedBuilder()
    .setTitle(`${mod?.emoji.str ?? CE.settings.str} ${mod?.label ?? modId} — Settings`)
    .setColor(0x5865f2);

  switch (modId) {
    case "infractions": {
      const s = getInfractionsConfig(cfg);
      e.setDescription("Configure how infractions behave in this server.");
      e.addFields(
        {
          name: "Strike Expiry",
          value: s.strikeExpiryDays === 0 ? "*Never expire*" : `**${s.strikeExpiryDays}** days`,
          inline: true,
        },
        {
          name: "DM on Infraction",
          value: s.dmOnInfraction ? `${CE.success.str} Enabled` : `${CE.error.str} Disabled`,
          inline: true,
        },
        {
          name: "Auto-Demotion on Strikes",
          value: s.autoDemotionEnabled ? `${CE.success.str} Enabled` : `${CE.error.str} Disabled`,
          inline: true,
        },
        {
          name: "Punishment at 1 Active Strike",
          value: `\`${s.strikeAction1}\``,
          inline: true,
        },
        {
          name: "Punishment at 2 Active Strikes",
          value: `\`${s.strikeAction2}\``,
          inline: true,
        },
        {
          name: "Punishment at 3+ Active Strikes",
          value: `\`${s.strikeAction3plus}\``,
          inline: true,
        },
      );
      e.setFooter({ text: "Actions: none · warning · strike · demotion · termination" });
      break;
    }
    case "moderation": {
      const s = getModerationConfig(cfg);
      e.setDescription("Configure how moderation actions behave.");
      e.addFields({
        name: "DM on Action",
        value: s.dmOnAction
          ? `${CE.success.str} Enabled — users are notified when banned, kicked, muted, or jailed`
          : `${CE.error.str} Disabled — actions are silent`,
        inline: false,
      });
      break;
    }
    case "promotions": {
      const s = getPromotionsConfig(cfg);
      e.setDescription("Configure how promotion announcements are handled.");
      e.addFields({
        name: "DM Promoted Member",
        value: s.dmMember
          ? `${CE.success.str} Enabled — the promoted member receives a DM`
          : `${CE.error.str} Disabled — no DM is sent`,
        inline: false,
      });
      break;
    }
    case "demotions": {
      const s = getDemotionsConfig(cfg);
      e.setDescription("Configure how demotion announcements are handled.");
      e.addFields({
        name: "DM Demoted Member",
        value: s.dmMember
          ? `${CE.success.str} Enabled — the demoted member receives a DM`
          : `${CE.error.str} Disabled — no DM is sent`,
        inline: false,
      });
      break;
    }
    case "appeals": {
      const s = getAppealsConfig(cfg);
      e.setDescription("Configure how appeals are handled.");
      e.addFields({
        name: "Auto-Close Pending Appeals After",
        value: s.autoCloseDays === 0
          ? "*Disabled — appeals stay open until manually reviewed*"
          : `**${s.autoCloseDays}** days`,
        inline: false,
      });
      break;
    }
    case "loa": {
      const s = getLoaConfig(cfg);
      e.setDescription("Configure leave of absence handling.");
      e.addFields(
        {
          name: "Max LOA Duration",
          value: s.maxDurationDays === 0 ? "*Unlimited*" : `**${s.maxDurationDays}** days`,
          inline: true,
        },
        {
          name: "Require Reason",
          value: s.requireReason
            ? `${CE.success.str} Enabled — staff must provide a reason`
            : `${CE.error.str} Disabled — reason is optional`,
          inline: true,
        },
      );
      break;
    }
    case "staffReport": {
      const s = getStaffReportConfig(cfg);
      e.setDescription("Configure the auto-updating staff tier report.");
      e.addFields({
        name: "Refresh Interval",
        value: `Every **${s.refreshIntervalHours}** hour${s.refreshIntervalHours === 1 ? "" : "s"}`,
        inline: true,
      });
      e.setFooter({ text: "The bot checks every hour and refreshes guilds that are due." });
      break;
    }
    case "antiNuke": {
      const s = getAntiNukeConfig(cfg);
      e.setDescription("Configure anti-nuke protections for mass destructive actions.");
      e.addFields(
        {
          name: "Anti-Join Protection",
          value: s.antiJoin.enabled ? `${CE.success.str} Enabled` : `${CE.error.str} Disabled`,
          inline: true,
        },
        {
          name: "Anti-Ban Protection",
          value: s.antiBan.enabled ? `${CE.success.str} Enabled` : `${CE.error.str} Disabled`,
          inline: true,
        },
        {
          name: "Anti-Kick Protection",
          value: s.antiKick.enabled ? `${CE.success.str} Enabled` : `${CE.error.str} Disabled`,
          inline: true,
        },
        {
          name: "Anti-Role Protection",
          value: s.antiRole.enabled ? `${CE.success.str} Enabled` : `${CE.error.str} Disabled`,
          inline: true,
        },
        {
          name: "Anti-Channel Protection",
          value: s.antiChannel.enabled ? `${CE.success.str} Enabled` : `${CE.error.str} Disabled`,
          inline: true,
        },
        {
          name: "Common Punishment",
          value: `\`${s.commonPunishment}\``,
          inline: true,
        },
        {
          name: "Global Whitelisted Users",
          value: s.globalWhitelistUserIds.length > 0
            ? s.globalWhitelistUserIds.map((id) => `<@${id}>`).join(", ")
            : "*None configured*",
          inline: false,
        },
      );
      break;
    }
  }

  return e;
}

function settingsRows(cfg: GuildConfig, modId: string): Row[] {
  switch (modId) {
    case "infractions": {
      const s = getInfractionsConfig(cfg);
      return [
        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId("cfg:settings:modal:infractions")
            .setLabel(`Expiry: ${s.strikeExpiryDays === 0 ? "Never" : `${s.strikeExpiryDays}d`} · Edit Punishments`)
            .setStyle(ButtonStyle.Primary)
            .setEmoji({ id: CE.settings.id, name: CE.settings.name }),
          new ButtonBuilder()
            .setCustomId("cfg:settings:toggle:infractions:dmOnInfraction")
            .setLabel(s.dmOnInfraction ? "DM: Enabled — Click to Disable" : "DM: Disabled — Click to Enable")
            .setStyle(s.dmOnInfraction ? ButtonStyle.Success : ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId("cfg:settings:toggle:infractions:autoDemotionEnabled")
            .setLabel(s.autoDemotionEnabled ? "Auto-Demotion: On — Click to Disable" : "Auto-Demotion: Off — Click to Enable")
            .setStyle(s.autoDemotionEnabled ? ButtonStyle.Success : ButtonStyle.Danger),
        ),
        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId("cfg:mod:view:infractions")
            .setLabel("← Back")
            .setStyle(ButtonStyle.Secondary),
        ),
      ];
    }
    case "moderation": {
      const s = getModerationConfig(cfg);
      return [
        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId("cfg:settings:toggle:moderation:dmOnAction")
            .setLabel(s.dmOnAction ? "DM on Action: Enabled — Click to Disable" : "DM on Action: Disabled — Click to Enable")
            .setStyle(s.dmOnAction ? ButtonStyle.Success : ButtonStyle.Danger),
        ),
        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId("cfg:mod:view:moderation")
            .setLabel("← Back")
            .setStyle(ButtonStyle.Secondary),
        ),
      ];
    }
    case "promotions": {
      const s = getPromotionsConfig(cfg);
      return [
        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId("cfg:settings:toggle:promotions:dmMember")
            .setLabel(s.dmMember ? "DM Member: Enabled — Click to Disable" : "DM Member: Disabled — Click to Enable")
            .setStyle(s.dmMember ? ButtonStyle.Success : ButtonStyle.Danger),
        ),
        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId("cfg:mod:view:promotions")
            .setLabel("← Back")
            .setStyle(ButtonStyle.Secondary),
        ),
      ];
    }
    case "demotions": {
      const s = getDemotionsConfig(cfg);
      return [
        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId("cfg:settings:toggle:demotions:dmMember")
            .setLabel(s.dmMember ? "DM Member: Enabled — Click to Disable" : "DM Member: Disabled — Click to Enable")
            .setStyle(s.dmMember ? ButtonStyle.Success : ButtonStyle.Danger),
        ),
        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId("cfg:mod:view:demotions")
            .setLabel("← Back")
            .setStyle(ButtonStyle.Secondary),
        ),
      ];
    }
    case "appeals": {
      const s = getAppealsConfig(cfg);
      return [
        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId("cfg:settings:modal:appeals")
            .setLabel(`Auto-Close: ${s.autoCloseDays === 0 ? "Disabled" : `${s.autoCloseDays}d`}`)
            .setStyle(ButtonStyle.Primary)
            .setEmoji({ id: CE.settings.id, name: CE.settings.name }),
        ),
        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId("cfg:mod:view:appeals")
            .setLabel("← Back")
            .setStyle(ButtonStyle.Secondary),
        ),
      ];
    }
    case "partnership": {
      const s = getPartnershipConfig(cfg);
      return [
        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId("cfg:settings:modal:partnership")
            .setLabel(`Quota: ${s.quota}`)
            .setStyle(ButtonStyle.Primary)
            .setEmoji({ id: CE.settings.id, name: CE.settings.name }),
        ),
        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId("cfg:partnership:setAnnounce")
            .setLabel("Set Partnership Channel")
            .setStyle(ButtonStyle.Primary)
            .setEmoji({ id: CE.link.id, name: CE.link.name }),
        ),
        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId("cfg:mod:view:partnership")
            .setLabel("← Back")
            .setStyle(ButtonStyle.Secondary),
        ),
      ];
    }
    case "verify": {
      return [
        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId("cfg:mod:setchannel:verify")
            .setLabel("Set Verify Channel")
            .setStyle(ButtonStyle.Primary)
            .setEmoji({ id: CE.check.id, name: CE.check.name }),
        ),
        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId("cfg:verify:sendEmbed")
            .setLabel("Send Verify Embed")
            .setStyle(ButtonStyle.Success)
            .setEmoji({ id: CE.check.id, name: CE.check.name }),
        ),
        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId("cfg:mod:view:verify")
            .setLabel("← Back")
            .setStyle(ButtonStyle.Secondary),
        ),
      ];
    }
    case "loa": {
      const s = getLoaConfig(cfg);
      return [
        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId("cfg:settings:modal:loa")
            .setLabel(`Max Duration: ${s.maxDurationDays === 0 ? "Unlimited" : `${s.maxDurationDays}d`}`)
            .setStyle(ButtonStyle.Primary)
            .setEmoji({ id: CE.settings.id, name: CE.settings.name }),
          new ButtonBuilder()
            .setCustomId("cfg:settings:toggle:loa:requireReason")
            .setLabel(s.requireReason ? "Require Reason: On — Click to Disable" : "Require Reason: Off — Click to Enable")
            .setStyle(s.requireReason ? ButtonStyle.Success : ButtonStyle.Danger),
        ),
        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId("cfg:mod:view:loa")
            .setLabel("← Back")
            .setStyle(ButtonStyle.Secondary),
        ),
      ];
    }
    case "antiNuke": {
      const s = getAntiNukeConfig(cfg);
      return [
        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId("cfg:settings:toggle:antiNuke:antiJoins")
            .setLabel(s.antiJoin.enabled ? "Anti-Join: On" : "Anti-Join: Off")
            .setStyle(s.antiJoin.enabled ? ButtonStyle.Success : ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId("cfg:settings:toggle:antiNuke:antiBans")
            .setLabel(s.antiBan.enabled ? "Anti-Ban: On" : "Anti-Ban: Off")
            .setStyle(s.antiBan.enabled ? ButtonStyle.Success : ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId("cfg:settings:toggle:antiNuke:antiKicks")
            .setLabel(s.antiKick.enabled ? "Anti-Kick: On" : "Anti-Kick: Off")
            .setStyle(s.antiKick.enabled ? ButtonStyle.Success : ButtonStyle.Danger),
        ),
        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId("cfg:settings:toggle:antiNuke:antiRoleChanges")
            .setLabel(s.antiRole.enabled ? "Anti-Role: On" : "Anti-Role: Off")
            .setStyle(s.antiRole.enabled ? ButtonStyle.Success : ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId("cfg:settings:toggle:antiNuke:antiChannelChanges")
            .setLabel(s.antiChannel.enabled ? "Anti-Channel: On" : "Anti-Channel: Off")
            .setStyle(s.antiChannel.enabled ? ButtonStyle.Success : ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId("cfg:settings:modal:antiNuke")
            .setLabel(`Punishment: ${s.commonPunishment}`)
            .setStyle(ButtonStyle.Primary)
            .setEmoji({ id: CE.settings.id, name: CE.settings.name }),
        ),
        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId("cfg:antiNuke:setUsers")
            .setLabel("Manage Whitelisted Users")
            .setStyle(ButtonStyle.Primary)
            .setEmoji({ id: CE.admin.id, name: CE.admin.name }),
        ),
        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId("cfg:mod:view:antiNuke")
            .setLabel("← Back")
            .setStyle(ButtonStyle.Secondary),
        ),
      ];
    }
    case "staffReport": {
      const s = getStaffReportConfig(cfg);
      const sel = new StringSelectMenuBuilder()
        .setCustomId("cfg:staffReport:intervalSelect")
        .setPlaceholder("Select auto-refresh interval")
        .addOptions(
          [1, 2, 4, 6, 12, 24].map((h) => ({
            label: h === 1 ? "Every hour" : `Every ${h} hours`,
            value: String(h),
            default: s.refreshIntervalHours === h,
          })),
        );
      return [
        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(sel),
        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId("cfg:mod:view:staffReport")
            .setLabel("← Back")
            .setStyle(ButtonStyle.Secondary),
        ),
      ];
    }
    default:
      return [backRow()];
  }
}

function buildSettingsModal(cfg: GuildConfig, modId: string): ModalBuilder | null {
  switch (modId) {
    case "infractions": {
      const s = getInfractionsConfig(cfg);
      return new ModalBuilder()
        .setCustomId("cfg:settings:modalResult:infractions")
        .setTitle("Infractions Settings")
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId("strikeExpiryDays")
              .setLabel("Strike expiry in days (0 = never expire)")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setValue(String(s.strikeExpiryDays))
              .setPlaceholder("30"),
          ),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId("strikeAction1")
              .setLabel("Punishment at 1 active strike")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setValue(s.strikeAction1)
              .setPlaceholder("none / warning / strike / demotion / termination"),
          ),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId("strikeAction2")
              .setLabel("Punishment at 2 active strikes")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setValue(s.strikeAction2)
              .setPlaceholder("none / warning / strike / demotion / termination"),
          ),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId("strikeAction3plus")
              .setLabel("Punishment at 3+ active strikes")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setValue(s.strikeAction3plus)
              .setPlaceholder("none / warning / strike / demotion / termination"),
          ),
        );
    }
    case "appeals": {
      const s = getAppealsConfig(cfg);
      return new ModalBuilder()
        .setCustomId("cfg:settings:modalResult:appeals")
        .setTitle("Appeals Settings")
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId("autoCloseDays")
              .setLabel("Auto-close pending appeals after days (0 = off)")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setValue(String(s.autoCloseDays))
              .setPlaceholder("0"),
          ),
        );
    }
    case "loa": {
      const s = getLoaConfig(cfg);
      return new ModalBuilder()
        .setCustomId("cfg:settings:modalResult:loa")
        .setTitle("Leave of Absence Settings")
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId("maxDurationDays")
              .setLabel("Max LOA duration in days (0 = unlimited)")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setValue(String(s.maxDurationDays))
              .setPlaceholder("0"),
          ),
        );
    }
    case "partnership": {
      const s = getPartnershipConfig(cfg);
      return new ModalBuilder()
        .setCustomId("cfg:settings:modalResult:partnership")
        .setTitle("Partnership Settings")
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId("quota")
              .setLabel("Approved partnerships quota")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setValue(String(s.quota))
              .setPlaceholder("0"),
          ),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId("failureAction1")
              .setLabel("1st failure action")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setValue(String(s.failureActions[1]))
              .setPlaceholder("none"),
          ),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId("failureAction2")
              .setLabel("2nd failure action")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setValue(String(s.failureActions[2]))
              .setPlaceholder("none"),
          ),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId("failureAction3")
              .setLabel("3rd failure action")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setValue(String(s.failureActions[3]))
              .setPlaceholder("none"),
          ),
        );
    }
    case "antiNuke": {
      const s = getAntiNukeConfig(cfg);
      return new ModalBuilder()
        .setCustomId("cfg:settings:modalResult:antiNuke")
        .setTitle("Anti-Nuke Common Punishment")
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId("punishmentAction")
              .setLabel("Common punishment for anti-nuke protection")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setValue(s.commonPunishment)
              .setPlaceholder("none / kick / ban / timeout_1h / timeout_24h / timeout_7d"),
          ),
        );
    }
    case "quotaFailure": {
      const s = getQuotaFailureConfig(cfg);
      return new ModalBuilder()
        .setCustomId("cfg:quotaFailureModalResult")
        .setTitle("Quota Failure Punishments")
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId("failure1")
              .setLabel("Punishment on 1st consecutive missed week")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setValue(s.failure1)
              .setPlaceholder("none / warning / strike / demotion / termination"),
          ),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId("failure2")
              .setLabel("Punishment on 2nd consecutive missed week")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setValue(s.failure2)
              .setPlaceholder("none / warning / strike / demotion / termination"),
          ),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId("failure3plus")
              .setLabel("Punishment on 3rd+ consecutive missed week")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setValue(s.failure3plus)
              .setPlaceholder("none / warning / strike / demotion / termination"),
          ),
        );
    }
    default:
      return null;
  }
}

function buildAntiNukeUsersModal(cfg: GuildConfig): ModalBuilder {
  const s = getAntiNukeConfig(cfg);
  return new ModalBuilder()
    .setCustomId("cfg:antiNuke:usersModalResult")
    .setTitle("Anti-Nuke Global Whitelist Users")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("whitelistedUserIds")
          .setLabel("Global user IDs that bypass anti-nuke checks")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false)
          .setValue(s.globalWhitelistUserIds.join(", "))
          .setPlaceholder("123456789012345678, 987654321098765432"),
      ),
    );
}

// ── Prefix view ───────────────────────────────────────────────────────────────

function buildPrefixEmbed(cfg: GuildConfig): EmbedBuilder {
  const prefix = cfg.guildPrefix ?? "b?";
  return new EmbedBuilder()
    .setTitle(`${CE.settings.str} Custom Prefix`)
    .setColor(0x5865f2)
    .setDescription(
      "Set a custom command prefix for this server.\n" +
      "Only the DM broadcast command is affected — nuke and highfi are always `bp?`.",
    )
    .addFields(
      { name: "Current Prefix", value: `\`${prefix}\``, inline: true },
      { name: "DM Command", value: `\`${prefix}n\``, inline: true },
      { name: "Always Fixed", value: "`bp?nuke`  ·  `bp?highfi`", inline: true },
    );
}

function prefixRows(cfg: GuildConfig): Row[] {
  const prefix = cfg.guildPrefix ?? "b?";
  const isDefault = !cfg.guildPrefix || cfg.guildPrefix === "b?";
  return [
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("cfg:prefix:set")
        .setLabel(`Set Prefix (current: ${prefix})`)
        .setStyle(ButtonStyle.Primary)
        .setEmoji({ id: CE.settings.id, name: CE.settings.name }),
      new ButtonBuilder()
        .setCustomId("cfg:prefix:reset")
        .setLabel("Reset to Default (b?)")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(isDefault),
    ),
    backRow(),
  ];
}

function prefixModal(cfg: GuildConfig): ModalBuilder {
  return new ModalBuilder()
    .setCustomId("cfg:prefix:modal")
    .setTitle("Set Custom Prefix")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("prefix")
          .setLabel("Command prefix (1–10 characters)")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMinLength(1)
          .setMaxLength(10)
          .setValue(cfg.guildPrefix ?? "b?")
          .setPlaceholder("b?"),
      ),
    );
}

// ── Bot Profile view ──────────────────────────────────────────────────────────

function buildBotProfileEmbed(nickname: string | null, avatarUrl: string, note?: string): EmbedBuilder {
  const e = new EmbedBuilder()
    .setTitle(`${CE.admin.str} Bot Profile — This Server`)
    .setColor(0x5865f2)
    .setThumbnail(avatarUrl || null)
    .setDescription(
      note ??
      "Change the bot's display name for this server only.\n" +
      "Avatar cannot be set per server from this menu.\n\n" +
      "Tip: use `/setavatar` to update the global bot avatar instead.",
    )
    .addFields({
      name: "Current Nickname",
      value: nickname ? `**${nickname}**` : "*None — using global bot name*",
      inline: true,
    });
  return e;
}

function botProfileRows(): Row[] {
  return [
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("cfg:botProfile:set")
        .setLabel("Change Nickname / Avatar")
        .setStyle(ButtonStyle.Primary)
        .setEmoji({ id: CE.admin.id, name: CE.admin.name }),
      new ButtonBuilder()
        .setCustomId("cfg:botProfile:resetNickname")
        .setLabel("Reset Nickname")
        .setStyle(ButtonStyle.Secondary),
    ),
    backRow(),
  ];
}

function botProfileModal(currentNick: string | null): ModalBuilder {
  return new ModalBuilder()
    .setCustomId("cfg:botProfile:modal")
    .setTitle("Change Bot Profile")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("nickname")
          .setLabel("Server Nickname (blank = clear)")
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(32)
          .setValue(currentNick ?? "")
          .setPlaceholder("Zenvy"),
      ),
    );
}

// ── Quota-specific builders ───────────────────────────────────────────────────

function buildQuotaEmbed(c: GuildConfig): EmbedBuilder {
  const e = new EmbedBuilder().setTitle("Quota Configuration").setColor(0x5865f2);
  if (c.quotaConfig) {
    e.addFields(
      { name: "Global — Messages / week", value: String(c.quotaConfig.messages), inline: true },
      { name: "Global — Mod actions / week", value: String(c.quotaConfig.modActions), inline: true },
      { name: "Week starts on", value: WEEKDAYS[c.quotaConfig.weekStartDay] ?? "Sunday", inline: true },
    );
    const rqEntries = Object.entries(c.roleQuotas ?? {});
    if (rqEntries.length > 0) {
      e.addFields({
        name: `${CE.settings.str} Per-Role Overrides`,
        value: rqEntries
          .map(([roleId, rq]) => `<@&${roleId}>: **${rq.messages}** msgs / **${rq.modActions}** mod actions`)
          .join("\n"),
        inline: false,
      });
    }
    const wl = c.quotaWhitelistRoles ?? [];
    e.addFields({
      name: `${CE.error.str} Quota Whitelist (exempt from check)`,
      value: wl.length > 0 ? wl.map((r) => `<@&${r}>`).join(", ") : "*None — all staff are checked*",
      inline: false,
    });
  } else {
    e.setDescription("Quota is **not configured**. Press *Set Targets* to define weekly goals.");
  }
  // Always show failure punishment configuration
  const qf = getQuotaFailureConfig(c);
  e.addFields({
    name: `${CE.warning.str} Consecutive Miss Punishments`,
    value: [
      `**1st miss:** \`${qf.failure1}\``,
      `**2nd miss:** \`${qf.failure2}\``,
      `**3rd+ miss:** \`${qf.failure3plus}\``,
    ].join("\n"),
    inline: false,
  });
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
      .setEmoji({ id: CE.staff.id, name: CE.staff.name })
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
      .setEmoji({ id: CE.admin.id, name: CE.admin.name })
      .setDisabled(!c.quotaConfig),
    new ButtonBuilder()
      .setCustomId("cfg:quotaFailurePunishments")
      .setLabel("Failure Punishments")
      .setStyle(ButtonStyle.Primary)
      .setEmoji({ id: CE.warning.id, name: CE.warning.name }),
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
    rmSel.addOptions(
      wl.slice(0, 25).map((r) => ({
        label: roleNameMap.get(r) ?? `Role ${r}`,
        value: r,
        description: `ID: ${r}`,
      })),
    );
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

// ── Staff roles view ──────────────────────────────────────────────────────────

async function staffRolesView(guildId: string): Promise<{ embed: EmbedBuilder; rows: Row[] }> {
  const roles = await listStaffRoles(guildId);
  const embed = new EmbedBuilder()
    .setTitle("Staff Roles")
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

// ── Anti-Nuke UI ──────────────────────────────────────────────────────────────

const AN_PUNISHMENT_LABELS: Record<AntiNukePunishment, string> = {
  none: "None (log only)",
  kick: "Kick",
  ban: "Ban",
  timeout_1h: "Timeout 1 hour",
  timeout_24h: "Timeout 24 hours",
  timeout_7d: "Timeout 7 days",
};

const AN_MINI_LABELS: Record<AntiNukeMiniId, { label: string; description: string }> = {
  antiJoin:    { label: "Anti-Join",    description: "Punish users who repeatedly join/leave the server." },
  antiBan:     { label: "Anti-Ban",     description: "Punish users who issue unauthorized bans." },
  antiKick:    { label: "Anti-Kick",    description: "Punish users who issue unauthorized kicks." },
  antiRole:    { label: "Anti-Role",    description: "Punish dangerous role creation/deletion/assignment." },
  antiChannel: { label: "Anti-Channel", description: "Punish unauthorized channel creation or deletion." },
};

function buildAntiNukeOverviewEmbed(cfg: GuildConfig): EmbedBuilder {
  const an = getAntiNukeConfig(cfg);
  const st = (b: boolean) => (b ? CE.success.str : CE.error.str);
  const lines = [
    `${st(an.antiJoin.enabled)} **Anti-Join** — Threshold: **${an.antiJoin.threshold}** joins in **${an.antiJoin.windowSeconds}s** · Punishment: \`${an.antiJoin.punishment}\``,
    `${st(an.antiBan.enabled)} **Anti-Ban** · Punishment: \`${an.antiBan.punishment}\``,
    `${st(an.antiKick.enabled)} **Anti-Kick** · Punishment: \`${an.antiKick.punishment}\``,
    `${st(an.antiRole.enabled)} **Anti-Role** · Punishment: \`${an.antiRole.punishment}\``,
    `${st(an.antiChannel.enabled)} **Anti-Channel** · Punishment: \`${an.antiChannel.punishment}\``,
  ];
  const e = new EmbedBuilder()
    .setTitle(`${CE.termination.str} Anti-Nuke`)
    .setColor(an.enabled ? 0x57f287 : 0xed4245)
    .addFields(
      { name: `Status`, value: an.enabled ? `${CE.success.str} **Enabled**` : `${CE.error.str} **Disabled**`, inline: true },
      { name: `${CE.warning.str} Common Punishment`, value: `\`${an.commonPunishment}\``, inline: true },
    )
    .setDescription(lines.join("\n"));
  if (an.accessUserIds.length > 0) {
    e.addFields({
      name: `${CE.admin.str} Extra Access Users`,
      value: an.accessUserIds.slice(0, 10).map((id) => `<@${id}>`).join(", "),
      inline: false,
    });
  }
  const wlParts: string[] = [];
  if (an.globalWhitelistUserIds.length > 0) wlParts.push(an.globalWhitelistUserIds.slice(0, 5).map((id) => `<@${id}>`).join(", "));
  if (an.globalWhitelistRoleIds.length > 0) wlParts.push(an.globalWhitelistRoleIds.slice(0, 5).map((id) => `<@&${id}>`).join(", "));
  if (wlParts.length > 0) {
    e.addFields({ name: `${CE.members.str} Global Whitelist`, value: wlParts.join(" · "), inline: false });
  }
  const logCh = cfg.channels.antiNukeLog;
  e.addFields({
    name: `${CE.settings.str} Log Channel`,
    value: logCh ? `<#${logCh}>` : "*Not set* — trigger events won't be logged",
    inline: false,
  });
  e.setFooter({ text: "Access: global whitelist · roles above bot · extra access users" });
  return e;
}

function antiNukeOverviewRows(cfg: GuildConfig): Row[] {
  const an = getAntiNukeConfig(cfg);
  const miniSel = new StringSelectMenuBuilder()
    .setCustomId("cfg:an:miniSelect")
    .setPlaceholder("Select a mini-module to configure")
    .addOptions(
      (Object.keys(AN_MINI_LABELS) as AntiNukeMiniId[]).map((id) => ({
        label: AN_MINI_LABELS[id].label,
        value: id,
        description: AN_MINI_LABELS[id].description,
      })),
    );
  const row2 = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("cfg:an:toggle")
      .setLabel(an.enabled ? "Enabled — Click to Disable" : "Disabled — Click to Enable")
      .setStyle(an.enabled ? ButtonStyle.Success : ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId("cfg:an:enableAll")
      .setLabel("Enable All")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("cfg:an:disableAll")
      .setLabel("Disable All")
      .setStyle(ButtonStyle.Secondary),
  );
  const row3 = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("cfg:an:access")
      .setLabel("Access Control")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji({ id: CE.admin.id, name: CE.admin.name }),
    new ButtonBuilder()
      .setCustomId("cfg:an:globalWL")
      .setLabel("Global Whitelist")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji({ id: CE.members.id, name: CE.members.name }),
    new ButtonBuilder()
      .setCustomId("cfg:an:commonPunish")
      .setLabel("Common Punishment")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji({ id: CE.warning.id, name: CE.warning.name }),
    new ButtonBuilder()
      .setCustomId("cfg:an:setLogChannel")
      .setLabel(cfg.channels.antiNukeLog ? "Change Log Channel" : "Set Log Channel")
      .setStyle(ButtonStyle.Primary)
      .setEmoji({ id: CE.settings.id, name: CE.settings.name }),
  );
  return [
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(miniSel),
    row2,
    row3,
    backRow(),
  ];
}

function buildAntiNukeMiniEmbed(cfg: GuildConfig, miniId: AntiNukeMiniId): EmbedBuilder {
  const an = getAntiNukeConfig(cfg);
  const mini = an[miniId];
  const info = AN_MINI_LABELS[miniId];
  const e = new EmbedBuilder()
    .setTitle(`${CE.termination.str} Anti-Nuke · ${info.label}`)
    .setColor(mini.enabled ? 0x57f287 : 0xed4245)
    .addFields(
      { name: "Status", value: mini.enabled ? `${CE.success.str} Enabled` : `${CE.error.str} Disabled`, inline: true },
      { name: "Punishment", value: `\`${mini.punishment}\``, inline: true },
    );
  if (miniId === "antiJoin") {
    const aj = an.antiJoin;
    e.addFields(
      { name: "Join Threshold", value: `**${aj.threshold}** joins`, inline: true },
      { name: "Time Window", value: `**${aj.windowSeconds}** seconds`, inline: true },
    );
  }
  const wlParts: string[] = [];
  if (mini.whitelistUserIds.length > 0) wlParts.push(mini.whitelistUserIds.slice(0, 5).map((id) => `<@${id}>`).join(", "));
  if (mini.whitelistRoleIds.length > 0) wlParts.push(mini.whitelistRoleIds.slice(0, 5).map((id) => `<@&${id}>`).join(", "));
  e.addFields({
    name: `${CE.members.str} Module Whitelist`,
    value: wlParts.length > 0 ? wlParts.join(" · ") : "*None*",
    inline: false,
  });
  return e;
}

function antiNukeMiniRows(cfg: GuildConfig, miniId: AntiNukeMiniId): Row[] {
  const an = getAntiNukeConfig(cfg);
  const mini = an[miniId];
  const punishSel = new StringSelectMenuBuilder()
    .setCustomId(`cfg:an:mini:punish:${miniId}`)
    .setPlaceholder("Set punishment for this module")
    .addOptions(
      (Object.entries(AN_PUNISHMENT_LABELS) as [AntiNukePunishment, string][]).map(([value, label]) => ({
        label,
        value,
        default: mini.punishment === value,
      })),
    );
  const actionRow = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`cfg:an:mini:toggle:${miniId}`)
      .setLabel(mini.enabled ? "Enabled — Click to Disable" : "Disabled — Click to Enable")
      .setStyle(mini.enabled ? ButtonStyle.Success : ButtonStyle.Danger),
  );
  if (miniId === "antiJoin") {
    actionRow.addComponents(
      new ButtonBuilder()
        .setCustomId("cfg:an:mini:joinThreshold")
        .setLabel("Set Threshold / Window")
        .setStyle(ButtonStyle.Primary)
        .setEmoji({ id: CE.settings.id, name: CE.settings.name }),
    );
  }
  return [
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(punishSel),
    actionRow,
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new UserSelectMenuBuilder()
        .setCustomId(`cfg:an:mini:wlUser:${miniId}`)
        .setPlaceholder("Add users to this module's whitelist")
        .setMinValues(1)
        .setMaxValues(10),
    ),
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new RoleSelectMenuBuilder()
        .setCustomId(`cfg:an:mini:wlRole:${miniId}`)
        .setPlaceholder("Add roles to this module's whitelist")
        .setMinValues(1)
        .setMaxValues(10),
    ),
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`cfg:an:mini:wlClear:${miniId}`)
        .setLabel("Clear Module Whitelist")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId("cfg:an:overview")
        .setLabel("← Anti-Nuke")
        .setStyle(ButtonStyle.Secondary),
    ),
  ];
}

function buildAntiNukeAccessEmbed(cfg: GuildConfig): EmbedBuilder {
  const an = getAntiNukeConfig(cfg);
  return new EmbedBuilder()
    .setTitle(`${CE.admin.str} Anti-Nuke · Access Control`)
    .setColor(0x5865f2)
    .setDescription(
      "These users can open the Anti-Nuke config panel even without a role above the bot.\n" +
      "**Global whitelist members and users with roles above the bot always have access.**",
    )
    .addFields({
      name: "Extra Access Users",
      value: an.accessUserIds.length > 0
        ? an.accessUserIds.map((id) => `<@${id}>`).join(", ")
        : "*None — only global whitelist + roles above bot*",
      inline: false,
    });
}

function antiNukeAccessRows(cfg: GuildConfig): Row[] {
  const an = getAntiNukeConfig(cfg);
  const rmSel = new StringSelectMenuBuilder()
    .setCustomId("cfg:an:accessRemove")
    .setPlaceholder("Remove a user from Anti-Nuke access")
    .setMinValues(1)
    .setMaxValues(1);
  if (an.accessUserIds.length > 0) {
    rmSel.addOptions(an.accessUserIds.slice(0, 25).map((id) => ({ label: `User ${id}`, value: id, description: id })));
  } else {
    rmSel.addOptions({ label: "(no extra users)", value: "_noop", default: true }).setDisabled(true);
  }
  return [
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new UserSelectMenuBuilder()
        .setCustomId("cfg:an:accessAdd")
        .setPlaceholder("Add users to Anti-Nuke access")
        .setMinValues(1)
        .setMaxValues(10),
    ),
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(rmSel),
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("cfg:an:overview")
        .setLabel("← Anti-Nuke")
        .setStyle(ButtonStyle.Secondary),
    ),
  ];
}

function buildAntiNukeGlobalWLEmbed(cfg: GuildConfig): EmbedBuilder {
  const an = getAntiNukeConfig(cfg);
  return new EmbedBuilder()
    .setTitle(`${CE.members.str} Anti-Nuke · Global Whitelist`)
    .setColor(0x5865f2)
    .setDescription("Users and roles here are exempt from **all** anti-nuke actions.")
    .addFields(
      {
        name: "Whitelisted Users",
        value: an.globalWhitelistUserIds.length > 0
          ? an.globalWhitelistUserIds.map((id) => `<@${id}>`).join(", ")
          : "*None*",
        inline: false,
      },
      {
        name: "Whitelisted Roles",
        value: an.globalWhitelistRoleIds.length > 0
          ? an.globalWhitelistRoleIds.map((id) => `<@&${id}>`).join(", ")
          : "*None*",
        inline: false,
      },
    );
}

function antiNukeGlobalWLRows(): Row[] {
  return [
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new UserSelectMenuBuilder()
        .setCustomId("cfg:an:gwlAddUser")
        .setPlaceholder("Add users to global whitelist")
        .setMinValues(1)
        .setMaxValues(10),
    ),
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new RoleSelectMenuBuilder()
        .setCustomId("cfg:an:gwlAddRole")
        .setPlaceholder("Add roles to global whitelist")
        .setMinValues(1)
        .setMaxValues(10),
    ),
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("cfg:an:gwlClearUsers")
        .setLabel("Clear Users")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId("cfg:an:gwlClearRoles")
        .setLabel("Clear Roles")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId("cfg:an:overview")
        .setLabel("← Anti-Nuke")
        .setStyle(ButtonStyle.Secondary),
    ),
  ];
}

// ── Command definition ────────────────────────────────────────────────────────

const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("config")
    .setDescription("Open the bot configuration menu for this server.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.inGuild() || !interaction.guildId) {
      await interaction.reply({ content: "Run this in a server.", flags: 1 << 6 });
      return;
    }
    if (!isAdminOrOwner(interaction) && !PERM_WHITELIST.has(interaction.user.id)) {
      await interaction.reply({ content: "Only administrators can change the config.", flags: 1 << 6 });
      return;
    }

    const guildId = interaction.guildId;
    await interaction.deferReply();
    let cfg = await getGuildConfig(guildId);

    const reply = await interaction.editReply({
      embeds: [buildOverviewEmbed(cfg)],
      components: [mainDropdownRow(), closeRow()],
    });

    async function safeUpdate(interaction: any, payload: any): Promise<void> {
      try {
        await interaction.update(payload);
      } catch (err: unknown) {
        logger.warn({ err, customId: interaction.customId }, "Fallback update failed, editing original message");
        try {
          if (interaction.message?.edit) {
            await interaction.message.edit(payload).catch(() => {});
          } else if (typeof interaction.editReply === 'function') {
            await interaction.editReply(payload).catch(() => {});
          }
        } catch {
          // ignore
        }
      }
    }

    async function safeSubmitUpdate(interaction: any, payload: any): Promise<void> {
      try {
        await interaction.update(payload);
      } catch (err: unknown) {
        logger.warn({ err, customId: interaction.customId }, "Fallback submit update failed, replying instead");
        try {
          await interaction.reply(payload).catch(() => {});
        } catch {
          // ignore
        }
      }
    }


    const collector = reply.createMessageComponentCollector({
      filter: (i) => i.user.id === interaction.user.id,
      idle: 5 * 60 * 1000,
      time: 15 * 60 * 1000,
    });

    collector.on("collect", async (i) => {
      try {
        const id = i.customId;

        // ── Navigation ──────────────────────────────────────────────────────

        if (id === "cfg:close") {
          collector.stop("closed");
          await safeUpdate(i, { content: "Configuration closed.", embeds: [], components: [] });
          return;
        }

        if (id === "cfg:back") {
          cfg = await getGuildConfig(guildId);
          await safeUpdate(i, { embeds: [buildOverviewEmbed(cfg)], components: [mainDropdownRow(), closeRow()] });
          return;
        }

        if (id === "cfg:module:select" && i.isStringSelectMenu()) {
          const modId = i.values[0]!;
          cfg = await getGuildConfig(guildId);

          if (modId === "staff") {
            const view = await staffRolesView(guildId);
            await safeUpdate(i, { embeds: [view.embed], components: view.rows });
            return;
          }
          if (modId === "quota") {
            await safeUpdate(i, { embeds: [buildQuotaEmbed(cfg)], components: quotaRows(cfg) });
            return;
          }
          if (modId === "prefix") {
            await safeUpdate(i, { embeds: [buildPrefixEmbed(cfg)], components: prefixRows(cfg) });
            return;
          }
          if (modId === "botProfile") {
            const me = i.guild?.members.me;
            await safeUpdate(i, {
              embeds: [buildBotProfileEmbed(me?.nickname ?? null, me?.displayAvatarURL() ?? "")],
              components: botProfileRows(),
            });
            return;
          }
          if (modId === "antiNuke") {
            const botMember = i.guild?.members.me;
            const member = await i.guild?.members.fetch(i.user.id).catch(() => null);
            const hasAccess =
              PERM_WHITELIST.has(i.user.id) ||
              (cfg.antiNukeConfig?.accessUserIds?.includes(i.user.id) ?? false) ||
              (botMember && member && member.roles.highest.position > botMember.roles.highest.position);
            if (!hasAccess) {
              await i.reply({ content: `${CE.error.str} You need a role above the bot, global whitelist, or Anti-Nuke access to configure this module.`, flags: 1 << 6 });
              return;
            }
            await i.update({ embeds: [buildAntiNukeOverviewEmbed(cfg)], components: antiNukeOverviewRows(cfg) });
            return;
          }
          if (modId === "shop") {
            const ss = await getShopSettings(guildId);
            await safeUpdate(i, { embeds: [buildShopOverviewEmbed(ss)], components: shopOverviewRows(ss) });
            return;
          }
          const mod = MODULE_DEFS.find((m) => m.id === modId);
          if (!mod) return;
          await safeUpdate(i, { embeds: [buildModuleEmbed(cfg, mod)], components: moduleActionRows(cfg, mod) });
          return;
        }

        if (id.startsWith("cfg:mod:view:")) {
          const modId = id.slice("cfg:mod:view:".length);
          cfg = await getGuildConfig(guildId);

          if (modId === "staff") {
            const view = await staffRolesView(guildId);
            await safeUpdate(i, { embeds: [view.embed], components: view.rows });
            return;
          }
          if (modId === "quota") {
            await safeUpdate(i, { embeds: [buildQuotaEmbed(cfg)], components: quotaRows(cfg) });
            return;
          }
          if (modId === "prefix") {
            await safeUpdate(i, { embeds: [buildPrefixEmbed(cfg)], components: prefixRows(cfg) });
            return;
          }
          if (modId === "botProfile") {
            const me = i.guild?.members.me;
            await safeUpdate(i, {
              embeds: [buildBotProfileEmbed(me?.nickname ?? null, me?.displayAvatarURL() ?? "")],
              components: botProfileRows(),
            });
            return;
          }
          const mod = MODULE_DEFS.find((m) => m.id === modId);
          if (!mod) return;
          await safeUpdate(i, { embeds: [buildModuleEmbed(cfg, mod)], components: moduleActionRows(cfg, mod) });
          return;
        }

        // ── Anti-Nuke handlers ────────────────────────────────────────────────

        if (id === "cfg:an:overview") {
          cfg = await getGuildConfig(guildId);
          await i.update({ embeds: [buildAntiNukeOverviewEmbed(cfg)], components: antiNukeOverviewRows(cfg) });
          return;
        }

        if (id === "cfg:an:toggle") {
          cfg = await updateGuildConfig(guildId, (c) => {
            const an = getAntiNukeConfig(c);
            an.enabled = !an.enabled;
            c.antiNukeConfig = an;
            return c;
          });
          await i.update({ embeds: [buildAntiNukeOverviewEmbed(cfg)], components: antiNukeOverviewRows(cfg) });
          return;
        }

        if (id === "cfg:an:enableAll") {
          cfg = await updateGuildConfig(guildId, (c) => {
            const an = getAntiNukeConfig(c);
            an.enabled = true;
            const common = an.commonPunishment;
            an.antiJoin.enabled = true;
            an.antiJoin.punishment = common;
            an.antiBan.enabled = true;
            an.antiBan.punishment = common;
            an.antiKick.enabled = true;
            an.antiKick.punishment = common;
            an.antiRole.enabled = true;
            an.antiRole.punishment = common;
            an.antiChannel.enabled = true;
            an.antiChannel.punishment = common;
            c.antiNukeConfig = an;
            return c;
          });
          await i.update({ embeds: [buildAntiNukeOverviewEmbed(cfg)], components: antiNukeOverviewRows(cfg) });
          return;
        }

        if (id === "cfg:an:disableAll") {
          cfg = await updateGuildConfig(guildId, (c) => {
            const an = getAntiNukeConfig(c);
            an.antiJoin.enabled = false;
            an.antiBan.enabled = false;
            an.antiKick.enabled = false;
            an.antiRole.enabled = false;
            an.antiChannel.enabled = false;
            c.antiNukeConfig = an;
            return c;
          });
          await i.update({ embeds: [buildAntiNukeOverviewEmbed(cfg)], components: antiNukeOverviewRows(cfg) });
          return;
        }

        if (id === "cfg:an:commonPunish") {
          const commonPunishSel = new StringSelectMenuBuilder()
            .setCustomId("cfg:an:commonPunishSet")
            .setPlaceholder("Select common punishment")
            .addOptions(
              (Object.entries(AN_PUNISHMENT_LABELS) as [AntiNukePunishment, string][]).map(([value, label]) => ({
                label, value,
                default: (cfg.antiNukeConfig?.commonPunishment ?? "none") === value,
              })),
            );
          await i.update({
            embeds: [
              new EmbedBuilder()
                .setTitle(`${CE.warning.str} Anti-Nuke · Common Punishment`)
                .setColor(0x5865f2)
                .setDescription("Select the punishment to use when **Enable All** is applied.\nThis also sets the punishment for all mini-modules when you press Enable All."),
            ],
            components: [
              new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(commonPunishSel),
              new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
                new ButtonBuilder().setCustomId("cfg:an:overview").setLabel("← Anti-Nuke").setStyle(ButtonStyle.Secondary),
              ),
            ],
          });
          return;
        }

        if (id === "cfg:an:commonPunishSet" && i.isStringSelectMenu()) {
          const punishment = i.values[0] as AntiNukePunishment;
          cfg = await updateGuildConfig(guildId, (c) => {
            const an = getAntiNukeConfig(c);
            an.commonPunishment = punishment;
            c.antiNukeConfig = an;
            return c;
          });
          await i.update({ embeds: [buildAntiNukeOverviewEmbed(cfg)], components: antiNukeOverviewRows(cfg) });
          return;
        }

        if (id === "cfg:an:access") {
          cfg = await getGuildConfig(guildId);
          await i.update({ embeds: [buildAntiNukeAccessEmbed(cfg)], components: antiNukeAccessRows(cfg) });
          return;
        }

        if (id === "cfg:an:accessAdd" && i.isUserSelectMenu()) {
          const toAdd = i.values.filter((uid) => !(cfg.antiNukeConfig?.accessUserIds ?? []).includes(uid));
          if (toAdd.length > 0) {
            cfg = await updateGuildConfig(guildId, (c) => {
              const an = getAntiNukeConfig(c);
              an.accessUserIds = [...an.accessUserIds, ...toAdd];
              c.antiNukeConfig = an;
              return c;
            });
          }
          await i.update({ embeds: [buildAntiNukeAccessEmbed(cfg)], components: antiNukeAccessRows(cfg) });
          return;
        }

        if (id === "cfg:an:accessRemove" && i.isStringSelectMenu()) {
          const toRemove = i.values[0]!;
          if (toRemove !== "_noop") {
            cfg = await updateGuildConfig(guildId, (c) => {
              const an = getAntiNukeConfig(c);
              an.accessUserIds = an.accessUserIds.filter((uid) => uid !== toRemove);
              c.antiNukeConfig = an;
              return c;
            });
          }
          await i.update({ embeds: [buildAntiNukeAccessEmbed(cfg)], components: antiNukeAccessRows(cfg) });
          return;
        }

        if (id === "cfg:an:globalWL") {
          cfg = await getGuildConfig(guildId);
          await i.update({ embeds: [buildAntiNukeGlobalWLEmbed(cfg)], components: antiNukeGlobalWLRows() });
          return;
        }

        if (id === "cfg:an:gwlAddUser" && i.isUserSelectMenu()) {
          const toAdd = i.values.filter((uid) => !(cfg.antiNukeConfig?.globalWhitelistUserIds ?? []).includes(uid));
          if (toAdd.length > 0) {
            cfg = await updateGuildConfig(guildId, (c) => {
              const an = getAntiNukeConfig(c);
              an.globalWhitelistUserIds = [...an.globalWhitelistUserIds, ...toAdd];
              c.antiNukeConfig = an;
              return c;
            });
          }
          await i.update({ embeds: [buildAntiNukeGlobalWLEmbed(cfg)], components: antiNukeGlobalWLRows() });
          return;
        }

        if (id === "cfg:an:gwlAddRole" && i.isRoleSelectMenu()) {
          const toAdd = i.values.filter((rid) => !(cfg.antiNukeConfig?.globalWhitelistRoleIds ?? []).includes(rid));
          if (toAdd.length > 0) {
            cfg = await updateGuildConfig(guildId, (c) => {
              const an = getAntiNukeConfig(c);
              an.globalWhitelistRoleIds = [...an.globalWhitelistRoleIds, ...toAdd];
              c.antiNukeConfig = an;
              return c;
            });
          }
          await i.update({ embeds: [buildAntiNukeGlobalWLEmbed(cfg)], components: antiNukeGlobalWLRows() });
          return;
        }

        if (id === "cfg:an:gwlClearUsers") {
          cfg = await updateGuildConfig(guildId, (c) => {
            const an = getAntiNukeConfig(c);
            an.globalWhitelistUserIds = [];
            c.antiNukeConfig = an;
            return c;
          });
          await i.update({ embeds: [buildAntiNukeGlobalWLEmbed(cfg)], components: antiNukeGlobalWLRows() });
          return;
        }

        if (id === "cfg:an:gwlClearRoles") {
          cfg = await updateGuildConfig(guildId, (c) => {
            const an = getAntiNukeConfig(c);
            an.globalWhitelistRoleIds = [];
            c.antiNukeConfig = an;
            return c;
          });
          await i.update({ embeds: [buildAntiNukeGlobalWLEmbed(cfg)], components: antiNukeGlobalWLRows() });
          return;
        }

        if (id === "cfg:an:miniSelect" && i.isStringSelectMenu()) {
          const miniId = i.values[0] as AntiNukeMiniId;
          cfg = await getGuildConfig(guildId);
          await i.update({ embeds: [buildAntiNukeMiniEmbed(cfg, miniId)], components: antiNukeMiniRows(cfg, miniId) });
          return;
        }

        if (id.startsWith("cfg:an:mini:toggle:")) {
          const miniId = id.slice("cfg:an:mini:toggle:".length) as AntiNukeMiniId;
          cfg = await updateGuildConfig(guildId, (c) => {
            const an = getAntiNukeConfig(c);
            (an[miniId] as any).enabled = !(an[miniId] as any).enabled;
            c.antiNukeConfig = an;
            return c;
          });
          await i.update({ embeds: [buildAntiNukeMiniEmbed(cfg, miniId)], components: antiNukeMiniRows(cfg, miniId) });
          return;
        }

        if (id.startsWith("cfg:an:mini:punish:") && i.isStringSelectMenu()) {
          const miniId = id.slice("cfg:an:mini:punish:".length) as AntiNukeMiniId;
          const punishment = i.values[0] as AntiNukePunishment;
          cfg = await updateGuildConfig(guildId, (c) => {
            const an = getAntiNukeConfig(c);
            (an[miniId] as any).punishment = punishment;
            c.antiNukeConfig = an;
            return c;
          });
          await i.update({ embeds: [buildAntiNukeMiniEmbed(cfg, miniId)], components: antiNukeMiniRows(cfg, miniId) });
          return;
        }

        if (id.startsWith("cfg:an:mini:wlUser:") && i.isUserSelectMenu()) {
          const miniId = id.slice("cfg:an:mini:wlUser:".length) as AntiNukeMiniId;
          cfg = await updateGuildConfig(guildId, (c) => {
            const an = getAntiNukeConfig(c);
            const existing = (an[miniId] as any).whitelistUserIds;
            (an[miniId] as any).whitelistUserIds = [...new Set([...existing, ...i.values])];
            c.antiNukeConfig = an;
            return c;
          });
          await i.update({ embeds: [buildAntiNukeMiniEmbed(cfg, miniId)], components: antiNukeMiniRows(cfg, miniId) });
          return;
        }

        if (id.startsWith("cfg:an:mini:wlRole:") && i.isRoleSelectMenu()) {
          const miniId = id.slice("cfg:an:mini:wlRole:".length) as AntiNukeMiniId;
          cfg = await updateGuildConfig(guildId, (c) => {
            const an = getAntiNukeConfig(c);
            const existing = (an[miniId] as any).whitelistRoleIds;
            (an[miniId] as any).whitelistRoleIds = [...new Set([...existing, ...i.values])];
            c.antiNukeConfig = an;
            return c;
          });
          await i.update({ embeds: [buildAntiNukeMiniEmbed(cfg, miniId)], components: antiNukeMiniRows(cfg, miniId) });
          return;
        }

        if (id.startsWith("cfg:an:mini:wlClear:")) {
          const miniId = id.slice("cfg:an:mini:wlClear:".length) as AntiNukeMiniId;
          cfg = await updateGuildConfig(guildId, (c) => {
            const an = getAntiNukeConfig(c);
            (an[miniId] as any).whitelistUserIds = [];
            (an[miniId] as any).whitelistRoleIds = [];
            c.antiNukeConfig = an;
            return c;
          });
          await i.update({ embeds: [buildAntiNukeMiniEmbed(cfg, miniId)], components: antiNukeMiniRows(cfg, miniId) });
          return;
        }

        if (id === "cfg:an:mini:joinThreshold") {
          const modal = new ModalBuilder()
            .setCustomId("cfg:an:mini:joinThresholdModal")
            .setTitle("Anti-Join: Threshold & Window")
            .addComponents(
              new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                  .setCustomId("threshold")
                  .setLabel("Join count before action (e.g. 3)")
                  .setStyle(TextInputStyle.Short)
                  .setRequired(true)
                  .setValue(String(getAntiNukeConfig(cfg).antiJoin.threshold))
                  .setMinLength(1)
                  .setMaxLength(3),
              ),
              new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                  .setCustomId("windowSeconds")
                  .setLabel("Time window in seconds (e.g. 60)")
                  .setStyle(TextInputStyle.Short)
                  .setRequired(true)
                  .setValue(String(getAntiNukeConfig(cfg).antiJoin.windowSeconds))
                  .setMinLength(1)
                  .setMaxLength(6),
              ),
            );
          await i.showModal(modal);
          try {
            const submit = await i.awaitModalSubmit({
              filter: (s) => s.customId === "cfg:an:mini:joinThresholdModal" && s.user.id === i.user.id,
              time: 5 * 60 * 1000,
            });
            const threshold = parseInt(submit.fields.getTextInputValue("threshold"), 10);
            const windowSeconds = parseInt(submit.fields.getTextInputValue("windowSeconds"), 10);
            if (!Number.isFinite(threshold) || threshold < 1 || !Number.isFinite(windowSeconds) || windowSeconds < 1) {
              await submit.reply({ content: "Both values must be positive integers.", flags: 1 << 6 });
              return;
            }
            cfg = await updateGuildConfig(guildId, (c) => {
              const an = getAntiNukeConfig(c);
              an.antiJoin.threshold = threshold;
              an.antiJoin.windowSeconds = windowSeconds;
              c.antiNukeConfig = an;
              return c;
            });
            if (submit.isFromMessage()) {
              await submit.update({ embeds: [buildAntiNukeMiniEmbed(cfg, "antiJoin")], components: antiNukeMiniRows(cfg, "antiJoin") });
            } else {
              await submit.reply({ content: `Anti-Join threshold set to **${threshold}** joins in **${windowSeconds}s**.`, flags: 1 << 6 });
            }
          } catch { /* timed out */ }
          return;
        }

        // ── Anti-Nuke Log Channel ────────────────────────────────────────────

        if (id === "cfg:an:setLogChannel") {
          const sel = new ChannelSelectMenuBuilder()
            .setCustomId("cfg:an:logChannelSet")
            .setPlaceholder("Pick the channel for Anti-Nuke logs")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setMinValues(1)
            .setMaxValues(1);
          const clearRow = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId("cfg:an:logChannelClear")
              .setLabel("Clear Log Channel")
              .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
              .setCustomId("cfg:an:overview")
              .setLabel("← Back")
              .setStyle(ButtonStyle.Secondary),
          );
          await i.update({
            embeds: [buildAntiNukeOverviewEmbed(cfg).setDescription("Select the channel where Anti-Nuke trigger events will be logged:")],
            components: [
              new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(sel),
              clearRow,
            ],
          });
          return;
        }

        if (id === "cfg:an:logChannelSet" && i.isChannelSelectMenu()) {
          const channelId = i.values[0]!;
          cfg = await updateGuildConfig(guildId, (c) => {
            c.channels.antiNukeLog = channelId;
            return c;
          });
          await i.update({ embeds: [buildAntiNukeOverviewEmbed(cfg)], components: antiNukeOverviewRows(cfg) });
          return;
        }

        if (id === "cfg:an:logChannelClear") {
          cfg = await updateGuildConfig(guildId, (c) => {
            delete c.channels.antiNukeLog;
            return c;
          });
          await i.update({ embeds: [buildAntiNukeOverviewEmbed(cfg)], components: antiNukeOverviewRows(cfg) });
          return;
        }

        // ── Shop ─────────────────────────────────────────────────────────────

        if (id === "cfg:shop:overview") {
          const ss = await getShopSettings(guildId);
          await i.update({ embeds: [buildShopOverviewEmbed(ss)], components: shopOverviewRows(ss) });
          return;
        }

        if (id === "cfg:shop:toggle") {
          const ss = await updateShopSettings(guildId, (s) => { s.enabled = !s.enabled; return s; });
          await i.update({ embeds: [buildShopOverviewEmbed(ss)], components: shopOverviewRows(ss) });
          return;
        }

        if (id === "cfg:shop:addShop" && i.isButton()) {
          const modal = new ModalBuilder()
            .setCustomId("cfg:shop:addShopModal")
            .setTitle("Add New Shop");
          modal.addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder()
                .setCustomId("name")
                .setLabel("Shop Name")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMaxLength(32)
                .setPlaceholder("e.g. Boosting, Nitro Gifts"),
            ),
          );
          await i.showModal(modal);
          let addSubmit;
          try {
            addSubmit = await i.awaitModalSubmit({
              filter: (s) => s.customId === "cfg:shop:addShopModal" && s.user.id === i.user.id,
              time: 5 * 60 * 1000,
            });
          } catch { return; }
          const shopName = addSubmit.fields.getTextInputValue("name").trim();
          if (!shopName) { await addSubmit.reply({ content: "Shop name cannot be empty.", flags: 1 << 6 }); return; }
          const newShopId = generateShopId();
          const sAfterAdd = await updateShopSettings(guildId, (s) => {
            s.shops[newShopId] = { id: newShopId, name: shopName, questions: [], embed: {} };
            return s;
          });
          if (addSubmit.isFromMessage()) {
            await addSubmit.update({ embeds: [buildShopOverviewEmbed(sAfterAdd)], components: shopOverviewRows(sAfterAdd) });
          } else {
            await addSubmit.reply({ content: `${CE.success.str} Created shop **${shopName}**. Select it from the dropdown to configure it.`, flags: 1 << 6 });
          }
          return;
        }

        if (id === "cfg:shop:setModRoles" && i.isButton()) {
          const ssMod = await getShopSettings(guildId);
          const modRoleSel = new RoleSelectMenuBuilder()
            .setCustomId("cfg:shop:modRolesSet")
            .setPlaceholder("Select mod (staff) roles for the shop")
            .setMinValues(0).setMaxValues(10);
          await i.update({
            embeds: [buildShopOverviewEmbed(ssMod).setDescription("Select the **staff** roles that can see and claim shop tickets:")],
            components: [
              new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(modRoleSel),
              new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
                new ButtonBuilder().setCustomId("cfg:shop:overview").setLabel("← Back").setStyle(ButtonStyle.Secondary),
              ),
            ],
          });
          return;
        }

        if (id === "cfg:shop:modRolesSet" && i.isRoleSelectMenu()) {
          const ssModSet = await updateShopSettings(guildId, (s) => { s.modRoleIds = i.values; return s; });
          await i.update({ embeds: [buildShopOverviewEmbed(ssModSet)], components: shopOverviewRows(ssModSet) });
          return;
        }

        if (id === "cfg:shop:setAdminRoles" && i.isButton()) {
          const ssAdm = await getShopSettings(guildId);
          const adminRoleSel = new RoleSelectMenuBuilder()
            .setCustomId("cfg:shop:adminRolesSet")
            .setPlaceholder("Select admin roles for the shop")
            .setMinValues(0).setMaxValues(10);
          await i.update({
            embeds: [buildShopOverviewEmbed(ssAdm).setDescription("Select the **admin** roles that retain access even after a ticket is claimed:")],
            components: [
              new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(adminRoleSel),
              new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
                new ButtonBuilder().setCustomId("cfg:shop:overview").setLabel("← Back").setStyle(ButtonStyle.Secondary),
              ),
            ],
          });
          return;
        }

        if (id === "cfg:shop:adminRolesSet" && i.isRoleSelectMenu()) {
          const ssAdmSet = await updateShopSettings(guildId, (s) => { s.adminRoleIds = i.values; return s; });
          await i.update({ embeds: [buildShopOverviewEmbed(ssAdmSet)], components: shopOverviewRows(ssAdmSet) });
          return;
        }

        if (id === "cfg:shop:setLogChannel" && i.isButton()) {
          const ssLog = await getShopSettings(guildId);
          const logChSel = new ChannelSelectMenuBuilder()
            .setCustomId("cfg:shop:logChannelSet")
            .setPlaceholder("Pick the shop log channel")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setMinValues(1).setMaxValues(1);
          await i.update({
            embeds: [buildShopOverviewEmbed(ssLog).setDescription("Select the channel where shop ticket logs will be sent:")],
            components: [
              new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(logChSel),
              new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
                new ButtonBuilder().setCustomId("cfg:shop:logChannelClear").setLabel("Clear").setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId("cfg:shop:overview").setLabel("← Back").setStyle(ButtonStyle.Secondary),
              ),
            ],
          });
          return;
        }

        if (id === "cfg:shop:logChannelSet" && i.isChannelSelectMenu()) {
          const ssLogSet = await updateShopSettings(guildId, (s) => { s.logChannelId = i.values[0]; return s; });
          await i.update({ embeds: [buildShopOverviewEmbed(ssLogSet)], components: shopOverviewRows(ssLogSet) });
          return;
        }

        if (id === "cfg:shop:logChannelClear") {
          const ssLogClr = await updateShopSettings(guildId, (s) => { delete s.logChannelId; return s; });
          await i.update({ embeds: [buildShopOverviewEmbed(ssLogClr)], components: shopOverviewRows(ssLogClr) });
          return;
        }

        if (id === "cfg:shop:setTranscriptChannel" && i.isButton()) {
          const ssTx = await getShopSettings(guildId);
          const txChSel = new ChannelSelectMenuBuilder()
            .setCustomId("cfg:shop:transcriptChannelSet")
            .setPlaceholder("Pick the transcript channel")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setMinValues(1).setMaxValues(1);
          await i.update({
            embeds: [buildShopOverviewEmbed(ssTx).setDescription("Select the channel where ticket transcripts will be sent on close:")],
            components: [
              new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(txChSel),
              new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
                new ButtonBuilder().setCustomId("cfg:shop:transcriptChannelClear").setLabel("Clear").setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId("cfg:shop:overview").setLabel("← Back").setStyle(ButtonStyle.Secondary),
              ),
            ],
          });
          return;
        }

        if (id === "cfg:shop:transcriptChannelSet" && i.isChannelSelectMenu()) {
          const ssTxSet = await updateShopSettings(guildId, (s) => { s.transcriptChannelId = i.values[0]; return s; });
          await i.update({ embeds: [buildShopOverviewEmbed(ssTxSet)], components: shopOverviewRows(ssTxSet) });
          return;
        }

        if (id === "cfg:shop:transcriptChannelClear") {
          const ssTxClr = await updateShopSettings(guildId, (s) => { delete s.transcriptChannelId; return s; });
          await i.update({ embeds: [buildShopOverviewEmbed(ssTxClr)], components: shopOverviewRows(ssTxClr) });
          return;
        }

        if (id === "cfg:shop:setProofChannel" && i.isButton()) {
          const ssProof = await getShopSettings(guildId);
          const proofChSel = new ChannelSelectMenuBuilder()
            .setCustomId("cfg:shop:proofChannelSet")
            .setPlaceholder("Pick the proof channel")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setMinValues(1).setMaxValues(1);
          await i.update({
            embeds: [buildShopOverviewEmbed(ssProof).setDescription("Select the channel where sale proof messages will be sent:")],
            components: [
              new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(proofChSel),
              new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
                new ButtonBuilder().setCustomId("cfg:shop:proofChannelClear").setLabel("Clear").setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId("cfg:shop:overview").setLabel("← Back").setStyle(ButtonStyle.Secondary),
              ),
            ],
          });
          return;
        }

        if (id === "cfg:shop:proofChannelSet" && i.isChannelSelectMenu()) {
          const ssProofSet = await updateShopSettings(guildId, (s) => { s.proofChannelId = i.values[0]; return s; });
          await i.update({ embeds: [buildShopOverviewEmbed(ssProofSet)], components: shopOverviewRows(ssProofSet) });
          return;
        }

        if (id === "cfg:shop:proofChannelClear") {
          const ssProofClr = await updateShopSettings(guildId, (s) => { delete s.proofChannelId; return s; });
          await i.update({ embeds: [buildShopOverviewEmbed(ssProofClr)], components: shopOverviewRows(ssProofClr) });
          return;
        }

        if (id === "cfg:shop:setCustomerRole" && i.isButton()) {
          const ssCR = await getShopSettings(guildId);
          const crSel = new RoleSelectMenuBuilder()
            .setCustomId("cfg:shop:customerRoleSet")
            .setPlaceholder("Select the role given on first purchase")
            .setMinValues(1).setMaxValues(1);
          await i.update({
            embeds: [buildShopOverviewEmbed(ssCR).setDescription("Select the role that will be **automatically assigned** to a customer on their first successful purchase:")],
            components: [
              new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(crSel),
              new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
                new ButtonBuilder().setCustomId("cfg:shop:overview").setLabel("← Back").setStyle(ButtonStyle.Secondary),
              ),
            ],
          });
          return;
        }

        if (id === "cfg:shop:customerRoleSet" && i.isRoleSelectMenu()) {
          const ssCRSet = await updateShopSettings(guildId, (s) => { s.customerRoleId = i.values[0]; return s; });
          await i.update({ embeds: [buildShopOverviewEmbed(ssCRSet)], components: shopOverviewRows(ssCRSet) });
          return;
        }

        if (id === "cfg:shop:customerRoleClear") {
          const ssCRClr = await updateShopSettings(guildId, (s) => { delete s.customerRoleId; return s; });
          await i.update({ embeds: [buildShopOverviewEmbed(ssCRClr)], components: shopOverviewRows(ssCRClr) });
          return;
        }

        if (id === "cfg:shop:shopSelect" && i.isStringSelectMenu()) {
          const selShopId = i.values[0]!;
          const ssShopSel = await getShopSettings(guildId);
          const selShop = ssShopSel.shops[selShopId];
          if (!selShop) { await i.update({ embeds: [buildShopOverviewEmbed(ssShopSel)], components: shopOverviewRows(ssShopSel) }); return; }
          await i.update({ embeds: [buildShopMiniEmbed(selShop, ssShopSel)], components: shopMiniRows(selShop) });
          return;
        }

        // ── Shop mini — per-shop config ───────────────────────────────────────

        if (id.startsWith("cfg:shop:mini:back:") || id === "cfg:shop:mini:back") {
          const ssMiniBack = await getShopSettings(guildId);
          await i.update({ embeds: [buildShopOverviewEmbed(ssMiniBack)], components: shopOverviewRows(ssMiniBack) });
          return;
        }

        if (id.startsWith("cfg:shop:mini:setChannel:") && i.isButton()) {
          const miniChShopId = id.slice("cfg:shop:mini:setChannel:".length);
          const ssMiniCh = await getShopSettings(guildId);
          const miniChShop = ssMiniCh.shops[miniChShopId];
          if (!miniChShop) return;
          const miniChSel = new ChannelSelectMenuBuilder()
            .setCustomId(`cfg:shop:mini:channelSet:${miniChShopId}`)
            .setPlaceholder("Select the channel for the shop embed")
            .addChannelTypes(ChannelType.GuildText)
            .setMinValues(1).setMaxValues(1);
          await i.update({
            embeds: [buildShopMiniEmbed(miniChShop, ssMiniCh).setDescription("Pick the **text channel** where the buy button embed will be posted:")],
            components: [
              new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(miniChSel),
              new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
                new ButtonBuilder().setCustomId(`cfg:shop:mini:back:${miniChShopId}`).setLabel("← Back").setStyle(ButtonStyle.Secondary),
              ),
            ],
          });
          return;
        }

        if (id.startsWith("cfg:shop:mini:channelSet:") && i.isChannelSelectMenu()) {
          const miniChSetId = id.slice("cfg:shop:mini:channelSet:".length);
          const ssMiniChSet = await updateShopSettings(guildId, (s) => {
            if (s.shops[miniChSetId]) s.shops[miniChSetId].channelId = i.values[0];
            return s;
          });
          const miniChSetShop = ssMiniChSet.shops[miniChSetId];
          if (!miniChSetShop) return;
          await i.update({ embeds: [buildShopMiniEmbed(miniChSetShop, ssMiniChSet)], components: shopMiniRows(miniChSetShop) });
          return;
        }

        if (id.startsWith("cfg:shop:mini:setCategory:") && i.isButton()) {
          const miniCatId = id.slice("cfg:shop:mini:setCategory:".length);
          const ssMiniCat = await getShopSettings(guildId);
          const miniCatShop = ssMiniCat.shops[miniCatId];
          if (!miniCatShop) return;
          const miniCatSel = new ChannelSelectMenuBuilder()
            .setCustomId(`cfg:shop:mini:categorySet:${miniCatId}`)
            .setPlaceholder("Select the ticket channel category")
            .addChannelTypes(ChannelType.GuildCategory)
            .setMinValues(1).setMaxValues(1);
          await i.update({
            embeds: [buildShopMiniEmbed(miniCatShop, ssMiniCat).setDescription("Pick the **category** where ticket channels will be created (optional):")],
            components: [
              new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(miniCatSel),
              new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
                new ButtonBuilder().setCustomId(`cfg:shop:mini:clearCategory:${miniCatId}`).setLabel("No Category").setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId(`cfg:shop:mini:back:${miniCatId}`).setLabel("← Back").setStyle(ButtonStyle.Secondary),
              ),
            ],
          });
          return;
        }

        if (id.startsWith("cfg:shop:mini:categorySet:") && i.isChannelSelectMenu()) {
          const miniCatSetId = id.slice("cfg:shop:mini:categorySet:".length);
          const ssMiniCatSet = await updateShopSettings(guildId, (s) => {
            if (s.shops[miniCatSetId]) s.shops[miniCatSetId].categoryId = i.values[0];
            return s;
          });
          const miniCatSetShop = ssMiniCatSet.shops[miniCatSetId];
          if (!miniCatSetShop) return;
          await i.update({ embeds: [buildShopMiniEmbed(miniCatSetShop, ssMiniCatSet)], components: shopMiniRows(miniCatSetShop) });
          return;
        }

        if (id.startsWith("cfg:shop:mini:clearCategory:")) {
          const miniCatClrId = id.slice("cfg:shop:mini:clearCategory:".length);
          const ssMiniCatClr = await updateShopSettings(guildId, (s) => {
            if (s.shops[miniCatClrId]) delete s.shops[miniCatClrId].categoryId;
            return s;
          });
          const miniCatClrShop = ssMiniCatClr.shops[miniCatClrId];
          if (!miniCatClrShop) return;
          await i.update({ embeds: [buildShopMiniEmbed(miniCatClrShop, ssMiniCatClr)], components: shopMiniRows(miniCatClrShop) });
          return;
        }

        if (id.startsWith("cfg:shop:mini:editQuestions:") && i.isButton()) {
          const miniQId = id.slice("cfg:shop:mini:editQuestions:".length);
          const ssMiniQ = await getShopSettings(guildId);
          const miniQShop = ssMiniQ.shops[miniQId];
          if (!miniQShop) return;

          const qModal = new ModalBuilder()
            .setCustomId(`cfg:shop:mini:questionsModal:${miniQId}`)
            .setTitle(`Questions — ${miniQShop.name}`.slice(0, 45));
          const qLabels = ["Question 1 (required)", "Question 2", "Question 3", "Question 4", "Question 5"];
          for (let qi = 0; qi < 5; qi++) {
            qModal.addComponents(
              new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                  .setCustomId(`q${qi}`)
                  .setLabel(qLabels[qi])
                  .setStyle(TextInputStyle.Short)
                  .setRequired(qi === 0)
                  .setMaxLength(100)
                  .setValue(miniQShop.questions[qi] ?? ""),
              ),
            );
          }
          await i.showModal(qModal);
          let qSubmit;
          try {
            qSubmit = await i.awaitModalSubmit({
              filter: (s) => s.customId === `cfg:shop:mini:questionsModal:${miniQId}` && s.user.id === i.user.id,
              time: 5 * 60 * 1000,
            });
          } catch { return; }

          const newQuestions = [0, 1, 2, 3, 4]
            .map((qi) => qSubmit.fields.getTextInputValue(`q${qi}`).trim())
            .filter(Boolean);
          const ssMiniQUpd = await updateShopSettings(guildId, (s) => {
            if (s.shops[miniQId]) s.shops[miniQId].questions = newQuestions;
            return s;
          });
          const miniQUpdShop = ssMiniQUpd.shops[miniQId];
          if (!miniQUpdShop) return;
          if (qSubmit.isFromMessage()) {
            await qSubmit.update({ embeds: [buildShopMiniEmbed(miniQUpdShop, ssMiniQUpd)], components: shopMiniRows(miniQUpdShop) });
          } else {
            await qSubmit.reply({ content: `${CE.success.str} Saved **${newQuestions.length}** question(s).`, flags: 1 << 6 });
          }
          return;
        }

        if (id.startsWith("cfg:shop:mini:editEmbed:") && i.isButton()) {
          const miniEmbId = id.slice("cfg:shop:mini:editEmbed:".length);
          const ssMiniEmb = await getShopSettings(guildId);
          const miniEmbShop = ssMiniEmb.shops[miniEmbId];
          if (!miniEmbShop) return;

          const embModal = new ModalBuilder()
            .setCustomId(`cfg:shop:mini:embedModal:${miniEmbId}`)
            .setTitle(`Edit Embed — ${miniEmbShop.name}`.slice(0, 45));
          embModal.addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder().setCustomId("title").setLabel("Embed Title").setStyle(TextInputStyle.Short)
                .setRequired(false).setMaxLength(256).setValue(miniEmbShop.embed.title ?? ""),
            ),
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder().setCustomId("description").setLabel("Description").setStyle(TextInputStyle.Paragraph)
                .setRequired(false).setMaxLength(2000).setValue(miniEmbShop.embed.description ?? ""),
            ),
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder().setCustomId("thumbnail").setLabel("Thumbnail URL (blank = remove)").setStyle(TextInputStyle.Short)
                .setRequired(false).setMaxLength(300).setValue(miniEmbShop.embed.thumbnail ?? ""),
            ),
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder().setCustomId("image").setLabel("Large Image URL (blank = remove)").setStyle(TextInputStyle.Short)
                .setRequired(false).setMaxLength(300).setValue(miniEmbShop.embed.image ?? ""),
            ),
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder().setCustomId("footer").setLabel("Footer Text (blank = remove)").setStyle(TextInputStyle.Short)
                .setRequired(false).setMaxLength(200).setValue(miniEmbShop.embed.footer ?? ""),
            ),
          );
          await i.showModal(embModal);
          let embSubmit;
          try {
            embSubmit = await i.awaitModalSubmit({
              filter: (s) => s.customId === `cfg:shop:mini:embedModal:${miniEmbId}` && s.user.id === i.user.id,
              time: 5 * 60 * 1000,
            });
          } catch { return; }

          const embTitle = embSubmit.fields.getTextInputValue("title").trim() || undefined;
          const embDesc = embSubmit.fields.getTextInputValue("description").trim() || undefined;
          const embThumb = embSubmit.fields.getTextInputValue("thumbnail").trim() || undefined;
          const embImg = embSubmit.fields.getTextInputValue("image").trim() || undefined;
          const embFooter = embSubmit.fields.getTextInputValue("footer").trim() || undefined;

          const ssMiniEmbUpd = await updateShopSettings(guildId, (s) => {
            if (s.shops[miniEmbId]) {
              s.shops[miniEmbId].embed = {
                ...s.shops[miniEmbId].embed,
                title: embTitle, description: embDesc,
                thumbnail: embThumb, image: embImg, footer: embFooter,
              };
            }
            return s;
          });
          const miniEmbUpdShop = ssMiniEmbUpd.shops[miniEmbId];
          if (!miniEmbUpdShop) return;
          if (embSubmit.isFromMessage()) {
            await embSubmit.update({ embeds: [buildShopMiniEmbed(miniEmbUpdShop, ssMiniEmbUpd)], components: shopMiniRows(miniEmbUpdShop) });
          } else {
            await embSubmit.reply({ content: `${CE.success.str} Embed settings saved for **${miniEmbUpdShop.name}**.`, flags: 1 << 6 });
          }
          return;
        }

        if (id.startsWith("cfg:shop:mini:postEmbed:") && i.isButton()) {
          const miniPostId = id.slice("cfg:shop:mini:postEmbed:".length);
          const ssMiniPost = await getShopSettings(guildId);
          const miniPostShop = ssMiniPost.shops[miniPostId];
          if (!miniPostShop) return;

          if (!miniPostShop.channelId) {
            await i.reply({ content: `${CE.error.str} Set the shop channel first before posting.`, flags: 1 << 6 });
            return;
          }
          const postTargetCh = i.guild?.channels.cache.get(miniPostShop.channelId) as TextChannel | undefined;
          if (!postTargetCh) {
            await i.reply({ content: `${CE.error.str} The configured channel no longer exists.`, flags: 1 << 6 });
            return;
          }

          const shopEmbed = new EmbedBuilder()
            .setTitle(miniPostShop.embed.title ?? miniPostShop.name)
            .setDescription(miniPostShop.embed.description ?? `Click below to open a ticket and purchase from **${miniPostShop.name}**!`)
            .setColor(0x5865f2)
            .setTimestamp();
          if (miniPostShop.embed.thumbnail) shopEmbed.setThumbnail(miniPostShop.embed.thumbnail);
          if (miniPostShop.embed.image) shopEmbed.setImage(miniPostShop.embed.image);
          if (miniPostShop.embed.footer) shopEmbed.setFooter({ text: miniPostShop.embed.footer });
          if (miniPostShop.embed.fields?.length) {
            shopEmbed.addFields(miniPostShop.embed.fields.map((f) => ({ name: f.name, value: f.value, inline: f.inline })));
          }

          const shopStatus = miniPostShop.status ?? "active";
          const statusColor = shopStatus === "out_of_stock" ? 0xed4245 : shopStatus === "coming_soon" ? 0xfee75c : 0x5865f2;
          shopEmbed.setColor(statusColor);

          let statusRow: ActionRowBuilder<MessageActionRowComponentBuilder>;
          if (shopStatus === "coming_soon") {
            statusRow = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
              new ButtonBuilder()
                .setCustomId("shop:status_noop")
                .setLabel("Coming Soon")
                .setStyle(ButtonStyle.Secondary)
                .setEmoji({ id: CE.limited.id, name: CE.limited.name })
                .setDisabled(true),
            );
          } else if (shopStatus === "out_of_stock") {
            statusRow = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
              new ButtonBuilder()
                .setCustomId("shop:status_noop")
                .setLabel("Out of Stock")
                .setStyle(ButtonStyle.Danger)
                .setEmoji({ id: CE.discount.id, name: CE.discount.name })
                .setDisabled(true),
            );
          } else {
            statusRow = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
              new ButtonBuilder()
                .setCustomId(`shop:buy:${guildId}:${miniPostId}`)
                .setLabel(`Purchase — ${miniPostShop.name}`.slice(0, 80))
                .setStyle(ButtonStyle.Success)
                .setEmoji({ id: CE.shoppingcart.id, name: CE.shoppingcart.name }),
            );
          }

          await i.deferUpdate();
          try {
            if (miniPostShop.messageId) {
              const oldPostMsg = await postTargetCh.messages.fetch(miniPostShop.messageId).catch(() => null);
              if (oldPostMsg) await oldPostMsg.delete().catch(() => {});
            }
            const postedMsg = await postTargetCh.send({ embeds: [shopEmbed], components: [statusRow] });
            const ssMiniPostUpd = await updateShopSettings(guildId, (s) => {
              if (s.shops[miniPostId]) s.shops[miniPostId].messageId = postedMsg.id;
              return s;
            });
            const miniPostUpdShop = ssMiniPostUpd.shops[miniPostId];
            if (!miniPostUpdShop) return;
            await i.editReply({ embeds: [buildShopMiniEmbed(miniPostUpdShop, ssMiniPostUpd)], components: shopMiniRows(miniPostUpdShop) });
          } catch (postErr) {
            logger.error({ postErr }, "[Shop Config] Failed to post embed");
            await i.editReply({ content: `${CE.error.str} Failed to post — check bot send permissions in that channel.` }).catch(() => {});
          }
          return;
        }

        if (id.startsWith("cfg:shop:mini:statusSet:") && i.isStringSelectMenu()) {
          const miniStatId = id.slice("cfg:shop:mini:statusSet:".length);
          const newStatus = i.values[0] as ShopStatus;
          const ssMiniStat = await updateShopSettings(guildId, (s) => {
            if (s.shops[miniStatId]) s.shops[miniStatId].status = newStatus;
            return s;
          });
          const miniStatShop = ssMiniStat.shops[miniStatId];
          if (!miniStatShop) return;
          await i.update({ embeds: [buildShopMiniEmbed(miniStatShop, ssMiniStat)], components: shopMiniRows(miniStatShop) });
          return;
        }

        if (id.startsWith("cfg:shop:mini:delete:") && i.isButton()) {
          const miniDelId = id.slice("cfg:shop:mini:delete:".length);
          const ssMiniDel = await getShopSettings(guildId);
          const miniDelShop = ssMiniDel.shops[miniDelId];
          if (!miniDelShop) return;
          await i.update({
            embeds: [new EmbedBuilder()
              .setTitle("Delete Shop")
              .setDescription(`Are you sure you want to delete **${miniDelShop.name}**?\n\nThis cannot be undone. Existing tickets will remain but no new ones can be opened.`)
              .setColor(0xed4245)],
            components: [new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
              new ButtonBuilder().setCustomId(`cfg:shop:mini:confirmDelete:${miniDelId}`).setLabel("Yes, Delete").setStyle(ButtonStyle.Danger),
              new ButtonBuilder().setCustomId(`cfg:shop:mini:back:${miniDelId}`).setLabel("← Cancel").setStyle(ButtonStyle.Secondary),
            )],
          });
          return;
        }

        if (id.startsWith("cfg:shop:mini:confirmDelete:")) {
          const miniConfDelId = id.slice("cfg:shop:mini:confirmDelete:".length);
          const ssMiniConfDel = await updateShopSettings(guildId, (s) => { delete s.shops[miniConfDelId]; return s; });
          await i.update({ embeds: [buildShopOverviewEmbed(ssMiniConfDel)], components: shopOverviewRows(ssMiniConfDel) });
          return;
        }

        // ── Custom Prefix ────────────────────────────────────────────────────

        if (id === "cfg:prefix:set") {
          cfg = await getGuildConfig(guildId);
          await i.showModal(prefixModal(cfg));
          let submit;
          try {
            submit = await i.awaitModalSubmit({
              filter: (s) => s.customId === "cfg:prefix:modal" && s.user.id === i.user.id,
              time: 5 * 60 * 1000,
            });
          } catch { return; }
          const newPrefix = submit.fields.getTextInputValue("prefix").trim();
          if (!newPrefix) {
            await submit.reply({ content: "Prefix cannot be empty.", flags: 1 << 6 });
            return;
          }
          cfg = await updateGuildConfig(guildId, (c) => { c.guildPrefix = newPrefix; return c; });
          if (submit.isFromMessage()) {
            await safeSubmitUpdate(submit, { embeds: [buildPrefixEmbed(cfg)], components: prefixRows(cfg) });
          } else {
            await submit.reply({ content: `Prefix set to \`${newPrefix}\`. DM command is now \`${newPrefix}n\`.`, flags: 1 << 6 });
          }
          return;
        }

        if (id === "cfg:prefix:reset") {
          cfg = await updateGuildConfig(guildId, (c) => { delete c.guildPrefix; return c; });
          await safeUpdate(i, { embeds: [buildPrefixEmbed(cfg)], components: prefixRows(cfg) });
          return;
        }

        // ── Bot Profile ──────────────────────────────────────────────────────

        if (id === "cfg:botProfile:set") {
          const currentNick = i.guild?.members.me?.nickname ?? null;
          await i.showModal(botProfileModal(currentNick));
          let submit;
          try {
            submit = await i.awaitModalSubmit({
              filter: (s) => s.customId === "cfg:botProfile:modal" && s.user.id === i.user.id,
              time: 5 * 60 * 1000,
            });
          } catch { return; }

          const nickname = submit.fields.getTextInputValue("nickname").trim();
          const results: string[] = [];

          if (i.guild?.members.me) {
            try {
              await i.guild.members.me.setNickname(nickname || null);
              results.push(nickname ? `Nickname set to **${nickname}**` : "Nickname cleared");
            } catch {
              results.push(`${CE.error.str} Could not set nickname — missing **Manage Nicknames** permission`);
            }
          }

          const me = i.guild?.members.me;
          const updatedNote = results.join("\n") || "No changes made.";
          if (submit.isFromMessage()) {
            await safeSubmitUpdate(submit, {
              embeds: [buildBotProfileEmbed(me?.nickname ?? null, me?.displayAvatarURL() ?? "", updatedNote)],
              components: botProfileRows(),
            });
          } else {
            await submit.reply({ content: updatedNote, flags: 1 << 6 });
          }
          return;
        }

        if (id === "cfg:botProfile:resetNickname") {
          try {
            await i.guild?.members.me?.setNickname(null);
          } catch { /* Missing permissions — ignore */ }
          const me = i.guild?.members.me;
          await safeUpdate(i, {
            embeds: [buildBotProfileEmbed(me?.nickname ?? null, me?.displayAvatarURL() ?? "", "Nickname has been cleared.")],
            components: botProfileRows(),
          });
          return;
        }

        // ── Module: toggle / channel / roles ────────────────────────────────

        if (id.startsWith("cfg:mod:toggle:")) {
          const modId = id.slice("cfg:mod:toggle:".length);
          const mod = MODULE_DEFS.find((m) => m.id === modId);
          if (!mod) return;
          cfg = await updateGuildConfig(guildId, (c) => {
            c.modules[mod.moduleKey] = !c.modules[mod.moduleKey];
            return c;
          });
          await safeUpdate(i, { embeds: [buildModuleEmbed(cfg, mod)], components: moduleActionRows(cfg, mod) });
          return;
        }

        if (id.startsWith("cfg:mod:setchannel:")) {
          const modId = id.slice("cfg:mod:setchannel:".length);
          const mod = MODULE_DEFS.find((m) => m.id === modId);
          if (!mod || !mod.channelKey) return;
          await safeUpdate(i, {
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
          await safeUpdate(i, { embeds: [buildModuleEmbed(cfg, mod)], components: moduleActionRows(cfg, mod) });
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
          await safeUpdate(i, { embeds: [buildModuleEmbed(cfg, mod)], components: moduleActionRows(cfg, mod) });
          return;
        }

        if (id === "cfg:partnership:setAnnounce") {
          const mod = MODULE_DEFS.find((m) => m.id === "partnership")!;
          const sel = new ChannelSelectMenuBuilder()
            .setCustomId("cfg:partnership:announceSet")
            .setPlaceholder("Pick the channel where approved partnerships are announced")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setMinValues(1)
            .setMaxValues(1);
          const clearRow = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId("cfg:partnership:announceClear")
              .setLabel("Clear Channel")
              .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
              .setCustomId("cfg:settings:view:partnership")
              .setLabel("← Back")
              .setStyle(ButtonStyle.Secondary),
          );
          await safeUpdate(i, {
            embeds: [buildModuleEmbed(cfg, mod).setDescription("Select the channel where approved partnerships will be announced:")],
            components: [
              new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(sel),
              clearRow,
            ],
          });
          return;
        }

        if (id === "cfg:partnership:announceSet" && i.isChannelSelectMenu()) {
          const mod = MODULE_DEFS.find((m) => m.id === "partnership")!;
          const channelId = i.values[0]!;
          cfg = await updateGuildConfig(guildId, (c) => {
            c.channels.partnership = channelId;
            return c;
          });
          await safeUpdate(i, { embeds: [buildSettingsEmbed(cfg, "partnership")], components: settingsRows(cfg, "partnership") });
          return;
        }

        if (id === "cfg:partnership:announceClear") {
          cfg = await updateGuildConfig(guildId, (c) => {
            delete c.channels.partnership;
            return c;
          });
          await safeUpdate(i, { embeds: [buildSettingsEmbed(cfg, "partnership")], components: settingsRows(cfg, "partnership") });
          return;
        }

        if (id === "cfg:verify:sendEmbed") {
          const channelId = cfg.channels.verifyChannel;
          if (!channelId) {
            await i.reply({ content: "No verify channel set. Please set one first.", ephemeral: true });
            return;
          }
          try {
            const channel = await i.guild!.channels.fetch(channelId) as TextChannel;
            const promptMessage = "**Verify yourself to access the server!**\n\nClick the button below to start verification.";
            const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
              new ButtonBuilder()
                .setCustomId("verify_prompt")
                .setLabel("Verify Now")
                .setStyle(ButtonStyle.Success),
            );
            await channel.send({ content: promptMessage, components: [row] });
            await i.reply({ content: "Verification embed sent to the channel.", ephemeral: true });
          } catch (err) {
            await i.reply({ content: "Failed to send embed to the channel.", ephemeral: true });
          }
          return;
        }

        if (id.startsWith("cfg:mod:setroles:")) {
          const modId = id.slice("cfg:mod:setroles:".length);
          const mod = MODULE_DEFS.find((m) => m.id === modId);
          if (!mod) return;
          await safeUpdate(i, {
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
          await safeUpdate(i, { embeds: [buildModuleEmbed(cfg, mod)], components: moduleActionRows(cfg, mod) });
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
          await safeUpdate(i, { embeds: [buildModuleEmbed(cfg, mod)], components: moduleActionRows(cfg, mod) });
          return;
        }

        // ── Per-module settings ─────────────────────────────────────────────

        if (id.startsWith("cfg:settings:view:")) {
          const modId = id.slice("cfg:settings:view:".length);
          cfg = await getGuildConfig(guildId);
          await safeUpdate(i, {
            embeds: [buildSettingsEmbed(cfg, modId)],
            components: settingsRows(cfg, modId),
          });
          return;
        }

        if (id.startsWith("cfg:settings:toggle:")) {
          const rest = id.slice("cfg:settings:toggle:".length);
          const colonIdx = rest.indexOf(":");
          if (colonIdx === -1) return;
          const modId = rest.slice(0, colonIdx);
          const field = rest.slice(colonIdx + 1);

          cfg = await updateGuildConfig(guildId, (c) => {
            switch (modId) {
              case "infractions": {
                const s = c.infractionsConfig ?? {
                  strikeExpiryDays: 30,
                  dmOnInfraction: true,
                  autoDemotionEnabled: true,
                  strikeAction1: "warning" as const,
                  strikeAction2: "strike" as const,
                  strikeAction3plus: "termination" as const,
                };
                if (field === "dmOnInfraction")      s.dmOnInfraction      = !s.dmOnInfraction;
                if (field === "autoDemotionEnabled") s.autoDemotionEnabled = !s.autoDemotionEnabled;
                c.infractionsConfig = s;
                break;
              }
              case "moderation": {
                const s = c.moderationConfig ?? { dmOnAction: true };
                if (field === "dmOnAction") s.dmOnAction = !s.dmOnAction;
                c.moderationConfig = s;
                break;
              }
              case "promotions": {
                const s = c.promotionsConfig ?? { dmMember: true };
                if (field === "dmMember") s.dmMember = !s.dmMember;
                c.promotionsConfig = s;
                break;
              }
              case "demotions": {
                const s = c.demotionsConfig ?? { dmMember: true };
                if (field === "dmMember") s.dmMember = !s.dmMember;
                c.demotionsConfig = s;
                break;
              }
              case "loa": {
                const s = c.loaConfig ?? { maxDurationDays: 0, requireReason: true };
                if (field === "requireReason") s.requireReason = !s.requireReason;
                c.loaConfig = s;
                break;
              }
              case "antiNuke": {
                const s = getAntiNukeConfig(c);
                if (field === "antiJoins") s.antiJoin.enabled = !s.antiJoin.enabled;
                if (field === "antiBans") s.antiBan.enabled = !s.antiBan.enabled;
                if (field === "antiKicks") s.antiKick.enabled = !s.antiKick.enabled;
                if (field === "antiRoleChanges") s.antiRole.enabled = !s.antiRole.enabled;
                if (field === "antiChannelChanges") s.antiChannel.enabled = !s.antiChannel.enabled;
                c.antiNukeConfig = s;
                break;
              }
            }
            return c;
          });

          await safeUpdate(i, {
            embeds: [buildSettingsEmbed(cfg, modId)],
            components: settingsRows(cfg, modId),
          });
          return;
        }

        if (id.startsWith("cfg:settings:modal:")) {
          const modId = id.slice("cfg:settings:modal:".length);
          cfg = await getGuildConfig(guildId);
          const modal = buildSettingsModal(cfg, modId);
          if (!modal) return;
          await i.showModal(modal);
          try {
            const submit = await i.awaitModalSubmit({
              filter: (s) => s.customId === `cfg:settings:modalResult:${modId}` && s.user.id === i.user.id,
              time: 5 * 60 * 1000,
            });
            cfg = await updateGuildConfig(guildId, (c) => {
              switch (modId) {
                case "infractions": {
                  const v = parseInt(submit.fields.getTextInputValue("strikeExpiryDays"), 10);
                  const validActions = new Set<FailureAction>(["none", "warning", "strike", "demotion", "termination"]);
                  const toAction = (raw: string): FailureAction => {
                    const trimmed = raw.trim().toLowerCase() as FailureAction;
                    return validActions.has(trimmed) ? trimmed : "none";
                  };
                  const sa1 = toAction(submit.fields.getTextInputValue("strikeAction1"));
                  const sa2 = toAction(submit.fields.getTextInputValue("strikeAction2"));
                  const sa3 = toAction(submit.fields.getTextInputValue("strikeAction3plus"));
                  const existingInf = c.infractionsConfig ?? {
                    strikeExpiryDays: 30,
                    dmOnInfraction: true,
                    autoDemotionEnabled: true,
                    strikeAction1: "warning" as const,
                    strikeAction2: "strike" as const,
                    strikeAction3plus: "termination" as const,
                  };
                  c.infractionsConfig = {
                    ...existingInf,
                    strikeExpiryDays: Number.isFinite(v) && v >= 0 ? v : existingInf.strikeExpiryDays,
                    strikeAction1: sa1,
                    strikeAction2: sa2,
                    strikeAction3plus: sa3,
                  };
                  break;
                }
                case "appeals": {
                  const v = parseInt(submit.fields.getTextInputValue("autoCloseDays"), 10);
                  if (Number.isFinite(v) && v >= 0) {
                    c.appealsConfig = { autoCloseDays: v };
                  }
                  break;
                }
                case "loa": {
                  const v = parseInt(submit.fields.getTextInputValue("maxDurationDays"), 10);
                  if (Number.isFinite(v) && v >= 0) {
                    c.loaConfig = {
                      ...(c.loaConfig ?? { requireReason: true }),
                      maxDurationDays: v,
                    };
                  }
                  break;
                }
                case "partnership": {
                  const quota = parseInt(submit.fields.getTextInputValue("quota"), 10);
                  const f1 = submit.fields.getTextInputValue("failureAction1").trim().toLowerCase();
                  const f2 = submit.fields.getTextInputValue("failureAction2").trim().toLowerCase();
                  const f3 = submit.fields.getTextInputValue("failureAction3").trim().toLowerCase();
                  const validActions = new Set(["none", "warning", "strike", "demotion", "termination"]);
                  if (Number.isFinite(quota) && quota >= 0) {
                    c.partnershipConfig = {
                      ...(c.partnershipConfig ?? { quota: 0, failureActions: { 1: "none", 2: "none", 3: "none" } }),
                      quota,
                      failureActions: {
                        1: validActions.has(f1) ? f1 as PartnershipConfig["failureActions"][1] : "none",
                        2: validActions.has(f2) ? f2 as PartnershipConfig["failureActions"][2] : "none",
                        3: validActions.has(f3) ? f3 as PartnershipConfig["failureActions"][3] : "none",
                      },
                    };
                  }
                  break;
                }
                case "antiNuke": {
                  const value = submit.fields.getTextInputValue("punishmentAction").trim().toLowerCase() as AntiNukePunishment;
                  const validActions = new Set<AntiNukePunishment>(["none", "kick", "ban", "timeout_1h", "timeout_24h", "timeout_7d"]);
                  const s = getAntiNukeConfig(c);
                  s.commonPunishment = validActions.has(value) ? value : "none";
                  c.antiNukeConfig = s;
                  break;
                }
              }
              return c;
            });
            if (submit.isFromMessage()) {
              await safeSubmitUpdate(submit, {
                embeds: [buildSettingsEmbed(cfg, modId)],
                components: settingsRows(cfg, modId),
              });
            } else {
              await submit.reply({ content: "Settings saved.", flags: 1 << 6 });
            }
          } catch {
            // timed out or dismissed
          }
          return;
        }

        if (id === "cfg:antiNuke:setUsers") {
          cfg = await getGuildConfig(guildId);
          const modal = buildAntiNukeUsersModal(cfg);
          await i.showModal(modal);
          try {
            const submit = await i.awaitModalSubmit({
              filter: (s) => s.customId === "cfg:antiNuke:usersModalResult" && s.user.id === i.user.id,
              time: 5 * 60 * 1000,
            });
            const raw = submit.fields.getTextInputValue("whitelistedUserIds");
            const userIds = raw
              .split(/[\s,]+/)
              .map((value) => value.trim())
              .filter((value) => value.length > 0);
            cfg = await updateGuildConfig(guildId, (c) => {
              const s = getAntiNukeConfig(c);
              s.globalWhitelistUserIds = userIds;
              c.antiNukeConfig = s;
              return c;
            });
            if (submit.isFromMessage()) {
              await safeSubmitUpdate(submit, {
                embeds: [buildSettingsEmbed(cfg, "antiNuke")],
                components: settingsRows(cfg, "antiNuke"),
              });
            } else {
              await submit.reply({ content: "Anti-nuke whitelist saved.", flags: 1 << 6 });
            }
          } catch {
            // timed out or dismissed
          }
          return;
        }

        if (id === "cfg:staffReport:intervalSelect" && i.isStringSelectMenu()) {
          const hours = Number(i.values[0]);
          if (Number.isFinite(hours) && hours >= 1) {
            cfg = await updateGuildConfig(guildId, (c) => {
              c.staffReportConfig = { refreshIntervalHours: hours };
              return c;
            });
          }
          await safeUpdate(i, {
            embeds: [buildSettingsEmbed(cfg, "staffReport")],
            components: settingsRows(cfg, "staffReport"),
          });
          return;
        }

        // ── Appeals: set invite ─────────────────────────────────────────────

        if (id === "cfg:appeals:setInvite") {
          const appealsMod = MODULE_DEFS.find((m) => m.id === "appeals")!;
          const modal = new ModalBuilder()
            .setCustomId("cfg:appeals:inviteModal")
            .setTitle("Set Appeal Server Invite")
            .addComponents(
              new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                  .setCustomId("invite")
                  .setLabel("Invite URL (blank = clear)")
                  .setStyle(TextInputStyle.Short)
                  .setRequired(false)
                  .setPlaceholder("https://discord.gg/...")
                  .setValue(cfg.appealServerInvite ?? ""),
              ),
            );
          await i.showModal(modal);
          try {
            const submit = await i.awaitModalSubmit({
              filter: (s) => s.customId === "cfg:appeals:inviteModal" && s.user.id === i.user.id,
              time: 5 * 60 * 1000,
            });
            const invite = submit.fields.getTextInputValue("invite").trim();
            cfg = await updateGuildConfig(guildId, (c) => {
              if (invite) c.appealServerInvite = invite;
              else delete c.appealServerInvite;
              return c;
            });
            if (submit.isFromMessage()) {
              await safeSubmitUpdate(submit, {
                embeds: [buildModuleEmbed(cfg, appealsMod)],
                components: moduleActionRows(cfg, appealsMod),
              });
            } else {
              await submit.reply({
                content: invite ? `Appeal server invite set to ${invite}` : "Appeal server invite cleared.",
                flags: 1 << 6,
              });
            }
          } catch {
            /* timed out or dismissed */
          }
          return;
        }

        // ── Quota: handlers ─────────────────────────────────────────────────

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
              await submit.reply({ content: "Both values must be non-negative integers.", flags: 1 << 6 });
              return;
            }
            cfg = await updateGuildConfig(guildId, (c) => {
              const day = c.quotaConfig?.weekStartDay ?? 0;
              c.quotaConfig = { messages, modActions, weekStartDay: day };
              return c;
            });
            if (submit.isFromMessage()) {
              await safeSubmitUpdate(submit, { embeds: [buildQuotaEmbed(cfg)], components: quotaRows(cfg) });
            } else {
              await submit.reply({
                content: `Quota set: **${messages}** messages / **${modActions}** mod actions per week.`,
                flags: 1 << 6,
              });
            }
          } catch {
            // timed out or dismissed
          }
          return;
        }

        if (id === "cfg:quotaClear") {
          cfg = await updateGuildConfig(guildId, (c) => { delete c.quotaConfig; return c; });
          await safeUpdate(i, { embeds: [buildQuotaEmbed(cfg)], components: quotaRows(cfg) });
          return;
        }

        if (id === "cfg:quotaDay") {
          await safeUpdate(i, { embeds: [buildQuotaEmbed(cfg)], components: weekStartRows(cfg) });
          return;
        }

        if (id === "cfg:quotaWhitelist") {
          const roleNameMap = new Map(i.guild?.roles.cache.map((r) => [r.id, r.name]) ?? []);
          await safeUpdate(i, {
            embeds: [
              new EmbedBuilder()
                .setTitle("Quota Whitelist")
                .setColor(0x5865f2)
                .setDescription(
                  "Roles on this list are **completely skipped** during the Friday quota check — " +
                  "they won't receive warnings, strikes, or terminations.\n\n" +
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
            c.quotaWhitelistRoles = Array.from(current);
            return c;
          });
          const roleNameMap = new Map(i.guild?.roles.cache.map((r) => [r.id, r.name]) ?? []);
          await safeUpdate(i, {
            embeds: [
              new EmbedBuilder()
                .setTitle("Quota Whitelist")
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
          await safeUpdate(i, {
            embeds: [
              new EmbedBuilder()
                .setTitle("Quota Whitelist")
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
          await safeUpdate(i, {
            embeds: [
              new EmbedBuilder()
                .setTitle("Quota Whitelist")
                .setColor(0xed4245)
                .setDescription("Whitelist cleared. All staff roles will now be checked on Fridays."),
            ],
            components: whitelistManageRows(cfg, roleNameMap),
          });
          return;
        }

        if (id === "cfg:quotaFailurePunishments") {
          cfg = await getGuildConfig(guildId);
          const modal = buildSettingsModal(cfg, "quotaFailure");
          if (!modal) return;
          await i.showModal(modal);
          try {
            const submit = await i.awaitModalSubmit({
              filter: (s) => s.customId === "cfg:quotaFailureModalResult" && s.user.id === i.user.id,
              time: 5 * 60 * 1000,
            });
            const validActions = new Set<FailureAction>(["none", "warning", "strike", "demotion", "termination"]);
            const toAction = (raw: string): FailureAction => {
              const trimmed = raw.trim().toLowerCase() as FailureAction;
              return validActions.has(trimmed) ? trimmed : "none";
            };
            cfg = await updateGuildConfig(guildId, (c) => {
              c.quotaFailureConfig = {
                failure1:    toAction(submit.fields.getTextInputValue("failure1")),
                failure2:    toAction(submit.fields.getTextInputValue("failure2")),
                failure3plus: toAction(submit.fields.getTextInputValue("failure3plus")),
              };
              return c;
            });
            if (submit.isFromMessage()) {
              await safeSubmitUpdate(submit, { embeds: [buildQuotaEmbed(cfg)], components: quotaRows(cfg) });
            } else {
              await submit.reply({ content: "Quota failure punishments saved.", flags: 1 << 6 });
            }
          } catch {
            // timed out or dismissed
          }
          return;
        }

        if (id === "cfg:quotaRoleTarget") {
          await safeUpdate(i, {
            embeds: [
              buildQuotaEmbed(cfg).setDescription(
                "Select a role to set its specific quota target.\n" +
                "This overrides the global target for members of that role.",
              ),
            ],
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
              await submit.reply({ content: "Both values must be non-negative integers.", flags: 1 << 6 });
              return;
            }
            cfg = await updateGuildConfig(guildId, (c) => {
              if (!c.roleQuotas) c.roleQuotas = {};
              c.roleQuotas[roleId] = { messages, modActions };
              return c;
            });
            if (submit.isFromMessage()) {
              await safeSubmitUpdate(submit, { embeds: [buildQuotaEmbed(cfg)], components: quotaRows(cfg) });
            } else {
              await submit.reply({
                content: `Set quota for <@&${roleId}>: **${messages}** msgs / **${modActions}** mod actions per week.`,
                flags: 1 << 6,
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
          await safeUpdate(i, { embeds: [buildQuotaEmbed(cfg)], components: quotaRows(cfg) });
          return;
        }

        // ── Staff role management ───────────────────────────────────────────

        if (id === "cfg:staffRoleAdd" && i.isRoleSelectMenu()) {
          const roleId = i.values[0];
          if (roleId) await addStaffRole(guildId, roleId).catch(() => {});
          const view = await staffRolesView(guildId);
          await safeUpdate(i, { embeds: [view.embed], components: view.rows });
          return;
        }

        if (id === "cfg:staffRoleRemove" && i.isStringSelectMenu()) {
          const roleId = i.values[0];
          if (roleId && roleId !== "_noop") await removeStaffRole(guildId, roleId).catch(() => {});
          const view = await staffRolesView(guildId);
          await safeUpdate(i, { embeds: [view.embed], components: view.rows });
          return;
        }
      } catch (err: unknown) {
        logger.error({ err }, "config collector error");
        if (!i.replied && !i.deferred) {
          await i.reply({ content: "Something went wrong.", flags: 1 << 6 }).catch(() => {});
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
