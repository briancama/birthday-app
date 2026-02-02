import { BasePage } from './base-page.js';
import { SubmissionTable } from '../components/submission.js';
import { ChallengeAssignmentTable } from '../components/challenge-assignment.js';

export class AdminApprovalsPage extends BasePage {
  constructor() {
    super();
    this.pendingTable = new SubmissionTable('pendingContainer', 'admin');
    this.approvedTable = new ChallengeAssignmentTable('approvedContainer');
    this.deniedTable = new SubmissionTable('deniedContainer', 'admin');
    this.detailsModal = null;
    this.assignmentModal = null;
    this.assignmentForm = null;
    this.currentChallenge = null;
  }

  async init() {
    await super.init();
    this.setPageTitle('Admin Approvals');
    this.initializeModals();
    this.initializeAssignmentForm();
    await this.loadAllChallenges();
  }

  /**
   * Initialize modal elements and event listeners
   */
  initializeModals() {
    // Details Modal
    this.detailsModal = document.getElementById('detailsModal');
    const closeDetailsBtn = document.getElementById('closeDetailsModal');
    const detailsOverlay = this.detailsModal?.querySelector('.challenge-modal-overlay');

    if (closeDetailsBtn) {
      closeDetailsBtn.addEventListener('click', () => this.closeDetailsModal());
    }
    if (detailsOverlay) {
      detailsOverlay.addEventListener('click', () => this.closeDetailsModal());
    }

    // Assignment Modal
    this.assignmentModal = document.getElementById('assignmentModal');
    const closeAssignmentBtn = document.getElementById('closeAssignmentModal');
    const assignmentOverlay = this.assignmentModal?.querySelector('.challenge-modal-overlay');

    if (closeAssignmentBtn) {
      closeAssignmentBtn.addEventListener('click', () => this.closeAssignmentModal());
    }
    if (assignmentOverlay) {
      assignmentOverlay.addEventListener('click', () => this.closeAssignmentModal());
    }
  }

  /**
   * Initialize assignment form handler
   */
  initializeAssignmentForm() {
    this.assignmentForm = document.getElementById('assignmentForm');
    if (this.assignmentForm) {
      this.assignmentForm.addEventListener('submit', (e) => this.handleApproveSubmit(e));
    }
  }

  /**
   * Load all challenges across all statuses
   */
  async loadAllChallenges() {
    try {
      // Load challenges and assignments with user data
      const [challengesResult, assignmentsResult] = await Promise.all([
        this.supabase
          .from('challenges')
          .select('*')
          .order('created_at', { ascending: false }),
        this.supabase
          .from('assignments')
          .select(`
            challenge_id,
            user_id,
            users!assignments_user_id_fkey (
              username,
              display_name
            )
          `)
      ]);

      if (challengesResult.error) throw challengesResult.error;
      if (assignmentsResult.error) throw assignmentsResult.error;

      const data = challengesResult.data;

      console.log('Raw assignments from DB:', assignmentsResult.data);

      // Build map of challenge_id -> array of assigned users
      const assignmentsByChallenge = {};
      assignmentsResult.data.forEach(assignment => {
        console.log('Processing assignment:', assignment);
        if (!assignmentsByChallenge[assignment.challenge_id]) {
          assignmentsByChallenge[assignment.challenge_id] = [];
        }
        assignmentsByChallenge[assignment.challenge_id].push({
          username: assignment.users.username,
          display_name: assignment.users.display_name || assignment.users.username
        });
      });

      console.log('Built assignmentsByChallenge map:', assignmentsByChallenge);

      // Fetch usernames for created_by and assigned_to fields
      if (data && data.length > 0) {
        const userIds = [...new Set([
          ...data.map(c => c.created_by),
          ...data.filter(c => c.assigned_to).map(c => c.assigned_to)
        ])];

        const { data: users, error: userError } = await this.supabase
          .from('users')
          .select('id, username, display_name')
          .in('id', userIds);

        if (!userError && users) {
          const usernameMap = Object.fromEntries(users.map(u => [u.id, u.username]));
          const displayNameMap = Object.fromEntries(users.map(u => [u.id, u.display_name || u.username]));

          // Attach usernames to challenges
          data.forEach(challenge => {
            challenge.created_by_username = usernameMap[challenge.created_by];
            challenge.created_by_display = displayNameMap[challenge.created_by];
            if (challenge.assigned_to) {
              challenge.assigned_to_username = usernameMap[challenge.assigned_to];
            }
            // Attach actual assignments for all challenges
            challenge.actual_assignments = assignmentsByChallenge[challenge.id] || [];
            console.log(`Challenge "${challenge.title}" (ID: ${challenge.id}) has assignments:`, challenge.actual_assignments);
          });
        }
      }

      // Split by status
      const pending = data.filter(c => c.approval_status === 'pending');
      const approved = data.filter(c => c.approval_status === 'approved');
      const denied = data.filter(c => c.approval_status === 'denied');

      // Debug: log approved challenges with their assignments
      console.log('Approved challenges:', approved.map(c => ({
        title: c.title,
        actual_assignments: c.actual_assignments
      })));

      // Render each section
      this.renderPending(pending);
      this.renderApproved(approved);
      this.renderDenied(denied);

    } catch (err) {
      console.error('Error loading challenges:', err);
      this.pendingTable.showError('Error loading challenges. Please refresh the page.');
    }
  }

  /**
   * Render pending challenges table
   */
  renderPending(challenges) {
    this.pendingTable.render(challenges, {
      onApprove: (challenge) => this.handleApprove(challenge),
      onDeny: (challenge) => this.handleDeny(challenge),
      onViewDetails: (challenge) => this.showDetails(challenge)
    });
  }

  /**
   * Render approved challenges table
   */
  renderApproved(challenges) {
    this.approvedTable.render(challenges, {
      onAssign: (challenge) => this.handleAssign(challenge),
      onViewDetails: (challenge) => this.showDetails(challenge)
    });
  }

  /**
   * Render denied challenges table
   */
  renderDenied(challenges) {
    this.deniedTable.render(challenges, {
      onViewDetails: (challenge) => this.showDetails(challenge)
    });
  }

  /**
   * Show challenge details in modal
   */
  showDetails(challenge) {
    this.currentChallenge = challenge;
    console.log('showDetails called with challenge:', {
      id: challenge.id,
      title: challenge.title,
      assigned_to: challenge.assigned_to,
      assigned_to_username: challenge.assigned_to_username,
      actual_assignments: challenge.actual_assignments
    });

    const detailsDiv = document.getElementById('challengeDetails');

    // Build assigned users display
    let assignedDisplay = 'None';
    if (challenge.actual_assignments && challenge.actual_assignments.length > 0) {
      assignedDisplay = challenge.actual_assignments
        .map(a => this.escapeHtml(a.display_name || a.username))
        .join(', ');
    } else if (challenge.assigned_to_username) {
      assignedDisplay = this.escapeHtml(challenge.assigned_to_username);
    }

    if (detailsDiv) {
      detailsDiv.innerHTML = `
        <div class="detail-row">
          <strong>Title:</strong>
          <span>${this.escapeHtml(challenge.title)}</span>
        </div>
        <div class="detail-row">
          <strong>Description:</strong>
          <span>${this.escapeHtml(challenge.description)}</span>
        </div>
        <div class="detail-row">
          <strong>Success Metric:</strong>
          <span>${this.escapeHtml(challenge.success_metric || 'Not specified')}</span>
        </div>
        <div class="detail-row">
          <strong>Submitted By:</strong>
          <span>${this.escapeHtml(challenge.created_by_display || 'Unknown')}</span>
        </div>
        <div class="detail-row">
          <strong>Intended For:</strong>
          <span>${assignedDisplay}</span>
        </div>
      `;
    }

    this.openDetailsModal();
  }

  /**
   * Handle approve button click - opens assignment modal
   */
  handleApprove(challenge) {
    this.currentChallenge = challenge;
    
    const infoDiv = document.getElementById('assignmentChallengeInfo');
    if (infoDiv) {
      infoDiv.innerHTML = `
        <p><strong>Challenge:</strong> ${this.escapeHtml(challenge.title)}</p>
        <p><strong>Current Assignment:</strong> ${challenge.assigned_to_username ? this.escapeHtml(challenge.assigned_to_username) : 'Anyone'}</p>
      `;
    }

    // Pre-fill with current assignment if exists
    const assignInput = document.getElementById('assignToUser');
    if (assignInput) {
      assignInput.value = challenge.assigned_to_username || '';
    }

    // Set button text for approval
    const submitBtn = document.getElementById('approveAssignBtn');
    if (submitBtn) {
      submitBtn.textContent = '✅ APPROVE CHALLENGE';
    }

    this.loadUsers();
    this.openAssignmentModal();
  }

  /**
   * Handle assign button click for approved challenges
   */
  handleAssign(challenge) {
    this.currentChallenge = challenge;
    
    const infoDiv = document.getElementById('assignmentChallengeInfo');
    if (infoDiv) {
      const assignedUsers = challenge.actual_assignments && challenge.actual_assignments.length > 0
        ? challenge.actual_assignments.map(a => a.display_name || a.username).join(', ')
        : 'None';
      
      infoDiv.innerHTML = `
        <p><strong>Challenge:</strong> ${this.escapeHtml(challenge.title)}</p>
        <p><strong>Currently Assigned To:</strong> ${this.escapeHtml(assignedUsers)}</p>
      `;
    }

    // Clear input for new assignment
    const assignInput = document.getElementById('assignToUser');
    if (assignInput) {
      assignInput.value = '';
    }

    // Change button text to indicate adding assignment
    const submitBtn = document.getElementById('approveAssignBtn');
    if (submitBtn) {
      submitBtn.textContent = '➕ ADD ASSIGNMENT';
    }

    this.loadUsers();
    this.openAssignmentModal();
  }

  /**
   * Handle deny button click
   */
  async handleDeny(challenge) {
    const confirmed = confirm(`Are you sure you want to deny "${challenge.title}"?`);
    if (!confirmed) return;

    try {
      const { error } = await this.supabase
        .from('challenges')
        .update({
          approval_status: 'denied',
          approved_by: this.userId,
          approved_at: new Date().toISOString()
        })
        .eq('id', challenge.id);

      if (error) throw error;

      alert('Challenge denied successfully.');
      await this.loadAllChallenges();
    } catch (err) {
      console.error('Error denying challenge:', err);
      alert('Failed to deny challenge: ' + err.message);
    }
  }

  /**
   * Handle approval form submission
   */
  async handleApproveSubmit(e) {
    e.preventDefault();

    const submitBtn = document.getElementById('approveAssignBtn');
    this.hideAssignmentMessages();

    // Get selected user IDs from checkboxes
    const checkboxes = document.querySelectorAll('input[name="assignedUsers"]:checked:not([disabled])');
    const selectedUserIds = Array.from(checkboxes).map(cb => cb.value);

    if (selectedUserIds.length === 0) {
      this.showAssignmentError('Please select at least one user to assign this challenge to.');
      return;
    }

    submitBtn.disabled = true;
    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'Processing...';

    try {
      // Check if this is an approval or just an assignment
      const isApproval = this.currentChallenge.approval_status === 'pending';

      if (isApproval) {
        // Update challenge to approved
        const { error: approveError } = await this.supabase
          .from('challenges')
          .update({
            approval_status: 'approved',
            approved_by: this.userId,
            approved_at: new Date().toISOString(),
            assigned_to: selectedUserIds[0] // Use first user for assigned_to field
          })
          .eq('id', this.currentChallenge.id);

        if (approveError) throw approveError;
      }

      // Create assignments for all selected users
      const assignmentRecords = selectedUserIds.map(userId => ({
        user_id: userId,
        challenge_id: this.currentChallenge.id,
        assigned_at: new Date().toISOString()
      }));

      const { error: assignError } = await this.supabase
        .from('assignments')
        .insert(assignmentRecords);

      if (assignError) throw assignError;

      const userCount = selectedUserIds.length;
      const successMsg = isApproval 
        ? `Challenge approved and assigned to ${userCount} user${userCount > 1 ? 's' : ''}!`
        : `Challenge assigned to ${userCount} user${userCount > 1 ? 's' : ''}!`;
      
      this.showAssignmentSuccess(successMsg);

      // Reload and close after 1.5 seconds
      setTimeout(async () => {
        await this.loadAllChallenges();
        this.closeAssignmentModal();
      }, 1500);

    } catch (err) {
      console.error('Error processing challenge:', err);
      this.showAssignmentError(err.message || 'Failed to process challenge.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = originalText;
    }
  }

  /**
   * Load users for assignment datalist
   */
  async loadUsers() {
    try {
      const { data, error } = await this.supabase
        .from('users')
        .select('id, username, display_name')
        .order('display_name');

      if (error) throw error;

      const container = document.getElementById('userCheckboxList');
      if (container) {
        container.innerHTML = data.map(user => {
          const displayName = this.escapeHtml(user.display_name || user.username);
          const alreadyAssigned = this.currentChallenge.actual_assignments?.some(
            a => a.username === user.username
          ) || false;
          
          return `
            <div class="checkbox-item">
              <input 
                type="checkbox" 
                id="user_${user.id}" 
                name="assignedUsers" 
                value="${user.id}"
                data-username="${this.escapeHtml(user.username)}"
                ${alreadyAssigned ? 'checked disabled' : ''}
              >
              <label for="user_${user.id}">
                ${displayName}
                ${alreadyAssigned ? '<span class="already-assigned">(already assigned)</span>' : ''}
              </label>
            </div>
          `;
        }).join('');
      }
    } catch (err) {
      console.error('Error loading users:', err);
    }
  }

  /**
   * Modal management methods
   */
  openDetailsModal() {
    if (this.detailsModal) {
      this.detailsModal.style.display = 'block';
      document.body.style.overflow = 'hidden';
    }
  }

  closeDetailsModal() {
    if (this.detailsModal) {
      this.detailsModal.style.display = 'none';
      document.body.style.overflow = 'auto';
    }
  }

  openAssignmentModal() {
    if (this.assignmentModal) {
      this.assignmentModal.style.display = 'block';
      document.body.style.overflow = 'hidden';
    }
  }

  closeAssignmentModal() {
    if (this.assignmentModal) {
      this.assignmentModal.style.display = 'none';
      document.body.style.overflow = 'auto';
      this.assignmentForm?.reset();
      this.hideAssignmentMessages();
    }
  }

  /**
   * Message helpers
   */
  hideAssignmentMessages() {
    const errorDiv = document.getElementById('assignmentError');
    const successDiv = document.getElementById('assignmentSuccess');
    if (errorDiv) errorDiv.style.display = 'none';
    if (successDiv) successDiv.style.display = 'none';
  }

  showAssignmentError(message) {
    const errorDiv = document.getElementById('assignmentError');
    if (errorDiv) {
      errorDiv.textContent = message;
      errorDiv.style.display = 'block';
    }
  }

  showAssignmentSuccess(message) {
    const successDiv = document.getElementById('assignmentSuccess');
    if (successDiv) {
      successDiv.textContent = message;
      successDiv.style.display = 'block';
    }
  }

  /**
   * Escape HTML to prevent XSS
   */
  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}