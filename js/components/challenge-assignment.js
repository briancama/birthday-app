/**
 * Challenge Assignment Component
 * For managing approved challenges and their assignments
 */
export class ChallengeAssignmentRow {
  constructor(challenge, callbacks = {}) {
    this.challenge = challenge;
    this.callbacks = callbacks; // { onAssign, onViewDetails }
  }

  /**
   * Get assigned users display
   */
  getAssignedUsers() {
    if (this.challenge.actual_assignments && this.challenge.actual_assignments.length > 0) {
      const names = this.challenge.actual_assignments
        .map(a => this.escapeHtml(a.display_name || a.username))
        .join(', ');
      return names;
    }
    return '<em>None</em>';
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
   * Render the challenge row
   */
  render() {
    const row = document.createElement('tr');
    row.dataset.challengeId = this.challenge.id;

    row.innerHTML = `
      <td>${this.escapeHtml(this.challenge.title)}</td>
      <td class="assigned-users">${this.getAssignedUsers()}</td>
      <td class="action-buttons">
        <button class="btn-assign" data-id="${this.challenge.id}">➕ Assign</button>
        <button class="btn-view" data-id="${this.challenge.id}">👁️ View</button>
      </td>
    `;

    // Attach event listeners
    const assignBtn = row.querySelector('.btn-assign');
    const viewBtn = row.querySelector('.btn-view');

    if (assignBtn && this.callbacks.onAssign) {
      assignBtn.addEventListener('click', () => {
        this.callbacks.onAssign(this.challenge);
      });
    }

    if (viewBtn && this.callbacks.onViewDetails) {
      viewBtn.addEventListener('click', () => {
        this.callbacks.onViewDetails(this.challenge);
      });
    }

    return row;
  }
}

/**
 * Challenge Assignment Table Component
 * Manages a table of approved challenges
 */
export class ChallengeAssignmentTable {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.challenges = [];
  }

  /**
   * Get table headers
   */
  getHeaders() {
    return ['Challenge Name', 'Assigned To', 'Actions'];
  }

  /**
   * Render the table with challenges
   */
  render(challenges, callbacks = {}) {
    this.challenges = challenges;

    if (!challenges || challenges.length === 0) {
      this.container.innerHTML = '<div class="empty-state">No approved challenges yet.</div>';
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
    challenges.forEach(challenge => {
      const row = new ChallengeAssignmentRow(challenge, callbacks);
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
    this.container.innerHTML = '<div class="empty-state">Loading challenges...</div>';
  }

  /**
   * Show error state
   */
  showError(message) {
    this.container.innerHTML = `<div class="empty-state error">${message}</div>`;
  }
}