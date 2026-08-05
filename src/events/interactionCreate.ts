import { Client } from "discord.js";
import { routePrayerCommand } from "../commands";
import { logError } from "../services/logger.service";

export function registerInteractionEvent(client: Client): void {
  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== "prayer") return;

    try {
      await routePrayerCommand(interaction);
    } catch (err) {
      await logError(interaction.client, interaction.guildId, "Command execution failed", err);
      const payload = { content: "Something went wrong running that command.", ephemeral: true };
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp(payload);
      } else {
        await interaction.reply(payload);
      }
    }
  });
}
