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

## Replit Environment Setup

- Workflow `Start application` runs `PORT=5000 pnpm --filter @workspace/api-server run start` and waits for port 5000 (webview).
- The api-server binds to `0.0.0.0:5000` and exposes `/` (health text) and `/api/healthz` (JSON).
- Build the api-server bundle once (or when sources change) with `pnpm --filter @workspace/api-server run build` before starting the workflow.
- The Discord bot is optional; without `DISCORD_BOT_TOKEN` and `DISCORD_CLIENT_ID` it logs a warning and stays disabled while the HTTP server keeps running.
- Deployment is configured for `vm` (always-on) target with build = api-server bundle, run = `PORT=5000 pnpm --filter @workspace/api-server run start`.

## Discord Bot

The api-server artifact also hosts a Discord bot using `discord.js` v14.

- Entry: `artifacts/api-server/src/discord/client.ts` (started from `src/index.ts`)
- Commands live in `artifacts/api-server/src/discord/commands/` and are registered in `registry.ts`
- Required secrets: `DISCORD_BOT_TOKEN`, `DISCORD_CLIENT_ID`
- Slash commands are registered globally on startup (may take a few minutes to appear in clients)
- Built-in commands: `/ping`, `/help`, `/serverinfo`, `/userinfo`, `/roll`, `/8ball`, `/avatar`, `/say`, `/ban`, `/mute`, `/unmute`, `/warn`, `/dm`
- Whitelist-managed commands: `ban`, `mute`, `unmute`, `warn`, `dm`, `say`. Each has a matching `/whitelist-<command>` with `add`/`remove`/`list` subcommands. Whitelists are per-guild and persist to `.data/whitelist.json`.
- Global perm-whitelist (can use any restricted command in any server) is hardcoded in `src/discord/storage/whitelist.ts` (`PERM_WHITELIST`).
- Warnings persist to `.data/warnings.json` (relative to the api-server cwd).
- `/dm` to a role or `@everyone` requires the **Server Members Intent** to be enabled in the Discord Developer Portal under Bot → Privileged Gateway Intents. The bot falls back to a Guilds-only connection when the intent is disabled (DMs to a single user still work).

To add a new command, create a file in `commands/`, default-export an object matching the `SlashCommand` type, and add it to the array in `registry.ts`.

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
