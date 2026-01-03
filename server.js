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
const simpleCounterSchema = new mongoose.Schema({
  name: { type: String, unique: true },
  count: { type: Number, default: 0 }
});
const SimpleCounter = mongoose.model('SimpleCounter', simpleCounterSchema);

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

// گرفتن نسخه فعلی جایزه (ورژن ریست)
async function getCurrentRewardVersion() {
  let versionDoc = await RewardVersion.findOne();
  if (!versionDoc) {
    versionDoc = new RewardVersion({ version: 1 });
    await versionDoc.save();
  }
  return versionDoc;
}
// تغییر اسم
app.post('/update-name', async (req, res) => {
  const { uid, name } = req.body;

  if (!uid || !name) {
    return res.status(400).send({ error: 'Missing uid or name' });
  }

  try {
    const player = await Entry.findOneAndUpdate(
      { uid },
      { $set: { name } },
      { new: true }
    );

    if (!player) {
      return res.status(404).send({ error: 'Player not found' });
    }

    res.send({ success: true, name: player.name });
  } catch (err) {
    console.error('❌ Error in /update-name:', err);
    res.status(500).send({ error: 'Server error' });
  }
});
// روت آپدیت لول پلیر (کاملاً مستقل)
app.post('/update-level', async (req, res) => {
      console.log("BODY:", req.body);
console.log("ENTRY LEVEL TYPE:", typeof entry.level, entry.level);
  const { uid, level, secret } = req.body;

  if (!uid || typeof level !== 'number' || secret !== SECRET_KEY) {
    return res.status(400).send({ error: 'Invalid input or secret' });
  }

  if (level < 1 || level > 1000) {
    return res.status(400).send({ error: 'Level out of bounds' });
  }

  try {
    const entry = await Entry.findOne({ uid });
    if (!entry) {
      return res.status(404).send({ error: 'Player not found' });
    }

    // فقط افزایش لول، نه کاهش
    if (level > entry.level) {
      entry.level = level;
      await entry.save();
    }

    res.send({
      success: true,
      level: entry.level
    });
  } catch (err) {
    console.error('❌ Error in /update-level:', err);
    res.status(500).send({ error: 'Server error' });
  }
});
// گرفتن لول
// گرفتن لیست uid + level همه پلیرها
app.get('/levels', async (req, res) => {
  try {
    const entries = await Entry.find()
      .select('uid level -_id');

    const result = entries.map(e => ({
      uid: e.uid,
      level: e.level ?? 1
    }));

    res.json({
      success: true,
      players: result
    });
  } catch (err) {
    console.error('Error in /levels:', err);
    res.status(500).send({ error: 'Server error' });
  }
});



// روت ادعای جایزه ماهانه
app.post('/claim-reward', async (req, res) => {
  const { uid } = req.body;
  if (!uid) return res.status(400).send({ error: 'uid is required' });

  try {
    const currentVersionDoc = await getCurrentRewardVersion();
    const currentVersion = currentVersionDoc.version;

    // آرشیو دوره فعلی رو بگیر (ماه جاری یا آخرین آرشیو)
    const archive = await Archive.findOne().sort({ month: -1 }); // آخرین آرشیو

    if (!archive) {
      return res.status(400).send({ error: 'No archive found for current period' });
    }

    // آیا uid داخل آرشیو 100 نفره هست؟
    const isInArchive = archive.topPlayers.some(player => player.uid === uid);
    if (!isInArchive) {
      return res.status(400).send({ error: 'User is not eligible for reward this period' });
    }

    // چک ادعای جایزه برای ورژن فعلی
    let claim = await RewardClaim.findOne({ uid });

    if (claim && claim.lastClaimedVersion >= currentVersion) {
      return res.status(400).send({ error: 'Reward already claimed for current period' });
    }

    if (!claim) {
      claim = new RewardClaim({ uid, lastClaimedVersion: currentVersion });
    } else {
      claim.lastClaimedVersion = currentVersion;
    }
    await claim.save();

    res.send({ success: true, message: 'Reward claimed successfully', version: currentVersion });
  } catch (err) {
    console.error('Error in claim-reward:', err);
    res.status(500).send({ error: 'Server error' });
  }
});
//روت شمارنده لاگ این
app.post('/log-entry', async (req, res) => {
  try {
    const updated = await SimpleCounter.findOneAndUpdate(
      { name: 'totalEntries' },
      { $inc: { count: 1 } },
      { new: true, upsert: true }
    );
    res.send({ success: true, total: updated.count });
  } catch (err) {
    console.error('❌ Error in /log-entry:', err);
    res.status(500).send({ error: 'Failed to log entry' });
  }
});

// مسیر فقط برای مشاهده مقدار فعلی (بدون تغییر)
app.get('/log-count', async (req, res) => {
  try {
    const doc = await SimpleCounter.findOne({ name: 'totalEntries' });
    if (!doc) {
      return res.send({ success: true, total: 0 });
    }
    res.send({ success: true, total: doc.count });
  } catch (err) {
    console.error('❌ Error in /log-count:', err);
    res.status(500).send({ error: 'Server error' });
  }
});

// روت ریست و آرشیو دستی
app.post('/reset', async (req, res) => {
  if (req.headers['x-admin-secret'] !== ADMIN_SECRET) {
    return res.status(403).send({ error: 'Forbidden' });
  }

  try {
    // پاک کردن همه آرشیوهای قبلی
    await Archive.deleteMany({});

    // گرفتن ماه فعلی به صورت YYYY-MM
    const month = new Date().toISOString().slice(0, 7);

    // گرفتن تاپ 100 از جدول امتیازها
    const top = await Entry.find().sort({ score: -1 }).limit(100);

    // ساخت آرشیو جدید برای ماه جاری
    const archive = new Archive({
      month,
      topPlayers: top
    });
    await archive.save();

    // پاک کردن همه امتیازهای فعلی (ریست کردن لیدربورد)
    await Entry.deleteMany();

    // افزایش ورژن جایزه (ورژن ریست)
    let versionDoc = await getCurrentRewardVersion();
    versionDoc.version += 1;
    await versionDoc.save();

    res.send({ success: true, message: `Leaderboard reset and archived for ${month}`, newRewardVersion: versionDoc.version });
  } catch (err) {
    console.error('Error in reset:', err);
    res.status(500).send({ error: 'Reset failed' });
  }
});


// ریست دولوپری: پاک کردن کامل همه دیتاها و آرشیو و برگشت ورژن جایزه به 1
app.post('/dev-reset', async (req, res) => {
  if (req.headers['x-admin-secret'] !== ADMIN_SECRET) {
    return res.status(403).send({ error: 'Forbidden' });
  }

  try {
    // حذف کامل آرشیوها
    await Archive.deleteMany({});

    // حذف کامل رکوردهای امتیاز
    await Entry.deleteMany({});

    // حذف کامل رکوردهای ادعای جایزه
    await RewardClaim.deleteMany({});

    // بازگردانی ورژن جایزه به 1
    let versionDoc = await RewardVersion.findOne();
    if (versionDoc) {
      versionDoc.version = 0;
      await versionDoc.save();
    } else {
      await new RewardVersion({ version: 0 }).save();
    }

    res.send({ success: true, message: 'Developer reset done: all data cleared and reward version reset to 0' });
  } catch (err) {
    console.error('Dev reset error:', err);
    res.status(500).send({ error: 'Dev reset failed' });
  }
});

// روت گرفتن نسخه ریست فعلی (برای کلاینت)
app.get('/reset-version', async (req, res) => {
  try {
    const versionDoc = await getCurrentRewardVersion();
    res.json({ version: versionDoc.version });
  } catch (err) {
    console.error('Error in /reset-version:', err);
    res.status(500).send({ error: 'Server error' });
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

// روت تاپ 100
app.get('/leaderboard', async (req, res) => {
  try {
    const entries = await Entry.find()
      .sort({ score: -1 })
      .limit(100)
      .select('uid name score -_id');

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

// روت اطراف UID و تاپ 10 همراه رنک هر بازیکن
app.get('/leaderboard/around/:uid', async (req, res) => {
  const uid = req.params.uid;

  try {
    const all = await Entry.find().sort({ score: -1 });

    // ایجاد مپ از uid به رنک
    const rankMap = new Map();
    all.forEach((entry, idx) => {
      rankMap.set(entry.uid, idx + 1);
    });

    const top100 = all.slice(0, 100);
    const top10 = top100.slice(0, 10).map(entry => ({
      uid: entry.uid,
      name: entry.name,
      score: entry.score,
      rank: rankMap.get(entry.uid)
    }));

    const top100Index = top100.findIndex(entry => entry.uid === uid);

    if (top100Index !== -1) {
      // اگر داخل 100 نفر اول بود، فقط تاپ 10 و رنک خودشو میفرسته
      return res.send({
        top10,
        around: null,
        rank: rankMap.get(uid)
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
      score: entry.score,
      rank: rankMap.get(entry.uid)
    }));

    res.send({
      top10,
      around,
      rank: rankMap.get(uid)
    });
  } catch (err) {
    console.error(err);
    res.status(500).send({ error: 'Server error' });
  }
});

// روت زمان
app.get("/time", (req, res) => {
  const now = new Date();
  const iso = now.toISOString();
  const tehranTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Tehran" }));
  res.json({ dateTime: iso, tehran: tehranTime.toISOString() });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
