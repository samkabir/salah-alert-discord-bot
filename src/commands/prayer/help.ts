import { EmbedBuilder } from "discord.js";
import { PrayerSubcommand } from "../types";

export const helpCommand: PrayerSubcommand = {
  name: "help",
  build: (sub) => sub.setName("help").setDescription("List all /prayer commands"),
  execute: async (interaction) => {
    const embed = new EmbedBuilder()
      .setTitle("/prayer commands")
      .setColor(0x2b7a4b)
      .setDescription(
        [
          "`/prayer toggle <waqt> <enabled>` — enable/disable a waqt's alerts",
          "`/prayer set <waqt> <start|before|after|fixed> [value]` — configure alert timing",
          "`/prayer message <waqt> <text|reset>` — custom or default alert message",
          "`/prayer channel <#channel>` — set the alert channel",
          "`/prayer days <waqt|all> <mon,tue,...>` — set active weekdays",
          "`/prayer mute range <start> <end> [time]` — mute a date range (optional HH:MM-HH:MM window)",
          "`/prayer mute day <date> [time]` — mute a single day (optional HH:MM-HH:MM window)",
          "`/prayer mute list` — list mute entries with IDs",
          "`/prayer mute enable|disable <id>` — turn a mute entry on/off",
          "`/prayer mute remove <id>` — delete a mute entry",
          "`/prayer mute today` — mute for the rest of today",
          "`/prayer unmute` — resume alerts immediately",
          "`/prayer status` — show current configuration",
          "`/prayer help` — this message",
        ].join("\n")
      );

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
