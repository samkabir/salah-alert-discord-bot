import { PrayerSubcommand } from "../types";
import { WAQTS } from "../../types/prayer.types";
import { setCustomMessage } from "../../db/repositories/waqtSettings.repo";

export const messageCommand: PrayerSubcommand = {
  name: "message",
  build: (sub) =>
    sub
      .setName("message")
      .setDescription("Set or reset the alert message for a waqt")
      .addStringOption((opt) =>
        opt
          .setName("waqt")
          .setDescription("Which prayer")
          .setRequired(true)
          .addChoices(...WAQTS.map((w) => ({ name: w, value: w })))
      )
      .addStringOption((opt) =>
        opt
          .setName("text")
          .setDescription("Message text (use {waqt} and {time}), or 'reset' for default")
          .setRequired(true)
      ),
  execute: async (interaction) => {
    const guildId = interaction.guildId!;
    const waqt = interaction.options.getString("waqt", true) as (typeof WAQTS)[number];
    const text = interaction.options.getString("text", true);

    const isReset = text.trim().toLowerCase() === "reset";
    setCustomMessage(guildId, waqt, isReset ? null : text);

    await interaction.reply({
      content: isReset
        ? `**${waqt}** message reset to default.`
        : `**${waqt}** message updated.`,
      ephemeral: true,
    });
  },
};
