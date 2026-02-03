/**
 * Test script for AssignmentService
 * This can be run in the browser console to verify the service works
 */

// Test the AssignmentService independently
async function testAssignmentService() {
    console.log('🧪 Testing AssignmentService...');

    try {
        // Import required modules (assuming they're available)
        const { AssignmentService, ConflictError } = await import('./js/services/assignment-service.js');
        const { appState } = await import('./js/app.js');

        // Initialize service
        const userId = appState.getUserId();
        const supabase = appState.getSupabase();

        if (!userId || !supabase) {
            throw new Error('Not authenticated or Supabase not available');
        }

        const service = new AssignmentService(supabase, userId);
        console.log('✅ Service initialized');

        // Test with a fake challenge ID (replace with real one)
        const testChallengeId = 'test-challenge-id';

        // Test getCurrentAssignments
        console.log('🔍 Testing getCurrentAssignments...');
        const assignments = await service.getCurrentAssignments(testChallengeId);
        console.log('Current assignments:', assignments);

        // Test version calculation
        console.log('🔢 Testing version calculation...');
        const version1 = service.calculateVersion(['user1', 'user2']);
        const version2 = service.calculateVersion(['user2', 'user1']);
        const version3 = service.calculateVersion(['user1', 'user3']);

        console.log('Version 1 (user1, user2):', version1);
        console.log('Version 2 (user2, user1):', version2);
        console.log('Version 3 (user1, user3):', version3);

        if (version1 === version2) {
            console.log('✅ Version calculation is order-independent');
        } else {
            console.log('❌ Version calculation should be order-independent');
        }

        if (version1 !== version3) {
            console.log('✅ Version calculation differentiates between different sets');
        } else {
            console.log('❌ Version calculation should differentiate between different sets');
        }

        console.log('🎉 AssignmentService tests completed!');

    } catch (error) {
        console.error('❌ Test failed:', error);

        // Check if it's a ConflictError
        if (error instanceof ConflictError) {
            console.log('✅ ConflictError properly thrown');
        }
    }
}

// Test service state
async function testServiceState() {
    console.log('🔧 Testing service state...');

    try {
        const { appState } = await import('./js/app.js');

        console.log('User ID:', appState.getUserId());
        console.log('Current User:', appState.getCurrentUser());
        console.log('Supabase client:', appState.getSupabase());

        // Test if we can query challenges
        const supabase = appState.getSupabase();
        const { data: challenges, error } = await supabase
            .from('challenges')
            .select('id, title, approval_status')
            .limit(5);

        if (error) {
            console.error('Database query error:', error);
        } else {
            console.log('Sample challenges:', challenges);

            if (challenges && challenges.length > 0) {
                const testChallenge = challenges[0];
                console.log(`Using challenge "${testChallenge.title}" for testing`);
                return testChallenge.id;
            }
        }

    } catch (error) {
        console.error('State test failed:', error);
    }
}

// Export test functions for console use
window.testAssignmentService = testAssignmentService;
window.testServiceState = testServiceState;

console.log('🧪 Assignment service test functions loaded!');
console.log('Run testServiceState() to check basic connectivity');
console.log('Run testAssignmentService() to test the service (after authentication)');