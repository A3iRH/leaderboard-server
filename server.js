const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const app = express();
const PORT = process.env.PORT || 3000;

const MONGO_URI = process.env.MONGO_URI;

app.use(bodyParser.json());

// اتصال به دیتابیس MongoDB
mongoose.connect(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('✅ MongoDB connected'))
.catch(err => console.error('❌ MongoDB error:', err));

// اسکیمای لیدربورد
const entrySchema = new mongoose.Schema({
  uid: { type: String, required: true, unique: true },
  name: String,
  score: Number
});

const Entry = mongoose.model('Entry', entrySchema);

// ✅ Submit route
app.post('/submit', async (req, res) => {
  const { uid, name, score } = req.body;

  if (!uid || !name || typeof score !== 'number') {
    return res.status(400).send({ error: 'Invalid input' });
  }

  try {
    let entry = await Entry.findOne({ uid });

    if (entry) {
      if (score > entry.score) {
        entry.score = score;
        entry.name = name;
        await entry.save();
      }
    } else {
      entry = new Entry({ uid, name, score });
      await entry.save();
    }

    res.send({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).send({ error: 'Database error' });
  }
});

// ✅ Top 100 route
app.get('/leaderboard', async (req, res) => {
  try {
    const entries = await Entry.find()
      .sort({ score: -1 })
      .limit(100)
      .select('uid name score -_id');
    
    res.json(entries);
  } catch (err) {
    console.error(err);
    res.status(500).send({ error: 'Server error' });
  }
});

// ✅ Top 10 + Around route
app.get('/leaderboard/around/:uid', async (req, res) => {
  const uid = req.params.uid;

  try {
    const all = await Entry.find().sort({ score: -1 });

    // بررسی اینکه توی تاپ 100 هست یا نه
    const top100 = all.slice(0, 100);
    const top10 = top100.slice(0, 10).map(entry => ({
      uid: entry.uid,
      name: entry.name,
      score: entry.score
    }));

    const top100Index = top100.findIndex(entry => entry.uid === uid);

    if (top100Index !== -1) {
      // اگر تو تاپ 100 بود
      return res.send({
        top10,
        around: null,
        rank: top100Index + 1
      });
    }

    // اگر جزو تاپ 100 نبود
    const realIndex = all.findIndex(entry => entry.uid === uid);
    if (realIndex === -1) {
      return res.status(404).send({ error: 'User not found' });
    }

    const start = Math.max(0, realIndex - 5);
    const end = Math.min(all.length, realIndex + 6);
    const around = all.slice(start, end).map(entry => ({
      uid: entry.uid,
      name: entry.name,
      score: entry.score
    }));

    res.send({
      top10,
      around,
      rank: realIndex + 1
    });

  } catch (err) {
    console.error(err);
    res.status(500).send({ error: 'Server error' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
