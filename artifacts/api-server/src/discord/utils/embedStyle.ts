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

export const EMOJI = {
  ok: "✅",
  fail: "❌",
  warn: "⚠️",
  info: "ℹ️",
  shield: "🛡️",
  crown: "👑",
  star: "⭐",
  fire: "🔥",
  bomb: "💣",
  rocket: "🚀",
  user: "👤",
  users: "👥",
  role: "🎭",
  channel: "📺",
  ping: "📡",
  list: "📋",
  clock: "⏰",
  cal: "📅",
  msg: "💬",
  hammer: "🔨",
  tools: "🛠️",
  gear: "⚙️",
  ban: "🚫",
  mute: "🔇",
  unmute: "🔊",
  kick: "👢",
  bell: "🔔",
  lock: "🔒",
  unlock: "🔓",
  bot: "🤖",
  server: "🏠",
  globe: "🌐",
  link: "🔗",
  arrowUp: "🔺",
  arrowDown: "🔻",
  bullet: "•",
  dot: "·",
  spark: "✨",
  trophy: "🏆",
  graph: "📈",
  party: "🎉",
} as const;

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
  return prettyEmbed({
    title: `${EMOJI.ok} ${title}`,
    description,
    color: COLORS.success,
  });
}

export function errorEmbed(title: string, description?: string): EmbedBuilder {
  return prettyEmbed({
    title: `${EMOJI.fail} ${title}`,
    description,
    color: COLORS.danger,
  });
}

export function warnEmbed(title: string, description?: string): EmbedBuilder {
  return prettyEmbed({
    title: `${EMOJI.warn} ${title}`,
    description,
    color: COLORS.warning,
  });
}

export function infoEmbed(title: string, description?: string): EmbedBuilder {
  return prettyEmbed({
    title: `${EMOJI.info} ${title}`,
    description,
    color: COLORS.info,
  });
}
