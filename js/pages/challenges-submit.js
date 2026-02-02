import { BasePage } from './base-page.js';
import { SubmissionTable } from '../components/submission.js';

export class ChallengesSubmitPage extends BasePage {
  constructor() {
    super();
    this.submissionTable = new SubmissionTable('submissionsContainer', 'user');
    this.modal = null;
    this.form = null;
  }

  async init() {
    await super.init();
    this.setPageTitle('Challenge Workshop');
    this.initializeModal();
    this.initializeForm();
    await this.loadSubmissions();
  }

  /**
   * Initialize modal elements and event listeners
   */
  initializeModal() {
    this.modal = document.getElementById('challengeModal');
    const addBtn = document.getElementById('addChallengeBtn');
    const closeBtn = document.getElementById('closeChallengeModal');
    const overlay = document.querySelector('.challenge-modal-overlay');

    if (!this.modal || !addBtn || !closeBtn || !overlay) {
      console.error('Modal elements not found');
      return;
    }

    addBtn.addEventListener('click', () => this.openModal());
    closeBtn.addEventListener('click', () => this.closeModal());
    overlay.addEventListener('click', () => this.closeModal());
  }

  /**
   * Initialize form and submission handler
   */
  initializeForm() {
    this.form = document.getElementById('challengeForm');
    if (!this.form) {
      console.error('Challenge form not found');
      return;
    }

    this.form.addEventListener('submit', (e) => this.handleSubmit(e));
  }

  /**
   * Open the challenge submission modal
   */
  openModal() {
    this.modal.style.display = 'block';
    document.body.style.overflow = 'hidden';
    this.loadUsers();
  }

  /**
   * Close the modal and reset form
   */
  closeModal() {
    this.modal.style.display = 'none';
    document.body.style.overflow = 'auto';
    this.form.reset();
    this.hideMessages();
  }

  /**
   * Hide error and success messages
   */
  hideMessages() {
    const errorDiv = document.getElementById('formError');
    const successDiv = document.getElementById('formSuccess');
    if (errorDiv) errorDiv.style.display = 'none';
    if (successDiv) successDiv.style.display = 'none';
  }

  /**
   * Show error message
   */
  showError(message) {
    const errorDiv = document.getElementById('formError');
    if (errorDiv) {
      errorDiv.textContent = message;
      errorDiv.style.display = 'block';
    }
  }

  /**
   * Show success message
   */
  showSuccess(message) {
    const successDiv = document.getElementById('formSuccess');
    if (successDiv) {
      successDiv.textContent = message;
      successDiv.style.display = 'block';
    }
  }

  /**
   * Load users for datalist dropdown
   */
  async loadUsers() {
    try {
      const { data, error } = await this.supabase
        .from('users')
        .select('id, username')
        .order('username');

      if (error) throw error;

      const datalist = document.getElementById('usersDatalist');
      if (datalist) {
        datalist.innerHTML = data.map(user => 
          `<option value="${user.username}" data-user-id="${user.id}">`
        ).join('');
      }
    } catch (err) {
      console.error('Error loading users:', err);
    }
  }

  /**
   * Load user's submitted challenges
   */
  async loadSubmissions() {
    this.submissionTable.showLoading();

    try {
      const { data, error } = await this.supabase
        .from('challenges')
        .select('*')
        .eq('created_by', this.userId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Fetch assigned usernames for challenges that have assigned_to
      if (data && data.length > 0) {
        const assignedUserIds = [...new Set(data.filter(c => c.assigned_to).map(c => c.assigned_to))];
        
        if (assignedUserIds.length > 0) {
          const { data: users, error: userError } = await this.supabase
            .from('users')
            .select('id, username')
            .in('id', assignedUserIds);

          if (!userError && users) {
            const usernameMap = Object.fromEntries(users.map(u => [u.id, u.username]));
            
            // Attach username to each challenge
            data.forEach(challenge => {
              if (challenge.assigned_to) {
                challenge.assigned_to_username = usernameMap[challenge.assigned_to];
              }
            });
          }
        }
      }

      this.submissionTable.render(data);
    } catch (err) {
      console.error('Error loading submissions:', err);
      this.submissionTable.showError('Error loading submissions. Please refresh the page.');
    }
  }

  /**
   * Handle form submission
   */
  async handleSubmit(e) {
    e.preventDefault();

    const submitBtn = document.getElementById('submitChallengeBtn');
    this.hideMessages();

    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting...';

    try {
      const challengeName = document.getElementById('challengeName').value.trim();
      const challengeDescription = document.getElementById('challengeDescription').value.trim();
      const challengeMetric = document.getElementById('challengeMetric').value.trim();
      const assignedToUsername = document.getElementById('assignedTo').value.trim();

      // Validate
      if (!challengeName || !challengeDescription || !challengeMetric) {
        throw new Error('Please fill in all required fields.');
      }

      // Find user ID if assigned
      let assignedToUserId = null;
      if (assignedToUsername) {
        const { data: users, error: userError } = await this.supabase
          .from('users')
          .select('id, username')
          .eq('username', assignedToUsername)
          .limit(1);

        if (userError) throw userError;

        if (users && users.length > 0) {
          assignedToUserId = users[0].id;
        } else {
          throw new Error(`User "${assignedToUsername}" not found. Please select a valid user from the list.`);
        }
      }

      // Generate unique ID for challenge
      const challengeId = `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Insert challenge
      const { error } = await this.supabase
        .from('challenges')
        .insert([{
          id: challengeId,
          title: challengeName,
          description: challengeDescription,
          success_metric: challengeMetric,
          type: 'assigned',
          created_by: this.userId,
          assigned_to: assignedToUserId,
          approval_status: 'pending'
        }]);

      if (error) throw error;

      this.showSuccess('Challenge submitted successfully! Awaiting admin approval.');

      // Reload submissions
      await this.loadSubmissions();

      // Close modal after 2 seconds
      setTimeout(() => {
        this.closeModal();
      }, 2000);

    } catch (err) {
      console.error('Error submitting challenge:', err);
      this.showError(err.message || 'Failed to submit challenge. Please try again.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = '🚀 SUBMIT CHALLENGE 🚀';
    }
  }
}