/**
 * One-off: push src/assets/logo.jpg to Discord as the bot's avatar and as the
 * application icon (the picture shown in the App Directory / on the profile).
 *
 * Not done on boot on purpose: Discord rate-limits avatar/username edits hard
 * (a couple per hour), so a restart loop would lock the bot out of the change.
 * Run it by hand whenever the logo file changes.
 *
 * Run:  npm run set-avatar
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { Client, GatewayIntentBits } from "discord.js";

const token = process.env.DISCORD_TOKEN;
if (!token) throw new Error("Missing required env var: DISCORD_TOKEN");

const logoPath = path.resolve(__dirname, "../src/assets/logo.jpg");

async function main(): Promise<void> {
  if (!fs.existsSync(logoPath)) throw new Error(`Logo not found: ${logoPath}`);
  const logo = fs.readFileSync(logoPath);

  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  await client.login(token);
  await new Promise<void>((resolve) => client.once("ready", () => resolve()));

  await client.user!.setAvatar(logo);
  console.log(`Avatar updated for ${client.user!.tag}.`);

  try {
    await client.application!.edit({ icon: logo });
    console.log("Application icon updated.");
  } catch (err) {
    // Non-fatal: the avatar is what shows on messages.
    console.warn("Could not update application icon:", err);
  }

  await client.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
