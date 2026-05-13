# Project Casa Elsbeth

Project Casa Elsbeth is a minimal house occupancy board. It shows which part of a house is occupied through booking requests and status changes such as requested, approved, rejected, and cancelled.

The project is split into two parts:

- a beginner-friendly frontend inside the Web Technologies course scope
- a very small external backend module outside the core course scope

## Project purpose

The goal is to provide a simple MVP for:

- viewing house-area bookings
- creating booking requests
- approving, rejecting, and cancelling requests
- demonstrating frontend topics from an introductory Web Technologies course

## What is inside the course scope

The frontend in `frontend/` stays close to the course material:

- HTML5
- CSS3
- semantic HTML
- forms
- tables
- IDs and classes
- CSS selectors
- responsive design
- vanilla JavaScript
- arrays
- objects
- functions
- control flow
- event handlers
- DOM scripting
- frontend validation
- optional small jQuery enhancement

## What is outside the course scope

The backend in `external_backend/` is intentionally separated because these topics are not the core focus of the course:

- multi-user authentication
- long-term persistence
- approval workflow protection
- environment-specific database handling

## Why authentication is needed

Authentication is needed because different users are allowed to do different actions:

- guests can only view public bookings
- normal users can create requests and cancel their own bookings
- admins can approve, reject, and cancel bookings

Without login, the app could not safely distinguish between these roles.

## Why SQLite is needed

SQLite keeps data between restarts with minimal setup. That matters because the board should remember:

- users
- house areas
- booking requests
- booking statuses

This is simpler than using a larger database system for an MVP.

## Environments

The same codebase supports three environments through the `APP_ENV` environment variable.

Allowed values:

- `dev`
- `uat`
- `prod`

### DEV

- used for development, unfinished work, and experiments
- may contain messy test data
- can be reseeded freely
- database file: `external_backend/data/project-casa-elsbeth-dev.db`

### UAT

- used for user acceptance testing before release
- should contain clean test data
- should behave almost like PROD
- database file: `external_backend/data/project-casa-elsbeth-uat.db`

### PROD

- used for real live data
- should be treated carefully
- must not be used for testing
- must not be reseeded accidentally
- database file: `external_backend/data/project-casa-elsbeth-prod.db`

## Why PROD must not be used for testing

Testing in PROD risks mixing real data with test requests, test users, and cancelled or rejected bookings that do not belong in live operation. That is why `dev` and `uat` exist.

## Project structure

```text
project-casa-elsbeth/
  frontend/
    index.html
    styles.css
    app.js
    jquery-enhancements.js
    README_FRONTEND_COURSE_SCOPE.md

  external_backend/
    config.py
    main.py
    database.py
    auth.py
    schema.sql
    seed.py
    requirements.txt
    README_EXTERNAL_MODULE.md
    data/

  README.md
```

## How to run the frontend only

Option 1:

- open `frontend/index.html` directly in the browser

Option 2:

1. Open a terminal in the project root.
2. Run `cd frontend`
3. Run `python3 -m http.server 8080`
4. Open `http://127.0.0.1:8080`

If the backend is not running, the frontend switches to a tiny mock dataset so the course frontend can still be demonstrated.

## How to run the backend

1. Open a terminal in `external_backend/`
2. Create a virtual environment:
   `python3 -m venv .venv`
3. Activate it:
   `source .venv/bin/activate`
4. Install dependencies:
   `pip install -r requirements.txt`
5. Choose an environment:
   `export APP_ENV=dev`
6. Seed data if needed:
   `python3 seed.py`
7. Start the API:
   `uvicorn main:app --reload`

The backend runs at `http://127.0.0.1:8000`.

If port `8000` is already in use on your machine, you can start the backend on another port such as `8010`:

```bash
uvicorn main:app --host 127.0.0.1 --port 8010
```

Then open the frontend with a matching query parameter:

```text
frontend/index.html?apiBaseUrl=http://127.0.0.1:8010
```

## How to start the backend in each environment

### DEV

```bash
cd external_backend
source .venv/bin/activate
export APP_ENV=dev
python3 seed.py
uvicorn main:app --reload
```

### UAT

```bash
cd external_backend
source .venv/bin/activate
export APP_ENV=uat
python3 seed.py
uvicorn main:app
```

### PROD

```bash
cd external_backend
source .venv/bin/activate
export APP_ENV=prod
uvicorn main:app
```

`seed.py` refuses `prod` by default. If someone intentionally needs demo seed data in an empty PROD database for a technical smoke test, they must run:

```bash
export APP_ENV=prod
python3 seed.py --confirm-prod
```

That should not be used for real live operation.

## How to seed DEV and UAT

### DEV

```bash
cd external_backend
export APP_ENV=dev
python3 seed.py
```

### UAT

```bash
cd external_backend
export APP_ENV=uat
python3 seed.py
```

`seed.py` resets and rebuilds the demo dataset for `dev` and `uat`, which is useful for clean demonstrations and repeated testing.

## Demo credentials

These are demo credentials only:

- `admin / admin123`
- `user1 / user123`
- `user2 / user123`

They are suitable for local development and course demonstrations only. They should not be used in real production operation.

## MVP features included

- public board with area, start, end, requested by, status, note, and actions
- simple house areas
- login for guest, user, and admin roles
- booking request form
- status handling for `requested`, `approved`, `rejected`, and `cancelled`
- approval and rejection by admin
- cancellation by admin or the booking owner
- frontend validation
- backend validation and authorisation checks
- SQLite storage
- fallback frontend mode if the backend is unavailable

## Limitations

- no real production-ready security model
- session tokens are stored only in memory
- no audit log yet
- no comments/history feature yet
- no notifications yet
- no recurring bookings yet
- table view only, no richer calendar view yet

## Future improvements

The structure is intentionally simple, but it leaves room for later features such as:

- approval chains
- request escalation
- event priorities
- comments and history
- audit log
- notifications
- recurring bookings
- visual redesign
- richer calendar views
