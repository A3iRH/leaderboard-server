const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const app = express();
const PORT = process.env.PORT || 3000;

// از محیط بخونه (تو Render تنظیمش می‌کنی)
const MONGO_URI = 'mongodb+srv://amhojoo:Sahj1381@cluster0.7ubwwbf.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

app.use(bodyParser.json());

// اتصال به دیتابیس MongoDB Atlas
mongoose.connect(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('✅ MongoDB connected'))
.catch(err => console.error('❌ MongoDB connection error:', err));

// تعریف مدل اسکیمای لیدربورد
const entrySchema = new mongoose.Schema({
  uid: { type: String, required: true, unique: true },
  name: String,
  score: Number
});

const Entry = mongoose.model('Entry', entrySchema);

// گرفتن لیدربورد (مرتب بر اساس امتیاز)
app.get('/leaderboard', async (req, res) => {
  try {
    const entries = await Entry.find().sort({ score: -1 }).limit(100);
    res.json(entries);
  } catch (err) {
    console.error(err);
    res.status(500).send({ error: 'Server error' });
  }
});

// ارسال امتیاز
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
        entry.name = name; // نیک‌نیم جدید ذخیره شه
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

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
