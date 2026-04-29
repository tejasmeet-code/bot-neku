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
import warn from "./commands/warn";
import dm from "./commands/dm";
import nuke from "./commands/nuke";
import highfi from "./commands/highfi";
import whitelistAll from "./commands/whitelistAll";
import verifyOwner from "./commands/verify-owner";
import nukeAntiWhitelist from "./commands/nuke-anti-whitelist";
import whitelistGlobal from "./commands/whitelist-global";
import config from "./commands/config";
import staffRoles from "./commands/staff-roles";
import staffRoleAdd, { removeCommand as staffRoleRemove } from "./commands/staff-role-add";
import staffDatabase from "./commands/staff-database";
import promote from "./commands/promote";
import demote from "./commands/demote";
import infractions from "./commands/infractions";
import profile from "./commands/profile";
import quota from "./commands/quota";
import connectServers from "./commands/connect-servers";
import { buildWhitelistCommand } from "./commands/whitelistFactory";
import { WHITELISTED_COMMANDS } from "./storage/whitelist";

const whitelistCommands = WHITELISTED_COMMANDS.map((c) =>
  buildWhitelistCommand(c),
);

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
  warn,
  dm,
  nuke,
  highfi,
  whitelistAll,
  verifyOwner,
  nukeAntiWhitelist,
  whitelistGlobal,
  config,
  staffRoles,
  staffRoleAdd,
  staffRoleRemove,
  staffDatabase,
  promote,
  demote,
  infractions,
  profile,
  quota,
  connectServers,
  ...whitelistCommands,
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
