/**
 * Submission Component
 * Renders a challenge submission as a table row
 * Reusable for both user submission page and admin approval page
 */
export class SubmissionRow {
  constructor(challenge, mode = 'user', callbacks = {}) {
    this.challenge = challenge;
    this.mode = mode; // 'user' or 'admin'
    this.callbacks = callbacks; // { onApprove, onDeny, onViewDetails }
  }

  /**
   * Get status badge HTML with appropriate color
   */
  getStatusBadge() {
    const status = this.challenge.approval_status;
    return `<span class="status-badge status-${status}">${status}</span>`;
  }

  /**
   * Get assigned user display
   */
  getAssignedTo() {
    if (this.challenge.suggested_for_username) {
      return this.escapeHtml(this.challenge.suggested_for_username);
    }
    return 'Anyone';
  }

  /**
   * Format date for display
   */
  formatDate(dateString) {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString();
  }

  /**
   * Get action buttons for admin mode
   */
  getActionButtons() {
    if (this.mode !== 'admin') return '';

    const isPending = this.challenge.approval_status === 'pending';
    if (!isPending) return '<td>—</td>';

    return `
      <td class="action-buttons">
        <button class="btn-approve" data-id="${this.challenge.id}" aria-label="Approve challenge">✅</button>
        <button class="btn-deny" data-id="${this.challenge.id}" aria-label="Deny challenge">✖️</button>
        <button class="btn-view" data-id="${this.challenge.id}" aria-label="View challenge details">👁️</button>
      </td>
    `;
  }

  /**
   * Escape HTML to prevent XSS
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Render the submission row
   */
  render() {
    const row = document.createElement('tr');
    row.dataset.challengeId = this.challenge.id;

    row.innerHTML = `
      <td>${this.escapeHtml(this.challenge.title)}</td>
      <td>${this.getAssignedTo()}</td>
      ${this.mode === 'user' ? `<td>${this.getStatusBadge()}</td>` : ''}
      ${this.getActionButtons()}
    `;

    // Attach event listeners for admin buttons
    if (this.mode === 'admin') {
      const approveBtn = row.querySelector('.btn-approve');
      const denyBtn = row.querySelector('.btn-deny');
      const viewBtn = row.querySelector('.btn-view');

      if (approveBtn && this.callbacks.onApprove) {
        approveBtn.addEventListener('click', () => {
          this.callbacks.onApprove(this.challenge);
        });
      }

      if (denyBtn && this.callbacks.onDeny) {
        denyBtn.addEventListener('click', () => {
          this.callbacks.onDeny(this.challenge);
        });
      }

      if (viewBtn && this.callbacks.onViewDetails) {
        viewBtn.addEventListener('click', () => {
          this.callbacks.onViewDetails(this.challenge);
        });
      }
    }

    return row;
  }
}

/**
 * Submission Table Component
 * Manages a table of submission rows
 */
export class SubmissionTable {
  constructor(containerId, mode = 'user') {
    this.container = document.getElementById(containerId);
    this.mode = mode;
    this.submissions = [];
  }

  /**
   * Get table headers based on mode
   */
  getHeaders() {
    const baseHeaders = ['Challenge Name', 'Intended For'];
    if (this.mode === 'user') {
      baseHeaders.push('Status');
    } else if (this.mode === 'admin') {
      baseHeaders.push('Actions');
    }
    return baseHeaders;
  }

  /**
   * Render the table with submissions
   */
  render(submissions, callbacks = {}) {
    this.submissions = submissions;

    if (!submissions || submissions.length === 0) {
      this.container.innerHTML = '<div class="empty-state">No submissions found.</div>';
      return;
    }

    const headers = this.getHeaders();
    const table = document.createElement('table');
    table.className = 'submissions-table';

    // Create table header
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    headers.forEach(header => {
      const th = document.createElement('th');
      th.textContent = header;
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Create table body
    const tbody = document.createElement('tbody');
    submissions.forEach(submission => {
      const row = new SubmissionRow(submission, this.mode, callbacks);
      tbody.appendChild(row.render());
    });
    table.appendChild(tbody);

    // Clear container and append table
    this.container.innerHTML = '';
    this.container.appendChild(table);
  }

  /**
   * Show loading state
   */
  showLoading() {
    this.container.innerHTML = '<div class="empty-state">Loading submissions...</div>';
  }

  /**
   * Show error state
   */
  showError(message) {
    this.container.innerHTML = `<div class="empty-state error">${message}</div>`;
  }
}