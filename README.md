
# Fun Declaration Game (FDG)

A simple, internal web app where members predict winners of scheduled sports matches (cricket, football, kabaddi, etc.) and earn points based on a shared pot from losing predictions. Built with **Node.js + Express + EJS + SQLite** for easy local development in **Visual Studio Code**.

## ✨ Features
- Admin creates series, matches, timings, entry points, declares winner after completion.
- Admin adds allowed users; once a series starts, no new members can join.
- Members see current & upcoming series they are part of.
- Per match declarations allowed until cutoff (e.g., 30 minutes before start).
- If missed, member is treated as having picked the losing team when winner is declared.
- After match starts, all declarations become visible along with **probable winning points**.
- Points distribution: `(losing predictions + missed) × entry_points` shared **equally** among the winners.
- Washed-out matches: **no points**.
- Dashboards: current total points, per-series stats, global leaderboard across series.
- Basic session auth (no OTP); passwords hashed with bcrypt.

## 🧱 Tech Stack
- **Backend**: Node.js (Express), SQLite3
- **Views**: EJS (server-rendered)
- **Auth**: express-session (SQLite store)
- **Time**: moment-timezone (Indian Standard Time handling)

## 📦 Getting Started (Local)

> Prerequisites: Node.js v18+, npm, and VS Code.

1. **Clone or copy** this project
   ```bash
   git clone <your-repo-url> fdg
   cd fdg
   ```
   Or copy the folder created by Copilot: `fun-declaration-game/`.

2. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env to set SESSION_SECRET etc. Defaults use Asia/Kolkata timezone
   ```

3. **Install dependencies**
   ```bash
   npm install
   ```

4. **Run (dev)**
   ```bash
   npm run dev
   # or
   npm start
   ```

5. **Login**
   - First run bootstraps an admin:
     - Username: `admin`
     - Password: `Admin@123`
   - Change in `.env` before first run if desired.

## 🔧 Admin Workflow
1. Login as admin.
2. Create users (`Admin → Users → Add User`).
3. Create a series (`Admin → + New Series`).
4. Add members to series and **Lock** series before start.
5. Create matches with **UTC start times** and entry points.
6. When match completes, **Declare Winner** (or mark **Washed Out**).

## 👤 Member Workflow
- See **My Series** and open a series.
- For each match, declare prediction **before cutoff**.
- After match starts, view all declarations and probable points.
- Points are credited when admin declares the winner.

## ⏱ Timezone & Cutoff
- All start times are stored as **UTC** in the database.
- Deadlines and displays honor **India Standard Time (Asia/Kolkata)** as configured via `APP_TIMEZONE`.
- Cutoff enforced exactly at `start_time - cutoff_minutes`.

## 🧮 Points Calculation
- Let `entry_points` be the per-loser contribution (default 50).
- If Team A wins:
  - Pot = `(#predicted_B + #missed) × entry_points`
  - Winners (predicted A) share the pot equally.
- Missed predictions count as **losers** on the side opposite to the winner.
- No points assigned in **washed-out** matches.
- Points are stored as **real numbers** (decimals allowed) for fair splits.

## 📊 Dashboard & Leaderboard
- Dashboard shows per-series played, wins, losses, win%.
- Leaderboard sums points **across all series**.

## 🚀 Production Hosting (Quick Guide)
> For a small internal site on a Linux VM (e.g., Ubuntu) behind Nginx.

1. **Server setup**
   ```bash
   sudo apt update && sudo apt install -y nodejs npm nginx
   # (optional) install pm2
   sudo npm i -g pm2
   ```
2. **Deploy code** (git clone or copy)
3. **Environment**: create `.env` and `data/` dir
   ```bash
   mkdir -p data
   cp .env.example .env
   nano .env
   ```
4. **Install & start**
   ```bash
   npm install
   pm2 start server.js --name fdg
   pm2 save
   ```
5. **Reverse proxy** (Nginx)
   ```nginx
   server {
     listen 80;
     server_name your.domain.com;

     location / {
       proxy_pass http://127.0.0.1:3000;
       proxy_set_header Host $host;
       proxy_set_header X-Real-IP $remote_addr;
       proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       proxy_set_header X-Forwarded-Proto $scheme;
     }
   }
   ```
   ```bash
   sudo ln -s /etc/nginx/sites-available/your.domain.com /etc/nginx/sites-enabled/
   sudo nginx -t && sudo systemctl reload nginx
   ```

## 🗂 Project Structure
```
fun-declaration-game/
├── server.js
├── package.json
├── .env.example
├── public/
│  ├── css/styles.css
│  └── js/main.js
├── views/
│  ├── partials/
│  ├── auth/
│  ├── admin/
│  ├── series/
│  └── dashboard/
└── src/
   ├── config/
   ├── middleware/
   ├── routes/
   └── utils/
```

## 🔒 Notes on Security
- This is an **internal** app. We still hash passwords (bcrypt) and use sessions.
- No OTP or wallets are implemented.
- Do not expose publicly without adding TLS (HTTPS) and hardening.

## 🧪 Testing Tips
- Create a series with 5–10 members.
- Add multiple matches with varied `entry_points`.
- Try scenarios: all pick one side, split picks, some miss declarations, washed-out.

## 🐛 Known Limitations & TODOs
- No edit/delete flows for series/matches (can add if needed).
- Streak calculations per user not yet shown on UI (can be added quickly).
- Time inputs use raw UTC strings; could add IST helper field.
- Before start, only your own prediction is visible; after start, all predictions and probable points appear.

---
Made for a small internal team by M365 Copilot. Enjoy the game! 🎉
