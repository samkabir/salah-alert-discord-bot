import { PrayerSubcommand } from "../types";
import { OFFSET_TYPES, WAQTS } from "../../types/prayer.types";
import { setOffset } from "../../db/repositories/waqtSettings.repo";

const FIXED_TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const setCommand: PrayerSubcommand = {
  name: "set",
  build: (sub) =>
    sub
      .setName("set")
      .setDescription("Configure how a waqt's alert time is calculated")
      .addStringOption((opt) =>
        opt
          .setName("waqt")
          .setDescription("Which prayer")
          .setRequired(true)
          .addChoices(...WAQTS.map((w) => ({ name: w, value: w })))
      )
      .addStringOption((opt) =>
        opt
          .setName("mode")
          .setDescription("start | before | after | fixed")
          .setRequired(true)
          .addChoices(...OFFSET_TYPES.map((t) => ({ name: t, value: t })))
      )
      .addStringOption((opt) =>
        opt
          .setName("value")
          .setDescription("Minutes for before/after, or HH:MM for fixed. Omit for start.")
          .setRequired(false)
      ),
  execute: async (interaction) => {
    const guildId = interaction.guildId!;
    const waqt = interaction.options.getString("waqt", true) as (typeof WAQTS)[number];
    const mode = interaction.options.getString("mode", true) as (typeof OFFSET_TYPES)[number];
    const rawValue = interaction.options.getString("value", false);

    if (mode === "before" || mode === "after") {
      const minutes = Number(rawValue);
      if (!rawValue || !Number.isInteger(minutes) || minutes <= 0) {
        await interaction.reply({
          content: "For `before`/`after` mode, `value` must be a positive integer number of minutes.",
          ephemeral: true,
        });
        return;
      }
      setOffset(guildId, waqt, mode, minutes);
    } else if (mode === "fixed") {
      if (!rawValue || !FIXED_TIME_REGEX.test(rawValue)) {
        await interaction.reply({
          content: "For `fixed` mode, `value` must be a 24h time in HH:MM format, e.g. `19:30`.",
          ephemeral: true,
        });
        return;
      }
      const [h, m] = rawValue.split(":").map(Number);
      setOffset(guildId, waqt, mode, h * 60 + m);
    } else {
      setOffset(guildId, waqt, "start", 0);
    }

    await interaction.reply({
      content: `**${waqt}** alert mode set to **${mode}**${rawValue ? ` (${rawValue})` : ""}.`,
      ephemeral: true,
    });
  },
};
