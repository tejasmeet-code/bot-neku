import app from "./app";
import { logger } from "./lib/logger";
import { startDiscordBot } from "./discord/client";
import { ensureDataDir } from "./lib/paths";

// Surface any unhandled error instead of letting Railway swallow it.
process.on("unhandledRejection", (err) => {
  logger.error({ err }, "Unhandled promise rejection");
});
process.on("uncaughtException", (err) => {
  logger.error({ err }, "Uncaught exception");
});

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

(async () => {
  try {
    // Make sure the on-disk storage directory exists *before* any command
    // tries to read or write. On Railway this is critical: without DATA_DIR
    // set, .data/ lives on the ephemeral container fs (data wipes on every
    // deploy). Set DATA_DIR to a mounted volume path for persistence.
    await ensureDataDir();
  } catch (err) {
    logger.error({ err }, "Failed to ensure data directory; storage commands will fail");
  }
  try {
    await startDiscordBot();
  } catch (err) {
    logger.error({ err }, "Discord bot failed to start");
  }
})();