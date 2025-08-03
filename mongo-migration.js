const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');

console.log('🔄 Starting MongoDB migration...');

// MongoDB connection string
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = 'magicsell';
const COLLECTION_NAMES = ['orders', 'customers', 'dailySales', 'weeklySales', 'predictions', 'reports', 'notifications'];

async function migrateToMongoDB() {
  let client;
  
  try {
    // Connect to MongoDB
    console.log('🔌 Connecting to MongoDB...');
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    console.log('✅ Connected to MongoDB');

    const db = client.db(DB_NAME);
    
    // Read JSON data
    const dataFile = path.join(__dirname, 'data_production.json');
    if (!fs.existsSync(dataFile)) {
      throw new Error('Production data file not found');
    }
    
    const jsonData = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    console.log('📊 JSON data loaded:', {
      orders: jsonData.orders?.length || 0,
      customers: jsonData.customers?.length || 0,
      dailySales: jsonData.dailySales?.length || 0,
      weeklySales: jsonData.weeklySales?.length || 0
    });

    // Migrate each collection
    for (const collectionName of COLLECTION_NAMES) {
      if (jsonData[collectionName] && jsonData[collectionName].length > 0) {
        const collection = db.collection(collectionName);
        
        // Clear existing data
        await collection.deleteMany({});
        console.log(`🗑️ Cleared existing ${collectionName}`);
        
        // Insert new data
        const result = await collection.insertMany(jsonData[collectionName]);
        console.log(`✅ Migrated ${result.insertedCount} documents to ${collectionName}`);
      } else {
        console.log(`⚠️ No data found for ${collectionName}`);
      }
    }

    // Create indexes for better performance
    console.log('🔍 Creating indexes...');
    await db.collection('orders').createIndex({ status: 1 });
    await db.collection('orders').createIndex({ createdAt: 1 });
    await db.collection('customers').createIndex({ shopName: 1 });
    await db.collection('dailySales').createIndex({ date: 1 });
    console.log('✅ Indexes created');

    console.log('🎉 MongoDB migration completed successfully!');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    throw error;
  } finally {
    if (client) {
      await client.close();
      console.log('🔌 MongoDB connection closed');
    }
  }
}

// Run migration if called directly
if (require.main === module) {
  migrateToMongoDB()
    .then(() => {
      console.log('✅ Migration script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Migration script failed:', error);
      process.exit(1);
    });
}

module.exports = { migrateToMongoDB }; 