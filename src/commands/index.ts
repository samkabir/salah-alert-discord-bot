import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { ADMIN_ONLY_PERMISSIONS } from "../utils/permissions";
import { toggleCommand } from "./prayer/toggle";
import { setCommand } from "./prayer/set";
import { messageCommand } from "./prayer/message";
import { channelCommand } from "./prayer/channel";
import { daysCommand } from "./prayer/days";
import { unmuteCommand } from "./prayer/unmute";
import { statusCommand } from "./prayer/status";
import { helpCommand } from "./prayer/help";
import {
  buildMuteGroup,
  executeMuteRange,
  executeMuteDay,
  executeMuteList,
  executeMuteEnable,
  executeMuteDisable,
  executeMuteRemove,
  executeMuteToday,
} from "./prayer/mute";
import { PrayerSubcommand } from "./types";

const flatSubcommands: PrayerSubcommand[] = [
  toggleCommand,
  setCommand,
  messageCommand,
  channelCommand,
  daysCommand,
  unmuteCommand,
  statusCommand,
  helpCommand,
];

export function buildPrayerCommand(): SlashCommandBuilder {
  const builder = new SlashCommandBuilder()
    .setName("prayer")
    .setDescription("Configure namaz alerts")
    .setDefaultMemberPermissions(ADMIN_ONLY_PERMISSIONS)
    .setDMPermission(false);

  for (const cmd of flatSubcommands) {
    builder.addSubcommand((sub) => cmd.build(sub));
  }
  builder.addSubcommandGroup((group) => buildMuteGroup(group));

  return builder;
}

export async function routePrayerCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const group = interaction.options.getSubcommandGroup(false);
  const sub = interaction.options.getSubcommand(true);

  if (group === "mute") {
    if (sub === "range") return executeMuteRange(interaction);
    if (sub === "day") return executeMuteDay(interaction);
    if (sub === "list") return executeMuteList(interaction);
    if (sub === "enable") return executeMuteEnable(interaction);
    if (sub === "disable") return executeMuteDisable(interaction);
    if (sub === "remove") return executeMuteRemove(interaction);
    if (sub === "today") return executeMuteToday(interaction);
    return;
  }

  const handler = flatSubcommands.find((c) => c.name === sub);
  if (!handler) {
    await interaction.reply({ content: "Unknown subcommand.", ephemeral: true });
    return;
  }
  await handler.execute(interaction);
}
