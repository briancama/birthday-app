/**
 * Feature Flags Management
 * Fetches app-wide feature flags from Supabase
 */

class FeatureFlags {
  constructor() {
    this.cache = null;
    this.cacheExpiry = 0;
    this.CACHE_DURATION = 60000; // 1 minute
  }

  async getSettings(supabase, forceRefresh = false) {
    const now = Date.now();
    
    if (!forceRefresh && this.cache && now < this.cacheExpiry) {
      return this.cache;
    }

    try {
      const { data, error } = await supabase
        .from('app_settings')
        .select('setting_key, setting_value');

      if (error) throw error;

      this.cache = data.reduce((acc, row) => {
        acc[row.setting_key] = row.setting_value;
        return acc;
      }, {});

      this.cacheExpiry = now + this.CACHE_DURATION;
      return this.cache;
    } catch (err) {
      console.error('Failed to load feature flags:', err);
      return {};
    }
  }

  /**
   * Check if event has started (enables challenges and leaderboard)
   */
  async isEventStarted(supabase) {
    const settings = await this.getSettings(supabase);
    const eventSettings = settings.event_started;
    return eventSettings?.enabled === true;
  }

  /**
   * Invalidate cache to force refresh
   */
  invalidateCache() {
    this.cache = null;
    this.cacheExpiry = 0;
  }
}

export const featureFlags = new FeatureFlags();