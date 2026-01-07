# Knight Multiplayer

A simple Socket.IO multiplayer demo served by an Express server. The server serves `index.html` and `game.js`, and relays player positions in real time.

## Local Run

```powershell
Push-Location "c:\client"
npm install
$env:PORT=3001
npm start
```
Open http://localhost:3001 in two tabs to test.

## Deploy to Render

Option A — render.yaml (recommended):
1. Push this folder to a Git repository (GitHub/GitLab/Bitbucket).
2. In Render, create a new "Web Service" and connect the repo.
3. Render automatically reads `render.yaml` and uses:
   - Build: `npm install`
   - Start: `node server.js`
   - Health check: `/health`

Option B — manual:
1. Create a Web Service in Render and connect the repo.
2. Set Build Command: `npm install`
3. Set Start Command: `node server.js`
4. Region: any (e.g., Oregon). Plan: Free is fine for testing.

## Client Connection

The client uses `io()` (same-origin). When served from the Render Web Service, Socket.IO will connect to the same domain automatically. If you host the HTML elsewhere, update `game.js` to `io("https://YOUR-SERVICE.onrender.com")`.

## Notes
- WebSockets are supported on Render Web Services.
- The server uses `process.env.PORT` provided by Render.
- Health check endpoint: `/health`.
