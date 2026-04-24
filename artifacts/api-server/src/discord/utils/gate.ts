import type { ChatInputCommandInteraction } from "discord.js";
import { isWhitelisted, type WhitelistedCommand } from "../storage/whitelist";

/**
 * Checks if the invoking user is allowed to run a restricted command.
 * Replies with an ephemeral denial message and returns false if not allowed.
 */
export async function ensureWhitelisted(
  interaction: ChatInputCommandInteraction,
  command: WhitelistedCommand,
): Promise<boolean> {
  if (!interaction.inGuild() || !interaction.guildId) {
    await interaction.reply({
      content: "This command can only be used in a server.",
      ephemeral: true,
    });
    return false;
  }
  const allowed = await isWhitelisted(
    command,
    interaction.guildId,
    interaction.user.id,
  );
  if (!allowed) {
    await interaction.reply({
      content: `You aren't on the whitelist for \`/${command}\`. Ask an admin to add you with \`/whitelist-${command} add\`.`,
      ephemeral: true,
    });
    return false;
  }
  return true;
}
