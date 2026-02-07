/**
 * FavoriteButton - Reusable favorite toggle button component
 * Supports both icon-only (⭐/☆) and button with text styles
 */

class FavoriteButton {
    /**
     * Create a favorite button element
     * @param {Object} options - Configuration options
     * @param {string} options.entryId - ID of the entry
     * @param {boolean} options.isFavorite - Whether this entry is currently favorited
     * @param {string} options.style - 'icon' or 'button' (default: 'icon')
     * @param {Function} options.onClick - Optional click handler
     * @returns {HTMLButtonElement}
     */
    static create({ entryId, isFavorite = false, style = 'icon', onClick = null }) {
        const button = document.createElement('button');
        
        if (style === 'icon') {
            // Icon-only style (for compact cards)
            button.className = `btn-favorite-icon ${isFavorite ? 'is-favorite' : ''}`;
            button.textContent = isFavorite ? '⭐' : '☆';
            button.title = isFavorite ? 'Your favorite!' : 'Mark as favorite';
        } else if (style === 'icon-with-text') {
            // Icon with text style (for judgment forms)
            button.className = `btn-favorite-icon ${isFavorite ? 'is-favorite' : ''}`;
            button.innerHTML = `${isFavorite ? '⭐' : '☆'} <span style="margin-left: 0.25rem;">${isFavorite ? 'Unfavorite' : 'Favorite'}</span>`;
            button.title = isFavorite ? 'Remove as favorite' : 'Mark as favorite';
        } else if (style === 'button') {
            // Button with text style (for forms)
            button.className = `btn-secondary mark-favorite-btn`;
            button.innerHTML = isFavorite ? '⭐ Your Favorite' : '☆ Mark as Favorite';
        }
        
        button.dataset.action = 'toggle-favorite';
        button.dataset.entryId = entryId;
        button.dataset.sound = isFavorite ? 'unfavorite' : 'favorite';
        button.setAttribute('aria-label', isFavorite ? 'Your favorite!' : 'Mark as favorite');
        
        if (onClick) {
            button.addEventListener('click', onClick);
        }
        
        return button;
    }

    /**
     * Update an existing button's favorite state
     * @param {HTMLButtonElement} button - The button element to update
     * @param {boolean} isFavorite - New favorite state
     */
    static update(button, isFavorite) {
        const isIconStyle = button.classList.contains('btn-favorite-icon');
        const hasTextSpan = button.querySelector('span');
        
        if (isIconStyle && hasTextSpan) {
            // Icon with text style
            button.innerHTML = `${isFavorite ? '⭐' : '☆'} <span style="margin-left: 0.25rem;">${isFavorite ? 'Unfavorite' : 'Favorite'}</span>`;
            button.classList.toggle('is-favorite', isFavorite);
            button.title = isFavorite ? 'Remove as favorite' : 'Mark as favorite';
        } else if (isIconStyle) {
            // Icon only style
            button.textContent = isFavorite ? '⭐' : '☆';
            button.classList.toggle('is-favorite', isFavorite);
            button.title = isFavorite ? 'Your favorite!' : 'Mark as favorite';
        } else {
            // Button style
            button.innerHTML = isFavorite ? '⭐ Your Favorite' : '☆ Mark as Favorite';
        }
        
        button.dataset.sound = isFavorite ? 'unfavorite' : 'favorite';
        button.setAttribute('aria-label', isFavorite ? 'Your favorite!' : 'Mark as favorite');
    }

    /**
     * Create a favorite button HTML string (for template literals)
     * @param {Object} options - Configuration options
     * @returns {string} HTML string
     */
    static toHTML({ entryId, isFavorite = false, style = 'icon' }) {
        if (style === 'icon') {
            return `
                <button class="btn-favorite-icon ${isFavorite ? 'is-favorite' : ''}" 
                        data-action="toggle-favorite"
                        data-entry-id="${entryId}"
                        data-sound="${isFavorite ? 'unfavorite' : 'favorite'}"
                        title="${isFavorite ? 'Your favorite!' : 'Mark as favorite'}"
                        aria-label="${isFavorite ? 'Your favorite!' : 'Mark as favorite'}">
                    ${isFavorite ? '⭐' : '☆'}
                </button>
            `;
        } else if (style === 'icon-with-text') {
            return `
                <button class="btn-favorite-icon ${isFavorite ? 'is-favorite' : ''}" 
                        data-action="toggle-favorite"
                        data-entry-id="${entryId}"
                        data-sound="${isFavorite ? 'unfavorite' : 'favorite'}"
                        title="${isFavorite ? 'Remove as favorite' : 'Mark as favorite'}"
                        aria-label="${isFavorite ? 'Remove as favorite' : 'Mark as favorite'}">
                    ${isFavorite ? '⭐' : '☆'} <span style="margin-left: 0.25rem;">${isFavorite ? 'Unfavorite' : 'Favorite'}</span>
                </button>
            `;
        } else if (style === 'button') {
            return `
                <button type="button" class="btn-secondary mark-favorite-btn" 
                        data-action="toggle-favorite"
                        data-entry-id="${entryId}"
                        data-sound="${isFavorite ? 'unfavorite' : 'favorite'}"
                        aria-label="${isFavorite ? 'Your favorite!' : 'Mark as favorite'}">
                    ${isFavorite ? '⭐ Your Favorite' : '☆ Mark as Favorite'}
                </button>
            `;
        }
    }
}

export { FavoriteButton };
