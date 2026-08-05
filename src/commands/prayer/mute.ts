import { SlashCommandSubcommandGroupBuilder, ChatInputCommandInteraction } from "discord.js";
import {
  addMuteRange,
  listMuteRanges,
  setMuteRangeEnabled,
  removeMuteRange,
} from "../../db/repositories/muteRange.repo";
import { setMuteToday } from "../../db/repositories/guildConfig.repo";
import { MuteRange } from "../../types/prayer.types";

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TIME_WINDOW_REGEX = /^([01]\d|2[0-3]):([0-5]\d)-([01]\d|2[0-3]):([0-5]\d)$/;

export function buildMuteGroup(group: SlashCommandSubcommandGroupBuilder) {
  return group
    .setName("mute")
    .setDescription("Pause alerts")
    .addSubcommand((sub) =>
      sub
        .setName("range")
        .setDescription("Mute a date range (optionally only a time window)")
        .addStringOption((opt) =>
          opt.setName("start").setDescription("Start date YYYY-MM-DD").setRequired(true)
        )
        .addStringOption((opt) =>
          opt.setName("end").setDescription("End date YYYY-MM-DD").setRequired(true)
        )
        .addStringOption((opt) =>
          opt
            .setName("time")
            .setDescription("Optional window HH:MM-HH:MM (omit = whole day)")
            .setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("day")
        .setDescription("Mute a single day (optionally only a time window)")
        .addStringOption((opt) =>
          opt.setName("date").setDescription("Date YYYY-MM-DD").setRequired(true)
        )
        .addStringOption((opt) =>
          opt
            .setName("time")
            .setDescription("Optional window HH:MM-HH:MM (omit = whole day)")
            .setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub.setName("list").setDescription("List all mute entries with their IDs")
    )
    .addSubcommand((sub) =>
      sub
        .setName("enable")
        .setDescription("Re-enable a mute entry by ID")
        .addIntegerOption((opt) =>
          opt.setName("id").setDescription("Mute entry ID (see /prayer mute list)").setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("disable")
        .setDescription("Disable a mute entry by ID (kept for later reuse)")
        .addIntegerOption((opt) =>
          opt.setName("id").setDescription("Mute entry ID (see /prayer mute list)").setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Delete a mute entry by ID")
        .addIntegerOption((opt) =>
          opt.setName("id").setDescription("Mute entry ID (see /prayer mute list)").setRequired(true)
        )
    )
    .addSubcommand((sub) => sub.setName("today").setDescription("Mute alerts for the rest of today"));
}

/** Parse and validate an "HH:MM-HH:MM" window; returns null if the syntax is bad. */
function parseWindow(raw: string): { from: string; to: string } | null {
  if (!TIME_WINDOW_REGEX.test(raw)) return null;
  const [from, to] = raw.split("-");
  return { from, to };
}

/** Human-readable one-line description of a mute entry. */
export function describeRange(r: MuteRange): string {
  const span = r.startDate === r.endDate ? r.startDate : `${r.startDate} → ${r.endDate}`;
  const window = r.fromTime && r.toTime ? `${r.fromTime}–${r.toTime}` : "all day";
  return `\`#${r.id}\` [${r.enabled ? "ON" : "OFF"}] ${span} (${window})`;
}

async function addAndReply(
  interaction: ChatInputCommandInteraction,
  guildId: string,
  start: string,
  end: string,
  rawTime: string | null
): Promise<void> {
  if (!ISO_DATE_REGEX.test(start) || !ISO_DATE_REGEX.test(end) || start > end) {
    await interaction.reply({
      content: "Dates must be YYYY-MM-DD and `start` must not be after `end`.",
      ephemeral: true,
    });
    return;
  }

  let from: string | null = null;
  let to: string | null = null;
  if (rawTime) {
    const parsed = parseWindow(rawTime);
    if (!parsed || parsed.from >= parsed.to) {
      await interaction.reply({
        content: "`time` must be a window `HH:MM-HH:MM` with start before end, e.g. `12:00-18:00`.",
        ephemeral: true,
      });
      return;
    }
    from = parsed.from;
    to = parsed.to;
  }

  const id = addMuteRange(guildId, start, end, from, to);
  const span = start === end ? `**${start}**` : `**${start}** → **${end}**`;
  const window = from ? ` during **${from}–${to}**` : "";
  await interaction.reply({
    content: `Muted ${span}${window}. Entry \`#${id}\`.`,
    ephemeral: true,
  });
}

export async function executeMuteRange(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId!;
  const start = interaction.options.getString("start", true);
  const end = interaction.options.getString("end", true);
  const time = interaction.options.getString("time", false);
  await addAndReply(interaction, guildId, start, end, time);
}

export async function executeMuteDay(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId!;
  const date = interaction.options.getString("date", true);
  const time = interaction.options.getString("time", false);
  await addAndReply(interaction, guildId, date, date, time);
}

export async function executeMuteList(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId!;
  const ranges = listMuteRanges(guildId);
  await interaction.reply({
    content:
      ranges.length > 0
        ? ["**Mute entries**", ...ranges.map(describeRange)].join("\n")
        : "No mute entries. Add one with `/prayer mute range` or `/prayer mute day`.",
    ephemeral: true,
  });
}

async function setEnabled(interaction: ChatInputCommandInteraction, enabled: boolean): Promise<void> {
  const guildId = interaction.guildId!;
  const id = interaction.options.getInteger("id", true);
  const ok = setMuteRangeEnabled(guildId, id, enabled);
  await interaction.reply({
    content: ok
      ? `Mute entry \`#${id}\` ${enabled ? "enabled" : "disabled"}.`
      : `No mute entry with ID \`#${id}\`. Use \`/prayer mute list\`.`,
    ephemeral: true,
  });
}

export async function executeMuteEnable(interaction: ChatInputCommandInteraction): Promise<void> {
  await setEnabled(interaction, true);
}

export async function executeMuteDisable(interaction: ChatInputCommandInteraction): Promise<void> {
  await setEnabled(interaction, false);
}

export async function executeMuteRemove(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId!;
  const id = interaction.options.getInteger("id", true);
  const ok = removeMuteRange(guildId, id);
  await interaction.reply({
    content: ok
      ? `Mute entry \`#${id}\` deleted.`
      : `No mute entry with ID \`#${id}\`. Use \`/prayer mute list\`.`,
    ephemeral: true,
  });
}

export async function executeMuteToday(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId!;
  setMuteToday(guildId, true);
  await interaction.reply({ content: "Alerts muted for the rest of today.", ephemeral: true });
}
