const { MongoClient } = require('mongodb');

class DatabaseService {
  constructor() {
    this.client = null;
    this.db = null;
    this.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
    this.DB_NAME = 'magicsell';
  }

  async connect() {
    try {
      if (!this.client) {
        console.log('🔌 Connecting to MongoDB...');
        this.client = new MongoClient(this.MONGODB_URI);
        await this.client.connect();
        this.db = this.client.db(this.DB_NAME);
        console.log('✅ Connected to MongoDB');
      }
      return this.db;
    } catch (error) {
      console.error('❌ MongoDB connection failed:', error);
      throw error;
    }
  }

  async disconnect() {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.db = null;
      console.log('🔌 MongoDB disconnected');
    }
  }

  // Orders operations
  async getOrders(filter = {}) {
    const db = await this.connect();
    return await db.collection('orders').find(filter).toArray();
  }

  async getOrderById(id) {
    const db = await this.connect();
    return await db.collection('orders').findOne({ id: parseInt(id) });
  }

  async createOrder(order) {
    const db = await this.connect();
    const result = await db.collection('orders').insertOne(order);
    return { ...order, _id: result.insertedId };
  }

  async updateOrder(id, updates) {
    const db = await this.connect();
    const result = await db.collection('orders').updateOne(
      { id: parseInt(id) },
      { $set: updates }
    );
    return result;
  }

  async deleteOrder(id) {
    const db = await this.connect();
    return await db.collection('orders').deleteOne({ id: parseInt(id) });
  }

  // Customers operations
  async getCustomers(filter = {}) {
    const db = await this.connect();
    return await db.collection('customers').find(filter).toArray();
  }

  async getCustomerById(id) {
    const db = await this.connect();
    return await db.collection('customers').findOne({ id: parseInt(id) });
  }

  async createCustomer(customer) {
    const db = await this.connect();
    const result = await db.collection('customers').insertOne(customer);
    return { ...customer, _id: result.insertedId };
  }

  async updateCustomer(id, updates) {
    const db = await this.connect();
    const result = await db.collection('customers').updateOne(
      { id: parseInt(id) },
      { $set: updates }
    );
    return result;
  }

  async deleteCustomer(id) {
    const db = await this.connect();
    return await db.collection('customers').deleteOne({ id: parseInt(id) });
  }

  // Analytics operations
  async getDailySales() {
    const db = await this.connect();
    return await db.collection('dailySales').find({}).toArray();
  }

  async getWeeklySales() {
    const db = await this.connect();
    return await db.collection('weeklySales').find({}).toArray();
  }

  async saveDailySales(dailySales) {
    const db = await this.connect();
    await db.collection('dailySales').deleteMany({});
    if (dailySales.length > 0) {
      return await db.collection('dailySales').insertMany(dailySales);
    }
  }

  async saveWeeklySales(weeklySales) {
    const db = await this.connect();
    await db.collection('weeklySales').deleteMany({});
    if (weeklySales.length > 0) {
      return await db.collection('weeklySales').insertMany(weeklySales);
    }
  }

  // Predictions and Reports
  async getPredictions() {
    const db = await this.connect();
    return await db.collection('predictions').find({}).toArray();
  }

  async getReports() {
    const db = await this.connect();
    return await db.collection('reports').find({}).toArray();
  }

  async savePredictions(predictions) {
    const db = await this.connect();
    await db.collection('predictions').deleteMany({});
    if (predictions.length > 0) {
      return await db.collection('predictions').insertMany(predictions);
    }
  }

  async saveReports(reports) {
    const db = await this.connect();
    await db.collection('reports').deleteMany({});
    if (reports.length > 0) {
      return await db.collection('reports').insertMany(reports);
    }
  }

  // Notifications
  async getNotifications() {
    const db = await this.connect();
    return await db.collection('notifications').find({}).toArray();
  }

  async saveNotifications(notifications) {
    const db = await this.connect();
    await db.collection('notifications').deleteMany({});
    if (notifications.length > 0) {
      return await db.collection('notifications').insertMany(notifications);
    }
  }

  // Utility methods
  async getNextId(collectionName) {
    const db = await this.connect();
    const result = await db.collection(collectionName)
      .find({})
      .sort({ id: -1 })
      .limit(1)
      .toArray();
    
    return result.length > 0 ? result[0].id + 1 : 1;
  }

  async getCollectionStats() {
    const db = await this.connect();
    const collections = ['orders', 'customers', 'dailySales', 'weeklySales', 'predictions', 'reports', 'notifications'];
    const stats = {};
    
    for (const collectionName of collections) {
      const count = await db.collection(collectionName).countDocuments();
      stats[collectionName] = count;
    }
    
    return stats;
  }
}

// Singleton instance
const databaseService = new DatabaseService();

module.exports = databaseService; 