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

// Init DB
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

// === API ENDPOINTS ===

// Step 1: Roblox sends code
app.post("/api/link", (req, res) => {
  const { userId, username, code } = req.body;
  if (!userId || !code) return res.status(400).json({ error: "Missing fields" });

  db.run(
    `INSERT OR REPLACE INTO pending_links (code, robloxUserId, robloxUsername) VALUES (?, ?, ?)`,
    [code, userId, username],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    }
  );
});

// Step 2: Roblox posts playtime
app.post("/api/playtime", (req, res) => {
  const { userId, playtime } = req.body;
  if (!userId || !playtime) return res.status(400).json({ error: "Missing fields" });

  db.run(
    `INSERT INTO playtime (robloxUserId, seconds) VALUES (?, ?)`,
    [userId, playtime],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    }
  );
});

// === WEBSITE ROUTES ===

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

      db.run(
        `INSERT OR REPLACE INTO users (websiteUserId, robloxUserId, robloxUsername) VALUES (?, ?, ?)`,
        [websiteUserId, row.robloxUserId, row.robloxUsername],
        (err2) => {
          if (err2) return res.status(500).send("DB Error");
          db.run(`DELETE FROM pending_links WHERE code = ?`, [code]);
          res.send(`✅ Linked ${row.robloxUsername} to website account ${websiteUserId}`);
        }
      );
    }
  );
});

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


// Profile page showing playtime
app.get("/profile/:robloxId", (req, res) => {
  const robloxId = req.params.robloxId;

  db.get(
    `SELECT * FROM users WHERE robloxUserId = ?`,
    [robloxId],
    (err, user) => {
      if (err || !user) return res.status(404).send("User not found");

      db.get(
        `SELECT SUM(seconds) as total FROM playtime WHERE robloxUserId = ?`,
        [robloxId],
        (err2, stats) => {
          const total = stats?.total || 0;
          res.render("profile", {
            username: user.robloxUsername,
            robloxId: user.robloxUserId,
            playtime: Math.floor(total / 60) + " minutes"
          });
        }
      );
    }
  );
});

// Start server
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log("Server running on port " + port);
});
