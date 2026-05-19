import { EmbedBuilder, type APIEmbedField, type ColorResolvable } from "discord.js";

export const COLORS = {
  primary: 0x5865f2,
  success: 0x57f287,
  warning: 0xfee75c,
  danger: 0xed4245,
  info: 0x5dade2,
  neutral: 0x99aab5,
  staff: 0x9b59b6,
  premium: 0xffd700,
} as const;

/**
 * Custom emoji registry. Each entry has:
 *   str      – Discord inline format, usable anywhere in message/embed text
 *   id       – Snowflake, for use in setEmoji({ id, name, animated? }) on components
 *   name     – Emoji name
 *   animated – true for animated (a:) emojis
 */
export const CE = {
  // — Animated —
  success:       { str: "<a:success:1504835579618267227>",       id: "1504835579618267227", name: "success",       animated: true  },
  loading:       { str: "<a:loading:1504836425730752664>",       id: "1504836425730752664", name: "loading",       animated: true  },
  // — Static —
  admin:         { str: "<:admin:1504836204850319401>",          id: "1504836204850319401", name: "admin",         animated: false },
  error:         { str: "<:error:1504835377771577496>",          id: "1504835377771577496", name: "error",         animated: false },
  information:   { str: "<:information:1504835789249450154>",    id: "1504835789249450154", name: "information",   animated: false },
  members:       { str: "<:members:1504836239545733120>",        id: "1504836239545733120", name: "members",       animated: false },
  staff:         { str: "<:mod:1504835959789719623>",            id: "1504835959789719623", name: "mod",           animated: false },
  demotion:      { str: "<:demotion:1504835752503021679>",       id: "1504835752503021679", name: "demotion",      animated: false },
  failure:       { str: "<:failure:1504836505930301490>",        id: "1504836505930301490", name: "failure",       animated: false },
  failureorno:   { str: "<:failure:1504836505930301490>",        id: "1504836505930301490", name: "failure",       animated: false },
  moderation:    { str: "<:moderation:1504835545887539352>",     id: "1504835545887539352", name: "moderation",    animated: false },
  notifications: { str: "<:notifications:1504836121560088728>",  id: "1504836121560088728", name: "notifications", animated: false },
  promotion:     { str: "<:promotion:1504835712178978876>",      id: "1504835712178978876", name: "promotion",     animated: false },
  settings:      { str: "<:settings:1504835917712724180>",       id: "1504835917712724180", name: "settings",      animated: false },
  termination:   { str: "<:termination:1504836165260542099>",    id: "1504836165260542099", name: "termination",   animated: false },
  warning:       { str: "<:warning:1504835862658285628>",        id: "1504835862658285628", name: "warning",       animated: false },
  check:         { str: "<a:success:1504835579618267227>",       id: "1504835579618267227", name: "success",       animated: true  },
  link:          { str: "<:information:1504835789249450154>",    id: "1504835789249450154", name: "information",   animated: false },
  // — Shop —
  cash:          { str: "<:cash:1505184041278767166>",           id: "1505184041278767166", name: "cash",          animated: false },
  shoppingcart:  { str: "<:shoppingcart:1505184039039139890>",   id: "1505184039039139890", name: "shoppingcart",  animated: false },
  discount:      { str: "<:discount:1505184036996251829>",       id: "1505184036996251829", name: "discount",      animated: false },
  ltc:           { str: "<:ltc:1505184034916008096>",            id: "1505184034916008096", name: "ltc",           animated: false },
  limited:       { str: "<:limited:1505184031975673876>",        id: "1505184031975673876", name: "limited",       animated: false },
} as const;

/** Semantic EMOJI aliases — all resolved to custom emojis, no Unicode. */
export const EMOJI = {
  ok:        CE.success.str,
  fail:      CE.error.str,
  warn:      CE.warning.str,
  info:      CE.information.str,
  loading:   CE.loading.str,
  shield:    CE.admin.str,
  crown:     CE.admin.str,
  star:      CE.staff.str,
  fire:      CE.moderation.str,
  bomb:      CE.moderation.str,
  rocket:    CE.promotion.str,
  user:      CE.members.str,
  users:     CE.members.str,
  role:      CE.staff.str,
  channel:   CE.settings.str,
  ping:      CE.notifications.str,
  list:      CE.information.str,
  clock:     CE.information.str,
  cal:       CE.information.str,
  msg:       CE.notifications.str,
  hammer:    CE.moderation.str,
  tools:     CE.settings.str,
  gear:      CE.settings.str,
  ban:       CE.moderation.str,
  mute:      CE.moderation.str,
  unmute:    CE.moderation.str,
  kick:      CE.moderation.str,
  bell:      CE.notifications.str,
  lock:      CE.admin.str,
  unlock:    CE.admin.str,
  bot:       CE.settings.str,
  server:    CE.admin.str,
  globe:     CE.information.str,
  link:      CE.information.str,
  arrowUp:   CE.promotion.str,
  arrowDown: CE.demotion.str,
  bullet:    "•",
  dot:       "·",
  spark:     CE.success.str,
  trophy:    CE.staff.str,
  graph:     CE.promotion.str,
  party:     CE.success.str,
} as const;

/**
 * Build a bullet-point description string.
 * Renders as:  • **Label:** value
 */
export function buildBullets(items: { label: string; value: string }[]): string {
  return items.map(f => `• **${f.label}:** ${f.value}`).join("\n");
}

export interface PrettyEmbedOpts {
  title?: string;
  description?: string;
  color?: ColorResolvable;
  fields?: APIEmbedField[];
  footer?: string;
  thumbnail?: string;
  author?: { name: string; iconURL?: string };
  timestamp?: boolean;
  url?: string;
  image?: string;
}

export function prettyEmbed(opts: PrettyEmbedOpts): EmbedBuilder {
  const e = new EmbedBuilder().setColor(opts.color ?? COLORS.primary);
  if (opts.title) e.setTitle(opts.title);
  if (opts.description) e.setDescription(opts.description);
  if (opts.fields && opts.fields.length > 0) e.addFields(opts.fields);
  if (opts.footer) e.setFooter({ text: opts.footer });
  if (opts.thumbnail) e.setThumbnail(opts.thumbnail);
  if (opts.author) e.setAuthor(opts.author);
  if (opts.url) e.setURL(opts.url);
  if (opts.image) e.setImage(opts.image);
  if (opts.timestamp !== false) e.setTimestamp(new Date());
  return e;
}

export function successEmbed(title: string, description?: string): EmbedBuilder {
  return prettyEmbed({ title, description, color: COLORS.success });
}

export function errorEmbed(title: string, description?: string): EmbedBuilder {
  return prettyEmbed({ title, description, color: COLORS.danger });
}

export function warnEmbed(title: string, description?: string): EmbedBuilder {
  return prettyEmbed({ title, description, color: COLORS.warning });
}

export function infoEmbed(title: string, description?: string): EmbedBuilder {
  return prettyEmbed({ title, description, color: COLORS.info });
}