import type { SlashCommand } from "./types";
import announce from "./commands/announce";
import appeal from "./commands/appeal";
import avatar from "./commands/avatar";
import banRequest from "./commands/ban-request";
import ban from "./commands/ban";
import blacklist from "./commands/blacklist";
import botAdmin from "./commands/bot-admin";
import botinfo from "./commands/botinfo";
import caseCommand from "./commands/case";
import choice from "./commands/choice";
import coinflip from "./commands/coinflip";
import config from "./commands/config";
import connectServers from "./commands/connect-servers";
import demote from "./commands/demote";
import dm from "./commands/dm";
import editCase from "./commands/edit-case";
import eightball from "./commands/eightball";
import globalBackup from "./commands/global-backup";
import help from "./commands/help";
import highfi from "./commands/highfi";
import infractions from "./commands/infractions";
import jail from "./commands/jail";
import kick from "./commands/kick";
import loa from "./commands/loa";
import lock from "./commands/lock";
import modhistory from "./commands/modhistory";
import modstats from "./commands/modstats";
import mute from "./commands/mute";
import nickname from "./commands/nickname";
import note from "./commands/note";
import nukeAntiWhitelist from "./commands/nuke-anti-whitelist";
import nuke from "./commands/nuke";
import ping from "./commands/ping";
import partnership from "./commands/partnership";
import partnershipScore from "./commands/partnership-score";
import poll from "./commands/poll";
import profile from "./commands/profile";
import promote from "./commands/promote";
import pull from "./commands/pull";
import pullable from "./commands/pullable";
import purge from "./commands/purge";
import quota from "./commands/quota";
import rolegive from "./commands/rolegive";
import roleinfo from "./commands/roleinfo";
import roleremove from "./commands/roleremove";
import roll from "./commands/roll";
import say from "./commands/say";
import serverBackup from "./commands/server-backup";
import servercount from "./commands/servercount";
import serverinfo from "./commands/serverinfo";
import setavatar from "./commands/setavatar";
import slowmode from "./commands/slowmode";
import staffDatabase from "./commands/staff-database";
import staffHistory from "./commands/staff-history";
import staffProfile from "./commands/staff-profile";
import staffReport from "./commands/staff-report";
import staffRoleAdd from "./commands/staff-role-add";
import staffRoles from "./commands/staff-roles";
import staffUpdateReport from "./commands/staff-update-report";
import timeout from "./commands/timeout";
import unban from "./commands/unban";
import unbanAll from "./commands/unban-all";
import unjail from "./commands/unjail";
import unlock from "./commands/unlock";
import unmute from "./commands/unmute";
import untimeout from "./commands/untimeout";
import unwarn from "./commands/unwarn";
import userinfo from "./commands/userinfo";
import vcdeafen from "./commands/vcdeafen";
import vckick from "./commands/vckick";
import vcmove from "./commands/vcmove";
import vcmute from "./commands/vcmute";
import verifyOwner from "./commands/verify-owner";
import verifyOwnerCommands from "./commands/verify-owner-commands";
import verify from "./commands/verify";
import verifyConfig from "./commands/verify-config";
import warn from "./commands/warn";
import whitelistGlobal from "./commands/whitelist-global";
import whitelistAll from "./commands/whitelistAll";
import whitelist from "./commands/whitelist";
import closeTicket from "./commands/close-ticket";
import staffShopScore from "./commands/staff-shop-score";
import customerPoints from "./commands/customer-points";
import shopTopStaff from "./commands/shop-top-staff";
import postProof from "./commands/post-proof";

const commands: SlashCommand[] = [
  announce,
  appeal,
  avatar,
  banRequest,
  ban,
  blacklist,
  botAdmin,
  botinfo,
  caseCommand,
  choice,
  coinflip,
  config,
  connectServers,
  demote,
  dm,
  editCase,
  eightball,
  globalBackup,
  help,
  highfi,
  infractions,
  jail,
  kick,
  loa,
  lock,
  modhistory,
  modstats,
  mute,
  nickname,
  note,
  nukeAntiWhitelist,
  nuke,
  ping,
  partnership,
  partnershipScore,
  poll,
  profile,
  promote,
  pull,
  pullable,
  purge,
  quota,
  rolegive,
  roleinfo,
  roleremove,
  roll,
  say,
  serverBackup,
  servercount,
  serverinfo,
  setavatar,
  slowmode,
  staffDatabase,
  staffHistory,
  staffProfile,
  staffReport,
  staffRoleAdd,
  staffRoles,
  staffUpdateReport,
  timeout,
  unban,
  unbanAll,
  unjail,
  unlock,
  unmute,
  untimeout,
  unwarn,
  userinfo,
  vcdeafen,
  vckick,
  vcmove,
  vcmute,
  verifyOwner,
  verifyOwnerCommands,
  verify,
  verifyConfig,
  warn,
  whitelistGlobal,
  whitelistAll,
  whitelist,
  closeTicket,
  staffShopScore,
  customerPoints,
  shopTopStaff,
  postProof,
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
