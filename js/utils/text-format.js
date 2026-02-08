/**
 * Text formatting utilities for challenge descriptions
 */

/**
 * Format text and escape it safely while preserving structure
 * Converts newlines to <br> and multiple spaces to &nbsp;
 * @param {string} text - Plain text input
 * @returns {string} Safe HTML-formatted text with entities
 */
export function formatAndEscapeText(text) {
  if (!text) return '';
  
  return text
    // 1. First escape dangerous characters
    .split('&').join('&amp;')
    .split('<').join('&lt;')
    .split('>').join('&gt;')
    .split('"').join('&quot;')
    // 2. Then replace newlines with <br> (safe HTML)
    .replace(/\n/g, '<br>')
    // 3. Then replace multiple spaces with &nbsp; entities
    .replace(/  +/g, (spaces) => '&nbsp;'.repeat(spaces.length - 1) + ' ');
}

/**
 * Escape HTML special characters to prevent XSS
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
export function escapeHTML(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
