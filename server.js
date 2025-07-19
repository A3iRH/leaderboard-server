const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;

const MONGO_URI = process.env.MONGO_URI;
const SECRET_KEY = process.env.SECRET_KEY;
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'my_admin_secret';

app.use(cors());
app.use(bodyParser.json());

// اتصال به دیتابیس MongoDB
mongoose.connect(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('✅ MongoDB connected'))
.catch(err => console.error('❌ MongoDB error:', err));

// مدل‌ها
const rewardSchema = new mongoose.Schema({
  uid: { type: String, required: true },
  month: { type: String, required: true },
  claimedAt: { type: Date, default: Date.now }
});
const RewardClaim = mongoose.model('RewardClaim', rewardSchema);

const entrySchema = new mongoose.Schema({
  uid: { type: String, required: true, unique: true },
  name: String,
  score: Number
});
const Entry = mongoose.model('Entry', entrySchema);

const archiveSchema = new mongoose.Schema({
  month: { type: String, required: true },
  topPlayers: [entrySchema]
});
const Archive = mongoose.model('Archive', archiveSchema);

// ثبت امتیاز
app.post('/submit', async (req, res) => {
  const { uid, name, score, secret } = req.body;

  if (!uid || !name || typeof score !== 'number' || secret !== SECRET_KEY) {
    return res.status(400).send({ error: 'Invalid input or secret' });
  }

  if (score < 0 || score > 100000) {
    return res.status(400).send({ error: 'Score out of bounds' });
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

// نمایش تاپ ۱۰۰
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

// نمایش تاپ ۱۰ و اطراف پلیر
app.get('/leaderboard/around/:uid', async (req, res) => {
  const uid = req.params.uid;

  try {
    const all = await Entry.find().sort({ score: -1 });
    const top100 = all.slice(0, 100);
    const top10 = top100.slice(0, 10).map(entry => ({
      uid: entry.uid,
      name: entry.name,
      score: entry.score
    }));

    const top100Index = top100.findIndex(entry => entry.uid === uid);

    if (top100Index !== -1) {
      return res.send({
        top10,
        around: null,
        rank: top100Index + 1
      });
    }

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

// ریست لیدربورد + آرشیو + جایزه
app.post('/reset', async (req, res) => {
  if (req.headers['x-admin-secret'] !== ADMIN_SECRET) {
    return res.status(403).send({ error: 'Forbidden' });
  }

  try {
    const top = await Entry.find().sort({ score: -1 }).limit(100);
    const month = new Date().toISOString().slice(0, 7); // "YYYY-MM"

    // آرشیو کردن
    const archive = new Archive({
      month,
      topPlayers: top
    });
    await archive.save();

    // اضافه کردن جایزه برای ۱۰۰ نفر اول
    const rewardClaims = top.map(player => ({
      uid: player.uid,
      month
    }));
    await RewardClaim.insertMany(rewardClaims);

    // پاک کردن لیدربورد
    await Entry.deleteMany();

    res.send({ success: true, message: `Leaderboard reset and archived for ${month}` });
  } catch (err) {
    console.error('Error in reset:', err);
    res.status(500).send({ error: 'Reset failed' });
  }
});

// ادعای جایزه
app.post('/claim-reward', async (req, res) => {
  const { uid, month } = req.body;

  if (!uid || !month) {
    return res.status(400).send({ error: 'uid and month are required' });
  }

  try {
    const alreadyClaimed = await RewardClaim.findOne({ uid, month });
    if (!alreadyClaimed) {
      return res.status(400).send({ error: 'No reward available for this user/month' });
    }

    // چک نکنیم دوباره که شاید قبلا گرفته؟
    if (alreadyClaimed.claimedAt !== null) {
      return res.status(400).send({ error: 'Reward already claimed' });
    }

    alreadyClaimed.claimedAt = new Date();
    await alreadyClaimed.save();

    // در اینجا جایزه واقعی بده (در صورت نیاز)

    res.send({ success: true, message: 'Reward claimed successfully' });
  } catch (err) {
    console.error('Error in claim-reward:', err);
    res.status(500).send({ error: 'Server error' });
  }
});

// ساعت سرور
app.get('/time', (req, res) => {
  const now = new Date();
  const iso = now.toISOString();
  const tehranTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Tehran" }));
  res.json({ dateTime: iso, tehran: tehranTime.toISOString() });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
