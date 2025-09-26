import express from "express";
import bodyParser from "body-parser";
import sqlite3 from "sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const db = new sqlite3.Database("./db.sqlite");

// Setup
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// Initialize DB
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS pending_links (
    code TEXT PRIMARY KEY,
    robloxUserId TEXT,
    robloxUsername TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    websiteUserId TEXT,
    robloxUserId TEXT UNIQUE,
    robloxUsername TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS playtime (
    robloxUserId TEXT,
    seconds INTEGER
  )`);
});

// === ROUTES ===

// Homepage
app.get("/", (req, res) => {
  res.render("index");
});

// Profile search redirect
app.get("/profile", (req, res) => {
  const id = req.query.robloxId;
  if (!id) return res.redirect("/");
  res.redirect("/profile/" + id);
});

// Show link form
app.get("/link", (req, res) => {
  res.render("link");
});

// Handle link submission
app.post("/link", (req, res) => {
  const { code, websiteUserId } = req.body;
  if (!code || !websiteUserId) return res.status(400).send("Missing fields");

  db.get(
    `SELECT * FROM pending_links WHERE code = ?`,
    [code],
    (err, row) => {
      if (err) return res.status(500).send("DB Error");
      if (!row) return res.status(400).send("Invalid code");

      const websiteIdStr = websiteUserId.toString();
      const robloxIdStr = row.robloxUserId.toString();
      const robloxName = row.robloxUsername;

      db.run(
        `INSERT OR REPLACE INTO users (websiteUserId, robloxUserId, robloxUsername) VALUES (?, ?, ?)`,
        [websiteIdStr, robloxIdStr, robloxName],
        (err2) => {
          if (err2) return res.status(500).send("DB Error");
          db.run(`DELETE FROM pending_links WHERE code = ?`, [code]);
          res.send(`✅ Linked ${robloxName} to website account ${websiteIdStr}`);
        }
      );
    }
  );
});

// Profile page showing playtime
app.get("/profile/:robloxId", (req, res) => {
  const robloxId = req.params.robloxId.toString(); // ensure string

  db.get(
    `SELECT * FROM users WHERE robloxUserId = ?`,
    [robloxId],
    (err, user) => {
      if (err) return res.status(500).send("DB Error");
      if (!user) return res.status(404).send("User not found");

      db.get(
        `SELECT SUM(seconds) as total FROM playtime WHERE robloxUserId = ?`,
        [robloxId],
        (err2, stats) => {
          if (err2) return res.status(500).send("DB Error");
          const totalSeconds = stats?.total || 0;
          const hours = Math.floor(totalSeconds / 3600);
          const minutes = Math.floor((totalSeconds % 3600) / 60);
          const seconds = totalSeconds % 60;

          res.render("profile", {
            username: user.robloxUsername,
            robloxId: user.robloxUserId,
            playtime: `${hours}h ${minutes}m ${seconds}s`
          });
        }
      );
    }
  );
});

// API endpoint: Roblox sends login code
app.post("/api/link", (req, res) => {
  const { userId, username, code } = req.body;
  if (!userId || !code) return res.status(400).json({ error: "Missing fields" });

  db.run(
    `INSERT OR REPLACE INTO pending_links (code, robloxUserId, robloxUsername) VALUES (?, ?, ?)`,
    [code.toString(), userId.toString(), username],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    }
  );
});

// API endpoint: Roblox sends playtime
app.post("/api/playtime", (req, res) => {
  const { userId, playtime } = req.body;
  if (!userId || !playtime) return res.status(400).json({ error: "Missing fields" });

  db.run(
    `INSERT INTO playtime (robloxUserId, seconds) VALUES (?, ?)`,
    [userId.toString(), playtime],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    }
  );
});

// Start server
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log("Server running on port " + port);
});
