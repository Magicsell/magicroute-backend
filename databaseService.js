const { MongoClient } = require('mongodb');

class DatabaseService {
  constructor() {
    this.client = null;
    this.db = null;
    this.uri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
    this.dbName = 'magicsell';
  }

  async connect() {
    try {
      this.client = new MongoClient(this.uri);
      await this.client.connect();
      this.db = this.client.db(this.dbName);
      console.log('✅ Connected to MongoDB');
      return true;
    } catch (error) {
      console.error('❌ MongoDB connection failed:', error.message);
      throw error;
    }
  }

  async disconnect() {
    if (this.client) {
      await this.client.close();
      console.log('🔌 MongoDB connection closed');
    }
  }

  // Orders
  async getOrders() {
    try {
      const collection = this.db.collection('orders');
      return await collection.find({}).toArray();
    } catch (error) {
      console.error('Error getting orders:', error.message);
      return [];
    }
  }

  async saveOrders(orders) {
    try {
      const collection = this.db.collection('orders');
      await collection.deleteMany({});
      if (orders.length > 0) {
        await collection.insertMany(orders);
      }
      return true;
    } catch (error) {
      console.error('Error saving orders:', error.message);
      return false;
    }
  }

  async createOrder(order) {
    try {
      const collection = this.db.collection('orders');
      const result = await collection.insertOne(order);
      return result.insertedId;
    } catch (error) {
      console.error('Error creating order:', error.message);
      throw error;
    }
  }

  async updateOrder(id, updates) {
    try {
      const collection = this.db.collection('orders');
      const result = await collection.updateOne(
        { _id: id },
        { $set: updates }
      );
      return result.modifiedCount > 0;
    } catch (error) {
      console.error('Error updating order:', error.message);
      throw error;
    }
  }

  async deleteOrder(id) {
    try {
      const collection = this.db.collection('orders');
      const result = await collection.deleteOne({ _id: id });
      return result.deletedCount > 0;
    } catch (error) {
      console.error('Error deleting order:', error.message);
      throw error;
    }
  }

  // Customers
  async getCustomers() {
    try {
      const collection = this.db.collection('customers');
      return await collection.find({}).toArray();
    } catch (error) {
      console.error('Error getting customers:', error.message);
      return [];
    }
  }

  async saveCustomers(customers) {
    try {
      const collection = this.db.collection('customers');
      await collection.deleteMany({});
      if (customers.length > 0) {
        await collection.insertMany(customers);
      }
      return true;
    } catch (error) {
      console.error('Error saving customers:', error.message);
      return false;
    }
  }

  async createCustomer(customer) {
    try {
      const collection = this.db.collection('customers');
      const result = await collection.insertOne(customer);
      return result.insertedId;
    } catch (error) {
      console.error('Error creating customer:', error.message);
      throw error;
    }
  }

  async updateCustomer(id, updates) {
    try {
      const collection = this.db.collection('customers');
      const result = await collection.updateOne(
        { _id: id },
        { $set: updates }
      );
      return result.modifiedCount > 0;
    } catch (error) {
      console.error('Error updating customer:', error.message);
      throw error;
    }
  }

  async deleteCustomer(id) {
    try {
      const collection = this.db.collection('customers');
      const result = await collection.deleteOne({ _id: id });
      return result.deletedCount > 0;
    } catch (error) {
      console.error('Error deleting customer:', error.message);
      throw error;
    }
  }

  // Analytics
  async getDailySales() {
    try {
      const collection = this.db.collection('dailySales');
      return await collection.find({}).toArray();
    } catch (error) {
      console.error('Error getting daily sales:', error.message);
      return [];
    }
  }

  async saveDailySales(dailySales) {
    try {
      const collection = this.db.collection('dailySales');
      await collection.deleteMany({});
      if (dailySales.length > 0) {
        await collection.insertMany(dailySales);
      }
      return true;
    } catch (error) {
      console.error('Error saving daily sales:', error.message);
      return false;
    }
  }

  async getWeeklySales() {
    try {
      const collection = this.db.collection('weeklySales');
      return await collection.find({}).toArray();
    } catch (error) {
      console.error('Error getting weekly sales:', error.message);
      return [];
    }
  }

  async saveWeeklySales(weeklySales) {
    try {
      const collection = this.db.collection('weeklySales');
      await collection.deleteMany({});
      if (weeklySales.length > 0) {
        await collection.insertMany(weeklySales);
      }
      return true;
    } catch (error) {
      console.error('Error saving weekly sales:', error.message);
      return false;
    }
  }

  async getPredictions() {
    try {
      const collection = this.db.collection('predictions');
      return await collection.find({}).toArray();
    } catch (error) {
      console.error('Error getting predictions:', error.message);
      return [];
    }
  }

  async savePredictions(predictions) {
    try {
      const collection = this.db.collection('predictions');
      await collection.deleteMany({});
      if (predictions.length > 0) {
        await collection.insertMany(predictions);
      }
      return true;
    } catch (error) {
      console.error('Error saving predictions:', error.message);
      return false;
    }
  }

  async getReports() {
    try {
      const collection = this.db.collection('reports');
      return await collection.find({}).toArray();
    } catch (error) {
      console.error('Error getting reports:', error.message);
      return [];
    }
  }

  async saveReports(reports) {
    try {
      const collection = this.db.collection('reports');
      await collection.deleteMany({});
      if (reports.length > 0) {
        await collection.insertMany(reports);
      }
      return true;
    } catch (error) {
      console.error('Error saving reports:', error.message);
      return false;
    }
  }

  async getNotifications() {
    try {
      const collection = this.db.collection('notifications');
      return await collection.find({}).toArray();
    } catch (error) {
      console.error('Error getting notifications:', error.message);
      return [];
    }
  }

  async saveNotifications(notifications) {
    try {
      const collection = this.db.collection('notifications');
      await collection.deleteMany({});
      if (notifications.length > 0) {
        await collection.insertMany(notifications);
      }
      return true;
    } catch (error) {
      console.error('Error saving notifications:', error.message);
      return false;
    }
  }

  // Utility methods
  async getNextId(collectionName) {
    try {
      const collection = this.db.collection('counters');
      const result = await collection.findOneAndUpdate(
        { _id: collectionName },
        { $inc: { sequence_value: 1 } },
        { upsert: true, returnDocument: 'after' }
      );
      return result.value.sequence_value;
    } catch (error) {
      console.error('Error getting next ID:', error.message);
      return Date.now();
    }
  }

  async getCollectionStats() {
    try {
      const stats = {};
      const collections = ['orders', 'customers', 'dailySales', 'weeklySales', 'predictions', 'reports', 'notifications'];
      
      for (const collectionName of collections) {
        const collection = this.db.collection(collectionName);
        const count = await collection.countDocuments();
        stats[collectionName] = count;
      }
      
      return stats;
    } catch (error) {
      console.error('Error getting collection stats:', error.message);
      return {};
    }
  }
}

module.exports = DatabaseService; 