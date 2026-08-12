# Lottery Project Memory

## Development Commands

### Starting the server

- `yarn start` - Starts the server WITH database backup (runs `prestart` hook)
- `yarn dev` - Starts the server WITHOUT database backup (for development)
- `yarn both` - Starts both backend and frontend with backup
- `yarn both:dev` - Starts both backend and frontend WITHOUT backup (for development)

### Testing frontend changes

The recommended workflow for testing frontend changes:
1. Make changes to frontend code in `front/src/`
2. Build: `cd front && yarn build`
3. Test via backend at `http://localhost:4001`

This is preferred over running the frontend dev server because:
- Single server to manage
- Matches production behavior
- No CORS/proxy configuration needed

### Other commands

- `yarn backup` - Manually run database backup
- `yarn test` - Run tests
- `yarn export_to_canvas` - Export lottery data to Canvas LMS

## Architecture

- Backend: Express.js server running on port 4001
- Frontend: React app in `front/` directory
- Database: MongoDB (local)

## Key Files

- `front/src/LotteryChart.js` - Local D3 visualization component (replaces Observable notebook)
- `front/src/LotteryResultsFromMongo.js` - Wrapper component for the chart
- `front/src/App.js` - Main application component
- `front/src/students.mjs` - Course and student configuration (gitignored for privacy). Data only — no logic, since it is not version-controlled
- `front/src/courses.mjs` - Course registry derived from students.mjs (tracked). Must not import files outside `front/src/`
- `db/backup.mjs` - Database backup script

## Browser Testing

Use Claude in Chrome (`mcp__claude-in-chrome__*`) to validate UI changes when it is
available. It runs in the real browser session, so it exercises the app the way it is
actually used.

Fall back to Playwright MCP when Claude in Chrome is unavailable or the task needs
scripted, repeatable automation — for example asserting on `localStorage`, driving the
same flow many times, or running without a visible browser.

Either way, validate against the backend at `http://localhost:4001` after
`cd front && yarn build` rather than the frontend dev server.
