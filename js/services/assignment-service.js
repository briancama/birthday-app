/**
 * Assignment Service - Handles challenge assignment operations
 * Follows Single Responsibility Principle and provides transactional safety
 */
export class AssignmentService {
    constructor(supabase, userId) {
        this.supabase = supabase;
        this.userId = userId;
    }

    /**
     * Get current assignments with version for optimistic locking
     */
    async getCurrentAssignments(challengeId) {
        const { data, error } = await this.supabase
            .from('assignments')
            .select('user_id, active, updated_at')
            .eq('challenge_id', challengeId)
            .eq('active', true);

        if (error) throw error;

        return {
            userIds: data.map(a => a.user_id),
            version: this.calculateVersion(data) // Hash of updated_at timestamps
        };
    }

    /**
     * Update assignments atomically using a single transaction
     */
    async updateAssignments(challengeId, newUserIds, expectedVersion = null) {
        // Optimistic locking check
        if (expectedVersion) {
            const current = await this.getCurrentAssignments(challengeId);
            if (current.version !== expectedVersion) {
                throw new ConflictError('Assignments modified by another user. Please refresh and try again.');
            }
        }

        // Use database transaction for atomicity
        const { data, error } = await this.supabase.rpc('update_challenge_assignments', {
            p_challenge_id: challengeId,
            p_user_ids: newUserIds.map(id => id.toString()), // Ensure string format for UUID conversion
            p_updated_by: this.userId
        });

        if (error) throw error;
        return data;
    }

    /**
     * Calculate version hash from assignment timestamps
     */
    calculateVersion(assignments) {
        const timestamps = assignments.map(a => a.updated_at).sort().join('|');
        return btoa(timestamps).slice(0, 8); // Simple hash
    }
}

/**
 * Conflict Error for optimistic locking violations
 */
export class ConflictError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ConflictError';
        this.isConflict = true;
    }
}