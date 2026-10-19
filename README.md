# Driftboard — Personal Projects & Daily Routines

A personal Kanban board and calendar to organize projects, daily commitments, habits, and schedules. No paid services, account, npm installation, or API keys required.

**Live app:** https://jenozu-kanban.vercel.app

## Pages

- **Kanban:** `index.html` — four drag-and-drop task columns, projects, checklists, priorities, due dates, search, focus view, dark/light themes.
- **Calendar & routines:** `calendar.html` — day, week, and month views for fixed appointments and flexible tasks. Reach it from the main sidebar.
- **Calendar logic:** `calendar.js` — recurring events (daily, weekdays, chosen days), date/time scheduling, per-occurrence completion, starter routine template, and task linking.
- **Browser alerts:** `calendar-alerts.js` — checks for scheduled events with 5-minute reminders when you are viewing the main Kanban board.

## Getting started

Open the hosted app and select **Calendar & routines** from the sidebar. Click **New event** to schedule a block. Choose the date, times, repeat pattern, and whether it is a fixed commitment or flexible task.

You can also click **Load suggested routine**. This adds six editable examples: weekday work, daily room reset, exercise on Monday/Wednesday/Friday, nightly dinner, bedtime wind-down, and a weekly planning session.

- Select **Day** for today's agenda and mark blocks done as you complete them.
- Select **Week** to see all your classes/appointments at a glance.
- Select **Month** to plan farther ahead.
- On a date with outstanding Kanban due dates, click **Schedule** to time-block an existing task. Marking its calendar entry complete also marks the linked Kanban task done.

## Reminders: important limitation

Click **Enable 5-minute alerts** on the Calendar page and allow browser notification permission. Alerts are checked only **while a Driftboard browser tab is open**. Browser suspension and background throttling can delay or prevent those alerts. The site does **not** send notifications after all tabs are closed, and there is no push-notification server.

For reminders on your phone when the site is closed, click **Export calendar (.ics)**, import it into your preferred calendar app, and **verify** that the app imported its 5-minute event alarms and has permission to send notifications. Calendar providers vary in whether they preserve imported alarms. Export is a snapshot: changes made later in Driftboard do not automatically update the imported calendar, and re-importing may duplicate events.

## Data and backups

The app uses localStorage on each browser/origin:

- `driftboard-personal-v1`: projects, Kanban tasks and display theme.
- `driftboard-calendar-v1`: scheduled series and daily completion history.
- `driftboard-calendar-alerts-v1`: notification deduplication.

The main board's **Export your data** creates a JSON backup of **both Kanban and calendar**. Its **Import backup** restores calendar data when present. An older board-only JSON backup does not overwrite the existing calendar.

Data **does not synchronize** between phones, computers or browsers. It can be lost after clearing site data/private browsing. Export JSON backups regularly and keep them somewhere safe.

## Hosting and development

Static files only; deploy this repo root on Vercel (no framework/build command required). To add reliable closed-app push reminders and multi-device sync in future, use authentication, persistent backend storage, push subscriptions and a reminder scheduler.

Keyboard shortcuts in Kanban: `N` new task, `/` search, `Esc` close dialogs.
