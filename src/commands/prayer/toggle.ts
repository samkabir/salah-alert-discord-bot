import { PrayerSubcommand } from "../types";
import { WAQTS } from "../../types/prayer.types";
import { toggleWaqt, getWaqtSetting } from "../../db/repositories/waqtSettings.repo";

export const toggleCommand: PrayerSubcommand = {
  name: "toggle",
  build: (sub) =>
    sub
      .setName("toggle")
      .setDescription("Enable or disable alerts for a waqt")
      .addStringOption((opt) =>
        opt
          .setName("waqt")
          .setDescription("Which prayer")
          .setRequired(true)
          .addChoices(...WAQTS.map((w) => ({ name: w, value: w })))
      )
      .addBooleanOption((opt) =>
        opt.setName("enabled").setDescription("Enable or disable").setRequired(true)
      ),
  execute: async (interaction) => {
    const guildId = interaction.guildId!;
    const waqt = interaction.options.getString("waqt", true) as (typeof WAQTS)[number];
    const enabled = interaction.options.getBoolean("enabled", true);

    toggleWaqt(guildId, waqt, enabled);
    const setting = getWaqtSetting(guildId, waqt);

    await interaction.reply({
      content: `**${waqt}** alerts are now **${setting?.enabled ? "enabled" : "disabled"}**.`,
      ephemeral: true,
    });
  },
};
