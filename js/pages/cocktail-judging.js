import { BasePage } from './base-page.js';

class CocktailJudgingPage extends BasePage {
    constructor() {
        super();
        this.activeCompetition = null;
        this.entries = [];
        this.myJudgments = new Map(); // entry_id -> judgment data
        this.myFavorite = null;
    }

    async onReady() {
        this.setPageTitle('Cocktail Judging');
        await this.loadCompetitionData();
    }

    async loadCompetitionData() {
        try {
            // Load active competition
            const { data: competitions, error: compError } = await this.supabase
                .from('cocktail_competitions')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(1);

            if (compError) throw compError;

            if (!competitions || competitions.length === 0) {
                this.showNoCompetition();
                return;
            }

            this.activeCompetition = competitions[0];
            document.getElementById('competitionName').textContent = this.activeCompetition.name || 'Cocktail Competition';

            // Check if voting is open
            if (!this.activeCompetition.voting_open) {
                this.showVotingClosed();
                return;
            }

            // Load all entries for this competition
            await this.loadEntries();

            // Load user's judgments
            await this.loadMyJudgments();

            // Load user's favorite
            await this.loadMyFavorite();

            // Render entries
            this.renderEntries();

        } catch (err) {
            console.error('Error loading competition data:', err);
            this.showError('Failed to load competition data. Please refresh the page.');
        }
    }

    async loadEntries() {
        const { data, error } = await this.supabase
            .from('cocktail_entries')
            .select(`
                *,
                users:user_id (username, display_name)
            `)
            .eq('competition_id', this.activeCompetition.id)
            .order('submitted_at', { ascending: true });

        if (error) throw error;

        this.entries = data || [];
    }

    async loadMyJudgments() {
        const { data, error } = await this.supabase
            .from('cocktail_judgments')
            .select('*')
            .eq('judge_user_id', this.userId);

        if (error) throw error;

        this.myJudgments.clear();
        (data || []).forEach(judgment => {
            this.myJudgments.set(judgment.entry_id, judgment);
        });
    }

    async loadMyFavorite() {
        const { data, error } = await this.supabase
            .from('cocktail_favorites')
            .select('*')
            .eq('competition_id', this.activeCompetition.id)
            .eq('judge_user_id', this.userId)
            .maybeSingle();

        if (error) throw error;

        this.myFavorite = data?.entry_id || null;
    }

    showNoCompetition() {
        document.getElementById('judgingStatus').innerHTML = `
            <h3>No Active Competition</h3>
            <p>There is no cocktail competition available for judging at this time.</p>
        `;
        document.getElementById('entriesList').innerHTML = '';
    }

    showVotingClosed() {
        document.getElementById('judgingStatus').innerHTML = `
            <h3>Judging Closed</h3>
            <p>Judging for this competition has ended.</p>
        `;
        document.getElementById('entriesList').innerHTML = '';
    }

    renderEntries() {
        const statusDiv = document.getElementById('judgingStatus');
        const judgedCount = this.myJudgments.size;
        const totalCount = this.entries.length;

        statusDiv.innerHTML = `
            <p><strong>Your Progress:</strong> ${judgedCount} of ${totalCount} cocktails judged</p>
            ${this.myFavorite ? '<p>Favorite selected!</p>' : '<p>Don\'t forget to pick your favorite!</p>'}
        `;

        const entriesDiv = document.getElementById('entriesList');
        
        if (this.entries.length === 0) {
            entriesDiv.innerHTML = '<p class="text-center">No entries submitted yet.</p>';
            return;
        }

        entriesDiv.innerHTML = this.entries.map(entry => {
            const judgment = this.myJudgments.get(entry.id);
            const isFavorite = this.myFavorite === entry.id;
            const isJudged = !!judgment;

            return `
                <div class="entry-card ${isJudged ? 'judged' : ''}" data-entry-id="${entry.id}">
                    <div class="entry-header">
                        <h3>${entry.entry_name}</h3>
                        <p class="entry-author">by ${entry.users?.display_name || entry.users?.username || 'Unknown'}</p>
                        ${isFavorite ? '<span class="favorite-badge">YOUR FAVORITE</span>' : ''}
                    </div>

                    <div class="entry-description">
                        <pre>${entry.description}</pre>
                    </div>

                    ${isJudged ? this.renderJudgmentView(entry, judgment, isFavorite) : this.renderJudgmentForm(entry, isFavorite)}
                </div>
            `;
        }).join('');

        // Attach event listeners
        this.attachEntryListeners();
    }

    renderJudgmentView(entry, judgment, isFavorite) {
        const totalScore = (judgment.taste_score * 10) + (judgment.presentation_score * 4) + 
                          (judgment.workmanship_score * 3) + (judgment.creativity_score * 3);

        return `
            <div class="judgment-view">
                <div class="scores-grid">
                    <div class="score-item">
                        <strong>Taste:</strong> ${judgment.taste_score}/5 (${judgment.taste_score * 10} pts)
                    </div>
                    <div class="score-item">
                        <strong>Presentation:</strong> ${judgment.presentation_score}/5 (${judgment.presentation_score * 4} pts)
                    </div>
                    <div class="score-item">
                        <strong>Workmanship:</strong> ${judgment.workmanship_score}/5 (${judgment.workmanship_score * 3} pts)
                    </div>
                    <div class="score-item">
                        <strong>Creativity:</strong> ${judgment.creativity_score}/5 (${judgment.creativity_score * 3} pts)
                    </div>
                </div>
                <div class="total-score">
                    <strong>Total:</strong> ${totalScore}/100 points
                </div>
                ${judgment.notes ? `<div class="judgment-notes"><strong>Notes:</strong> ${judgment.notes}</div>` : ''}
                <div class="judgment-actions">
                    <button class="btn-secondary edit-judgment-btn" data-entry-id="${entry.id}">
                        Edit Scores
                    </button>
                    ${!isFavorite ? `
                        <button class="btn-primary mark-favorite-btn" data-entry-id="${entry.id}">
                            Mark as Favorite
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
    }

    renderJudgmentForm(entry, isFavorite) {
        return `
            <form class="judgment-form" data-entry-id="${entry.id}">
                <div class="scoring-grid">
                    <div class="score-input">
                        <label>Taste & Flavor (x10)</label>
                        <select name="taste_score" required>
                            <option value="">Select...</option>
                            <option value="1">1 - Poor</option>
                            <option value="2">2 - Not Great</option>
                            <option value="3">3 - Good</option>
                            <option value="4">4 - Very Good</option>
                            <option value="5">5 - Amazing</option>
                        </select>
                    </div>

                    <div class="score-input">
                        <label>Presentation (x4)</label>
                        <select name="presentation_score" required>
                            <option value="">Select...</option>
                            <option value="1">1 - Basic</option>
                            <option value="2">2 - Some Effort</option>
                            <option value="3">3 - Nice</option>
                            <option value="4">4 - Impressive</option>
                            <option value="5">5 - Wow Factor</option>
                        </select>
                    </div>

                    <div class="score-input">
                        <label>Workmanship (x3)</label>
                        <select name="workmanship_score" required>
                            <option value="">Select...</option>
                            <option value="1">1 - Poor</option>
                            <option value="2">2 - Needs Work</option>
                            <option value="3">3 - Good</option>
                            <option value="4">4 - Skilled</option>
                            <option value="5">5 - Perfect</option>
                        </select>
                    </div>

                    <div class="score-input">
                        <label>Creativity (x3)</label>
                        <select name="creativity_score" required>
                            <option value="">Select...</option>
                            <option value="1">1 - Basic</option>
                            <option value="2">2 - Slight Twist</option>
                            <option value="3">3 - Creative</option>
                            <option value="4">4 - Very Unique</option>
                            <option value="5">5 - Genius</option>
                        </select>
                    </div>
                </div>

                <div class="notes-input">
                    <label>Notes (optional)</label>
                    <textarea name="notes" rows="3" placeholder="Any additional feedback..."></textarea>
                </div>

                <div class="form-actions">
                    <button type="submit" class="btn-primary">
                        Submit Judgment
                    </button>
                    ${!isFavorite && this.myJudgments.size > 0 ? `
                        <button type="button" class="btn-secondary mark-favorite-btn" data-entry-id="${entry.id}">
                            Mark as Favorite
                        </button>
                    ` : ''}
                </div>

                <div class="error-message" style="display: none;"></div>
            </form>
        `;
    }

    attachEntryListeners() {
        // Form submissions
        document.querySelectorAll('.judgment-form').forEach(form => {
            form.addEventListener('submit', (e) => this.handleJudgmentSubmit(e));
        });

        // Edit buttons
        document.querySelectorAll('.edit-judgment-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.handleEditJudgment(e));
        });

        // Favorite buttons
        document.querySelectorAll('.mark-favorite-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.handleMarkFavorite(e));
        });
    }

    async handleJudgmentSubmit(e) {
        e.preventDefault();
        const form = e.target;
        const entryId = form.dataset.entryId;
        const submitBtn = form.querySelector('button[type="submit"]');
        const errorDiv = form.querySelector('.error-message');

        submitBtn.disabled = true;
        submitBtn.textContent = 'Saving...';
        errorDiv.style.display = 'none';

        try {
            const formData = new FormData(form);
            const judgmentData = {
                entry_id: entryId,
                judge_user_id: this.userId,
                taste_score: parseInt(formData.get('taste_score')),
                presentation_score: parseInt(formData.get('presentation_score')),
                workmanship_score: parseInt(formData.get('workmanship_score')),
                creativity_score: parseInt(formData.get('creativity_score')),
                notes: formData.get('notes')?.trim() || null
            };

            const existingJudgment = this.myJudgments.get(entryId);

            if (existingJudgment) {
                // Update existing judgment
                const { error } = await this.supabase
                    .from('cocktail_judgments')
                    .update(judgmentData)
                    .eq('id', existingJudgment.id);

                if (error) throw error;
            } else {
                // Create new judgment
                const { error } = await this.supabase
                    .from('cocktail_judgments')
                    .insert([judgmentData]);

                if (error) throw error;
            }

            // Reload data and re-render
            await this.loadMyJudgments();
            this.renderEntries();

        } catch (err) {
            console.error('Error saving judgment:', err);
            errorDiv.textContent = 'Failed to save judgment. Please try again.';
            errorDiv.style.display = 'block';
            submitBtn.disabled = false;
            submitBtn.textContent = 'Submit Judgment';
        }
    }

    async handleEditJudgment(e) {
        const entryId = e.target.dataset.entryId;
        const judgment = this.myJudgments.get(entryId);

        // Find the entry card and replace judgment view with form
        const entryCard = document.querySelector(`[data-entry-id="${entryId}"]`);
        const judgmentView = entryCard.querySelector('.judgment-view');

        const form = document.createElement('div');
        form.innerHTML = this.renderJudgmentForm(
            this.entries.find(e => e.id === entryId),
            this.myFavorite === entryId
        );

        // Pre-fill form with existing values
        const formElement = form.querySelector('form');
        formElement.querySelector('[name="taste_score"]').value = judgment.taste_score;
        formElement.querySelector('[name="presentation_score"]').value = judgment.presentation_score;
        formElement.querySelector('[name="workmanship_score"]').value = judgment.workmanship_score;
        formElement.querySelector('[name="creativity_score"]').value = judgment.creativity_score;
        if (judgment.notes) {
            formElement.querySelector('[name="notes"]').value = judgment.notes;
        }

        judgmentView.replaceWith(form.firstElementChild);

        // Re-attach listeners
        this.attachEntryListeners();
    }

    async handleMarkFavorite(e) {
        const entryId = e.target.dataset.entryId;
        const btn = e.target;

        btn.disabled = true;
        btn.textContent = 'Saving...';

        try {
            // Remove existing favorite if any
            if (this.myFavorite) {
                await this.supabase
                    .from('cocktail_favorites')
                    .delete()
                    .eq('judge_user_id', this.userId)
                    .eq('competition_id', this.activeCompetition.id);
            }

            // Add new favorite
            const { error } = await this.supabase
                .from('cocktail_favorites')
                .insert([{
                    competition_id: this.activeCompetition.id,
                    judge_user_id: this.userId,
                    entry_id: entryId
                }]);

            if (error) throw error;

            // Reload and re-render
            await this.loadMyFavorite();
            this.renderEntries();

        } catch (err) {
            console.error('Error marking favorite:', err);
            alert('Failed to mark as favorite. Please try again.');
            btn.disabled = false;
            btn.textContent = 'Mark as Favorite';
        }
    }

    showError(message) {
        document.getElementById('judgingStatus').innerHTML = `
            <div class="error-message">
                <p>${message}</p>
            </div>
        `;
    }
}

export { CocktailJudgingPage };
