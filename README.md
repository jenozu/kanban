# Driftboard — Personal Projects & Daily Routines

A personal Kanban board and calendar to organize projects, daily commitments, habits, and schedules. No paid services, account, npm installation, or API keys required.

**Live app:** https://jenozu-kanban.vercel.app

## Pages

- **Kanban:** `index.html` — four drag-and-drop task columns, projects, checklists, priorities, due dates, search, focus view, dark/light themes.
- **Calendar & routines:** `calendar.html` — day, week, and month views for fixed appointments and flexible tasks. Reach it from the main sidebar.
- **Calendar logic:** `calendar.js` — recurring events (daily, weekdays, chosen days), date/time scheduling, per-occurrence completion, starter routine template, and task linking.
- **Calendar import:** `calendar-import.js` (`.ics` reader with recurring-event expansion) and `api/ics.js` (small Vercel function that fetches calendar feed URLs) power **Import from calendar** in the Kanban sidebar.
- **Browser alerts:** `calendar-alerts.js` — checks for scheduled events with 5-minute reminders when you are viewing the main Kanban board.

## Getting started

Open the hosted app and select **Calendar & routines** from the sidebar. Click **New event** to schedule a block. Choose the date, times, repeat pattern, and whether it is a fixed commitment or flexible task.

You can also click **Load suggested routine**. This adds six editable examples: weekday work, daily room reset, exercise on Monday/Wednesday/Friday, nightly dinner, bedtime wind-down, and a weekly planning session.

- Select **Day** for today's agenda and mark blocks done as you complete them.
- Select **Week** to see all your classes/appointments at a glance.
- Select **Month** to plan farther ahead.
- On a date with outstanding Kanban due dates, click **Schedule** to time-block an existing task. Marking its calendar entry complete also marks the linked Kanban task done.

## Adding calendar events to your board

Click **Import from calendar** at the bottom of the Kanban sidebar, then either:

- paste your calendar's private iCal address and press **Fetch** (Google Calendar: Settings → your calendar → *Secret address in iCal format*; Apple and Outlook offer a similar "subscribe/publish" link), or
- upload an `.ics` file exported from any calendar app.

Upcoming events (7–90 days) are listed by day. Tick the ones you want, choose a project and column, and they become tasks with the event date as the due date, the time and location in the description, and a `Calendar` tag. Nothing is added until you choose it, and repeating events (daily, weekly, monthly, yearly, with exceptions and moved/cancelled instances) are expanded into their individual dates.

Notes:

- Events already on the board, or added before, are hidden so re-syncing doesn't create duplicates. Use **Also show events already added** to see them.
- This is one-way: calendar to board. Editing or completing a task does not change your calendar.
- Rules such as "second Tuesday of every month" can't be expanded; only the first date of those events is considered and the dialog says so.
- Feed addresses are fetched through `/api/ics` because browsers block most calendar servers. The function only allows `https` addresses on public servers, caps responses at 2 MB, and stores nothing. Your feed address is saved only in this browser's localStorage. It is a secret link, so treat it like a password. It is not included in JSON backups.
- Fetching a feed only works on the hosted app (or `vercel dev`); uploading a file works anywhere.

## Reminders: important limitation

Click **Enable 5-minute alerts** on the Calendar page and allow browser notification permission. Alerts are checked only **while a Driftboard browser tab is open**. Browser suspension and background throttling can delay or prevent those alerts. The site does **not** send notifications after all tabs are closed, and there is no push-notification server.

For reminders on your phone when the site is closed, click **Export calendar (.ics)**, import it into your preferred calendar app, and **verify** that the app imported its 5-minute event alarms and has permission to send notifications. Calendar providers vary in whether they preserve imported alarms. Export is a snapshot: changes made later in Driftboard do not automatically update the imported calendar, and re-importing may duplicate events.

## Data and backups

The app uses localStorage on each browser/origin:

- `driftboard-personal-v1`: projects, Kanban tasks and display theme.
- `driftboard-calendar-v1`: scheduled series and daily completion history.
- `driftboard-calendar-alerts-v1`: notification deduplication.
- `driftboard-ics-v1`: saved calendar feed address and the events already imported.

The main board's **Export your data** creates a JSON backup of **both Kanban and calendar**. Its **Import backup** restores calendar data when present. An older board-only JSON backup does not overwrite the existing calendar.

Data **does not synchronize** between phones, computers or browsers. It can be lost after clearing site data/private browsing. Export JSON backups regularly and keep them somewhere safe.

## Hosting and development

Static files plus one serverless function (`api/ics.js`, used only for feed-URL import); deploy this repo root on Vercel (no framework/build command required, no environment variables or API keys). Run `TZ=America/Toronto node tests/ics.test.js` to test the calendar reader. To add reliable closed-app push reminders and multi-device sync in future, use authentication, persistent backend storage, push subscriptions and a reminder scheduler.

Keyboard shortcuts in Kanban: `N` new task, `/` search, `Esc` close dialogs.
