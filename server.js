const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;

const MONGO_URI = process.env.MONGO_URI;
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'my_admin_secret';
const SECRET_KEY = process.env.SECRET_KEY || 'my_secret_key';

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
const rewardVersionSchema = new mongoose.Schema({
  version: { type: Number, default: 1 }
});
const RewardVersion = mongoose.model('RewardVersion', rewardVersionSchema);

const rewardClaimSchema = new mongoose.Schema({
  uid: { type: String, required: true, unique: true },
  lastClaimedVersion: { type: Number, required: true }
});
const RewardClaim = mongoose.model('RewardClaim', rewardClaimSchema);

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

// تابع دریافت current reward version یا ایجاد اگر نیست
async function getCurrentRewardVersion() {
  let versionDoc = await RewardVersion.findOne();
  if (!versionDoc) {
    versionDoc = new RewardVersion({ version: 1 });
    await versionDoc.save();
  }
  return versionDoc;
}

// روت ادعای جایزه ماهانه (حالا بر اساس ورژن)
app.post('/claim-reward', async (req, res) => {
  const { uid } = req.body;

  if (!uid) {
    return res.status(400).send({ error: 'uid is required' });
  }

  try {
    const currentVersionDoc = await getCurrentRewardVersion();
    const currentVersion = currentVersionDoc.version;

    let claim = await RewardClaim.findOne({ uid });

    if (claim && claim.lastClaimedVersion >= currentVersion) {
      return res.status(400).send({ error: 'Reward already claimed for current version' });
    }

    // اگر claim موجود نیست یا ورژن کمتره، جایزه بدیم و ثبت کنیم
    if (!claim) {
      claim = new RewardClaim({ uid, lastClaimedVersion: currentVersion });
    } else {
      claim.lastClaimedVersion = currentVersion;
    }
    await claim.save();

    // اینجا می‌تونی جایزه رو هم بدی به پلیر

    res.send({ success: true, message: 'Reward claimed successfully', version: currentVersion });
  } catch (err) {
    console.error('Error in claim-reward:', err);
    res.status(500).send({ error: 'Server error' });
  }
});

// روت ریست دستی لیدربورد و آرشیو + افزایش ورژن جایزه
app.post('/reset', async (req, res) => {
  if (req.headers['x-admin-secret'] !== ADMIN_SECRET) {
    return res.status(403).send({ error: 'Forbidden' });
  }

  try {
    // آرشیو تاپ 100 فعلی
    const top = await Entry.find().sort({ score: -1 }).limit(100);
    const month = new Date().toISOString().slice(0, 7);

    const archive = new Archive({
      month,
      topPlayers: top
    });
    await archive.save();

    // حذف رکوردهای فعلی
    await Entry.deleteMany();

    // افزایش ورژن جایزه
    let versionDoc = await getCurrentRewardVersion();
    versionDoc.version += 1;
    await versionDoc.save();

    res.send({ success: true, message: `Leaderboard reset and archived for ${month}`, newRewardVersion: versionDoc.version });
  } catch (err) {
    console.error('Error in reset:', err);
    res.status(500).send({ error: 'Reset failed' });
  }
});

// روت ثبت امتیاز
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

// روت لیدربورد تاپ 100 با رنک
app.get('/leaderboard', async (req, res) => {
  try {
    const entries = await Entry.find()
      .sort({ score: -1 })
      .limit(100)
      .select('uid name score -_id');

    // اضافه کردن rank به هر بازیکن
    const rankedEntries = entries.map((entry, index) => ({
      uid: entry.uid,
      name: entry.name,
      score: entry.score,
      rank: index + 1
    }));

    res.json(rankedEntries);
  } catch (err) {
    console.error(err);
    res.status(500).send({ error: 'Server error' });
  }
});

// روت لیدربورد اطراف uid و تاپ 10
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

// روت زمان (اختیاری)
app.get("/time", (req, res) => {
  const now = new Date();
  const iso = now.toISOString();
  const tehranTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Tehran" }));
  res.json({ dateTime: iso, tehran: tehranTime.toISOString() });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
