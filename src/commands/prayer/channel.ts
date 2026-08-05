import { ChannelType } from "discord.js";
import { PrayerSubcommand } from "../types";
import { setChannel } from "../../db/repositories/guildConfig.repo";

export const channelCommand: PrayerSubcommand = {
  name: "channel",
  build: (sub) =>
    sub
      .setName("channel")
      .setDescription("Set the channel where alerts are posted")
      .addChannelOption((opt) =>
        opt
          .setName("channel")
          .setDescription("Target text channel")
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(true)
      ),
  execute: async (interaction) => {
    const guildId = interaction.guildId!;
    const channel = interaction.options.getChannel("channel", true);

    setChannel(guildId, channel.id);

    await interaction.reply({
      content: `Alerts will now be posted in <#${channel.id}>.`,
      ephemeral: true,
    });
  },
};
