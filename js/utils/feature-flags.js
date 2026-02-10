/**
 * Feature Flags Management
 * Simple singleton to check if event has started
 */

class FeatureFlags {
  async isEventStarted(supabase) {
    try {
      const { data, error } = await supabase
        .from('app_settings')
        .select('setting_value')
        .eq('setting_key', 'event_started')
        .single();

      if (error) throw error;
      return data?.setting_value?.enabled === true;
    } catch (err) {
      console.error('Failed to check event status:', err);
      return false; // Default to disabled on error
    }
  }
}

export const featureFlags = new FeatureFlags();