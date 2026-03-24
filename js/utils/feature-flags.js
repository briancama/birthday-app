
// Feature Flags Management
// Simple singleton to check if event has started or challenges are enabled
class FeatureFlags {
  async isChallengesEnabled(supabase) {
    try {
      const { data, error } = await supabase
        .from('app_settings')
        .select('setting_value')
        .eq('setting_key', 'challenges_enabled')
        .single();
      if (error) throw error;
      return data?.setting_value?.enabled !== false;
    } catch (err) {
      console.error('Failed to check challenges_enabled:', err);
      return true; // Default to enabled on error
    }
  }

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
