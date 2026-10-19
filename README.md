# Driftboard — Personal Projects

A private, standalone Kanban board for tracking multiple personal projects. Built as a single HTML file: no account, database, npm install, API key, or paid service required.

## Start

Open `index.html` in Chrome, Edge, Firefox, or Safari. Or host this folder on any static hosting provider such as Vercel, GitHub Pages, or Netlify.

## Features

- Drag tasks between Backlog, In progress, Review, and Done; reorder within columns.
- Add, edit, star, and delete tasks and projects.
- Due dates, priorities, searchable tags, and checklists.
- Project overview, focused tasks, and completed tasks.
- Board and list views; project and priority filters; task search.
- Dark / light themes; keyboard shortcuts: `N` for new task, `/` to search, `Esc` to close a dialog.
- Local browser saving, JSON export, and JSON import.
- Responsive layout for desktop, tablet, and phone.

## Important: data storage

Your data is stored in **the browser's localStorage on this device and origin**. It does *not* automatically synchronize across devices or between a local file and a hosted website. Data can disappear if you clear site data or use private browsing. Use **Export your data** regularly, then **Import backup** to restore or move to another device/browser.

The initial tasks are illustrative starter examples and can be edited/deleted.

## Hosting

For Vercel, create a new project and deploy this directory as a static site (no framework or build command needed). To synchronize tasks across devices, add authentication and a real database in a later version.