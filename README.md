# GigConnect Full-Stack Prototype

This package adds a real backend/database to the uploaded GigConnect prototype.

## Stack
- Frontend: HTML/CSS/JavaScript
- Backend: Node.js + Express
- Database: SQLite
- API: REST

## Run locally

1. Install Node.js.
2. Open this folder in Terminal.
3. Run:

```bash
npm install
npm start
```

4. Open http://localhost:3000

The database is created automatically at `data/gigconnect.db`.

## Working database features

- GET `/api/jobs`
- GET `/api/jobs?q=python`
- POST `/api/jobs`
- POST `/api/applications`
- GET `/api/applications`
- GET `/api/stats`
- GET `/api/health`

The frontend now loads jobs from the backend and stores newly posted jobs and applications in SQLite.

## Important for public deployment

For a public website, deploy this Node.js application to a server host and use a persistent database such as PostgreSQL. Do not use the local SQLite database as the production database on ephemeral hosting.
