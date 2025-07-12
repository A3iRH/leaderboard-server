const express = require('express');
const fs = require('fs');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

let users = [];

const DBFILE = 'db.json';
try {
  users = JSON.parse(fs.readFileSync(DBFILE));
} catch {
  users = [];
}

const saveDB = () => {
  fs.writeFileSync(DBFILE, JSON.stringify(users, null, 2));
};

app.post('/submit', (req, res) => {
  const { name, secret, score } = req.body;
  if (!name || !secret || typeof score !== 'number') {
    return res.status(400).json({ message: 'Invalid input' });
  }

  const idx = users.findIndex(u => u.name === name);
  if (idx !== -1) {
    if (users[idx].secret !== secret) {
      return res.status(403).json({ message: 'Invalid secret' });
    }
    users[idx].score = Math.max(users[idx].score, score);
  } else {
    users.push({ name, secret, score });
  }

  users.sort((a, b) => b.score - a.score);
  saveDB();
  res.json({ message: 'Score saved', rank: users.findIndex(u => u.name === name) + 1 });
});

app.get('/leaderboard', (req, res) => {
  res.json(users.slice(0, 10).map((u, i) => ({ rank: i+1, name: u.name, score: u.score })));
});

app.get('/around/:name', (req, res) => {
  const name = req.params.name;
  const idx = users.findIndex(u => u.name === name);
  if (idx === -1) return res.status(404).json({ message: 'User not found' });

  const start = Math.max(0, idx - 2);
  const slice = users.slice(start, start + 5);
  res.json(slice.map((u, i) => ({ rank: start + i + 1, name: u.name, score: u.score })));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});