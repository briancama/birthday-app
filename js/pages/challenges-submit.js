import { BasePage } from "./base-page.js";
import { SubmissionTable } from "../components/submission.js";
import { firebaseAuth } from "../services/firebase-auth.js";
import { escapeHTML } from "../utils/text-format.js";
import { EventBus } from "../events/event-bus.js";
import { toE164Format, isValidUSPhone, formatPhoneInput } from "../utils/phone-format.js";

export class ChallengesSubmitPage extends BasePage {
  constructor() {
    super();
    this.submissionTable = new SubmissionTable("submissionsContainer", "user");
    this.modal = null;
    this.form = null;
  }

  /**
   * Return the default scam dialog sequence. Edit messages, inputs and validators here.
   * Each item may be a string (simple alert) or an object with fields:
   * - type: 'alert'|'confirm'|'prompt'
   * - title: optional title shown in titlebar
   * - text: message body
   * - okText/cancelText/closeText: label overrides
   * - validate: function|RegExp|string to validate prompt input (function may be async)
   * - validationFailed: object or string shown when validation fails (only Close button)
   * - hideCancel: true to hide Cancel button
   */
  getScamDialogSequence() {
    return [
      {
        type: "alert",
        title: "Congratulations!",
        text: "Don't worry this definitely isn't a scam. Just go through this process and that car is yours!",
      },
      // Example prompt with a simple validation (at least 3 chars)
      {
        type: "prompt",
        title: "Phone number",
        text: "Please enter your phone number so we can contact you about your new car!",
        inputMode: "phone",
        inputType: "tel",
        placeholder: "(555) 555-5555",
        default: "",
        // Validate the entered phone: normalize to E.164 and compare to the current user's phone
        validate: async function (val) {
          try {
            if (typeof val !== "string") return false;
            const enteredDigits = (val || "").replace(/\D/g, "");
            if (enteredDigits.length !== 10) return false;
            const enteredE164 = `+1${enteredDigits}`;

            // Obtain the active user's phone from currentUser or localStorage fallback
            let myPhone =
              this.currentUser?.phone_number || localStorage.getItem("phone_number") || "";
            const myDigits = (myPhone || "").replace(/\D/g, "");
            let myE164 = null;
            if (myDigits.length === 11 && myDigits.startsWith("1")) {
              myE164 = `+1${myDigits.slice(1)}`;
            } else if (myDigits.length === 10) {
              myE164 = `+1${myDigits}`;
            } else {
              // fallback: try util conversion (will throw on invalid)
              try {
                myE164 = toE164Format(myPhone);
              } catch (e) {
                return false;
              }
            }

            return enteredE164 === myE164;
          } catch (e) {
            return false;
          }
        },
        validationFailed: {
          title: "Incorrect Number",
          text: "Trying to give us a fake phone number, huh? Well guess who isn't getting a car. It's you.",
          closeText: "Close",
        },
      },
      // Example prompt with a simple validation (at least 3 chars)
      {
        type: "prompt",
        title: "You sure you want this car?",
        text: "So here we'll just need your Social Security Number to ensure you are a US Citizen and eligible for this giveaway.",
        default: "",
        // Validate the SSN: must be exactly 9 numeric digits
        validate: function (val) {
          if (typeof val !== "string") return false;
          const digits = (val || "").replace(/\D/g, "");
          return digits.length === 9;
        },
        validationFailed: {
          title: "Probably Smart",
          text: "I mean really, was asking for an SSN just a little too much? Anyway, you're probably smart to be cautious about sharing that info. No car for you, but at least your identity is safe!",
          closeText: "Close",
        },
      },
      // Ask user for a password.
      {
        type: "prompt",
        title: "Set Password",
        text: "I guess that *could* be your real SSN. Now, Enter a password. Your most-used one is fine, we're sure it's very secure.",
        default: "",
        // Validate the password: must be at least 8 characters
        validate: function (val) {
          const COMMON_PASSWORDS = [
            "123456",
            "password",
            "123456789",
            "12345678",
            "12345",
            "1234567",
            "qwerty",
            "abc123",
            "football",
            "monkey",
            "letmein",
            "696969",
            "shadow",
            "master",
            "666666",
            "qwertyuiop",
            "123321",
            "mustang",
            "1234567890",
            "michael",
            "superman",
            "batman",
            "dragon",
            "pass",
            "iloveyou",
            "trustno1",
            "sunshine",
            "princess",
            "welcome",
            "admin",
            "login",
            "starwars",
            "solo",
            "passw0rd",
            "whatever",
            "donald",
            "password1",
            "qazwsx",
            "zxcvbnm",
            "hunter2",
            "baseball",
            "access",
            "hello",
            "charlie",
            "august2020",
            "cheese",
            "thomas",
            "liverpool",
            "seahawks",
            "nicole",
          ];
          if (typeof val !== "string") return false;
          if (val.length < 7) return false;
          if (COMMON_PASSWORDS.includes(val.toLowerCase())) return false;
          return true;
        },
        validationFailed: {
          title: "Seriously?",
          text: "Whoa! That password is really not good. I can't believe you would use that. And you use that everywhere? Yikes. Your data has to already be compromised, so no real point in continuing this farce.",
          closeText: "Close",
        },
      },
      {
        type: "prompt",
        title: "One last thing...",
        text: "Last step! Let's setup your password reminder. Who is your best friend?",
        default: "",
        // Validate that the answer matches 'Brian' (case-insensitive) or 'brian cama'
        validate: function (val) {
          if (typeof val !== "string") return false;
          const v = (val || "").trim().toLowerCase();
          return v === "brian" || v === "brian cama";
        },
        validationFailed: {
          title: "Appease my Ego!",
          text: "Well, that answer doesn't seem quite right to me. If you can't tell the truth about your best friend, how can I trust you with a car?",
          closeText: "Close",
        },
      },
      {
        type: "confirm",
        title: "Proceed?",
        text: "Oh my goodness. *I'M* your best friend. You really didn't have to say that. Well you've completed all I asked for: Are you ready for your brand new car!!!",
        okText: "FREE CAR!",
        cancelText: "NO THANKS, I HATE CARS",
      },
    ];
  }

  async init() {
    await super.init();
    this.initializeModal();
    this.initializeForm();
    this.updateMarqueeUsername();
    await this.loadSubmissions();
    this.initScamGifDialog();
    // Expose a dev helper to trigger the reveal sequence from the console
    try {
      window.triggerScamReveal = this.revealScam?.bind(this) || (() => {});
    } catch (e) {
      /* noop */
    }
  }
  /**
   * Initialize a dialog chain that triggers when the user clicks the scamGif image.
   * Uses native alert/confirm/prompt dialogs for vintage feel. If `this.scamDialogMessages`
   * is an array of strings, each string will be shown via `alert()` in order and then
   * the page will navigate to `/hello`. If any item is an object {type, text}, the
   * corresponding native method will be used (type: 'alert'|'confirm'|'prompt').
   */
  initScamGifDialog() {
    const defaultMessages = this.getScamDialogSequence();
    this.scamDialogMessages = this.scamDialogMessages || defaultMessages;

    const img =
      document.querySelector("img#scamGif") || document.querySelector("img[data-scam-gif]");
    if (!img) return;

    const container = document.getElementById("scamGifContainer");

    const enableInteraction = () => {
      if (!container) return;
      // Toggle CSS classes to animate in and enable pointer-events via stylesheet
      container.classList.remove("scam-hidden");
      container.classList.add("scam-visible");
      const onTransitionEnd = (ev) => {
        if (ev.propertyName === "opacity") {
          container.removeEventListener("transitionend", onTransitionEnd);
        }
      };
      container.addEventListener("transitionend", onTransitionEnd);
    };

    // If the image is already cached/complete, animate immediately; otherwise wait for load
    if (img.complete) {
      enableInteraction();
    } else {
      img.addEventListener("load", enableInteraction, { once: true });
      // Also guard against long loads — fall back after 2s
      setTimeout(enableInteraction, 2000);
    }

    img.style.cursor = "pointer";
    img.addEventListener("click", (e) => {
      e.stopPropagation();
      this._runScamNativeDialogChain();
    });
  }
  _runScamNativeDialogChain() {
    const messages = this.scamDialogMessages || [];

    // Ensure Win98 CSS is loaded once
    if (!document.querySelector("link[data-win98-dialog]")) {
      const l = document.createElement("link");
      l.rel = "stylesheet";
      l.href = "/css/components/win98-window.css";
      l.setAttribute("data-win98-dialog", "1");
      document.head.appendChild(l);
    }

    const showModal = (item) => {
      return new Promise((resolve) => {
        const overlay = document.createElement("div");
        overlay.style.position = "fixed";
        overlay.style.left = "0";
        overlay.style.top = "0";
        overlay.style.right = "0";
        overlay.style.bottom = "0";
        overlay.style.background = "rgba(255, 255, 255, 0.7)";
        overlay.style.display = "flex";
        overlay.style.alignItems = "center";
        overlay.style.justifyContent = "center";
        overlay.style.zIndex = "9999";
        overlay.style.padding = "16px 0";

        const win = document.createElement("div");
        win.className = "win98-window";

        const titlebar = document.createElement("div");
        titlebar.className = "win98-titlebar";
        const title = document.createElement("div");
        title.className = "win98-title";
        title.textContent = item.title || this.scamDialogDefaultTitle || "Message";
        const closeBtn = document.createElement("div");
        closeBtn.className = "win98-close";
        closeBtn.textContent = "✖";
        closeBtn.addEventListener("click", () => {
          cleanup();
          resolve({ ok: false });
        });

        titlebar.appendChild(title);
        titlebar.appendChild(closeBtn);

        const content = document.createElement("div");
        content.className = "win98-content";

        let inputEl = null;
        if (item.type === "prompt") {
          const p = document.createElement("div");
          p.textContent = item.text || "";
          inputEl = document.createElement("input");
          // Allow messages to specify `inputMode` (e.g., 'tel','numeric','email')
          // and `inputType` (e.g., 'text','password','number'). Also support
          // a custom placeholder. These are optional per-message overrides.
          inputEl.type = item.inputType || "text";
          inputEl.value = item.default || "";
          inputEl.style.boxSizing = "border-box";

          if (item.inputMode) {
            // Accept both 'tel' and legacy 'phone' keys from message templates
            const mode = item.inputMode === "phone" ? "tel" : item.inputMode;
            inputEl.setAttribute("inputmode", mode);
          }
          if (item.placeholder) inputEl.setAttribute("placeholder", item.placeholder);

          // If the message indicates a phone input (either inputMode 'tel' or
          // explicit format 'phone'), attach the phone formatter to guide entry.
          const wantsPhoneFormat =
            item.inputMode === "tel" || item.inputMode === "phone" || item.format === "phone";
          if (wantsPhoneFormat) {
            if (!inputEl.getAttribute("placeholder")) {
              inputEl.setAttribute("placeholder", "(555) 555-5555");
            }

            const _onFormatInput = (e) => {
              try {
                const selStart = inputEl.selectionStart || 0;
                const prevLen = inputEl.value.length;
                inputEl.value = formatPhoneInput(inputEl.value);
                const newLen = inputEl.value.length;
                const delta = newLen - prevLen;
                const newPos = Math.max(0, selStart + delta);
                inputEl.selectionStart = inputEl.selectionEnd = newPos;
              } catch (err) {
                // ignore formatting errors
              }
            };
            inputEl.addEventListener("input", _onFormatInput);
          }
          content.appendChild(p);
          content.appendChild(inputEl);
        } else {
          const p = document.createElement("div");
          p.textContent = typeof item === "string" ? item : item.text || "";
          content.appendChild(p);
        }

        const buttons = document.createElement("div");
        buttons.className = "win98-buttons";

        // Validator helper: supports function (sync/async), RegExp/string
        const runValidator = async (val) => {
          if (!item.validate) return true;
          try {
            if (typeof item.validate === "function") {
              return await item.validate.call(this, val);
            }
            if (item.validate instanceof RegExp) return item.validate.test(val);
            if (typeof item.validate === "string") {
              const re = new RegExp(item.validate);
              return re.test(val);
            }
          } catch (e) {
            return false;
          }
          return false;
        };

        // Show a single-message failure dialog (only close/cancel) with custom copy
        const showFailModal = (fail) => {
          return new Promise((res) => {
            const overlayF = document.createElement("div");
            overlayF.style.position = "fixed";
            overlayF.style.left = "0";
            overlayF.style.top = "0";
            overlayF.style.right = "0";
            overlayF.style.bottom = "0";
            overlayF.style.background = "rgba(255,255,255,0.7)";
            overlayF.style.display = "flex";
            overlayF.style.alignItems = "center";
            overlayF.style.justifyContent = "center";
            overlayF.style.zIndex = "10000";

            const w = document.createElement("div");
            w.className = "win98-window";
            const tb = document.createElement("div");
            tb.className = "win98-titlebar";
            const t = document.createElement("div");
            t.className = "win98-title";
            t.textContent = (fail && fail.title) || this.scamDialogDefaultTitle || "Notice";
            const cb = document.createElement("div");
            cb.className = "win98-close";
            cb.textContent = "✖";
            cb.tabIndex = 0;
            cb.addEventListener("click", () => cleanupF());
            tb.appendChild(t);
            tb.appendChild(cb);

            const cont = document.createElement("div");
            cont.className = "win98-content";
            const txt = document.createElement("div");
            txt.textContent =
              (fail && (fail.text || fail.message)) || String(fail || "Invalid input");
            cont.appendChild(txt);

            const btns = document.createElement("div");
            btns.className = "win98-buttons";
            const closeBtn = document.createElement("button");
            closeBtn.className = "win98-btn";
            closeBtn.textContent = (fail && fail.closeText) || "CLOSE";
            closeBtn.addEventListener("click", () => cleanupF());
            btns.appendChild(closeBtn);

            w.appendChild(tb);
            w.appendChild(cont);
            w.appendChild(btns);
            overlayF.appendChild(w);
            document.body.appendChild(overlayF);

            setTimeout(() => closeBtn.focus(), 10);

            function cleanupF() {
              try {
                overlayF.remove();
              } catch (e) {}
              res();
            }
          });
        };

        const okBtn = document.createElement("button");
        okBtn.className = "win98-btn";
        okBtn.textContent = item.okText || "OK";

        okBtn.addEventListener("click", async () => {
          const val = inputEl ? inputEl.value : undefined;
          const valid = await runValidator(val);
          if (!valid) {
            cleanup();
            await showFailModal(
              item.validationFailed || item.validationFailedMessage || { text: "Invalid input" }
            );
            resolve({ ok: false, validationFailed: true });
            return;
          }
          if (item.type === "prompt") {
            cleanup();
            resolve({ ok: true, value: val });
          } else {
            cleanup();
            resolve({ ok: true });
          }
        });

        // Add a Cancel button for all dialogs unless explicitly disabled
        if (!item.hideCancel) {
          const cancelBtn = document.createElement("button");
          cancelBtn.className = "win98-btn";
          cancelBtn.textContent = item.cancelText || "CANCEL";
          cancelBtn.addEventListener("click", () => {
            cleanup();
            resolve({ ok: false });
          });
          // append cancel first so OK appears on the right
          buttons.appendChild(cancelBtn);
        }

        buttons.appendChild(okBtn);

        win.appendChild(titlebar);
        win.appendChild(content);
        win.appendChild(buttons);
        overlay.appendChild(win);
        document.body.appendChild(overlay);

        // Focus
        setTimeout(() => {
          if (inputEl) inputEl.focus();
          else okBtn.focus();
        }, 10);

        function cleanup() {
          try {
            overlay.remove();
          } catch (e) {
            // ignore
          }
        }
      });
    };

    (async () => {
      try {
        for (const raw of messages) {
          const item = typeof raw === "string" ? { type: "alert", text: raw } : raw;
          const res = await showModal(item);
          if (!res || res.ok === false) {
            return; // abort chain
          }
          // If prompt and value provided, we could store or act on it here
        }

        // After sequence completes, run the reveal sequence via the class method so
        // it can be maintained in one place and triggered from the console during dev.
        await this.revealScam();
      } catch (err) {
        console.error("Error running scam dialog chain:", err);
      }
    })();
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
  showFormError(message) {
    const errorDiv = document.getElementById("formError");
    if (errorDiv) {
      errorDiv.textContent = message;
      errorDiv.style.display = "block";
    }
    super.showErrorToast(message);
  }

  /**
   * Show success message.
   * Updates the inline form feedback div (if present) AND falls through to the
   * BasePage toast so achievement/global notifications are always visible.
   */
  showFormSuccess(message) {
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
            .select("id, username, display_name")
            .in("id", assignedUserIds);

          if (!userError && users) {
            const userMap = Object.fromEntries(
              users.map((u) => [u.id, { username: u.username, display_name: u.display_name }])
            );

            // Attach username and display_name to each challenge
            data.forEach((challenge) => {
              if (challenge.suggested_for) {
                const info = userMap[challenge.suggested_for];
                challenge.suggested_for_username = info?.username || null;
                challenge.suggested_for_display_name = info?.display_name || null;
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

      this.showFormSuccess("Challenge submitted successfully! Awaiting admin approval.");

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
      this.showFormError(err.message || "Failed to submit challenge. Please try again.");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "SUBMIT CHALLENGE";
    }
  }

  /**
   * Run the reveal sequence: trigger achievement, show overlay, preload assets,
   * animate car image into view, and play meme audio. This method is intentionally
   * standalone so it can be called from the console during development.
   */
  async revealScam() {
    try {
      // Emit achievement trigger both on EventBus and window so listeners on
      // either channel (EventBus or window-level handlers) receive it.
      try {
        EventBus.instance.emit("achievement:trigger", { key: "hacked", source: "scamFlow" });
      } catch (e) {
        console.debug("EventBus emit for achievement:trigger failed", e);
      }
      try {
        window.dispatchEvent(
          new CustomEvent("achievement:trigger", { detail: { key: "hacked", source: "scamFlow" } })
        );
      } catch (err) {
        console.warn("Failed to dispatch window achievement:trigger:", err);
      }

      const overlay = document.createElement("div");
      // Use CSS classes for presentation; JS only controls timing and class toggles
      overlay.className = "scam-reveal";

      const loading = document.createElement("div");
      loading.className = "scam-reveal__loading scam-reveal-loading";
      const spinner = document.createElement("div");
      spinner.className = "scam-spinner";
      const msg = document.createElement("div");
      msg.textContent = "Loading...";
      loading.appendChild(spinner);
      loading.appendChild(msg);
      overlay.appendChild(loading);
      document.body.appendChild(overlay);

      const imgSrc = "/images/new-car.jpg";
      const audioSrc = "/audio/2taktare.mp3";

      const loadImage = () =>
        new Promise((res) => {
          const i = new Image();
          i.onload = () => res(i);
          i.onerror = () => res(i);
          i.src = imgSrc;
        });

      const loadAudio = () =>
        new Promise((res) => {
          const a = new Audio();
          a.preload = "auto";
          a.src = audioSrc;
          const onReady = () => res(a);
          a.addEventListener("canplaythrough", onReady, { once: true });
          a.addEventListener("error", () => res(a), { once: true });
        });

      const timeout = new Promise((res) => setTimeout(res, 5000));
      const result = await Promise.race([
        Promise.all([loadImage(), loadAudio()]),
        timeout.then(() => [null, null]),
      ]);
      const [img, audio] = result || [null, null];

      // Keep the loading UI visible for at least a short moment so users notice it,
      // even if assets are cached and load instantly.
      try {
        await new Promise((res) => setTimeout(res, 800));
        // instruct CSS to hide the loader, then remove it after the fade
        try {
          loading.classList.add("scam-reveal__loading--hidden");
          setTimeout(() => {
            try {
              loading.remove();
            } catch (e) {}
          }, 350);
        } catch (e) {
          try {
            loading.remove();
          } catch (ee) {}
        }
      } catch (e) {
        try {
          loading.remove();
        } catch (ee) {}
      }

      const carImg = document.createElement("img");
      carImg.className = "scam-car scam-reveal__car";
      carImg.alt = "A very fast car";
      carImg.src = img ? img.src : imgSrc;

      // Append to overlay so CSS can control positioning and animation
      overlay.appendChild(carImg);

      // Trigger the enter animation by adding the modifier class on next frame
      requestAnimationFrame(() =>
        requestAnimationFrame(() => carImg.classList.add("scam-car-enter"))
      );

      const onAnimEnd = () => {
        try {
          carImg.removeEventListener("animationend", onAnimEnd);
          carImg.removeEventListener("transitionend", onAnimEnd);
        } catch (e) {}
        try {
          if (audio && audio.play) {
            audio.volume = 0.5;
            audio.play().catch((err) => console.warn("Audio play failed:", err));
          } else {
            const a2 = new Audio(audioSrc);
            a2.volume = 0.5;
            a2.play().catch((err) => console.warn("Audio play fallback failed:", err));
          }
        } catch (e) {
          console.warn("Play meme audio error", e);
        }
      };
      carImg.addEventListener("animationend", onAnimEnd);
      carImg.addEventListener("transitionend", onAnimEnd);

      // Prevent clicks on the car from closing the overlay
      carImg.addEventListener("click", (ev) => ev.stopPropagation());

      // Create a close control so the overlay remains until user dismisses it
      const closeBtn = document.createElement("button");
      closeBtn.className = "scam-reveal__close";
      closeBtn.textContent = "CLOSE";

      // Cleanup function to stop audio and remove overlay/car
      let _closed = false;
      const cleanup = () => {
        if (_closed) return;
        _closed = true;
        try {
          if (audio && audio.pause) {
            audio.pause();
            audio.currentTime = 0;
          }
        } catch (e) {}
        try {
          carImg.remove();
        } catch (e) {}
        try {
          overlay.remove();
        } catch (e) {}
      };

      closeBtn.addEventListener("click", cleanup);
      overlay.addEventListener("click", (e) => {
        // click outside the car image closes overlay
        if (e.target === overlay) cleanup();
      });

      overlay.appendChild(closeBtn);
    } catch (e) {
      console.error("Reveal sequence failed:", e);
    }
  }
}
