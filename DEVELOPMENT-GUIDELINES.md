# DEVELOPMENT GUIDELINES - Birthday Challenge Zone

## 🎯 PROJECT OVERVIEW
Vintage GeoCities-style birthday challenge web application with retro aesthetic and modern functionality.

## 📋 CORE RULES & STANDARDS

### 1. AESTHETIC & DESIGN RULES
- **NO MODERN EMOJIS** - Use text-based alternatives, available gifs, or ask to source a vintage gif(provide short description)
- **Vintage GeoCities Style** - Maintain early web aesthetic
- **Classic HTML Elements** - Classic HTML elements preferred but err on the side of semantics/best practice when you can. (i.e. bare bones html styling good, but use the right html tags)
- **Retro Color Schemes** - Use period-appropriate color palettes
- **Text-based Decorations** - Use gifs, ASCII art, brackets, or asterisks instead of emoji icons

### 2. CODE STRUCTURE RULES
- **ES6 Modules** - Use `import/export` syntax for JavaScript
- **Absolute Paths** - Always use absolute file paths in tools
- **Config Management** - Sensitive data in `js/config.js` (gitignored)
- **File Organization** - Keep logical folder structure (`css/`, `js/`, `images/`)

### 3. DATABASE & BACKEND
- **Supabase Integration** - Use public keys, not anon keys
- **Environment Detection** - Automatic dev/prod switching based on hostname
- **Error Handling** - Always include fallbacks for database failures

### 4. CONTENT GUIDELINES
- **No AI-sounding Language** - Avoid overly polished or corporate tone
- **Vintage Slang** - Use period-appropriate expressions
- **Enthusiastic Caps** - ALL CAPS for excitement (vintage style)
- **Text Emoticons** - :) :D :P instead of emojis

### 5. TECHNICAL STANDARDS
- **Semantic HTML** - Use proper HTML5 structure
- **Progressive Enhancement** - Site works without JavaScript
- **Local Storage Fallbacks** - Backup for database failures
- **Cross-browser Support** - Test on multiple browsers

### 6. FILE NAMING & STRUCTURE
```
/css/           - Stylesheets
/js/            - JavaScript files (config.js is gitignored)
/images/        - All media assets
/*.html         - Main pages (index, dashboard, invitation, leaderboard)
```

### 7. GIT & VERSION CONTROL
- **Ignore Sensitive Files** - config.js, API keys, credentials
- **Descriptive Commits** - Clear commit messages
- **Feature Branches** - For major changes

### 8. PERFORMANCE RULES
- **Minimize HTTP Requests** - Combine files where possible
- **Optimize Images** - Compress assets appropriately
- **CDN for Libraries** - Use external CDNs for frameworks

### 9. SECURITY GUIDELINES
- **Environment Variables** - Separate dev/prod credentials
- **Input Validation** - Sanitize all user inputs
- **HTTPS Only** - Force secure connections in production

### 10. TESTING & DEPLOYMENT
- **Local Testing** - Always test on localhost first
- **Cross-device Testing** - Verify mobile/desktop compatibility
- **Database Connection Tests** - Verify both dev and prod environments

## 🚫 THINGS TO AVOID
- Modern emoji usage
- Corporate/AI-sounding language
- Over-complicated animations
- Heavy frameworks (keep it simple)
- Non-semantic HTML
- Inline styles (use CSS files)

## ✅ PREFERRED APPROACHES
- Text-based decorations
- Vintage styling techniques
- Simple, clean code
- Semantic HTML structure
- External CSS/JS files
- Progressive enhancement

## 📖 REFERENCE DOCUMENTS
- `README.md` - Project overview and setup
- `.gitignore` - Files to exclude from version control

## 🔄 MAINTENANCE
- Review guidelines monthly
- Update when new patterns emerge
- Document all major decisions
- Keep vintage aesthetic consistent

---
**Last Updated:** January 27, 2026
**Version:** 1.0
**Maintainer:** Development Team