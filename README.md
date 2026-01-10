# PLH513 - Local Development with Docker

This repository contains a small microservices demo: `user-service`, `team-service`, `task-service` and a static `frontend`.

What I changed
- Converted services to persist data in MySQL (added `db/init.sql` with schema and default admin user).
- Updated `docker-compose.yml` to mount the DB init script and added a `frontend` nginx service.
- Added `Dockerfile`s for each Python service and installed `mysql-connector-python`.
- Modified service code to use MySQL (read/write) and added simple role-enforcement hooks.

Run the stack
1. Build and start everything:

```bash
docker compose up --build
```

2. After containers are up:
- Frontend: http://localhost:8000
- User service API: http://localhost:8080
- Team service API: http://localhost:8081
- Task service API: http://localhost:8082
- MySQL: 3306 (user: `pms`, password: `pms`, database: `pms`)

Notes and troubleshooting
- The MySQL init script `db/init.sql` creates tables and a default admin user (`username: admin`, `password: admin`). This only runs the first time the MySQL data directory is empty.
- The services include a small startup wait loop that retries connecting to the database for ~30s to reduce race conditions.
- Passwords are stored in plain text for now (kept simple for the demo). Do not use this in production.

Next steps I can take for you
- Re-apply or enhance role-based checks across services and frontend UI.
- Add API tests and/or Postman collection.
- Add Docker healthchecks and improved startup ordering.

If you'd like, I can now re-add role propagation in the frontend and tighten permission enforcement across endpoints.
