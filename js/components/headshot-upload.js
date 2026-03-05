// js/components/headshot-upload.js
// Component for uploading user headshot to Supabase Storage
import { appState } from "../app.js";
import { EventBus } from "../events/event-bus.js";
import { SUPABASE_CONFIG } from "../config.js";

export class HeadshotUpload extends EventTarget {
  constructor() {
    super();
    this.element = null;
    this.user = appState.getCurrentUser();
    this.supabase = appState.getSupabase();
  }

  render() {
    this.element = document.createElement("div");
    this.element.className = "headshot-upload";
    this.element.innerHTML = `
      <a href="#" data-sound="myspace" id="headshotUploadBtn" class="headshot-upload-link">Add/Update Headshot</a>
      <input type="file" id="headshotFileInput" accept="image/*" style="display:none" />
      <div id="headshotUploadStatus" class="upload-status"></div>
    `;
    // Style: .headshot-upload-link { color: #0077cc; text-decoration: underline; cursor: pointer; font-size: 1rem; }
    const uploadBtn = this.element.querySelector("#headshotUploadBtn");
    const fileInput = this.element.querySelector("#headshotFileInput");

    const onUploadClick = (e) => {
      // Prevent default anchor navigation and stop propagation so delegated
      // listeners aren't interrupted. Use the passed event rather than
      // relying on a global `event` variable (deprecated/unsafe).
      e.preventDefault();
      e.stopPropagation();
      fileInput.click();
    };

    uploadBtn.addEventListener("click", onUploadClick);
    // Keep a reference for potential cleanup by callers
    this._uploadBtnCleanup = () => uploadBtn.removeEventListener("click", onUploadClick);

    fileInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (file) this.uploadHeadshot(file);
    });
    return this.element;
  }

  async uploadHeadshot(file) {
    const statusDiv = this.element.querySelector("#headshotUploadStatus");
    statusDiv.textContent = "Uploading...";
    try {
      const userId = this.user.id;
      const fileExt = file.name.split(".").pop();
      const filePath = `${userId}.${fileExt}`;
      // Upload to Supabase Storage bucket 'Headshots'
      const { data, error } = await this.supabase.storage
        .from("Headshots")
        .upload(filePath, file, { upsert: true, contentType: file.type });
      if (error) {
        statusDiv.textContent = `Headshot upload failed: ${error.message}`;
        console.error("Storage upload error:", error, { filePath, file, userId });
        throw error;
      }
      // Get public URL and bust the CDN/browser cache with a timestamp param.
      // The file is upserted under the same path each time (storage efficiency),
      // but the CDN won't invalidate automatically — appending ?t= forces a fresh
      // fetch on every upload without changing the underlying storage path.
      const { data: headshotData } = this.supabase.storage
        .from("Headshots")
        .getPublicUrl(data.path || filePath);
      const cacheBustedUrl = `${headshotData.publicUrl}?t=${Date.now()}`;

      // Update user headshot in DB using Supabase client
      const { error: updateError } = await this.supabase
        .from("users")
        .update({ headshot: cacheBustedUrl })
        .eq("id", userId);
      if (updateError) {
        statusDiv.textContent = `Headshot DB update failed: ${updateError.message}`;
        console.error("DB update error:", updateError);
        throw updateError;
      }
      statusDiv.textContent = "Headshot updated!";
      // Emit event for global update (window for UI propagation)
      window.dispatchEvent(
        new CustomEvent("user:headshot-updated", {
          detail: {
            userId,
            headshotUrl: cacheBustedUrl,
          },
        })
      );
    } catch (err) {
      statusDiv.textContent = `Error: ${err.message}`;
    }
  }

  async init() {
    return this.render();
  }
}
