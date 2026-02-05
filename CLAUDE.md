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
- `front/src/students.mjs` - Course and student configuration (gitignored for privacy)
- `db/backup.mjs` - Database backup script

## Browser Testing

Use Playwright MCP (not Claude in Chrome) for automated browser testing of this project. Playwright provides more reliable browser automation for testing the visualization and UI.
