import type { Client, Guild } from "discord.js";
import { logger } from "../../lib/logger";
import { getConnectedGuildId } from "../storage/connections";
import {
  getProfile,
  getRoleEntry,
  listStaffRoles,
  syncProfileFromMember,
} from "../storage/staff";

/**
 * Given a position number in `sourceGuild`, find the equivalent staff role in
 * `targetGuild`. Tries by exact position first, then by matching role name.
 */
async function resolveTargetRoleId(
  sourceGuild: Guild,
  sourceRoleId: string,
  targetGuildId: string,
  client: Client,
): Promise<string | null> {
  const sourcePos = await getRoleEntry(sourceGuild.id, sourceRoleId);
  if (!sourcePos) return null;
  const targetRoles = await listStaffRoles(targetGuildId);
  const byPos = targetRoles.find((r) => r.position === sourcePos.position);
  if (byPos) return byPos.roleId;

  // Fall back to matching by name.
  const sourceRole = await sourceGuild.roles.fetch(sourceRoleId).catch(() => null);
  if (!sourceRole) return null;
  const targetGuild = await client.guilds.fetch(targetGuildId).catch(() => null);
  if (!targetGuild) return null;
  for (const r of targetRoles) {
    const role = await targetGuild.roles.fetch(r.roleId).catch(() => null);
    if (role && role.name.toLowerCase() === sourceRole.name.toLowerCase()) {
      return r.roleId;
    }
  }
  return null;
}

/**
 * Propagate a role assignment to the connected server. Best-effort: errors are
 * logged and swallowed so the primary command flow isn't blocked.
 */
export async function propagateRoleAssignment(
  client: Client,
  sourceGuild: Guild,
  userId: string,
  newRoleId: string | null,
  removeRoleId: string | null,
  reason: string,
): Promise<{ propagated: boolean; otherGuildId?: string; note?: string }> {
  const link = await getConnectedGuildId(sourceGuild.id);
  if (!link) return { propagated: false };

  const targetGuild = await client.guilds
    .fetch(link.otherGuildId)
    .catch(() => null);
  if (!targetGuild) {
    return {
      propagated: false,
      otherGuildId: link.otherGuildId,
      note: "Bot isn't in the connected server.",
    };
  }
  const targetMember = await targetGuild.members
    .fetch(userId)
    .catch(() => null);
  if (!targetMember) {
    return {
      propagated: false,
      otherGuildId: link.otherGuildId,
      note: "User isn't in the connected server.",
    };
  }

  try {
    if (removeRoleId) {
      const tRemoveId = await resolveTargetRoleId(
        sourceGuild,
        removeRoleId,
        link.otherGuildId,
        client,
      );
      if (tRemoveId) {
        await targetMember.roles.remove(tRemoveId, reason).catch((err) => {
          logger.warn({ err }, "cross-server: failed to remove role");
        });
      }
    }
    if (newRoleId) {
      const tNewId = await resolveTargetRoleId(
        sourceGuild,
        newRoleId,
        link.otherGuildId,
        client,
      );
      if (tNewId) {
        await targetMember.roles.add(tNewId, reason).catch((err) => {
          logger.warn({ err }, "cross-server: failed to add role");
        });
      } else {
        return {
          propagated: false,
          otherGuildId: link.otherGuildId,
          note: "Couldn't find a matching staff role in the connected server.",
        };
      }
    }
    // Sync profile in target.
    await syncProfileFromMember(link.otherGuildId, targetMember);
    return { propagated: true, otherGuildId: link.otherGuildId };
  } catch (err) {
    logger.warn({ err }, "cross-server: propagation failed");
    return {
      propagated: false,
      otherGuildId: link.otherGuildId,
      note: "Propagation error.",
    };
  }
}

export async function profileExists(
  guildId: string,
  userId: string,
): Promise<boolean> {
  const p = await getProfile(guildId, userId);
  return p !== null;
}
