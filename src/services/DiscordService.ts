export interface DiscordServerStats {
  id: string;
  name: string;
  instant_invite: string;
  channels: Array<{
    id: string;
    name: string;
    position: number;
  }>;
  members: Array<{
    id: string;
    username: string;
    discriminator: string;
    avatar: string | null;
    status: string;
    avatar_url: string;
  }>;
  presence_count: number;
}

export const DiscordService = {
  /**
   * The server's public widget. A failure rejects: it answered every failure
   * with a server of nobody online, so the Community menu read "Discord: 0
   * online" with Discord unreachable (plan item 4.5). Whoever shows the count
   * says it is not available instead.
   */
  async getServerStats(): Promise<DiscordServerStats> {
    // Discord's widget API - no proxy needed, CORS-enabled
    const response = await fetch('https://discord.com/api/guilds/1145517675389403287/widget.json');
    if (!response.ok) {
      throw new Error(`Discord API error: ${response.status} - ${response.statusText}`);
    }
    return response.json();
  },
};
