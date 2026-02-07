import { appState } from '../app.js';

export class CocktailEntryModal {
  constructor() {
    this.modal = null;
    this.overlay = null;
    this.form = null;
    this.currentEntry = null;
    this.activeCompetition = null;
    this.isEditMode = false;
    this.supabase = appState.getSupabase();
    this.userId = appState.getUserId();
  }

  /**
   * Initialize and inject modal into page
   */
  async init() {
    console.log('🍹 Initializing cocktail modal...');
    this.createModalHTML();
    console.log('✅ Modal HTML created');
    this.attachEventListeners();
    console.log('✅ Event listeners attached');
    await this.loadCompetitionAndEntry();
    console.log('✅ Competition and entry loaded');
  }

  /**
   * Create modal HTML and inject into DOM
   */
  createModalHTML() {
    const modalHTML = `
      <div id="cocktailEntryModal" class="challenge-modal" style="display: none;">
        <div class="challenge-modal-overlay"></div>
        <div class="challenge-modal-content">
          <button id="closeCocktailEntryModal" class="close-btn">✖️</button>
          
          <h2 class="text-center rainbow-text">Cocktail Entry</h2>
          
          <div id="cocktailEntryContent">
            <!-- Loading state -->
            <div id="cocktailEntryLoading" class="text-center">
              <p class="loading">Loading your entry...</p>
            </div>

            <!-- No active competition -->
            <div id="noCompetitionMessage" style="display: none;">
              <div class="highlight-box text-center">
                <h3>No Active Competition</h3>
                <p>There is no cocktail competition open for registration at this time.</p>
              </div>
            </div>

            <!-- Registration/Edit Form -->
            <form id="cocktailEntryForm" style="display: none;">
              <div class="form-group">
                <label for="cocktailName">Cocktail Name <span class="required">*</span></label>
                <input 
                  type="text" 
                  id="cocktailName" 
                  placeholder="e.g., Brian's Spicy Margarita"
                  required
                  maxlength="100"
                >
                <small>Give your creation a memorable name!</small>
              </div>

              <div class="form-group">
                <label for="cocktailDescription">Ingredients & Instructions <span class="required">*</span></label>
                <textarea 
                  id="cocktailDescription" 
                  rows="6"
                  placeholder="List your ingredients and how you made it&#10;&#10;Example:&#10;2 oz Tequila&#10;1 oz Lime Juice&#10;0.5 oz Jalapeño Simple Syrup&#10;Shake with ice, strain into glass with salted rim"
                  required
                  maxlength="1000"
                ></textarea>
                <small>Share what's in your cocktail (max 1000 characters)</small>
              </div>

              <button type="submit" id="cocktailEntrySubmitBtn" class="btn-primary" data-sound="save">
                🎉 REGISTER MY COCKTAIL
              </button>

              <div id="cocktailEntryError" class="error-message" style="display: none;"></div>
              <div id="cocktailEntrySuccess" class="success-message" style="display: none;"></div>
            </form>

            <!-- Entry Display -->
            <div id="cocktailEntryDisplay" style="display: none;">
              <div class="detail-row">
                <strong>Cocktail Name:</strong>
                <span id="displayCocktailName"></span>
              </div>
              <div class="detail-row">
                <strong>Ingredients & Instructions:</strong>
                <pre id="displayCocktailDescription" style="white-space: pre-wrap; font-family: 'Courier New', monospace; background: rgba(255, 255, 0, 0.1); padding: 1rem; border: 2px solid #FF6600; border-radius: 4px; margin: 0.5rem 0; color: #000;"></pre>
              </div>
              <div class="detail-row">
                <strong>Registered:</strong>
                <span id="displayCocktailSubmittedAt"></span>
              </div>

              <div class="text-center" style="margin-top: 1rem;">
                <button id="editCocktailEntryBtn" class="btn-secondary">✏️ EDIT MY ENTRY</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    // Inject into body
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    // Get references
    this.modal = document.getElementById('cocktailEntryModal');
    this.overlay = this.modal.querySelector('.challenge-modal-overlay');
    this.form = document.getElementById('cocktailEntryForm');
  }

  /**
   * Attach event listeners
   */
  attachEventListeners() {
    // Close button
    const closeBtn = document.getElementById('closeCocktailEntryModal');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.close());
    }

    // Overlay click
    if (this.overlay) {
      this.overlay.addEventListener('click', () => this.close());
    }

    // Form submit
    if (this.form) {
      this.form.addEventListener('submit', (e) => this.handleSubmit(e));
    }

    // Edit button
    const editBtn = document.getElementById('editCocktailEntryBtn');
    if (editBtn) {
      editBtn.addEventListener('click', () => this.enableEditMode());
    }
  }

  /**
   * Load active competition and user's entry
   */
  async loadCompetitionAndEntry() {
    try {
      // Get most recent competition (regardless of voting status)
      const { data: competitions, error: compError } = await this.supabase
        .from('cocktail_competitions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1);

      if (compError) throw compError;

      if (!competitions || competitions.length === 0) {
        this.showNoActiveCompetition();
        return;
      }

      this.activeCompetition = competitions[0];

      // Check if user has an entry
      const { data: entry, error: entryError } = await this.supabase
        .from('cocktail_entries')
        .select('*')
        .eq('competition_id', this.activeCompetition.id)
        .eq('user_id', this.userId)
        .maybeSingle();

      if (entryError) throw entryError;

      this.currentEntry = entry;
      
      // Update UI based on entry state
      document.getElementById('cocktailEntryLoading').style.display = 'none';
      
      if (this.currentEntry) {
        this.showEntryDisplay();
      } else {
        this.showRegistrationForm();
      }

    } catch (err) {
      console.error('Error loading competition/entry:', err);
      document.getElementById('cocktailEntryLoading').style.display = 'none';
      this.showError('Failed to load competition data. Please try again.');
    }
  }

  showNoActiveCompetition() {
    document.getElementById('cocktailEntryLoading').style.display = 'none';
    document.getElementById('noCompetitionMessage').style.display = 'block';
  }

  showRegistrationForm() {
    document.getElementById('cocktailEntryForm').style.display = 'block';
    document.getElementById('cocktailEntryDisplay').style.display = 'none';
  }

  showEntryDisplay() {
    document.getElementById('cocktailEntryForm').style.display = 'none';
    document.getElementById('cocktailEntryDisplay').style.display = 'block';
    
    // Populate display
    document.getElementById('displayCocktailName').textContent = this.currentEntry.entry_name || '';
    document.getElementById('displayCocktailDescription').textContent = this.currentEntry.description || '';
    document.getElementById('displayCocktailSubmittedAt').textContent = 
      new Date(this.currentEntry.submitted_at).toLocaleString();
  }

  enableEditMode() {
    this.isEditMode = true;
    
    // Populate form
    document.getElementById('cocktailName').value = this.currentEntry.entry_name || '';
    document.getElementById('cocktailDescription').value = this.currentEntry.description || '';
    
    // Update button text
    const submitBtn = document.getElementById('cocktailEntrySubmitBtn');
    submitBtn.textContent = '💾 UPDATE MY COCKTAIL';
    
    // Show form
    this.showRegistrationForm();
  }

  async handleSubmit(e) {
    e.preventDefault();
    
    const submitBtn = document.getElementById('cocktailEntrySubmitBtn');
    const originalText = submitBtn.textContent;
    
    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving...';
    
    this.hideMessages();
    
    try {
      const entryName = document.getElementById('cocktailName').value.trim();
      const description = document.getElementById('cocktailDescription').value.trim();
      
      if (!entryName || !description) {
        throw new Error('Please fill in all required fields.');
      }
      
      if (this.isEditMode && this.currentEntry) {
        // Update existing entry
        const { data, error } = await this.supabase
          .from('cocktail_entries')
          .update({
            entry_name: entryName,
            description: description
          })
          .eq('id', this.currentEntry.id)
          .select()
          .single();
        
        if (error) throw error;
        this.currentEntry = data;
        
        this.showSuccess('Cocktail entry updated! 🎉');
      } else {
        // Create new entry
        const { data, error } = await this.supabase
          .from('cocktail_entries')
          .insert([{
            competition_id: this.activeCompetition.id,
            user_id: this.userId,
            entry_name: entryName,
            description: description
          }])
          .select()
          .single();
        
        if (error) throw error;
        this.currentEntry = data;
        
        this.showSuccess('Cocktail registered! 🎉');
      }
      
      // Switch to display after brief delay
      setTimeout(() => {
        this.isEditMode = false;
        this.showEntryDisplay();
        this.hideMessages();
      }, 1500);
      
    } catch (err) {
      console.error('Error saving entry:', err);
      this.showError(err.message || 'Failed to save entry. Please try again.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = originalText;
    }
  }

  /**
   * Open the modal
   */
  open() {
    console.log('🍹 Opening cocktail modal...');
    if (this.modal) {
      console.log('✅ Modal element found, displaying...');
      this.modal.style.display = 'block';
      document.body.style.overflow = 'hidden';
    } else {
      console.error('✖️ Modal element not found!');
    }
  }

  /**
   * Close the modal
   */
  close() {
    if (this.modal) {
      this.modal.style.display = 'none';
      document.body.style.overflow = 'auto';
      this.hideMessages();
    }
  }

  /**
   * Check if user has entry
   */
  hasEntry() {
    return !!this.currentEntry;
  }

  /**
   * Get current entry
   */
  getEntry() {
    return this.currentEntry;
  }

  hideMessages() {
    const errorDiv = document.getElementById('cocktailEntryError');
    const successDiv = document.getElementById('cocktailEntrySuccess');
    if (errorDiv) errorDiv.style.display = 'none';
    if (successDiv) successDiv.style.display = 'none';
  }

  showError(message) {
    const errorDiv = document.getElementById('cocktailEntryError');
    if (errorDiv) {
      errorDiv.textContent = message;
      errorDiv.style.display = 'block';
    }
  }

  showSuccess(message) {
    const successDiv = document.getElementById('cocktailEntrySuccess');
    if (successDiv) {
      successDiv.textContent = message;
      successDiv.style.display = 'block';
    }
  }
}
