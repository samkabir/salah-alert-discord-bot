import { REST, Routes } from "discord.js";
import { env } from "./config/env";
import { buildPrayerCommand } from "./commands";

async function main(): Promise<void> {
  const command = buildPrayerCommand().toJSON();
  const rest = new REST().setToken(env.DISCORD_TOKEN);

  const route = env.GUILD_ID
    ? Routes.applicationGuildCommands(env.CLIENT_ID, env.GUILD_ID)
    : Routes.applicationCommands(env.CLIENT_ID);

  await rest.put(route, { body: [command] });
  console.log(`Registered /prayer command ${env.GUILD_ID ? `to guild ${env.GUILD_ID}` : "globally"}.`);
}

main().catch((err) => {
  console.error("Failed to deploy commands:", err);
  process.exit(1);
});
