# Brian's Birthday Challenge App

A gamified birthday celebration app where friends compete in challenges to earn points and climb the leaderboard.

## Overview

This is a web-based application built for a birthday party event. Users can:
- View and complete assigned challenges
- Compete in competitions with placement-based scoring
- Track progress on a live leaderboard
- Submit new challenge ideas for admin approval
- Leave messages in a guestbook

## Tech Stack

- **Frontend**: Vanilla JavaScript (ES6 modules), HTML5, CSS3
- **Backend**: Supabase (PostgreSQL database, real-time subscriptions)
- **Authentication**: Simple localStorage-based username system (no passwords)
- **Styling**: Custom "GeoCities-inspired" retro theme

## Architecture

### Component-Based Structure

The application uses a modular component architecture:

```
js/
├── app.js                    # Central AppState singleton for auth & state management
├── config.js                 # Supabase configuration
├── components/
│   ├── navigation.js         # <site-navigation> web component
│   └── challenge-card.js     # Reusable challenge card component
└── pages/
    ├── base-page.js          # Base class for page-specific logic
    └── dashboard.js          # Dashboard page controller
```

### Key Patterns

1. **AppState Singleton** (`app.js`):
   - Manages authentication state
   - Provides centralized Supabase client
   - Handles user profile loading
   - Implements pub/sub pattern for state changes
   - Initializes navigation automatically

2. **Web Components** (`components/`):
   - `<site-navigation>`: Header, nav tabs, sign out functionality
   - Encapsulated, reusable UI components
   - Self-contained styling and behavior

3. **Page Controllers** (`pages/`):
   - Extend `BasePage` class
   - Handle page-specific data fetching and rendering
   - Interact with AppState for user context

4. **Module Imports**:
   ```javascript
   import { appState } from './js/app.js';
   import { SiteNavigation } from './js/components/navigation.js';
   import { DashboardPage } from './js/pages/dashboard.js';
   ```

## Database Schema

### Core Tables

#### `users`
- `id` (UUID, primary key)
- `username` (text, unique)
- `display_name` (text)
- `created_at` (timestamp)

#### `challenges`
- `id` (text, primary key) - Format: `{type}-{number}` or `user-{timestamp}-{random}`
- `title` (text)
- `description` (text)
- `type` (text) - `'assigned'` or `'competition'`
- `points` (integer) - Points awarded for completion
- `brian_mode` (text, nullable) - `'vs'`, `'with'`, or null
- `success_metric` (text) - How success is measured (for user-submitted challenges)
- `created_by` (UUID, foreign key to users) - User who submitted the challenge
- `assigned_to` (UUID, nullable, foreign key to users) - Optional specific user assignment
- `approval_status` (text) - `'pending'`, `'approved'`, `'denied'`
- `approved_by` (UUID, nullable, foreign key to users) - Admin who reviewed
- `approved_at` (timestamp, nullable)
- `created_at` (timestamp)

#### `assignments`
- `id` (UUID, primary key)
- `user_id` (UUID, foreign key to users)
- `challenge_id` (text, foreign key to challenges)
- `status` (text) - `'pending'`, `'completed'`, `'failed'`
- `completed_at` (timestamp, nullable)
- `assigned_at` (timestamp)

#### `competition_placements`
- `id` (UUID, primary key)
- `user_id` (UUID, foreign key to users)
- `challenge_id` (text, foreign key to challenges)
- `place` (integer) - 1st, 2nd, 3rd, etc.
- `points` (integer) - Points awarded for this placement
- `completed_at` (timestamp)
- Unique constraint: `(user_id, challenge_id)`

#### `guestbook`
- `id` (UUID, primary key)
- `name` (text) - Display name of person leaving message
- `message` (text)
- `created_at` (timestamp)

### Challenge Types

1. **Assigned Challenges** (`type = 'assigned'`):
   - Traditional 1:1 challenges assigned to specific users
   - Fixed point value
   - Binary completion (complete/incomplete)
   - Created by admins or submitted by users (pending approval)

2. **Competition Challenges** (`type = 'competition'`):
   - Multiple users compete simultaneously
   - Placement-based scoring (1st place = most points)
   - Results stored in `competition_placements` table
   - Admin-created only

### Brian Mode

The `brian_mode` field indicates whether Brian (the birthday person) participates:
- `'vs'` - Brian competes against the user
- `'with'` - Brian collaborates with the user
- `null` - Brian is not involved

## Pages

### Public Pages
- `index.html` - Login page (username only, no password)
- `invitation.html` - Party invitation and RSVP guestbook

### Authenticated Pages
- `dashboard.html` - User's personal challenge dashboard
- `leaderboard.html` - Global leaderboard showing all users' scores
- `challenges-submit.html` - Submit new challenge ideas for admin approval

### Admin Pages (Future)
- Challenge approval interface
- Competition results entry
- User management

## Features

### Challenge Submission Flow

1. User clicks "ADD CHALLENGE" button on submission page
2. Modal opens with form fields:
   - Challenge Name (required)
   - Description (required)
   - Success Metric (required)
   - Assign To (optional, searchable by username)
3. Challenge submitted with `approval_status = 'pending'`
4. User can view their submission history with status badges
5. Admin reviews and approves/denies (future feature)
6. Approved challenges appear on dashboard for completion

### Scoring System

- **Assigned challenges**: Fixed point value per challenge
- **Competition challenges**: Placement-based (e.g., 1st = 100pts, 2nd = 75pts, 3rd = 50pts)
- **Leaderboard**: Sum of all points from both challenge types

## Authentication

Uses a simple localStorage-based system:
- Users enter a username (no password)
- Username stored in `localStorage.user_id`
- No encryption or session management
- Suitable for trusted, party-environment use case

**Note**: Row Level Security (RLS) is disabled on the challenges table due to localStorage auth not integrating with Supabase Auth (`auth.uid()` is always null).

## Styling

Custom CSS with a retro "GeoCities" aesthetic:
- Rainbow gradients and animations
- Flame dividers and marquee text
- Beveled buttons and borders
- Neon colors and star backgrounds
- Responsive design for mobile/desktop

Component-specific styles are scoped:
- `css/components/navigation.css` - Navigation component styles
- `css/geocities.css` - Global theme and utilities

## Development

### Local Setup

1. Clone the repository
2. Update `js/config.js` with your Supabase credentials:
   ```javascript
   export const SUPABASE_CONFIG = {
     url: 'YOUR_SUPABASE_URL',
     key: 'YOUR_SUPABASE_ANON_KEY'
   };
   ```
3. Run migrations in `migration-*.sql` files via Supabase SQL Editor
4. Serve with any static file server (e.g., `python -m http.server`)

### Database Migrations

Run SQL files in order:
1. `migration-challenge-submissions.sql` - Adds challenge submission fields
2. `migration-competition-placements.sql` - Adds competition tracking
3. `migration-guestbook.sql` - Adds guestbook table

### Adding New Pages

1. Create HTML file with standard structure
2. Create page controller in `js/pages/your-page.js` extending `BasePage`
3. Import and initialize in HTML:
   ```javascript
   import { appState } from './js/app.js';
   import { YourPage } from './js/pages/your-page.js';

   async function init() {
     const isAuthenticated = await appState.init();
     if (isAuthenticated) {
       const page = new YourPage();
       await page.init();
     }
   }
   init();
   ```
4. Add navigation link to `<site-navigation>` component

## Future Enhancements

- [ ] Admin dashboard for challenge approval
- [ ] Competition results entry interface
- [ ] Real-time leaderboard updates (Supabase subscriptions)
- [ ] Photo uploads for challenge proof
- [ ] Challenge categories/filtering
- [ ] User profiles with stats
- [ ] Push notifications for new challenges
- [ ] Export data/reports after party

## Security Notes

⚠️ **This app is designed for a private party environment**:
- No password authentication
- RLS disabled on challenges table
- Data accessible to all logged-in users
- Not suitable for public/production use

For a production app, implement proper authentication (Supabase Auth, OAuth) and enable RLS policies.

## License

Private project - not licensed for redistribution.