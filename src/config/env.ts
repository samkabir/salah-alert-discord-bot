import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const env = {
  DISCORD_TOKEN: required("DISCORD_TOKEN"),
  CLIENT_ID: required("CLIENT_ID"),
  GUILD_ID: process.env.GUILD_ID ?? null,
  DB_PATH: process.env.DB_PATH ?? "./data/namaz-bot.sqlite",
  BACKUP_DIR: process.env.BACKUP_DIR ?? "./data/backups",
  LAT: Number(process.env.LAT ?? "23.8103"),
  LON: Number(process.env.LON ?? "90.4125"),
  TIMEZONE: process.env.TIMEZONE ?? "Asia/Dhaka",
};
