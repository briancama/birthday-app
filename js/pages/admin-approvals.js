import { BasePage } from "./base-page.js";
import { SubmissionTable } from "../components/submission.js";
import { ChallengeAssignmentTable } from "../components/challenge-assignment.js";
import { firebaseAuth } from "../services/firebase-auth.js";
import { AssignmentService, ConflictError } from "../services/assignment-service.js";
import { escapeHtml } from "../utils/dom.js";

export class AdminApprovalsPage extends BasePage {
  constructor() {
    super();
    this.pendingTable = new SubmissionTable("pendingContainer", "admin");
    this.approvedTable = new ChallengeAssignmentTable("approvedContainer");
    this.deniedTable = new SubmissionTable("deniedContainer", "admin");
    this.detailsModal = null;
    this.assignmentModal = null;
    this.assignmentForm = null;
    this.currentChallenge = null;
    this.assignmentService = null; // Will be initialized after auth
    this.assignmentVersion = null; // For optimistic locking
    this.allUsers = []; // Cached user list for edit form datalists
  }

  async init() {
    await super.init();
    this.setPageTitle("Admin Approvals");

    // Initialize assignment service after auth
    this.assignmentService = new AssignmentService(this.supabase, this.userId);

    this.initializeModals();
    this.initializeAssignmentForm();
    await Promise.all([this.loadAllChallenges(), this.loadAssignmentStats()]);
  }

  /**
   * Initialize modal elements and event listeners
   */
  initializeModals() {
    // Details Modal
    this.detailsModal = document.getElementById("detailsModal");
    const closeDetailsBtn = document.getElementById("closeDetailsModal");
    const detailsOverlay = this.detailsModal?.querySelector(".challenge-modal-overlay");

    if (closeDetailsBtn) {
      closeDetailsBtn.addEventListener("click", () => {
        this.hideEditForm();
        this.closeDetailsModal();
      });
    }
    if (detailsOverlay) {
      detailsOverlay.addEventListener("click", () => {
        this.hideEditForm();
        this.closeDetailsModal();
      });
    }

    document
      .getElementById("editChallengeBtn")
      ?.addEventListener("click", () => this.showEditForm());
    document
      .getElementById("duplicateChallengeBtn")
      ?.addEventListener("click", () => this.handleDuplicate());
    document.getElementById("cancelEditBtn")?.addEventListener("click", () => this.hideEditForm());
    document.getElementById("saveEditBtn")?.addEventListener("click", () => this.handleEditSave());

    // Assignment Modal
    this.assignmentModal = document.getElementById("assignmentModal");
    const closeAssignmentBtn = document.getElementById("closeAssignmentModal");
    const assignmentOverlay = this.assignmentModal?.querySelector(".challenge-modal-overlay");

    if (closeAssignmentBtn) {
      closeAssignmentBtn.addEventListener("click", () => this.closeAssignmentModal());
    }
    if (assignmentOverlay) {
      assignmentOverlay.addEventListener("click", () => this.closeAssignmentModal());
    }
  }

  /**
   * Initialize assignment form handler
   */
  initializeAssignmentForm() {
    this.assignmentForm = document.getElementById("assignmentForm");
    this.isApprovalMode = false; // Track whether we're approving or just managing assignments

    if (this.assignmentForm) {
      this.assignmentForm.addEventListener("submit", (e) => this.handleAssignmentFormSubmit(e));
    }
  }

  /**
   * Load all challenges across all statuses
   */
  async loadAllChallenges() {
    try {
      // Load challenges and assignments with user data
      const [challengesResult, assignmentsResult] = await Promise.all([
        this.supabase.from("challenges").select("*").order("created_at", { ascending: false }),
        this.supabase
          .from("assignments")
          .select(
            `
            challenge_id,
            user_id,
            users!assignments_user_id_fkey (
              username,
              display_name
            )
          `
          )
          .eq("active", true),
      ]);

      if (challengesResult.error) throw challengesResult.error;
      if (assignmentsResult.error) throw assignmentsResult.error;

      const data = challengesResult.data;

      // Build map of challenge_id -> array of assigned users
      const assignmentsByChallenge = {};
      assignmentsResult.data.forEach((assignment) => {
        if (!assignmentsByChallenge[assignment.challenge_id]) {
          assignmentsByChallenge[assignment.challenge_id] = [];
        }
        assignmentsByChallenge[assignment.challenge_id].push({
          username: assignment.users.username,
          display_name: assignment.users.display_name || assignment.users.username,
        });
      });

      // Fetch usernames for created_by, suggested_for, and vs_user fields
      if (data && data.length > 0) {
        // Filter out nulls — .in() with null values causes a Supabase error
        const userIds = [
          ...new Set([
            ...data.map((c) => c.created_by),
            ...data.filter((c) => c.suggested_for).map((c) => c.suggested_for),
            ...data.filter((c) => c.vs_user).map((c) => c.vs_user),
          ]),
        ].filter(Boolean);

        // Always attach assignments regardless of whether user lookup succeeds
        data.forEach((challenge) => {
          challenge.actual_assignments = assignmentsByChallenge[challenge.id] || [];
        });

        if (userIds.length > 0) {
          const { data: users, error: userError } = await this.supabase
            .from("users")
            .select("id, username, display_name")
            .in("id", userIds);

          if (!userError && users) {
            const usernameMap = Object.fromEntries(users.map((u) => [u.id, u.username]));
            const displayNameMap = Object.fromEntries(
              users.map((u) => [u.id, u.display_name || u.username])
            );

            data.forEach((challenge) => {
              challenge.created_by_username = usernameMap[challenge.created_by];
              challenge.created_by_display = displayNameMap[challenge.created_by];
              if (challenge.suggested_for) {
                challenge.suggested_for_username = usernameMap[challenge.suggested_for];
                challenge.suggested_for_display = displayNameMap[challenge.suggested_for];
              }
              if (challenge.vs_user) {
                challenge.vs_user_username = usernameMap[challenge.vs_user];
                challenge.vs_user_display = displayNameMap[challenge.vs_user];
              }
            });
          }
        }
      }

      // Split by status
      const pending = data.filter((c) => c.approval_status === "pending");
      const approved = data.filter((c) => c.approval_status === "approved");
      const denied = data.filter((c) => c.approval_status === "denied");

      // Render each section
      this.renderPending(pending);
      this.renderApproved(approved);
      this.renderDenied(denied);
    } catch (err) {
      console.error("Error loading challenges:", err);
      this.pendingTable.showError("Error loading challenges. Please refresh the page.");
    }
  }

  /**
   * Load and render a per-user assignment stats table.
   * Counts:
   *   - total active assignments per user
   *   - assignments where the user is the vs opponent (challenge.vs_user === user_id)
   */
  async loadAssignmentStats() {
    const container = document.getElementById("assignmentStatsContainer");
    if (!container) return;

    try {
      // Two parallel queries:
      // 1. All assignments (for the Total column) with user info
      // 2. All challenges where vs_user IS NOT NULL (for the VS column)
      //    VS count comes directly from challenges, not from assignments, because
      //    opponent assignment rows don't exist until the challenge is completed.
      const [assignmentsResult, challengesResult] = await Promise.all([
        this.supabase
          .from("assignments")
          .select(
            `
            user_id,
            users!assignments_user_id_fkey ( username, display_name )
          `
          )
          .eq("active", true),
        this.supabase
          .from("challenges")
          .select("vs_user, users!challenges_vs_user_fkey ( username, display_name )")
          .not("vs_user", "is", null),
      ]);

      if (assignmentsResult.error) throw assignmentsResult.error;
      if (challengesResult.error) throw challengesResult.error;

      // Aggregate assignment totals per user
      const statsMap = {};

      (assignmentsResult.data || []).forEach((row) => {
        const uid = row.user_id;
        if (!statsMap[uid]) {
          statsMap[uid] = {
            username: row.users?.username || uid,
            display_name: row.users?.display_name || row.users?.username || uid,
            total: 0,
            as_vs: 0,
          };
        }
        statsMap[uid].total += 1;
      });

      // Count how many challenges list each user as vs_user.
      // Also ensures vs-only users appear in the table even if they have no assignments yet.
      (challengesResult.data || []).forEach((c) => {
        const uid = c.vs_user;
        if (!statsMap[uid]) {
          statsMap[uid] = {
            username: c.users?.username || uid,
            display_name: c.users?.display_name || c.users?.username || uid,
            total: 0,
            as_vs: 0,
          };
        }
        statsMap[uid].as_vs += 1;
      });

      const rows = Object.values(statsMap).sort((a, b) => b.total - a.total);

      if (rows.length === 0) {
        container.innerHTML = '<div class="empty-state">No active assignments found.</div>';
        return;
      }

      const half = Math.ceil(rows.length / 2);
      const leftRows = rows.slice(0, half);
      const rightRows = rows.slice(half);

      const renderRows = (list) =>
        list
          .map(
            (r) => `
          <div class="asg-row">
            <span class="asg-name">${escapeHtml(r.display_name)}<span class="asg-handle"> @${escapeHtml(r.username)}</span></span>
            <span class="asg-vs">${r.as_vs > 0 ? r.as_vs : "—"}</span>
            <span class="asg-total">${r.total}</span>
          </div>`
          )
          .join("");

      const statsHtml = `
        <div class="asg-grids">
          <div class="asg-grid">
            <div class="asg-header">
              <span>User</span>
              <span class="asg-vs" title="As VS opponent">VS</span>
              <span class="asg-total" title="Total assignments">Total</span>
            </div>
            ${renderRows(leftRows)}
          </div>
          ${rightRows.length ? `
          <div class="asg-grid">
            <div class="asg-header">
              <span>User</span>
              <span class="asg-vs" title="As VS opponent">VS</span>
              <span class="asg-total" title="Total assignments">Total</span>
            </div>
            ${renderRows(rightRows)}
          </div>` : ""}
        </div>`;

      container.innerHTML = statsHtml;
    } catch (err) {
      console.error("Error loading assignment stats:", err);
      container.innerHTML = '<div class="empty-state">Error loading assignment stats.</div>';
    }
  }

  /**
   * Render pending challenges table
   */
  renderPending(challenges) {
    this.pendingTable.render(challenges, {
      onApprove: (challenge) => this.handleApprove(challenge),
      onDeny: (challenge) => this.handleDeny(challenge),
      onViewDetails: (challenge) => this.showDetails(challenge),
    });
  }

  /**
   * Render approved challenges table
   */
  renderApproved(challenges) {
    this.approvedTable.render(challenges, {
      onAssign: (challenge) => this.handleManageAssignments(challenge),
      onViewDetails: (challenge) => this.showDetails(challenge),
      onDuplicate: (challenge) => {
        this.currentChallenge = challenge;
        this.handleDuplicate();
      },
    });
  }

  /**
   * Render denied challenges table
   */
  renderDenied(challenges) {
    this.deniedTable.render(challenges, {
      onViewDetails: (challenge) => this.showDetails(challenge),
    });
  }

  /**
   * Show challenge details in modal
   */
  showDetails(challenge) {
    this.currentChallenge = challenge;
    this.hideEditForm();

    const detailsDiv = document.getElementById("challengeDetails");

    // Build intended for display - show original suggestion
    let intendedForDisplay = "Anyone";
    if (challenge.suggested_for_display || challenge.suggested_for_username) {
      intendedForDisplay = escapeHtml(
        challenge.suggested_for_display || challenge.suggested_for_username
      );
    }

    // Build current assignments display
    let currentAssignmentsDisplay = "None";
    if (challenge.actual_assignments && challenge.actual_assignments.length > 0) {
      currentAssignmentsDisplay = challenge.actual_assignments
        .map((a) => escapeHtml(a.display_name || a.username))
        .join(", ");
    }

    if (detailsDiv) {
      detailsDiv.innerHTML = `
        <div class="detail-row">
          <strong>Title:</strong>
          <span>${escapeHtml(challenge.title)}</span>
        </div>
        <div class="detail-row">
          <strong>Description:</strong>
          <span style="white-space:pre-wrap">${escapeHtml(challenge.description)}</span>
        </div>
        <div class="detail-row">
          <strong>Success Metric:</strong>
          <span>${escapeHtml(challenge.success_metric || "Not specified")}</span>
        </div>
        <div class="detail-row">
          <strong>Submitted By:</strong>
          <span>${escapeHtml(challenge.created_by_display || "Unknown")}</span>
        </div>
        <div class="detail-row">
          <strong>Originally Intended For:</strong>
          <span>${intendedForDisplay}</span>
        </div>
        ${
          challenge.brian_mode
            ? `
        <div class="detail-row">
          <strong>Brian Mode:</strong>
          <span>${escapeHtml(challenge.brian_mode)}</span>
        </div>`
            : ""
        }
        ${
          challenge.vs_user_display
            ? `
        <div class="detail-row">
          <strong>VS User:</strong>
          <span>${escapeHtml(challenge.vs_user_display)}</span>
        </div>`
            : ""
        }
        ${
          challenge.approval_status === "approved"
            ? `
        <div class="detail-row">
          <strong>Currently Assigned To:</strong>
          <span>${currentAssignmentsDisplay}</span>
        </div>
        `
            : ""
        }
      `;
    }

    this.openDetailsModal();
  }

  /**
   * Show the inline edit form populated with current challenge data
   */
  async showEditForm() {
    const challenge = this.currentChallenge;
    if (!challenge) return;

    // Populate fields
    document.getElementById("editTitle").value = challenge.title || "";
    document.getElementById("editDescription").value = challenge.description || "";
    document.getElementById("editSuccessMetric").value = challenge.success_metric || "";
    document.getElementById("editBrianMode").value = challenge.brian_mode || "";
    document.getElementById("editHomeOnly").checked = !!challenge.home_only;

    // Populate user datalists and set suggested_for / vs_user display values
    await this.loadUsersForEdit();

    document.getElementById("editSuggestedFor").value =
      challenge.suggested_for_display || challenge.suggested_for_username || "";
    document.getElementById("editVsUser").value =
      challenge.vs_user_display || challenge.vs_user_username || "";

    // Mutually exclusive: selecting brian_mode clears vs_user and vice-versa
    document.getElementById("editBrianMode").addEventListener(
      "change",
      (e) => {
        if (e.target.value) document.getElementById("editVsUser").value = "";
      },
      { once: true }
    );

    document.getElementById("editVsUser").addEventListener("input", () => {
      if (document.getElementById("editVsUser").value) {
        document.getElementById("editBrianMode").value = "";
      }
    });

    // Hide view, show edit
    document.getElementById("challengeDetails").style.display = "none";
    document.getElementById("detailsModalActions").style.display = "none";
    document.getElementById("challengeEditForm").style.display = "block";
    document.getElementById("editError").style.display = "none";
    document.getElementById("editSuccess").style.display = "none";
  }

  hideEditForm() {
    document.getElementById("challengeDetails").style.display = "";
    document.getElementById("detailsModalActions").style.display = "";
    document.getElementById("challengeEditForm").style.display = "none";
    document.getElementById("editError").style.display = "none";
    document.getElementById("editSuccess").style.display = "none";
  }

  /**
   * Load all users into the edit form datalists
   */
  async loadUsersForEdit() {
    if (this.allUsers.length === 0) {
      const { data, error } = await this.supabase
        .from("users")
        .select("id, username, display_name")
        .order("display_name");
      if (!error && data) this.allUsers = data;
    }

    const options = this.allUsers
      .map(
        (u) =>
          `<option value="${escapeHtml(u.display_name || u.username)}" data-user-id="${u.id}"></option>`
      )
      .join("");

    const dl1 = document.getElementById("editUsersDatalist");
    const dl2 = document.getElementById("editVsUsersDatalist");
    if (dl1) dl1.innerHTML = options;
    if (dl2) dl2.innerHTML = options;
  }

  /**
   * Resolve a datalist input value to a user ID
   */
  resolveUserIdFromInput(inputId) {
    const input = document.getElementById(inputId);
    const val = (input?.value || "").trim();
    if (!val) return null;
    // Match against allUsers by display_name or username (case-insensitive)
    const match = this.allUsers.find(
      (u) =>
        (u.display_name || u.username).toLowerCase() === val.toLowerCase() ||
        u.username.toLowerCase() === val.toLowerCase()
    );
    return match ? match.id : null;
  }

  /**
   * Save edited challenge fields
   */
  async handleEditSave() {
    const saveBtn = document.getElementById("saveEditBtn");
    const errorDiv = document.getElementById("editError");
    const successDiv = document.getElementById("editSuccess");
    errorDiv.style.display = "none";
    successDiv.style.display = "none";

    const title = document.getElementById("editTitle").value.trim();
    const description = document.getElementById("editDescription").value.trim();
    if (!title || !description) {
      errorDiv.textContent = "Title and Description are required.";
      errorDiv.style.display = "block";
      return;
    }

    const suggestedForId = this.resolveUserIdFromInput("editSuggestedFor");
    const vsUserId = this.resolveUserIdFromInput("editVsUser");
    const brianMode = document.getElementById("editBrianMode").value || null;

    // vs_user and brian_mode mutually exclusive
    const finalBrianMode = vsUserId ? null : brianMode;
    const finalVsUser = vsUserId || null;

    saveBtn.disabled = true;
    saveBtn.textContent = "Saving...";

    try {
      const { error } = await this.supabase
        .from("challenges")
        .update({
          title,
          description,
          success_metric: document.getElementById("editSuccessMetric").value.trim() || null,
          suggested_for: suggestedForId,
          brian_mode: finalBrianMode,
          vs_user: finalVsUser,
          home_only: document.getElementById("editHomeOnly").checked,
        })
        .eq("id", this.currentChallenge.id);

      if (error) throw error;

      successDiv.textContent = "Challenge saved!";
      successDiv.style.display = "block";

      setTimeout(async () => {
        this.hideEditForm();
        this.closeDetailsModal();
        await this.loadAllChallenges();
      }, 1200);
    } catch (err) {
      errorDiv.textContent = "Save failed: " + err.message;
      errorDiv.style.display = "block";
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = "💾 Save Changes";
    }
  }

  /**
   * Duplicate the current challenge as a new pending submission, then open edit form on the copy
   */
  async handleDuplicate() {
    const challenge = this.currentChallenge;
    if (!challenge) return;

    const dupBtn = document.getElementById("duplicateChallengeBtn");
    if (dupBtn) {
      dupBtn.disabled = true;
      dupBtn.textContent = "Duplicating...";
    }

    try {
      const newId = `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const { error } = await this.supabase.from("challenges").insert([
        {
          id: newId,
          title: challenge.title + " (copy)",
          description: challenge.description,
          success_metric: challenge.success_metric || null,
          brian_mode: challenge.brian_mode || null,
          type: challenge.type || "assigned",
          created_by: this.userId,
          suggested_for: null,
          vs_user: null,
          approval_status: "pending",
        },
      ]);

      if (error) throw error;

      // Reload list and open edit form on the new copy
      await this.loadAllChallenges();
      this.closeDetailsModal();
      alert(
        `Challenge duplicated as "${challenge.title} (copy)" — it is now in Pending. Find it there to edit and approve.`
      );
    } catch (err) {
      alert("Duplicate failed: " + err.message);
    } finally {
      if (dupBtn) {
        dupBtn.disabled = false;
        dupBtn.textContent = "📋 Duplicate";
      }
    }
  }

  /**
   * Handle challenge approval for pending challenges
   */
  async handleApprove(challenge) {
    this.currentChallenge = challenge;
    this.isApprovalMode = true;

    try {
      // For pending challenges, usually no assignments yet
      const assignments = await this.assignmentService.getCurrentAssignments(challenge.id);
      this.assignmentVersion = assignments.version;
      this.currentAssignmentIds = assignments.userIds.map((id) => String(id));

      this.populateAssignmentModal("Approve Challenge & Assign Users");
      this.setupAssignmentForm("✅ APPROVE & ASSIGN");
      await this.loadUsersForAssignment();
      this.openAssignmentModal();
    } catch (error) {
      console.error("Error loading assignments:", error);
      this.showAssignmentError("Failed to load current assignments. Please try again.");
    }
  }

  /**
   * Handle assignment management for approved challenges
   */
  async handleManageAssignments(challenge) {
    this.currentChallenge = challenge;
    this.isApprovalMode = false;

    try {
      // Get current assignments with version for optimistic locking
      const assignments = await this.assignmentService.getCurrentAssignments(challenge.id);
      this.assignmentVersion = assignments.version;
      this.currentAssignmentIds = assignments.userIds.map((id) => String(id));

      this.populateAssignmentModal("Manage Challenge Assignments");
      this.setupAssignmentForm("✅ SAVE ASSIGNMENTS");
      await this.loadUsersForAssignment();
      this.openAssignmentModal();
    } catch (error) {
      console.error("Error loading assignments:", error);
      this.showAssignmentError("Failed to load current assignments. Please try again.");
    }
  }

  /**
   * Handle deny button click
   */
  async handleDeny(challenge) {
    const confirmed = confirm(`Are you sure you want to deny "${challenge.title}"?`);
    if (!confirmed) return;

    try {
      const { error } = await this.supabase
        .from("challenges")
        .update({
          approval_status: "denied",
          approved_by: this.userId,
          approved_at: new Date().toISOString(),
        })
        .eq("id", challenge.id);

      if (error) throw error;

      alert("Challenge denied successfully.");
      await this.loadAllChallenges();
    } catch (err) {
      console.error("Error denying challenge:", err);
      alert("Failed to deny challenge: " + err.message);
    }
  }

  // Removed getCurrentAssignedUserIds - now handled by AssignmentService

  /**
   * Populate assignment modal with challenge information
   */
  populateAssignmentModal(title) {
    const modalTitle = document.querySelector("#assignmentModal h2");
    if (modalTitle) {
      modalTitle.textContent = title;
    }

    const infoDiv = document.getElementById("assignmentChallengeInfo");
    if (infoDiv) {
      // Show actual assignments for approved challenges
      const actualAssignments =
        this.currentChallenge.actual_assignments &&
        this.currentChallenge.actual_assignments.length > 0
          ? this.currentChallenge.actual_assignments
              .map((a) => a.display_name || a.username)
              .join(", ")
          : null;

      // Show original suggestion from challenge submission
      const originalSuggestion = this.currentChallenge.suggested_for_username || null;

      // Determine what to show based on mode and available data
      let intendedForDisplay = "None";
      if (this.isApprovalMode && originalSuggestion) {
        // For pending approval, show the original suggestion
        intendedForDisplay = `${escapeHtml(originalSuggestion)} (suggested)`;
      } else if (!this.isApprovalMode && actualAssignments) {
        // For management, show actual assignments
        intendedForDisplay = escapeHtml(actualAssignments);
      } else if (originalSuggestion) {
        // Fallback to suggestion if no actual assignments
        intendedForDisplay = `${escapeHtml(originalSuggestion)} (suggested)`;
      }

      infoDiv.innerHTML = `
        <div class="detail-row">
          <strong>Challenge:</strong>
          <span>${escapeHtml(this.currentChallenge.title)}</span>
        </div>
        <div class="detail-row">
          <strong>${this.isApprovalMode ? "Originally Suggested For" : "Currently Assigned To"}:</strong>
          <span>${intendedForDisplay}</span>
        </div>
        ${
          this.isApprovalMode
            ? `
        <div class="detail-row">
          <strong>Status:</strong>
          <span class="status-pending">Pending Approval</span>
        </div>
        `
            : ""
        }
      `;
    }
  }

  /**
   * Setup assignment form button and state
   */
  setupAssignmentForm(buttonText) {
    const submitBtn = document.getElementById("approveAssignBtn");
    if (submitBtn) {
      submitBtn.textContent = buttonText;
    }

    // Clear any previous assignment input
    const assignInput = document.getElementById("assignToUser");
    if (assignInput) {
      assignInput.value = "";
    }
  }

  /**
   * Load users and populate checkbox list for assignment
   */
  async loadUsersForAssignment() {
    try {
      const { data, error } = await this.supabase
        .from("users")
        .select("id, username, display_name")
        .order("display_name");

      if (error) throw error;

      const container = document.getElementById("userCheckboxList");
      if (container) {
        container.innerHTML = data
          .map((user) => {
            const displayName = escapeHtml(user.display_name || user.username);
            const isCurrentlyAssigned = this.currentAssignmentIds.includes(String(user.id));

            return `
            <div class="checkbox-item">
              <input
                type="checkbox"
                id="user_${user.id}"
                name="assignedUsers"
                value="${user.id}"
                data-username="${escapeHtml(user.username)}"
                ${isCurrentlyAssigned ? "checked" : ""}
              >
              <label for="user_${user.id}">
                ${displayName}
                ${isCurrentlyAssigned ? '<span class="currently-assigned">(currently assigned)</span>' : ""}
              </label>
            </div>
          `;
          })
          .join("");
      }
    } catch (err) {
      console.error("Error loading users:", err);
      this.showAssignmentError("Failed to load users. Please try again.");
    }
  }

  /**
   * Handle form submission for both approval and assignment management
   */
  async handleAssignmentFormSubmit(e) {
    e.preventDefault();

    const submitBtn = document.getElementById("approveAssignBtn");
    this.hideAssignmentMessages();

    // Get currently selected user IDs from checkboxes
    const allCheckboxes = document.querySelectorAll('input[name="assignedUsers"]');
    const selectedUserIds = Array.from(allCheckboxes)
      .filter((checkbox) => checkbox.checked)
      .map((checkbox) => String(checkbox.value));

    // Check if there are any changes
    const currentSet = new Set(this.currentAssignmentIds);
    const selectedSet = new Set(selectedUserIds);
    const hasChanges =
      currentSet.size !== selectedSet.size || [...currentSet].some((x) => !selectedSet.has(x));

    if (!hasChanges) {
      this.showAssignmentError(
        "No changes detected. Please check or uncheck users to modify assignments."
      );
      return;
    }

    // Validate assignments
    const isApproval = this.isApprovalMode && this.currentChallenge.approval_status === "pending";
    if (!isApproval && selectedUserIds.length === 0) {
      this.showAssignmentError("Approved challenges must have at least one user assigned.");
      return;
    } else if (isApproval && selectedUserIds.length === 0) {
      this.showAssignmentError("Please select at least one user to assign this challenge to.");
      return;
    }

    submitBtn.disabled = true;
    const originalText = submitBtn.textContent;
    submitBtn.textContent = "Processing...";

    try {
      // Handle challenge approval first if needed
      if (isApproval) {
        await this.performChallengeApproval(selectedUserIds);
      }

      // Update assignments using the service
      const operations = await this.assignmentService.updateAssignments(
        this.currentChallenge.id,
        selectedUserIds,
        this.assignmentVersion
      );

      // Generate success message based on operations
      const successMessage = this.generateSuccessMessage(
        isApproval,
        operations,
        selectedUserIds.length
      );
      this.showAssignmentSuccess(successMessage);

      // Reload and close after 1.5 seconds
      setTimeout(async () => {
        await this.loadAllChallenges();
        this.closeAssignmentModal();
      }, 1500);
    } catch (err) {
      console.error("Error processing assignments:", err);

      if (err instanceof ConflictError) {
        this.showAssignmentError(
          "Another user modified these assignments. Please close this dialog and try again."
        );
      } else {
        this.showAssignmentError(err.message || "Failed to update assignments. Please try again.");
      }
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = originalText;
    }
  }

  /**
   * Perform challenge approval (set status to approved)
   */
  async performChallengeApproval(selectedUserIds) {
    const { error: approveError } = await this.supabase
      .from("challenges")
      .update({
        approval_status: "approved",
        approved_by: this.userId,
        approved_at: new Date().toISOString(),
        suggested_for: selectedUserIds[0] || null,
      })
      .eq("id", this.currentChallenge.id);

    if (approveError) {
      console.error("Approval error:", approveError);
      throw new Error(`Failed to approve challenge: ${approveError.message}`);
    }
  }

  // All assignment operations now handled by AssignmentService

  /**
   * Generate success message based on operations performed
   */
  generateSuccessMessage(isApproval, operations, finalAssignmentCount) {
    const messages = [];

    if (operations && operations.length > 0) {
      const counts = {
        created: 0,
        reactivated: 0,
        deactivated: 0,
      };

      operations.forEach((op) => {
        if (counts.hasOwnProperty(op.operation)) {
          counts[op.operation]++;
        }
      });

      if (counts.created > 0) {
        messages.push(`assigned to ${counts.created} new user${counts.created !== 1 ? "s" : ""}`);
      }
      if (counts.reactivated > 0) {
        messages.push(
          `reactivated ${counts.reactivated} user${counts.reactivated !== 1 ? "s" : ""}`
        );
      }
      if (counts.deactivated > 0) {
        messages.push(
          `unassigned ${counts.deactivated} user${counts.deactivated !== 1 ? "s" : ""}`
        );
      }
    }

    const actionMsg =
      messages.length > 0
        ? messages.join(" and ")
        : `assigned to ${finalAssignmentCount} user${finalAssignmentCount !== 1 ? "s" : ""}`;

    return isApproval
      ? `Challenge approved and ${actionMsg}!`
      : `Challenge assignments updated - ${actionMsg}!`;
  }

  /**
   * Modal management methods
   */
  openDetailsModal() {
    if (this.detailsModal) {
      this.detailsModal.style.display = "block";
      document.body.style.overflow = "hidden";
    }
  }

  closeDetailsModal() {
    if (this.detailsModal) {
      this.detailsModal.style.display = "none";
      document.body.style.overflow = "auto";
    }
  }

  openAssignmentModal() {
    if (this.assignmentModal) {
      this.assignmentModal.style.display = "block";
      document.body.style.overflow = "hidden";
    }
  }

  closeAssignmentModal() {
    if (this.assignmentModal) {
      this.assignmentModal.style.display = "none";
      document.body.style.overflow = "auto";
      this.assignmentForm?.reset();
      this.hideAssignmentMessages();
    }
  }

  /**
   * Message helpers
   */
  hideAssignmentMessages() {
    const errorDiv = document.getElementById("assignmentError");
    const successDiv = document.getElementById("assignmentSuccess");
    if (errorDiv) errorDiv.style.display = "none";
    if (successDiv) successDiv.style.display = "none";
  }

  showAssignmentError(message) {
    const errorDiv = document.getElementById("assignmentError");
    if (errorDiv) {
      errorDiv.textContent = message;
      errorDiv.style.display = "block";
    }
  }

  showAssignmentSuccess(message) {
    const successDiv = document.getElementById("assignmentSuccess");
    if (successDiv) {
      successDiv.textContent = message;
      successDiv.style.display = "block";
    }
  }
}
