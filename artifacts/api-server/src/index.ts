import app from "./app";
import { logger } from "./lib/logger";
import { startDiscordBot } from "./discord/client";

// This adds the "Home" page so UptimeRobot works
app.get("/", (req, res) => {
  res.send("Bot is online and healthy!");
});

const rawPort = process.env["PORT"] || "3000"; 
const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, "0.0.0.0", (err?: Error) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port }, "Server listening - Use this URL for UptimeRobot");
});

startDiscordBot().catch((err) => {
  logger.error({ err }, "Discord bot failed to start");
});