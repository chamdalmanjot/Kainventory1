// Optional: fill an empty collection with sample data (npm run seed)
require('dotenv').config();
const { MongoClient } = require('mongodb');

// Sample records
const sample = [
  { restaurant_id: 1, name: 'Kapampangan Grill', cuisine: 'Filipino', address: 'Angeles City', rating: 4.5, contact: '09171234567' },
  { restaurant_id: 2, name: 'Sisig Republic', cuisine: 'Filipino', address: 'Fields Avenue, Angeles City', rating: 4.7, contact: '09181234567' },
  { restaurant_id: 3, name: 'Pampanga Pizza House', cuisine: 'Italian', address: 'MacArthur Highway, San Fernando', rating: 4.1, contact: '09191234567' },
  { restaurant_id: 4, name: 'Sakura Sushi Bar', cuisine: 'Japanese', address: 'Clark Freeport Zone', rating: 4.3, contact: '09201234567' },
  { restaurant_id: 5, name: 'Dragon Wok', cuisine: 'Chinese', address: 'Balibago, Angeles City', rating: 3.9, contact: '09211234567' },
  { restaurant_id: 6, name: 'Seoul Kitchen', cuisine: 'Korean', address: 'Dau, Mabalacat', rating: 4.2, contact: '09221234567' }
];

// Insert only if the collection is empty
(async () => {
  const client = await MongoClient.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017');
  const col = client.db(process.env.DB_NAME || 'dbRestaurants').collection(process.env.COLLECTION || 'restaurants');
  if ((await col.countDocuments()) > 0) {
    console.log('Collection already has data - nothing inserted.');
  } else {
    const r = await col.insertMany(sample);
    console.log(`Inserted ${r.insertedCount} sample restaurants.`);
  }
  await client.close();
})();