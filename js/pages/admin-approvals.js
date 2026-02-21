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
  }

  async init() {
    await super.init();
    this.setPageTitle("Admin Approvals");

    // Initialize assignment service after auth
    this.assignmentService = new AssignmentService(this.supabase, this.userId);

    this.initializeModals();
    this.initializeAssignmentForm();
    await this.loadAllChallenges();
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
      closeDetailsBtn.addEventListener("click", () => this.closeDetailsModal());
    }
    if (detailsOverlay) {
      detailsOverlay.addEventListener("click", () => this.closeDetailsModal());
    }

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

      console.log("Raw assignments from DB:", assignmentsResult.data);

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

      // Fetch usernames for created_by and suggested_for fields
      if (data && data.length > 0) {
        const userIds = [
          ...new Set([
            ...data.map((c) => c.created_by),
            ...data.filter((c) => c.suggested_for).map((c) => c.suggested_for),
          ]),
        ];

        const { data: users, error: userError } = await this.supabase
          .from("users")
          .select("id, username, display_name")
          .in("id", userIds);

        if (!userError && users) {
          const usernameMap = Object.fromEntries(users.map((u) => [u.id, u.username]));
          const displayNameMap = Object.fromEntries(
            users.map((u) => [u.id, u.display_name || u.username])
          );

          // Attach usernames to challenges
          data.forEach((challenge) => {
            challenge.created_by_username = usernameMap[challenge.created_by];
            challenge.created_by_display = displayNameMap[challenge.created_by];
            if (challenge.suggested_for) {
              challenge.suggested_for_username = usernameMap[challenge.suggested_for];
            }
            // Attach actual assignments for all challenges
            challenge.actual_assignments = assignmentsByChallenge[challenge.id] || [];
          });
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

    const detailsDiv = document.getElementById("challengeDetails");

    // Build intended for display - show original suggestion
    let intendedForDisplay = "Anyone";
    if (challenge.suggested_for_username) {
      intendedForDisplay = escapeHtml(challenge.suggested_for_username);
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
          <span>${escapeHtml(challenge.description)}</span>
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

    console.log("Selected user IDs:", selectedUserIds);
    console.log("Current challenge ID:", this.currentChallenge.id);

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
