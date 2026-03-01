import { BasePage } from "./base-page.js";
import { SubmissionTable } from "../components/submission.js";
import { firebaseAuth } from "../services/firebase-auth.js";
import { escapeHTML } from "../utils/text-format.js";
import { EventBus } from "../events/event-bus.js";

export class ChallengesSubmitPage extends BasePage {
  constructor() {
    super();
    this.submissionTable = new SubmissionTable("submissionsContainer", "user");
    this.modal = null;
    this.form = null;
  }

  async init() {
    await super.init();
    this.initializeModal();
    this.initializeForm();
    this.updateMarqueeUsername();
    await this.loadSubmissions();
  }

  /**
   * Initialize modal elements and event listeners
   */
  initializeModal() {
    this.modal = document.getElementById("challengeModal");
    const addBtn = document.getElementById("addChallengeBtn");
    const closeBtn = document.getElementById("closeChallengeModal");
    const overlay = document.querySelector(".challenge-modal-overlay");

    if (!this.modal || !addBtn || !closeBtn || !overlay) {
      console.error("Modal elements not found");
      return;
    }

    addBtn.addEventListener("click", () => this.openModal());
    closeBtn.addEventListener("click", () => this.closeModal());
    overlay.addEventListener("click", () => this.closeModal());
  }

  /**
   * Initialize form and submission handler
   */
  initializeForm() {
    this.form = document.getElementById("challengeForm");
    if (!this.form) {
      console.error("Challenge form not found");
      return;
    }

    this.form.addEventListener("submit", (e) => this.handleSubmit(e));
  }

  /**
   * Open the challenge submission modal
   */
  openModal() {
    this.modal.style.display = "block";
    document.body.style.overflow = "hidden";
    this.loadUsers();
  }

  /**
   * Close the modal and reset form
   */
  closeModal() {
    this.modal.style.display = "none";
    document.body.style.overflow = "auto";
    this.form.reset();
    this.hideMessages();
  }

  /**
   * Hide error and success messages
   */
  hideMessages() {
    const errorDiv = document.getElementById("formError");
    const successDiv = document.getElementById("formSuccess");
    if (errorDiv) errorDiv.style.display = "none";
    if (successDiv) successDiv.style.display = "none";
  }

  /**
   * Show error message
   */
  showError(message) {
    const errorDiv = document.getElementById("formError");
    if (errorDiv) {
      errorDiv.textContent = message;
      errorDiv.style.display = "block";
    }
  }

  /**
   * Show success message
   */
  showSuccess(message) {
    const successDiv = document.getElementById("formSuccess");
    if (successDiv) {
      successDiv.textContent = message;
      successDiv.style.display = "block";
    }
  }

  /**
   * Load users for datalist dropdown
   */
  async loadUsers() {
    try {
      const { data, error } = await this.supabase
        .from("users")
        .select("id, username, display_name")
        .order("display_name");

      if (error) throw error;

      const datalist = document.getElementById("usersDatalist");
      if (datalist) {
        datalist.innerHTML = data
          .map((user) => {
            const display = user.display_name || user.username;
            // Option value is always display_name (or username fallback), store user id as data attribute
            return `<option value="${display}" data-user-id="${user.id}">`;
          })
          .join("");
      }
    } catch (err) {
      console.error("Error loading users:", err);
    }
  }

  /**
   * Load user's submitted challenges
   */
  async loadSubmissions() {
    this.submissionTable.showLoading();

    try {
      const { data, error } = await this.supabase
        .from("challenges")
        .select("*")
        .eq("created_by", this.userId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Fetch suggested usernames for challenges that have suggested_for
      if (data && data.length > 0) {
        const assignedUserIds = [
          ...new Set(data.filter((c) => c.suggested_for).map((c) => c.suggested_for)),
        ];

        if (assignedUserIds.length > 0) {
          const { data: users, error: userError } = await this.supabase
            .from("users")
            .select("id, username")
            .in("id", assignedUserIds);

          if (!userError && users) {
            const usernameMap = Object.fromEntries(users.map((u) => [u.id, u.username]));

            // Attach username to each challenge
            data.forEach((challenge) => {
              if (challenge.suggested_for) {
                challenge.suggested_for_username = usernameMap[challenge.suggested_for];
              }
            });
          }
        }
      }

      this.submissionTable.render(data);
    } catch (err) {
      console.error("Error loading submissions:", err);
      this.submissionTable.showError("Error loading submissions. Please refresh the page.");
    }
  }

  /**
   * Handle form submission
   */
  async handleSubmit(e) {
    e.preventDefault();

    const submitBtn = document.getElementById("submitChallengeBtn");
    this.hideMessages();

    submitBtn.disabled = true;
    submitBtn.textContent = "Submitting...";

    try {
      const challengeName = document.getElementById("challengeName").value.trim();
      const challengeDescription = document.getElementById("challengeDescription").value.trim();
      const challengeMetric = document.getElementById("challengeMetric").value.trim();
      const assignedToInput = document.getElementById("assignedTo");
      const assignedToValue = assignedToInput.value.trim();

      // Safely get brian mode value (field might be hidden for non-admin users)
      const brianModeElement = document.getElementById("brianMode");
      const brianMode = brianModeElement ? brianModeElement.value.trim() : "";

      // Validate required fields only
      if (!challengeName || !challengeDescription) {
        throw new Error("Please fill in all required fields (Name and Description).");
      }

      // Find user ID if assigned
      let assignedToUserId = null;
      if (assignedToValue) {
        // Try to resolve user id from datalist option
        const datalist = document.getElementById("usersDatalist");
        let userId = null;
        if (datalist) {
          const option = Array.from(datalist.options).find((opt) => opt.value === assignedToValue);
          if (option && option.dataset.userId) {
            userId = option.dataset.userId;
          }
        }
        if (!userId) {
          throw new Error(
            `User "${assignedToValue}" not found. Please select a valid user from the list.`
          );
        }
        assignedToUserId = userId;
      }

      // Generate unique ID for challenge
      const challengeId = `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Insert challenge - store raw text with HTML entities, format on display
      const challengeData = {
        id: challengeId,
        title: escapeHTML(challengeName),
        description: escapeHTML(challengeDescription), // Just escape, preserve newlines/spacing
        type: "assigned",
        created_by: this.userId,
        suggested_for: assignedToUserId,
        approval_status: "pending",
      };

      // Add optional fields if provided
      if (challengeMetric) {
        challengeData.success_metric = escapeHTML(challengeMetric);
      }

      if (brianMode && this.isAdmin()) {
        challengeData.brian_mode = brianMode;
      }

      // Insert challenge directly into Supabase
      const { error: insertError } = await this.supabase.from("challenges").insert([challengeData]);

      if (insertError) {
        throw new Error(`Failed to submit challenge: ${insertError.message}`);
      }

      this.showSuccess("Challenge submitted successfully! Awaiting admin approval.");

      // Reload submissions
      await this.loadSubmissions();

      // Emit event for achievements and other listeners
      try {
        EventBus.instance.emit("challenge:submitted", {
          userId: this.userId,
          challengeId: challengeId,
        });
      } catch (emitErr) {
        console.warn("Failed to emit challenge:submitted", emitErr);
      }

      // Close modal after 2 seconds
      setTimeout(() => {
        this.closeModal();
      }, 2000);
    } catch (err) {
      console.error("Error submitting challenge:", err);
      this.showError(err.message || "Failed to submit challenge. Please try again.");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "SUBMIT CHALLENGE";
    }
  }
}
