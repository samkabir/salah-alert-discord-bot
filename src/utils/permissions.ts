import { ChatInputCommandInteraction, PermissionFlagsBits } from "discord.js";

export const ADMIN_ONLY_PERMISSIONS = PermissionFlagsBits.Administrator;

/**
 * Subcommands any member may run. Everything else under /prayer mutates alert
 * config and stays admin-only.
 *
 * Discord's `setDefaultMemberPermissions` applies to the whole command, not to
 * individual subcommands — so /prayer is registered visible to everyone and the
 * admin gate is enforced here, at routing time.
 */
export const PUBLIC_SUBCOMMANDS = new Set(["status"]);

export function isGuildAdmin(interaction: ChatInputCommandInteraction): boolean {
  return interaction.memberPermissions?.has(ADMIN_ONLY_PERMISSIONS) ?? false;
}
