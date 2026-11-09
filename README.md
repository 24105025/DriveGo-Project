# DriveGo

🌐 **Live Website:** [https://drivego.hub.vercel.app](https://drivego.hub.vercel.app)

---

## Overview

DriveGo is a centralized platform where organizations and organizers publish donation drives, and donors discover, verify, and support causes. DriveGo connects communities with verified donation campaigns by organizing drives across categories, providing community veracity fact-checking, accepted item tracking, campaign updates, and direct links to official campaign posts.

---

## Tech Stack

![Next.js](https://img.shields.io/badge/Next.js%2015-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)
![React](https://img.shields.io/badge/React%2019-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)
![MySQL](https://img.shields.io/badge/MySQL-4479A1?style=for-the-badge&logo=mysql&logoColor=white)
![Vercel](https://img.shields.io/badge/Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white)

---

## Features

- **Centralized Drive Directory** — Explore drives filtered by category, urgency, status, and location.
- **Official Campaign Posts** — Direct external links to official organizer posts on social media and organization sites.
- **Community Veracity Fact-Checking** — Crowdsourced verification with True/False voting and admin verification badges to protect donors against fraud.
- **Accepted Items Checklist** — Itemized lists of needed goods with quantities, units, and urgency levels.
- **Organizer Dashboard** — Manage campaigns, post progress updates, and monitor donor involvement.
- **Admin Moderation Portal** — Review incoming drives, approve/reject submissions, and manage platform safety.
- **Saved Drives & Following** — Bookmark drives for later and follow organizations for campaign notifications.
- **Secure Authentication** — MySQL-backed accounts, scrypt password hashes, and server-side sessions.

## Local setup

1. Install and start MySQL Server. Create a local `.env` by copying `.env.example`.
2. Set `DATABASE_URL` to your MySQL connection, for example:
   `mysql://root:your-password@localhost:3306/drivego`
   URL-encode special characters in the username or password.
3. Run `npm run db:setup` and enter your MySQL root password. If the `mysql` command is not on your PATH, open `database/schema.sql` in MySQL Workbench and execute it.
4. Install packages with `npm install`, then start the app with `npm run dev`.

The complete database definition and starter category rows are in [database/schema.sql](./database/schema.sql). Backend database operations use parameterized SQL with `mysql2`; authentication sessions and password reset tokens are stored in MySQL. New accounts are active immediately. Existing Supabase accounts/data are not migrated automatically; users need to register again in this MySQL-backed version. To make an account an administrator, register it first, then run `UPDATE profiles SET role = 'ADMIN' WHERE email = 'your-email@example.com';` in MySQL Workbench. Password reset emails require SMTP settings in `.env`. Uploads are stored locally under `public/uploads`; a serverless deployment needs separate persistent storage.
