import { PrayerSubcommand } from "../types";
import { setMuteToday } from "../../db/repositories/guildConfig.repo";
import { removeMuteRangesCoveringDate } from "../../db/repositories/muteRange.repo";
import { todayIso } from "../../utils/time";
import { rescheduleGuildAlerts } from "../../services/scheduler.service";

export const unmuteCommand: PrayerSubcommand = {
  name: "unmute",
  build: (sub) => sub.setName("unmute").setDescription("Resume alerts immediately"),
  execute: async (interaction) => {
    const guildId = interaction.guildId!;
    const today = todayIso();

    setMuteToday(guildId, false);
    const removed = removeMuteRangesCoveringDate(guildId, today);

    rescheduleGuildAlerts(interaction.client, guildId);

    await interaction.reply({
      content: `Alerts resumed.${removed > 0 ? ` Removed ${removed} mute range(s) covering today.` : ""}`,
      ephemeral: true,
    });
  },
};
