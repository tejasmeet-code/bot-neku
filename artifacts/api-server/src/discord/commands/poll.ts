import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type GuildTextBasedChannel,
} from "discord.js";
import type { SlashCommand } from "../types";
import { ensureWhitelisted } from "../utils/gate";
import { prettyEmbed, COLORS, CE, errorEmbed } from "../utils/embedStyle";

const NUM_EMOJIS = ["1️⃣", "2️⃣", "3️⃣", "4️⃣"];

const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("poll")
    .setDescription("Create a poll with reactions.")
    .addStringOption(o => o.setName("question").setDescription("Poll question").setRequired(true).setMaxLength(256))
    .addStringOption(o => o.setName("option1").setDescription("Option 1 (omit for yes/no poll)").setRequired(false).setMaxLength(100))
    .addStringOption(o => o.setName("option2").setDescription("Option 2").setRequired(false).setMaxLength(100))
    .addStringOption(o => o.setName("option3").setDescription("Option 3").setRequired(false).setMaxLength(100))
    .addStringOption(o => o.setName("option4").setDescription("Option 4").setRequired(false).setMaxLength(100))
    .setDMPermission(false),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!(await ensureWhitelisted(interaction, "poll"))) return;
    if (!interaction.channel || !("send" in interaction.channel)) {
      await interaction.reply({ embeds: [errorEmbed("Invalid channel", "Cannot post polls here.")], flags: 1 << 6 });
      return;
    }

    // Defer first — sending the poll message + adding reactions can exceed 3 s
    await interaction.deferReply({ flags: 1 << 6 });

    const question = interaction.options.getString("question", true);
    const opts = [
      interaction.options.getString("option1"),
      interaction.options.getString("option2"),
      interaction.options.getString("option3"),
      interaction.options.getString("option4"),
    ].filter((o): o is string => Boolean(o));

    let description: string;
    let reactions: string[];

    if (opts.length >= 2) {
      description = opts.map((o, i) => `${NUM_EMOJIS[i]} ${o}`).join("\n\n");
      reactions = NUM_EMOJIS.slice(0, opts.length);
    } else {
      description = "React below!";
      reactions = ["✅", "❌"];
    }

    const channel = interaction.channel as GuildTextBasedChannel;
    const msg = await channel.send({
      embeds: [prettyEmbed({
        title: question,
        description,
        color: COLORS.primary,
        footer: `Poll by ${interaction.user.tag}`,
      })],
    });

    for (const emoji of reactions) {
      await msg.react(emoji).catch(() => {});
    }

    await interaction.editReply({ content: `${CE.success.str} Poll posted!` });
  },
};

export default command;