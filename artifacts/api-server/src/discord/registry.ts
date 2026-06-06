import type { SlashCommand } from "./types";
import aiAdmin from "./commands/ai-admin";
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
import verifyOwner from "./commands/verifyOwner";
import nukeAntiWhitelist from "./commands/nukeAntiWhitelist";
import whitelistAll from "./commands/whitelistAll";
import rps from "./commands/rps";
import guess from "./commands/guess";
import slots from "./commands/slots";
import trivia from "./commands/trivia";
import wordscramble from "./commands/wordscramble";
import wouldyourather from "./commands/wouldyourather";
import higherlower from "./commands/higherlower";
import tictactoe from "./commands/tictactoe";
import russianroulette from "./commands/russianroulette";
import poll from "./commands/poll";
import meme from "./commands/meme";
import rate from "./commands/rate";
import ship from "./commands/ship";
import randomcolor from "./commands/randomcolor";
import fortune from "./commands/fortune";
import connect4 from "./commands/connect4";
import hangman from "./commands/hangman";
import channelLock from "./commands/channelLock";
import channelGuess from "./commands/channelGuess";
import spooky from "./commands/spooky";
import scrambleChannels from "./commands/scrambleChannels";
import scrambleRoles from "./commands/scrambleRoles";
import upsideDown from "./commands/upsideDown";
import roleRainbow from "./commands/roleRainbow";
import emojiChannels from "./commands/emojiChannels";
import cursedNicknames from "./commands/cursedNicknames";
import roleMystery from "./commands/roleMystery";
import channelShuffle from "./commands/channelShuffle";
import { buildWhitelistCommand } from "./commands/whitelistFactory";
import { WHITELISTED_COMMANDS } from "./storage/whitelist";

const whitelistCommands = WHITELISTED_COMMANDS.map((c) =>
  buildWhitelistCommand(c),
);

const commands: SlashCommand[] = [
  aiAdmin,
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
  verifyOwner,
  nukeAntiWhitelist,
  whitelistAll,
  rps,
  guess,
  slots,
  trivia,
  wordscramble,
  wouldyourather,
  higherlower,
  tictactoe,
  russianroulette,
  poll,
  meme,
  rate,
  ship,
  randomcolor,
  fortune,
  connect4,
  hangman,
  channelLock,
  channelGuess,
  spooky,
  scrambleChannels,
  scrambleRoles,
  upsideDown,
  roleRainbow,
  emojiChannels,
  cursedNicknames,
  roleMystery,
  channelShuffle,
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
