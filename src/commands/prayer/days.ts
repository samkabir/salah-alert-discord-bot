import { PrayerSubcommand } from "../types";
import { WAQTS, WEEKDAYS, Weekday, Waqt } from "../../types/prayer.types";
import { setActiveDays } from "../../db/repositories/waqtSettings.repo";

export const daysCommand: PrayerSubcommand = {
  name: "days",
  build: (sub) =>
    sub
      .setName("days")
      .setDescription("Set which weekdays a waqt's alert is active on")
      .addStringOption((opt) =>
        opt
          .setName("waqt")
          .setDescription("Which prayer, or 'all'")
          .setRequired(true)
          .addChoices(
            { name: "all", value: "all" },
            ...WAQTS.map((w) => ({ name: w, value: w }))
          )
      )
      .addStringOption((opt) =>
        opt
          .setName("days")
          .setDescription("Comma-separated: mon,tue,wed,thu,fri,sat,sun")
          .setRequired(true)
      ),
  execute: async (interaction) => {
    const guildId = interaction.guildId!;
    const waqtOption = interaction.options.getString("waqt", true) as Waqt | "all";
    const rawDays = interaction.options.getString("days", true);

    const days = rawDays
      .split(",")
      .map((d) => d.trim().toLowerCase()) as Weekday[];

    const invalid = days.filter((d) => !WEEKDAYS.includes(d));
    if (invalid.length > 0 || days.length === 0) {
      await interaction.reply({
        content: `Invalid day(s): ${invalid.join(", ") || "none provided"}. Use: ${WEEKDAYS.join(", ")}.`,
        ephemeral: true,
      });
      return;
    }

    const targetWaqts: Waqt[] = waqtOption === "all" ? [...WAQTS] : [waqtOption];
    setActiveDays(guildId, targetWaqts, days);

    await interaction.reply({
      content: `Active days for **${waqtOption}** set to: ${days.join(", ")}.`,
      ephemeral: true,
    });
  },
};
