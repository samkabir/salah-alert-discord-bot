import { ChatInputCommandInteraction, SlashCommandSubcommandBuilder } from "discord.js";

export interface PrayerSubcommand {
  name: string;
  build: (sub: SlashCommandSubcommandBuilder) => SlashCommandSubcommandBuilder;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}
