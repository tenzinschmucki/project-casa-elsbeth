# Frontend Course Scope

This frontend stays intentionally close to an introductory Web Technologies course.

## File-to-block mapping

### `index.html`
- Blocks 1-2: semantic HTML structure with `header`, `main`, `section`, `form`, `table`, and `footer`
- Blocks 4-5: login form, booking form, and booking table
- IDs and classes: used for styling and DOM access

### `styles.css`
- Blocks 1-3: CSS syntax, selectors, IDs, classes, spacing, borders, colours, and layout
- Block 3: responsive layout with media queries for smaller screens
- Status classes: `status-requested`, `status-approved`, `status-rejected`, `status-cancelled`

### `app.js`
- Block 5: JavaScript syntax and control flow with `if`, loops, and condition checks
- Block 6: functions, arrays, objects, event handlers, and DOM scripting
- Block 8: frontend validation and small data-processing steps before sending requests
- Fallback mode: if the backend is unavailable, a tiny mock dataset is shown so the frontend can still be demonstrated

### `jquery-enhancements.js`
- Block 7: optional small jQuery enhancement
- This file is safe to keep even if jQuery is not loaded
- If jQuery is added later, it provides a small fade-in effect for messages and row highlighting on hover

## Why the frontend is kept simple

- No framework is used, so students can read the HTML, CSS, and JavaScript directly
- Logic is split into small functions instead of advanced abstractions
- The UI uses classic course topics: forms, tables, selectors, responsive CSS, validation, and DOM updates

## What is intentionally not included

- No React, Vue, Angular, or TypeScript
- No frontend build tools
- No large calendar libraries
- No advanced state-management patterns
