// Backend: Express server and MongoDB CRUD API
require('dotenv').config();
const express = require('express');
const path = require('path');
const { MongoClient, ObjectId } = require('mongodb');

// Settings (override in .env)
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017';
const DB_NAME = process.env.DB_NAME || 'dbRestaurants';
const COLLECTION = process.env.COLLECTION || 'restaurants';

// App setup (app must exist before any route is added)
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Collection handles, set after connecting
let restaurants;
let messages;

// Turn an address (string or object) into text
function addressToText(address) {
  if (!address) return '';
  if (typeof address === 'string') return address;
  return [address.building, address.street, address.zipcode].filter(Boolean).join(' ');
}

// Shape a document for the browser
function toClient(doc) {
  return {
    _id: doc._id,
    restaurant_id: doc.restaurant_id ?? '',
    name: doc.name || '',
    cuisine: doc.cuisine || '',
    address: addressToText(doc.address),
    borough: doc.borough || '',
    rating: typeof doc.rating === 'number' ? doc.rating : null,
    contact: doc.contact || '',
    createdAt: doc.createdAt || (doc._id && doc._id.getTimestamp ? doc._id.getTimestamp() : null)
  };
}

// Validate and clean form data
function cleanBody(body) {
  const name = String(body.name || '').trim();
  const cuisine = String(body.cuisine || '').trim();
  const address = String(body.address || '').trim();
  const contact = String(body.contact || '').trim();
  const ratingRaw = body.rating;

  if (!name) return { error: 'Restaurant name is required.' };
  if (!cuisine) return { error: 'Cuisine is required.' };

  let rating = null;
  if (ratingRaw !== '' && ratingRaw !== null && ratingRaw !== undefined) {
    rating = Number(ratingRaw);
    if (Number.isNaN(rating) || rating < 0 || rating > 5) {
      return { error: 'Rating must be a number from 0 to 5.' };
    }
  }
  return { value: { name, cuisine, address, rating, contact } };
}

// Next id = highest id + 1
async function nextRestaurantId() {
  const docs = await restaurants.find({}, { projection: { restaurant_id: 1 } }).toArray();
  const max = docs.reduce((m, d) => Math.max(m, parseInt(d.restaurant_id, 10) || 0), 0);
  return max + 1;
}

// Escape user text for regex search
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const validId = (id) => ObjectId.isValid(id);

// READ: cuisine list with the number of restaurants in each (MongoDB $group)
app.get('/api/cuisines', async (req, res) => {
  try {
    const data = await restaurants.aggregate([
      { $match: { cuisine: { $type: 'string', $ne: '' } } },
      { $group: { _id: '$cuisine', count: { $sum: 1 } } },
      { $sort: { count: -1, _id: 1 } }
    ]).toArray();
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load cuisines.' });
  }
});

// READ: top 5 restaurants by rating (homepage)
app.get('/api/restaurants/top', async (req, res) => {
  try {
    const docs = await restaurants
      .find({ rating: { $type: 'number' } })
      .sort({ rating: -1, name: 1 })
      .limit(5)
      .toArray();
    res.json(docs.map(toClient));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load top restaurants.' });
  }
});

// READ: 5 most recently added restaurants (sorted by the createdAt date field)
// Older records without createdAt come after, newest _id first.
app.get('/api/restaurants/recent', async (req, res) => {
  try {
    const docs = await restaurants
      .find()
      .sort({ createdAt: -1, _id: -1 })
      .limit(5)
      .toArray();
    res.json(docs.map(toClient));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load recent restaurants.' });
  }
});

// READ: average rating per place (MongoDB aggregation: $match, $addFields, $group, $sort)
app.get('/api/stats/places', async (req, res) => {
  try {
    const data = await restaurants.aggregate([
      // Only restaurants that have a numeric rating
      { $match: { rating: { $type: 'number' } } },
      // Use address when it is text, otherwise fall back to borough
      { $addFields: {
          place: { $cond: [{ $eq: [{ $type: '$address' }, 'string'] }, '$address', '$borough'] }
      } },
      { $match: { place: { $type: 'string', $ne: '' } } },
      // One group per place: average, best rating and number of restaurants
      { $group: {
          _id: '$place',
          avgRating: { $avg: '$rating' },
          bestRating: { $max: '$rating' },
          names: { $push: '$name' },
          count: { $sum: 1 }
      } },
      { $project: { _id: 1, count: 1, bestRating: 1, names: 1, avgRating: { $round: ['$avgRating', 2] } } },
      { $sort: { avgRating: -1, count: -1, _id: 1 } },
      { $limit: 8 }
    ]).toArray();
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load place stats.' });
  }
});

// READ: list with search and paging
app.get('/api/restaurants', async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 50);
    const search = String(req.query.search || '').trim();

    let filter = {};
    if (search) {
      const rx = { $regex: escapeRegex(search), $options: 'i' };
      const or = [
        { name: rx }, { cuisine: rx }, { address: rx },
        { 'address.street': rx }, { borough: rx }
      ];
      if (/^\d+$/.test(search)) {
        or.push({ restaurant_id: Number(search) }, { restaurant_id: rx });
      }
      filter = { $or: or };
    }

    const total = await restaurants.countDocuments(filter);
    const docs = await restaurants.find(filter)
      .sort({ name: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray();

    res.json({ data: docs.map(toClient), total, page, pages: Math.max(Math.ceil(total / limit), 1) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load restaurants.' });
  }
});

// READ: homepage stats
app.get('/api/stats', async (req, res) => {
  try {
    const total = await restaurants.countDocuments();
    const avg = await restaurants.aggregate([
      { $match: { rating: { $type: 'number' } } },
      { $group: { _id: null, avg: { $avg: '$rating' } } }
    ]).toArray();
    const cuisines = (await restaurants.distinct('cuisine')).length;
    res.json({ db: DB_NAME, total, cuisines, avgRating: avg.length ? Number(avg[0].avg.toFixed(1)) : null });
  } catch (err) {
    res.status(500).json({ error: 'Could not load stats.' });
  }
});

// CREATE: insertOne
app.post('/api/restaurants', async (req, res) => {
  const { value, error } = cleanBody(req.body);
  if (error) return res.status(400).json({ error });
  try {
    const doc = { restaurant_id: await nextRestaurantId(), ...value, createdAt: new Date() };
    const result = await restaurants.insertOne(doc);
    res.status(201).json({ message: 'Restaurant added.', _id: result.insertedId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not add the restaurant.' });
  }
});

// UPDATE: updateOne
app.put('/api/restaurants/:id', async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ error: 'Invalid restaurant id.' });
  const { value, error } = cleanBody(req.body);
  if (error) return res.status(400).json({ error });
  try {
    const result = await restaurants.updateOne({ _id: new ObjectId(req.params.id) }, { $set: value });
    if (result.matchedCount === 0) return res.status(404).json({ error: 'Restaurant not found.' });
    res.json({ message: 'Restaurant updated.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not update the restaurant.' });
  }
});

// DELETE: deleteOne
app.delete('/api/restaurants/:id', async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ error: 'Invalid restaurant id.' });
  try {
    const result = await restaurants.deleteOne({ _id: new ObjectId(req.params.id) });
    if (result.deletedCount === 0) return res.status(404).json({ error: 'Restaurant not found.' });
    res.json({ message: 'Restaurant deleted.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not delete the restaurant.' });
  }
});

// Contact form: save a message
app.post('/api/contact', async (req, res) => {
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').trim();
  const message = String(req.body.message || '').trim();

  if (!name) return res.status(400).json({ error: 'Please enter your name.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Please enter a valid email address.' });
  if (message.length < 5) return res.status(400).json({ error: 'Please write a short message.' });

  try {
    await messages.insertOne({ name, email, message: message.slice(0, 1000), createdAt: new Date() });
    res.status(201).json({ message: 'Message sent.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not send your message.' });
  }
});

// Connect to MongoDB, then start the server
MongoClient.connect(MONGO_URI)
  .then((client) => {
    const db = client.db(DB_NAME);
    restaurants = db.collection(COLLECTION);
    messages = db.collection('messages');
    console.log(`Connected to MongoDB: ${DB_NAME}.${COLLECTION}`);
    app.listen(PORT, () => console.log(`Kainventory running at http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error('MongoDB connection failed. Is MongoDB running?', err.message);
    process.exit(1);
  });