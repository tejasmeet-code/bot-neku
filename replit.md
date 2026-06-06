# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## Replit Setup

- The `Start application` workflow runs the api-server on port 5000 via `cd artifacts/api-server && PORT=5000 pnpm run dev` (which builds with esbuild and then launches the bundled output). The Express server listens on `0.0.0.0:5000` and is exposed in the Replit preview pane.
- The Discord bot starts in the same process; it logs a warning and stays disabled until `DISCORD_BOT_TOKEN` and `DISCORD_CLIENT_ID` are added as Replit secrets.
- Deployment is configured as `vm` (reserved VM) because the Discord bot maintains a persistent WebSocket connection and must stay running between HTTP requests. Build runs `pnpm --filter @workspace/api-server run build`; run launches the bundled `dist/index.mjs` on port 5000.

## Discord Bot

The api-server artifact also hosts a Discord bot using `discord.js` v14.

- Entry: `artifacts/api-server/src/discord/client.ts` (started from `src/index.ts`)
- Commands live in `artifacts/api-server/src/discord/commands/` and are registered in `registry.ts`
- Required secrets: `DISCORD_BOT_TOKEN`, `DISCORD_CLIENT_ID`
- Slash commands are registered globally on startup (may take a few minutes to appear in clients)
- Built-in commands: `/ping`, `/help`, `/serverinfo`, `/userinfo`, `/roll`, `/8ball`, `/avatar`, `/say`, `/ban`, `/mute`, `/unmute`, `/warn`, `/dm`
- Whitelist-managed commands: `ban`, `mute`, `unmute`, `warn`, `dm`, `say`. Each has a matching `/whitelist-<command>` with `add`/`remove`/`list` subcommands. Whitelists are per-guild and persist to `.data/whitelist.json`.
- Global perm-whitelist (can use any restricted command in any server) is hardcoded in `src/discord/storage/whitelist.ts` (`PERM_WHITELIST`). Runtime additions persist to `.data/perm-whitelist.json` and are managed via `/whitelist-global`.
- Warnings persist to `.data/warnings.json` (relative to the api-server cwd).
- `/dm` to a role or `@everyone` requires the **Server Members Intent** to be enabled in the Discord Developer Portal under Bot → Privileged Gateway Intents. The bot falls back to a Guilds-only connection when the intent is disabled (DMs to a single user still work).

### Staff Management System

A comprehensive per-guild staff management system. All state is stored as JSON in `.data/`:

- **`.data/config.json`** — per-guild config: managers (user/role lists), modules toggles (`staffMgmt`, `quota`, `auditLog`), channels (`promotions`, `demotions`, `botNotifications`, `performance`), and `quotaConfig` (`messages`, `modActions`, `weekStartDay`).
- **`.data/staff.json`** — per-guild staff roles (with hierarchy positions) and per-user profiles (promotions, demotions, infractions, position history). Strikes auto-expire after 14 days.
- **`.data/quota.json`** — per-guild per-user weekly stats (messages and mod actions). Last 12 weeks retained. Escalation chain on missed weeks: warning → strike → termination, reset by any fulfilled week.
- **`.data/connections.json`** — pending and active staff↔main server pairings.

Commands: `/config` (manager/channel/module/quota/view subgroups), `/staff-roles`, `/staff-role-add`, `/staff-role-remove`, `/staff-database`, `/promote`, `/demote`, `/infractions` (view/add/remove), `/profile`, `/quota` (view/server), `/connect-servers` (init/accept/status/disconnect).

Embeds always use the target user's avatar via `utils/staffEmbed.ts`. All slash command invocations are mirrored to `DISCORD_WEBHOOK_URL_1` via `utils/audit.ts` (gated on the guild's `auditLog` module). `Events.GuildMemberUpdate` and `Events.GuildMemberAdd` call `syncProfileFromMember` so manual role edits stay in sync. Promotions/demotions automatically propagate to a connected server (matching by hierarchy position, then by role name) via `utils/crossServer.ts`. Quota message counts are bumped in the `MessageCreate` listener in `client.ts`.

Manager check (`utils/staffPerms.ts`): admin OR server owner OR global perm-whitelist OR listed in `config.managers.userIds` OR holds any `config.managers.roleIds`.

To add a new command, create a file in `commands/`, default-export an object matching the `SlashCommand` type, and add it to the array in `registry.ts`.

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
