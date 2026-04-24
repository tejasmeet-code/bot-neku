import type { SlashCommand } from "./types";
import ping from "./commands/ping";
import help from "./commands/help";
import serverinfo from "./commands/serverinfo";
import userinfo from "./commands/userinfo";
import roll from "./commands/roll";
import eightball from "./commands/eightball";
import avatar from "./commands/avatar";
import say from "./commands/say";
import ban from "./commands/ban";
import mute from "./commands/mute";
import unmute from "./commands/unmute";

const commands: SlashCommand[] = [
  ping,
  help,
  serverinfo,
  userinfo,
  roll,
  eightball,
  avatar,
  say,
  ban,
  mute,
  unmute,
];

export function getCommands(): SlashCommand[] {
  return commands;
}

export function getCommandMap(): Map<string, SlashCommand> {
  const map = new Map<string, SlashCommand>();
  for (const cmd of commands) {
    map.set(cmd.data.name, cmd);
  }
  return map;
}
