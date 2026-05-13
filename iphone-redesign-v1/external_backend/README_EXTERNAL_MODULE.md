# External Backend Module

This backend is an external module outside the course curriculum, added only to support real multi-user persistence, authentication, and approval workflow.

It is intentionally small and separate from the frontend course scope.

## Why this backend exists

The Web Technologies course scope mainly focuses on frontend topics such as:
- HTML
- CSS
- forms
- tables
- JavaScript
- DOM scripting
- validation

True multi-user persistence and login handling need backend support. That is why this folder exists as a separate module.

## Technology choices

- Python
- FastAPI
- SQLite
- simple password hashing

No cloud platform, complex auth framework, Docker setup, or advanced infrastructure is introduced here.

## Environment handling

Environment handling is part of this external backend module and outside the core course curriculum.

The backend reads `APP_ENV` and uses one codebase for all three environments:

- `dev`
- `uat`
- `prod`

The selected SQLite file is:

- `external_backend/data/project-casa-elsbeth-dev.db`
- `external_backend/data/project-casa-elsbeth-uat.db`
- `external_backend/data/project-casa-elsbeth-prod.db`

## Safety note for seeding

- `seed.py` freely reseeds `dev` and `uat`
- `seed.py` refuses `prod` by default
- `prod` needs explicit confirmation and still refuses to overwrite existing live data

## Important limitation

Session tokens are stored in memory for simplicity. If the backend restarts, users must log in again.
