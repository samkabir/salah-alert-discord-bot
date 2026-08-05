import { Client, EmbedBuilder, TextChannel } from "discord.js";
import { getGuildConfig } from "../db/repositories/guildConfig.repo";

export async function logError(
  client: Client,
  guildId: string | null,
  context: string,
  error: unknown
): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[${context}]${guildId ? ` [guild:${guildId}]` : ""}`, message);

  if (!guildId) return;
  const config = getGuildConfig(guildId);
  if (!config?.adminLogChannelId) return;

  try {
    const channel = await client.channels.fetch(config.adminLogChannelId);
    if (!channel || !(channel instanceof TextChannel)) return;

    const embed = new EmbedBuilder()
      .setTitle("Bot Error")
      .setColor(0xc0392b)
      .setDescription(`**${context}**\n\`\`\`${message.slice(0, 1000)}\`\`\``)
      .setTimestamp();

    await channel.send({ embeds: [embed] });
  } catch (sendErr) {
    console.error("Failed to send error to admin log channel:", sendErr);
  }
}

export async function logFallbackUsage(
  client: Client,
  guildId: string,
  source: string
): Promise<void> {
  console.warn(`[fallback] guild:${guildId} used source=${source}`);

  const config = getGuildConfig(guildId);
  if (!config?.adminLogChannelId) return;

  try {
    const channel = await client.channels.fetch(config.adminLogChannelId);
    if (!channel || !(channel instanceof TextChannel)) return;
    await channel.send(`⚠️ Prayer times fetched via fallback source: **${source}**`);
  } catch (sendErr) {
    console.error("Failed to send fallback notice to admin log channel:", sendErr);
  }
}
