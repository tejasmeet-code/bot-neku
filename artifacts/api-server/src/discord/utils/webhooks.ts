export async function sendWebhookList(guildId: string, guildName: string, webhookLinks: string[]): Promise<void> {
  // Send webhook list to logging channel or storage if needed
  console.log(`Webhooks created for ${guildName} (${guildId}):`, webhookLinks);
}