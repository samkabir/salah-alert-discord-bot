import { PrayerSubcommand } from "../types";
import { WAQTS, Waqt } from "../../types/prayer.types";
import { setQuoteToggle } from "../../db/repositories/waqtSettings.repo";
import { rescheduleGuildAlerts } from "../../services/scheduler.service";

export const quoteCommand: PrayerSubcommand = {
  name: "quote",
  build: (sub) =>
    sub
      .setName("quote")
      .setDescription("Enable or disable ayah quotes for prayer alerts")
      .addStringOption((opt) =>
        opt
          .setName("waqt")
          .setDescription("Which prayer (or all)")
          .setRequired(true)
          .addChoices(
            { name: "all", value: "all" },
            ...WAQTS.map((w) => ({ name: w, value: w }))
          )
      )
      .addBooleanOption((opt) =>
        opt
          .setName("show")
          .setDescription("Show ayah quote in alert")
          .setRequired(true)
      ),
  execute: async (interaction) => {
    const guildId = interaction.guildId!;
    const waqt = interaction.options.getString("waqt", true) as Waqt | "all";
    const show = interaction.options.getBoolean("show", true);

    setQuoteToggle(guildId, waqt, show);
    rescheduleGuildAlerts(interaction.client, guildId);

    const target = waqt === "all" ? "all waqts" : `**${waqt}**`;
    await interaction.reply({
      content: `Ayah quotes are now **${show ? "enabled" : "disabled"}** for ${target}.`,
      ephemeral: true,
    });
  },
};
