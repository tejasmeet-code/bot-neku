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

## Discord Bot

The api-server artifact also hosts a Discord bot using `discord.js` v14.

- Entry: `artifacts/api-server/src/discord/client.ts` (started from `src/index.ts`)
- Commands live in `artifacts/api-server/src/discord/commands/` and are registered in `registry.ts`
- Required secrets: `DISCORD_BOT_TOKEN`, `DISCORD_CLIENT_ID`
- Slash commands are registered globally on startup (may take a few minutes to appear in clients)
- Built-in commands: `/ping`, `/help`, `/serverinfo`, `/userinfo`, `/roll`, `/8ball`, `/avatar`, `/say`, `/ban`, `/mute`, `/unmute`

To add a new command, create a file in `commands/`, default-export an object matching the `SlashCommand` type, and add it to the array in `registry.ts`.

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
