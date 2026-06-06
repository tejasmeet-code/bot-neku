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
  success:       { str: "<a:success:1512445154915778742>",       id: "1512445154915778742", name: "success",       animated: true  },
  loading:       { str: "<a:loading:1512445192966508574>",       id: "1512445192966508574", name: "loading",       animated: true  },
  // — Static —
  admin:         { str: "<:admins:1512445158946504754>",         id: "1512445158946504754", name: "admins",        animated: false },
  error:         { str: "<:error:1512445151098703912>",          id: "1512445151098703912", name: "error",         animated: false },
  information:   { str: "<:information:1512445174532411502>",    id: "1512445174532411502", name: "information",   animated: false },
  members:       { str: "<:members:1512445195528962193>",        id: "1512445195528962193", name: "members",       animated: false },
  staff:         { str: "<:staff:1512445181046030336>",          id: "1512445181046030336", name: "staff",         animated: false },
  demotion:      { str: "<:demotion:1512445167775383633>",       id: "1512445167775383633", name: "demotion",      animated: false },
  failure:       { str: "<:failure:1512445198444265532>",        id: "1512445198444265532", name: "failure",       animated: false },
  failureorno:   { str: "<:failure:1512445198444265532>",        id: "1512445198444265532", name: "failure",       animated: false },
  moderation:    { str: "<:mod:1512445200570646699>",            id: "1512445200570646699", name: "mod",           animated: false },
  notifications: { str: "<:notification:1512445184867041380>",   id: "1512445184867041380", name: "notification",  animated: false },
  promotion:     { str: "<:promotion:1512445165539950713>",      id: "1512445165539950713", name: "promotion",     animated: false },
  settings:      { str: "<:settings:1512445178726846617>",       id: "1512445178726846617", name: "settings",      animated: false },
  termination:   { str: "<:termination:1512445188763549858>",    id: "1512445188763549858", name: "termination",   animated: false },
  warning:       { str: "<:warning:1512445176587751454>",        id: "1512445176587751454", name: "warning",       animated: false },
  check:         { str: "<a:success:1512445154915778742>",       id: "1512445154915778742", name: "success",       animated: true  },
  link:          { str: "<:information:1512445174532411502>",    id: "1512445174532411502", name: "information",   animated: false },
  // — Shop —
  cash:          { str: "<:cash:1512445186922385429>",           id: "1512445186922385429", name: "cash",          animated: false },
  shoppingcart:  { str: "<:cart:1512445182883270657>",           id: "1512445182883270657", name: "cart",          animated: false },
  discount:      { str: "<:discount:1512445172351504504>",       id: "1512445172351504504", name: "discount",      animated: false },
  ltc:           { str: "<:ltc:1512445169847500890>",            id: "1512445169847500890", name: "ltc",           animated: false },
  limited:       { str: "<:limited:1512445163275026535>",        id: "1512445163275026535", name: "limited",       animated: false },
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
