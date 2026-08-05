import "./db/client";
import { Client, GatewayIntentBits } from "discord.js";
import { env } from "./config/env";
import { registerReadyEvent } from "./events/ready";
import { registerInteractionEvent } from "./events/interactionCreate";
import { initScheduler } from "./services/scheduler.service";
import { initBackupSchedule } from "./services/backup.service";

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

registerReadyEvent(client);
registerInteractionEvent(client);

client.once("ready", () => {
  initScheduler(client);
  initBackupSchedule();
});

client.login(env.DISCORD_TOKEN);

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason);
});
