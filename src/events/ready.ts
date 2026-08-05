import { Client } from "discord.js";
import { ensureGuild } from "../db/repositories/guildConfig.repo";

export function registerReadyEvent(client: Client): void {
  client.once("ready", (readyClient) => {
    for (const guild of readyClient.guilds.cache.values()) {
      ensureGuild(guild.id);
    }
    console.log(`Logged in as ${readyClient.user.tag}. Guilds: ${readyClient.guilds.cache.size}.`);
  });

  client.on("guildCreate", (guild) => {
    ensureGuild(guild.id);
  });
}
