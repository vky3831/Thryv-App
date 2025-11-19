Visit for Demo: https://vky3831.github.io/MediCycle/

MediCycle — Medicine Reminder (Local-only webapp)
Files:
- index.html
- css/style.css
- js/app.js

Features implemented:
- Multiple profiles with passkey protection (prompt on open).
- Create/Edit/Delete medicine routines (daily / monthly / weekly).
- "Today" tab shows only medicines scheduled for today; you can mark them as taken.
- History tab shows taken records per profile.
- Export / Import JSON (local file).
- Dark / Light theme toggle (persisted).
- Browser notifications (requests permission once).
- All data stored in browser localStorage, no backend.

How to use:
1. Open index.html in a browser (supports mobile & desktop).
2. Create a profile (name, age, passkey).
3. Add medicines and schedules.
4. Use Export to backup, Import to restore (replaces current data).
