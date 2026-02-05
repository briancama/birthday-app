# GitHub Copilot Instructions

## Project Overview
Birthday Challenge Zone - A retro GeoCities-style weekend event app with progressive challenge unlocking, Brian-mode competitions, and live scoreboards. Built with vanilla HTML/CSS/JS frontend and Supabase backend.

## Architecture Pattern

### Core Application State
- **Global State**: `js/app.js` exports singleton `appState` managing Supabase client, user auth, and state subscriptions
- **Page Classes**: Inherit from `BasePage` (`js/pages/base-page.js`) for consistent initialization and Supabase access
- **Components**: Functional classes like `ChallengeCard` and Web Components like `SiteNavigation`
- **Module System**: ES6 modules with absolute imports from workspace root

### Authentication Flow
Username-only auth (no passwords) stored in localStorage:
```javascript
// Check auth in any page
this.userId = appState.getUserId(); // from localStorage
this.currentUser = appState.getCurrentUser(); // loaded from Supabase
```

### Database Integration
- **Supabase Client**: Single instance via `appState.getSupabase()`
- **Environment Switching**: Automatic dev/prod config in `js/config.js` based on hostname
- **Key Tables**: users, challenges, assignments, competition_placements, cocktail_competitions, cocktail_entries, cocktail_votes
- **View**: scoreboard (aggregates points from assignments + competitions)
- **SQL Documentation Rule**: **CRITICAL** - All database schema changes, migrations, and RLS policies MUST be documented in `/sql/` folder before implementation. Every table creation, policy addition, or schema modification requires a corresponding SQL file for version control and environment replication.

## Development Conventions

### GeoCities Aesthetic Requirements
- **NO MODERN EMOJIS FOR DECORATION**: Emojis are acceptable in buttons/interactive elements for functional purposes, but avoid using them as decorative content elements. Prioritize retro gifs that can be found in our /images folder or use retro text emojis or ASCII art
- **CSS Variables**: All colors/spacing in `:root` of `css/geocities.css`
- **Retro Elements**: Marquees, flame dividers, rainbow text, construction gifs
- **File Structure**: `/css/`, `/js/`, `/images/` organization

### JavaScript Patterns
- **Component State**: Pass state objects to component methods, don't store in component instances
- **Event Handling**: Components use callback pattern - `setOnReveal()`, `setOnComplete()`
- **Loading States**: Use `setLoadingState(elementId, isLoading)` from BasePage
- **Error Handling**: Always include try/catch with user-friendly error display

### Challenge System Architecture
- **Progressive Unlock**: Users can only see/complete challenges in sequence
- **Brian Mode**: Special challenges tagged 'vs' or 'with' that auto-assign to 'brianc' user
- **Reveal Mechanic**: Titles show as "Challenge N" until clicked/completed
- **Competition vs Assigned**: Two different challenge types with different scoring

## Key Files & Their Roles

### Entry Points
- [`index.html`](index.html) - Login page with username-only auth
- [`dashboard.html`](dashboard.html) - Main user interface, loads `DashboardPage`
- [`leaderboard.html`](leaderboard.html) - Scoreboard display

### Core JavaScript
- [`js/app.js`](js/app.js) - Global state manager, Supabase client, user auth
- [`js/config.js`](js/config.js) - **GITIGNORED** Supabase credentials with env detection
- [`js/pages/base-page.js`](js/pages/base-page.js) - Base class for all pages with common utilities
- [`js/components/navigation.js`](js/components/navigation.js) - Web Component for site navigation

### Development Workflow
1. **Local Server**: `python3 -m http.server 8000` (add as `serve` alias)
2. **Config Setup**: Copy and modify `js/config.js` with your Supabase credentials
3. **Supabase Setup**: Run SQL from project docs to initialize database schema
4. **File Editing**: Use absolute paths from workspace root in all imports

## Brian Mode Challenge Pattern
When completing challenges marked with `brian_mode: 'vs'` or `brian_mode: 'with'`:
```javascript
// Auto-create assignment for brianc user with inverse outcome (vs) or same outcome (with)
const brianOutcome = brianMode === 'vs' ? (outcome === 'success' ? 'failure' : 'success') : outcome;
```

## Event System Architecture (Modern Implementation)

## Component Patterns & Lifecycle

### Two Component Architectures
1. **Functional Components**: (`ChallengeCard`) - EventTarget-based factories
   - Extend EventTarget for native event emission
   - Stateless - receive state objects via `create(state)` method  
   - Event handling via `addEventListener('reveal', handler)`
   
2. **Web Components**: (`SiteNavigation`) - Custom elements extending HTMLElement
   - Use `connectedCallback()` for initialization
   - Subscribe to appState: `appState.on('user:loaded', handler)`
   - Clean up in `disconnectedCallback()` with stored cleanup functions

### Modern Component Lifecycle Pattern
```javascript
// Functional components (ChallengeCard) - EventTarget pattern
class ChallengeCard extends EventTarget {
  constructor() { 
    super(); // EventTarget capabilities
    Object.assign(this, EventTarget.prototype);
    EventTarget.call(this);
  }
  addEventListeners(element, state) {
    element.addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('reveal', { detail: { assignmentId } }));
    });
  }
}

// Web components (SiteNavigation) - Modern event subscription
connectedCallback() -> setupEventListeners() -> render() -> store cleanup functions
setupEventListeners() -> appState.on('user:loaded', handler) -> store cleanup
disconnectedCallback() -> this.eventCleanup.forEach(cleanup => cleanup())
```

### State Management Rules
- **No Internal State**: Components don't store state, always receive it as parameters
- **Event System**: Modern EventTarget-based communication via `EventBus.instance`
- **AppState Events**: `appState.on('user:loaded', handler)` for user lifecycle
- **Component Events**: Direct event listeners on component instances
- **Global Events**: `EventBus.EVENTS.CHALLENGE.COMPLETE` for cross-component coordination
- **Legacy Support**: Old `.subscribe()` pattern still works with deprecation warnings

### Event Debugging
- **Development Tools**: `debugEvents()` in console shows event history
- **Event Logging**: All events logged in development environment
- **Error Boundaries**: Components emit error events for centralized handling
### Event Handling Best Practices
- **Immediate UI Feedback**: Disable buttons before async operations
- **Error Recovery**: Reset UI state on errors, allow retry
- **Global + Local Events**: Use both component events and EventBus as needed
- **Immediate UI Feedback**: Disable buttons, show "Processing..." before async operations
- **Error Recovery**: Reset button state on failure, allow retry
- **Event Cleanup**: All components track and clean up event listeners on destroy
- **Rich Context**: Events include DOM elements, original data, and action context

### Migration Status
- **Backward Compatibility**: Legacy callbacks still work but show deprecation warnings
- **Event + Callback**: During transition, both patterns work simultaneously
- **Modern Preferred**: New code should use event listeners exclusively

### Two Component Architectures
1. **Functional Components**: (`ChallengeCard`) - Class-based factories that create DOM elements
   - No inheritance from HTMLElement
   - Stateless - receive state objects via `create(state)` method
   - Event handling via callback pattern: `setOnReveal()`, `setOnComplete()`
   
2. **Web Components**: (`SiteNavigation`) - Custom elements extending HTMLElement
   - Use `connectedCallback()` for initialization
   - Subscribe to global state: `appState.subscribe()`
   - Clean up in `disconnectedCallback()`

### Component Lifecycle Pattern
```javascript
// Functional components (ChallengeCard)
const card = new ChallengeCard(assignment, index, options)
  .setOnReveal(callback)
  .setOnComplete(callback);
const element = card.create(state); // Pure function, no side effects

// Web components (SiteNavigation)
connectedCallback() -> render() -> addEventListeners() -> subscribe to appState
```

### State Management Rules
- **No Internal State**: Components don't store state, always receive it as parameters
- **Complete Re-renders**: Components replace entire innerHTML then re-attach listeners
- **State Objects**: Pass complete state objects to avoid prop drilling:
  ```javascript
  const state = { isCompleted, outcome, brianMode, isRevealed, canReveal, isLocked };
  ```

### Event Handling Patterns
- **Callback Registration**: Components accept callbacks during setup
- **Event Delegation**: Use `addEventListener` after each render
- **Cleanup**: Always remove listeners in disconnectedCallback or cleanup methods

## Component Communication
- **Global State**: `appState.subscribe(callback)` for cross-component communication
- **Parent-Child**: Pass callbacks down, call them up (no direct child->parent refs)
- **Sibling Communication**: Through shared parent state updates
- **Page Lifecycle**: Pages manage component state and coordinate updates

## Suggested Improvements

### 1. Event System Enhancement
Replace callback pattern with custom events for better decoupling and debugging.

**Current Callback Pattern Issues:**
```javascript
// Current: Tight coupling, hard to debug, single listener
const card = new ChallengeCard(assignment, index, options)
  .setOnReveal(callback)
  .setOnComplete(callback);
```

**Proposed Custom Event System:**
```javascript
// Enhanced: Decoupled, multiple listeners, better debugging
class ChallengeCard extends EventTarget {
  create(state) {
    const element = document.createElement('div');
    // ... render logic
    this.addEventListeners(element, state);
    return element;
  }

  addEventListeners(element, state) {
    if (canReveal) {
      element.addEventListener('click', () => {
        this.dispatchEvent(new CustomEvent('reveal', {
          detail: { 
            assignmentId: this.assignment.id,
            challengeId: this.assignment.challenges.id,
            element: element 
          }
        }));
      });
    }

    element.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.dispatchEvent(new CustomEvent('complete', {
          detail: {
            assignmentId: this.assignment.id,
            challengeId: this.assignment.challenges.id,
            outcome: btn.dataset.outcome,
            brianMode: this.assignment.challenges.brian_mode,
            element: element,
            button: btn
          }
        }));
      });
    });
  }
}

// Usage in dashboard:
const card = new ChallengeCard(assignment, index, options);
card.addEventListener('reveal', (e) => {
  const { assignmentId, element } = e.detail;
  this.revealedChallengeId = assignmentId;
  this.loadChallenges();
});

card.addEventListener('complete', async (e) => {
  const { assignmentId, challengeId, outcome, brianMode, button } = e.detail;
  button.disabled = true; // Immediate UI feedback
  try {
    await this.markChallengeComplete(assignmentId, challengeId, outcome, brianMode);
    this.revealedChallengeId = null;
    await Promise.all([this.loadChallenges(), this.loadPersonalStats()]);
  } catch (err) {
    button.disabled = false;
    this.showError('Failed to mark complete: ' + err.message);
  }
});
```

**Event Error Handling & Debugging:**
```javascript
// Enhanced error handling with events
class DashboardPage extends BasePage {
  async onReady() {
    // Set up error boundaries for events
    this.addEventListener('error', this.handleComponentError.bind(this));
    
    // Challenge event listeners with error handling
    document.addEventListener('challenge:complete', async (e) => {
      const { assignmentId, challengeId, outcome, brianMode, button } = e.detail;
      
      try {
        button.disabled = true;
        button.textContent = 'Processing...';
        
        await this.markChallengeComplete(assignmentId, challengeId, outcome, brianMode);
        
        // Success feedback
        this.dispatchEvent(new CustomEvent('challenge:completed-success', {
          detail: { assignmentId, outcome }
        }));
        
      } catch (error) {
        // Error feedback with recovery
        button.disabled = false;
        button.textContent = button.dataset.originalText || 'RETRY';
        
        this.dispatchEvent(new CustomEvent('challenge:completed-error', {
          detail: { assignmentId, error: error.message }
        }));
      }
    });
  }
  
  handleComponentError(e) {
    console.error('Component Error:', e.detail);
    this.showError(`Something went wrong: ${e.detail.message}`);
    
    // Optional: Send to analytics/logging service
    // Analytics.track('component-error', e.detail);
  }
}

// Development event debugging
if (process.env.NODE_ENV === 'development') {
  // Log all events for debugging
  document.addEventListener('*', (e) => {
    if (e.type.includes(':')) {
      console.log(`🎯 Event: ${e.type}`, e.detail);
    }
  });
  
  // Event listener audit
  window.debugEvents = () => {
    console.table(getEventListeners(document));
  };
}
```

**Migration Strategy from Callbacks:**
```javascript
// 1. Add EventTarget mixin to existing components
class ChallengeCard {
  constructor(assignment, index, options = {}) {
    // Add event capabilities
    Object.assign(this, EventTarget.prototype);
    EventTarget.call(this);
    
    // Keep existing callback properties for backward compatibility
    this.onReveal = null;
    this.onComplete = null;
  }
  
  // 2. Emit events AND call callbacks during transition
  addEventListeners(card, state) {
    if (!isCompleted && canReveal && !isRevealed) {
      card.addEventListener('click', () => {
        // New: Emit event
        this.dispatchEvent(new CustomEvent('reveal', {
          detail: { assignmentId: this.assignment.id }
        }));
        
        // Legacy: Still call callback for compatibility
        this.onReveal?.(this.assignment.id);
      });
    }
  }
  
  // 3. Gradually migrate pages to use events
  // Keep setOnReveal for backward compatibility but mark deprecated
  setOnReveal(callback) {
    console.warn('setOnReveal is deprecated, use addEventListener("reveal", handler)');
    this.onReveal = callback;
    return this;
  }
}
```
```javascript
// js/events/event-bus.js - Global event coordinator
class EventBus extends EventTarget {
  static instance = new EventBus();
  
  // Typed event dispatching with validation
  emit(eventType, detail) {
    console.log(`🎯 Event: ${eventType}`, detail);
    this.dispatchEvent(new CustomEvent(eventType, { detail }));
  }
  
  // Namespaced event types for organization
  static EVENTS = {
    CHALLENGE: {
      REVEAL: 'challenge:reveal',
      COMPLETE: 'challenge:complete',
      UPDATED: 'challenge:updated'
    },
    USER: {
      LOADED: 'user:loaded',
      STATS_UPDATED: 'user:stats-updated'
    },
    NAVIGATION: {
      PAGE_CHANGE: 'nav:page-change'
    }
  };
}

// Usage in components:
import { EventBus } from '../events/event-bus.js';

// In ChallengeCard:
this.dispatchEvent(new CustomEvent('complete', { detail, bubbles: true }));
// Or global: EventBus.instance.emit(EventBus.EVENTS.CHALLENGE.COMPLETE, detail);

// In DashboardPage:
EventBus.instance.addEventListener(EventBus.EVENTS.CHALLENGE.COMPLETE, (e) => {
  this.handleChallengeComplete(e.detail);
});
```

**Event-Driven State Updates:**
```javascript
// AppState becomes event-driven
class AppState extends EventTarget {
  async loadUserProfile() {
    try {
      const userData = await this.supabase.from('users')...;
      this.currentUser = userData;
      
      // Emit instead of direct subscriber calls
      this.dispatchEvent(new CustomEvent('user:loaded', { 
        detail: this.currentUser 
      }));
    } catch (error) {
      this.dispatchEvent(new CustomEvent('user:error', { 
        detail: { error, action: 'loadProfile' } 
      }));
    }
  }
}

// Components listen directly to AppState
// js/components/navigation.js
connectedCallback() {
  appState.addEventListener('user:loaded', (e) => {
    this.setCurrentUser(e.detail);
  });
  
  appState.addEventListener('user:error', (e) => {
    console.error('User error:', e.detail.error);
    if (e.detail.action === 'loadProfile') {
      this.showAuthError();
    }
  });
}
```

### 2. State Normalization
Introduce state shape validation and normalization:
```javascript
// Add to BasePage or utility
validateComponentState(state, requiredKeys) {
  return requiredKeys.every(key => state.hasOwnProperty(key));
}
```

### 3. Component Registry
Create component factory for consistent initialization:
```javascript
// js/components/registry.js
export const createComponent = (type, props, options) => {
  const constructors = { ChallengeCard, SiteNavigation };
  return new constructors[type](props, options);
}
```

### 4. Lifecycle Management
Add proper cleanup tracking in BasePage:
```javascript
addComponent(component) {
  this.components = this.components || [];
  this.components.push(component);
}
cleanup() {
  this.components?.forEach(c => c.cleanup?.());
}
```

## CSS Architecture
- **Layer System**: `@layer reset, base, containers, components, utilities`
- **Utility Classes**: `.rainbow-text`, `.construction-gif`, `.flame-divider`
- **Component CSS**: Separate files in `css/components/` for reusable components
- **Responsive**: Mobile-first with hamburger navigation

## Common Gotchas
- Always use absolute file paths in tools - workspace is `/Users/brian.cama/Projects/birthday-app/`
- `js/config.js` is gitignored - create from examples in README
- Components re-render completely - re-attach event listeners after innerHTML changes
- Brian mode logic: 'vs' = inverse outcome, 'with' = same outcome for brianc user
- Progressive challenge reveal: only current incomplete challenge can be revealed