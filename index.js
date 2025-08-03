const express = require('express');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const DatabaseService = require('./databaseService');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production' 
      ? ["https://magicroute-frontend.vercel.app"] // Frontend'in ayrı proje URL'si
      : ["http://localhost:3000", "http://localhost:3001", "http://localhost:3002"],
    methods: ["GET", "POST", "PUT", "DELETE"]
  }
});

// Mapbox token configuration
const MAPBOX_TOKEN = process.env.MAPBOX_TOKEN;

// Security middleware
app.use((req, res, next) => {
  // Security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  
  // Cache control headers
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  
  next();
});

// Middleware
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ["https://magicroute-frontend.vercel.app"] // Frontend'in ayrı proje URL'si
    : ["http://localhost:3000", "http://localhost:3001", "http://localhost:3002"],
  credentials: true
}));
app.use(express.json());

// Database service initialization
const dbService = new DatabaseService();
let isConnected = false;

// Data storage functions (fallback to file-based)
const dataFile = process.env.NODE_ENV === 'production' 
  ? path.join(__dirname, 'data_production.json')
  : path.join(__dirname, 'data.json');

console.log('📁 Using data file:', dataFile);
console.log('🌍 Environment:', process.env.NODE_ENV || 'development');
console.log('🗄️ MongoDB URI:', process.env.MONGODB_URI ? 'Configured' : 'Not configured');

async function loadData() {
  try {
    // Try MongoDB first if available
    if (process.env.MONGODB_URI && !isConnected) {
      try {
        await dbService.connect();
        isConnected = true;
        console.log('✅ Connected to MongoDB');
      } catch (error) {
        console.log('❌ MongoDB connection failed, using file-based storage:', error.message);
        isConnected = false;
      }
    }

    if (isConnected) {
      // Load from MongoDB
      const orders = await dbService.getOrders();
      const customers = await dbService.getCustomers();
      const dailySales = await dbService.getDailySales();
      const weeklySales = await dbService.getWeeklySales();
      const predictions = await dbService.getPredictions();
      const reports = await dbService.getReports();
      const notifications = await dbService.getNotifications();
      
      console.log('📊 Loaded data from MongoDB:', {
        orders: orders.length,
        customers: customers.length,
        dailySales: dailySales.length,
        weeklySales: weeklySales.length,
        predictions: predictions.length,
        reports: reports.length,
        notifications: notifications.length
      });
      
      return { orders, customers, dailySales, weeklySales, predictions, reports, notifications };
    } else {
      // Fallback to file-based storage
      if (fs.existsSync(dataFile)) {
        const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
        let orders = data.orders || [];
        let customers = data.customers || [];
        let dailySales = data.dailySales || [];
        let weeklySales = data.weeklySales || [];
        let predictions = data.predictions || [];
        let reports = data.reports || [];
        let notifications = data.notifications || [];
        
        console.log('📊 Loaded data from file:', {
          orders: orders.length,
          customers: customers.length,
          dailySales: dailySales.length,
          weeklySales: weeklySales.length,
          predictions: predictions.length,
          reports: reports.length,
          notifications: notifications.length
        });
        
        // Add createdAt to orders that don't have it
        let updated = false;
        orders.forEach(order => {
          if (!order.createdAt) {
            order.createdAt = order.deliveredAt || new Date().toISOString();
            updated = true;
          }
        });
        
        if (updated) {
          saveData({ orders, customers, dailySales, weeklySales, predictions, reports, notifications });
          console.log('📅 Added createdAt to orders');
        }
        
        return { orders, customers, dailySales, weeklySales, predictions, reports, notifications };
      }
    }
  } catch (error) {
    console.log('Error loading data:', error.message);
  }
  
  // Default data if file doesn't exist
  return {
    orders: [],
    customers: [],
    dailySales: [],
    weeklySales: [],
    predictions: [],
    reports: [],
    notifications: []
  };
}

// Function to recalculate analytics data based on current orders
function recalculateAnalytics(orders) {
  console.log('🔄 Recalculating analytics data...');
  
  // Group orders by date
  const ordersByDate = {};
  const ordersByWeek = {};
  
  orders.forEach(order => {
    if (order.createdAt) {
      const date = order.createdAt.split('T')[0];
      const week = getWeekNumber(new Date(order.createdAt));
      
      if (!ordersByDate[date]) {
        ordersByDate[date] = [];
      }
      if (!ordersByWeek[week]) {
        ordersByWeek[week] = [];
      }
      
      ordersByDate[date].push(order);
      ordersByWeek[week].push(order);
    }
  });
  
  // Calculate daily sales
  const dailySales = Object.keys(ordersByDate).map(date => {
    const dayOrders = ordersByDate[date];
    const totalRevenue = dayOrders.reduce((sum, order) => sum + parseFloat(order.totalAmount || 0), 0);
    const totalOrders = dayOrders.length;
    const deliveredOrders = dayOrders.filter(order => order.status === 'Delivered').length;
    const pendingOrders = dayOrders.filter(order => order.status === 'Pending').length;
    const inProcessOrders = dayOrders.filter(order => order.status === 'In Process').length;
    
    // Calculate payment breakdown
    const paymentBreakdown = { Balance: 0, Cash: 0, Card: 0, Bank: 0 };
    dayOrders.forEach(order => {
      const method = order.paymentMethod || 'Not Set';
      const amount = parseFloat(order.totalAmount || 0);
      if (method === 'Bank Transfer') {
        paymentBreakdown['Bank'] += amount;
      } else if (paymentBreakdown.hasOwnProperty(method)) {
        paymentBreakdown[method] += amount;
      }
    });
    
    // Find top shop
    const shopRevenue = {};
    dayOrders.forEach(order => {
      const shop = order.shopName;
      shopRevenue[shop] = (shopRevenue[shop] || 0) + parseFloat(order.totalAmount || 0);
    });
    
    const topShop = Object.keys(shopRevenue).reduce((a, b) => 
      shopRevenue[a] > shopRevenue[b] ? a : b, 'N/A');
    const topShopRevenue = shopRevenue[topShop] || 0;
    
    return {
      id: parseInt(date.replace(/-/g, '')),
      date: date,
      totalRevenue: totalRevenue,
      totalOrders: totalOrders,
      deliveredOrders: deliveredOrders,
      pendingOrders: pendingOrders,
      inProcessOrders: inProcessOrders,
      averageOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0,
      topShop: topShop,
      topShopRevenue: topShopRevenue,
      paymentBreakdown: paymentBreakdown
    };
  });
  
  // Calculate weekly sales
  const weeklySales = Object.keys(ordersByWeek).map(week => {
    const weekOrders = ordersByWeek[week];
    const totalRevenue = weekOrders.reduce((sum, order) => sum + parseFloat(order.totalAmount || 0), 0);
    const totalOrders = weekOrders.length;
    const deliveredOrders = weekOrders.filter(order => order.status === 'Delivered').length;
    const pendingOrders = weekOrders.filter(order => order.status === 'Pending').length;
    const inProcessOrders = weekOrders.filter(order => order.status === 'In Process').length;
    
    // Calculate payment breakdown
    const paymentBreakdown = { Balance: 0, Cash: 0, Card: 0, Bank: 0 };
    weekOrders.forEach(order => {
      const method = order.paymentMethod || 'Not Set';
      const amount = parseFloat(order.totalAmount || 0);
      if (method === 'Bank Transfer') {
        paymentBreakdown['Bank'] += amount;
      } else if (paymentBreakdown.hasOwnProperty(method)) {
        paymentBreakdown[method] += amount;
      }
    });
    
    // Find top shop
    const shopRevenue = {};
    weekOrders.forEach(order => {
      const shop = order.shopName;
      shopRevenue[shop] = (shopRevenue[shop] || 0) + parseFloat(order.totalAmount || 0);
    });
    
    const topShop = Object.keys(shopRevenue).reduce((a, b) => 
      shopRevenue[a] > shopRevenue[b] ? a : b, 'N/A');
    const topShopRevenue = shopRevenue[topShop] || 0;
    
    return {
      id: parseInt(week.replace('W', '')),
      week: week,
      totalRevenue: totalRevenue,
      totalOrders: totalOrders,
      deliveredOrders: deliveredOrders,
      pendingOrders: pendingOrders,
      inProcessOrders: inProcessOrders,
      averageOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0,
      topShop: topShop,
      topShopRevenue: topShopRevenue,
      paymentBreakdown: paymentBreakdown
    };
  });
  
  // Generate predictions
  const predictions = [{
    id: 1,
    type: "revenue",
    timeframe: "tomorrow",
    predictedValue: dailySales.length > 0 ? dailySales[dailySales.length - 1].totalRevenue * 1.1 : 850.00,
    confidence: 85,
    factors: ["historical_trend", "day_of_week", "seasonal_pattern"]
  }];
  
  // Generate reports
  const latestWeekly = weeklySales[weeklySales.length - 1] || {};
  const reports = [{
    id: 1,
    type: "comprehensive",
    date: new Date().toISOString().split('T')[0],
    totalRevenue: latestWeekly.totalRevenue || 0,
    totalOrders: latestWeekly.totalOrders || 0,
    averageOrderValue: latestWeekly.averageOrderValue || 0,
    topShop: latestWeekly.topShop || 'N/A',
    paymentBreakdown: latestWeekly.paymentBreakdown || { Balance: 0, Cash: 0, Card: 0, Bank: 0 }
  }];
  
  // Generate notifications
  const notifications = [];
  const latestOrder = orders[orders.length - 1];
  if (latestOrder && latestOrder.status === 'Delivered') {
    notifications.push({
      id: 1,
      type: "order_update",
      message: `Order #${latestOrder.id} delivered successfully`,
      timestamp: latestOrder.deliveredAt || new Date().toISOString(),
      read: false
    });
  }
  
  console.log('✅ Analytics recalculation completed');
  console.log('📊 Daily Sales:', dailySales.length, 'entries');
  console.log('📊 Weekly Sales:', weeklySales.length, 'entries');
  console.log('📊 Total Revenue:', orders.reduce((sum, order) => sum + parseFloat(order.totalAmount || 0), 0));
  console.log('📊 Total Orders:', orders.length);
  
  return { dailySales, weeklySales, predictions, reports, notifications };
}

// Function to force recalculation and save analytics data
async function forceRecalculateAndSaveAnalytics() {
  console.log('🔄 Force recalculating and saving analytics data...');
  const data = await loadData();
  const { dailySales, weeklySales, predictions, reports, notifications } = recalculateAnalytics(data.orders);
  
  const updatedData = {
    ...data,
    dailySales,
    weeklySales,
    predictions,
    reports,
    notifications
  };
  
  await saveData(updatedData);
  console.log('✅ Analytics data force recalculated and saved');
  return updatedData;
}

// Helper function to get week number
function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return `${d.getUTCFullYear()}-W${Math.ceil((((d - yearStart) / 86400000) + 1) / 7)}`;
}

async function saveData(data) {
  try {
    if (isConnected) {
      // Save to MongoDB
      await dbService.saveOrders(data.orders || []);
      await dbService.saveCustomers(data.customers || []);
      await dbService.saveDailySales(data.dailySales || []);
      await dbService.saveWeeklySales(data.weeklySales || []);
      await dbService.savePredictions(data.predictions || []);
      await dbService.saveReports(data.reports || []);
      await dbService.saveNotifications(data.notifications || []);
      console.log('✅ Data saved to MongoDB successfully');
    } else {
      // Fallback to file-based storage
      // Create backup before saving
      const backupFile = dataFile.replace('.json', `_backup_${new Date().toISOString().split('T')[0]}.json`);
      if (fs.existsSync(dataFile)) {
        fs.copyFileSync(dataFile, backupFile);
        console.log('✅ Backup created:', backupFile);
      }
      
      // Save new data
      fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
      console.log('✅ Data saved to file successfully');
      
      // Keep only last 5 backups
      const backupDir = path.dirname(dataFile);
      const backupFiles = fs.readdirSync(backupDir)
        .filter(file => file.includes('_backup_'))
        .sort()
        .reverse();
      
      if (backupFiles.length > 5) {
        backupFiles.slice(5).forEach(file => {
          fs.unlinkSync(path.join(backupDir, file));
          console.log('🗑️ Old backup removed:', file);
        });
      }
    }
  } catch (error) {
    console.log('❌ Error saving data:', error.message);
  }
}

// Load initial data
let { orders, customers, dailySales, weeklySales, predictions, reports, notifications } = { orders: [], customers: [], dailySales: [], weeklySales: [], predictions: [], reports: [], notifications: [] };

// Initialize data loading
(async () => {
  const data = await loadData();
  orders = data.orders;
  customers = data.customers;
  dailySales = data.dailySales;
  weeklySales = data.weeklySales;
  predictions = data.predictions;
  reports = data.reports;
  notifications = data.notifications;
  console.log('🚀 Application initialized with data');
})();

// Routes
app.get('/', (req, res) => {
  res.json({ message: 'MagicSell Backend API' });
});

// Orders API
app.get('/api/orders', (req, res) => {
  const { 
    search, 
    status, 
    paymentMethod, 
    minAmount, 
    maxAmount, 
    startDate, 
    endDate,
    shopName,
    customerName,
    customerPhone
  } = req.query;

  let filteredOrders = [...orders];

  // Search functionality
  if (search) {
    const searchLower = search.toLowerCase();
    filteredOrders = filteredOrders.filter(order => 
      order.shopName?.toLowerCase().includes(searchLower) ||
      order.customerName?.toLowerCase().includes(searchLower) ||
      order.customerPhone?.includes(search) ||
      order.customerAddress?.toLowerCase().includes(searchLower) ||
      order.customerPostcode?.toLowerCase().includes(searchLower) ||
      order.basketNo?.toString().includes(search) ||
      order.id?.toString().includes(search) ||
      order.deliveryNo?.toLowerCase().includes(searchLower)
    );
  }

  // Status filter
  if (status) {
    filteredOrders = filteredOrders.filter(order => order.status === status);
  }

  // Payment method filter
  if (paymentMethod) {
    filteredOrders = filteredOrders.filter(order => order.paymentMethod === paymentMethod);
  }

  // Amount range filter
  if (minAmount || maxAmount) {
    filteredOrders = filteredOrders.filter(order => {
      const amount = parseFloat(order.totalAmount);
      if (minAmount && maxAmount) {
        return amount >= parseFloat(minAmount) && amount <= parseFloat(maxAmount);
      } else if (minAmount) {
        return amount >= parseFloat(minAmount);
      } else if (maxAmount) {
        return amount <= parseFloat(maxAmount);
      }
      return true;
    });
  }

  // Date range filter
  if (startDate || endDate) {
    filteredOrders = filteredOrders.filter(order => {
      const orderDate = new Date(order.deliveredAt || order.createdAt || new Date());
      if (startDate && endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);
        return orderDate >= start && orderDate <= end;
      } else if (startDate) {
        const start = new Date(startDate);
        return orderDate >= start;
      } else if (endDate) {
        const end = new Date(endDate);
        return orderDate <= end;
      }
      return true;
    });
  }

  // Shop name filter
  if (shopName) {
    filteredOrders = filteredOrders.filter(order => 
      order.shopName?.toLowerCase().includes(shopName.toLowerCase())
    );
  }

  // Customer name filter
  if (customerName) {
    filteredOrders = filteredOrders.filter(order => 
      order.customerName?.toLowerCase().includes(customerName.toLowerCase())
    );
  }

  // Customer phone filter
  if (customerPhone) {
    filteredOrders = filteredOrders.filter(order => 
      order.customerPhone?.includes(customerPhone)
    );
  }

  res.json(filteredOrders);
});

app.post('/api/orders', async (req, res) => {
  try {
    // Find the next available ID
    const maxId = Math.max(...orders.map(order => order.id), 0);
    const newOrder = {
      id: maxId + 1,
      ...req.body,
      basketNo: maxId + 1,
      deliveryNo: `D${String(maxId + 1).padStart(3, '0')}`,
      status: 'Pending',
      deliveryNotes: '',
      createdAt: new Date().toISOString(),
      deliveredAt: null,
      paymentMethod: req.body.paymentMethod || ''
    };
    orders.push(newOrder);
    
    // Recalculate analytics data after adding new order
    const { dailySales: newDailySales, weeklySales: newWeeklySales, predictions: newPredictions, reports: newReports, notifications: newNotifications } = recalculateAnalytics(orders);
    
    // Update global variables with recalculated data
    dailySales.length = 0;
    dailySales.push(...newDailySales);
    weeklySales.length = 0;
    weeklySales.push(...newWeeklySales);
    predictions.length = 0;
    predictions.push(...newPredictions);
    reports.length = 0;
    reports.push(...newReports);
    notifications.length = 0;
    notifications.push(...newNotifications);
    
    // Save to MongoDB if connected, otherwise fallback to file
    await saveData({ orders, customers, dailySales, weeklySales, predictions, reports, notifications });
    
    // Broadcast new order to all connected clients
    io.emit('order-updated', { orderId: newOrder.id, newOrder });
    
    console.log('✅ New order created and saved to MongoDB:', newOrder.id);
    res.status(201).json(newOrder);
  } catch (error) {
    console.error('❌ Error creating order:', error);
    res.status(500).json({ message: 'Error creating order', error: error.message });
  }
});

app.put('/api/orders/:id', async (req, res) => {
  try {
    console.log('🔄 PUT /api/orders/:id - Request received');
    console.log('📥 Request params:', req.params);
    console.log('📥 Request body:', req.body);
    
    const id = parseInt(req.params.id);
    console.log('🔍 Looking for order with ID:', id);
    
    const orderIndex = orders.findIndex(order => order.id === id);
    console.log('📍 Order found at index:', orderIndex);
    
    if (orderIndex === -1) {
      console.log('❌ Order not found with ID:', id);
      return res.status(404).json({ message: 'Order not found' });
    }
    
    console.log('📋 Original order:', orders[orderIndex]);
    
    // Update order with new fields
    const updatedOrder = { 
      ...orders[orderIndex], 
      ...req.body,
      // Add delivery notes and delivered time if status is Delivered
      ...(req.body.status === 'Delivered' && {
        deliveryNotes: req.body.deliveryNotes || '',
        deliveredAt: req.body.deliveredAt || new Date().toISOString()
      }),
      // Ensure payment method is always a string
      paymentMethod: req.body.paymentMethod || ''
    };
    
    console.log('✅ Updated order:', updatedOrder);
    
    orders[orderIndex] = updatedOrder;
    
    // Recalculate analytics data after order update
    const { dailySales: newDailySales, weeklySales: newWeeklySales, predictions: newPredictions, reports: newReports, notifications: newNotifications } = recalculateAnalytics(orders);
    
    // Update global variables with recalculated data
    dailySales.length = 0;
    dailySales.push(...newDailySales);
    weeklySales.length = 0;
    weeklySales.push(...newWeeklySales);
    predictions.length = 0;
    predictions.push(...newPredictions);
    reports.length = 0;
    reports.push(...newReports);
    notifications.length = 0;
    notifications.push(...newNotifications);
    
    // Save to MongoDB if connected, otherwise fallback to file
    await saveData({ orders, customers, dailySales, weeklySales, predictions, reports, notifications });
    
    // Broadcast order update to all connected clients
    io.emit('order-updated', { orderId: id, updatedOrder });
    console.log('📡 Broadcasted order update to all clients');
    
    console.log('💾 Data saved successfully to MongoDB with recalculated analytics');
    res.json(updatedOrder);
  } catch (error) {
    console.error('❌ Error updating order:', error);
    res.status(500).json({ message: 'Error updating order', error: error.message });
  }
});

app.delete('/api/orders/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const orderIndex = orders.findIndex(order => order.id === id);
    
    if (orderIndex === -1) {
      return res.status(404).json({ message: 'Order not found' });
    }
    
    orders.splice(orderIndex, 1);
    
    // Recalculate analytics data after deleting order
    const { dailySales: newDailySales, weeklySales: newWeeklySales, predictions: newPredictions, reports: newReports, notifications: newNotifications } = recalculateAnalytics(orders);
    
    // Update global variables with recalculated data
    dailySales.length = 0;
    dailySales.push(...newDailySales);
    weeklySales.length = 0;
    weeklySales.push(...newWeeklySales);
    predictions.length = 0;
    predictions.push(...newPredictions);
    reports.length = 0;
    reports.push(...newReports);
    notifications.length = 0;
    notifications.push(...newNotifications);
    
    // Save to MongoDB if connected, otherwise fallback to file
    await saveData({ orders, customers, dailySales, weeklySales, predictions, reports, notifications });
    
    // Broadcast order deletion to all connected clients
    io.emit('order-updated', { orderId: id, deleted: true });
    console.log('📡 Broadcasted order deletion to all clients');
    
    console.log('✅ Order deleted and saved to MongoDB:', id);
    res.json({ message: 'Order deleted' });
  } catch (error) {
    console.error('❌ Error deleting order:', error);
    res.status(500).json({ message: 'Error deleting order', error: error.message });
  }
});

// Mapbox Route Optimization API
app.post('/api/optimize-route', async (req, res) => {
  try {
    const { startPostcode = "BH13 7EX", orders: requestOrders = [] } = req.body;
    const ordersToOptimize = requestOrders.length > 0 ? requestOrders : orders;
    const activeOrders = ordersToOptimize.filter(order => 
      order.status === 'Pending' || order.status === 'In Process'
    );

    console.log(`🔴 Route optimization requested for ${activeOrders.length} active orders`);
    console.log(`🔴 Start postcode: ${startPostcode}`);

    if (activeOrders.length === 0) {
      return res.json({
        route: [],
        totalDistance: 0,
        startPoint: startPostcode,
        message: 'No active orders to optimize'
      });
    }

    if (!MAPBOX_TOKEN) {
      return res.json({
        route: activeOrders,
        totalDistance: 0,
        startPoint: startPostcode,
        message: 'Mapbox token required for full optimization'
      });
    }

    // Depot coordinates (Poole)
    const depotCoords = { lng: -1.9876, lat: 50.7128 };
    console.log(`🔴 Depot coordinates: [${depotCoords.lng}, ${depotCoords.lat}]`);

    // Step 1: Geocode all postcodes
    const ordersWithCoordinates = [];
    
    for (const order of activeOrders) {
      if (!order.customerPostcode) {
        console.log(`⚠️ Order ${order.id} (Basket ${order.basketNo}) skipped - no postcode`);
        continue;
      }
      
      try {
        console.log(`📍 Geocoding: ${order.customerPostcode} for Order #${order.basketNo}`);
        const geocodingUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(order.customerPostcode)}.json?access_token=${MAPBOX_TOKEN}&country=GB`;
        const response = await axios.get(geocodingUrl);
        
        if (response.data.features && response.data.features.length > 0) {
          const [lng, lat] = response.data.features[0].center;
          console.log(`✅ Order #${order.basketNo} geocoded: [${lng}, ${lat}]`);
          ordersWithCoordinates.push({
            ...order,
            coordinates: { lng, lat }
          });
        } else {
          console.log(`❌ Order #${order.basketNo} - no geocoding results for: ${order.customerPostcode}`);
          ordersWithCoordinates.push({
            ...order,
            coordinates: null
          });
        }
      } catch (err) {
        console.error(`❌ Geocoding error for Order #${order.basketNo}:`, err.message);
        ordersWithCoordinates.push({
          ...order,
          coordinates: null
        });
      }
    }

    // Step 2: Filter orders with valid coordinates
    const validOrders = ordersWithCoordinates.filter(order => order.coordinates);
    console.log(`🔴 Valid orders with coordinates: ${validOrders.length}/${activeOrders.length}`);

    if (validOrders.length === 0) {
      return res.json({
        route: activeOrders,
        totalDistance: 0,
        startPoint: startPostcode,
        message: 'No orders with valid coordinates found'
      });
    }

    // Step 3: Calculate distances from depot and sort
    const ordersWithDistance = validOrders.map(order => ({
      ...order,
      distanceFromDepot: calculateHaversineDistance(
        depotCoords.lat, depotCoords.lng,
        order.coordinates.lat, order.coordinates.lng
      )
    }));

    // Sort by distance from depot (nearest first)
    ordersWithDistance.sort((a, b) => a.distanceFromDepot - b.distanceFromDepot);

    console.log(`🔴 Orders sorted by distance from depot:`);
    ordersWithDistance.forEach((order, index) => {
      console.log(`  ${index + 1}. Order #${order.basketNo} (${order.customerPostcode}) - ${order.distanceFromDepot.toFixed(2)} km`);
    });

    // Step 4: Build optimized route
    const optimizedRoute = [];
    let totalRouteDistance = 0;
    let previousLocation = depotCoords;

    ordersWithDistance.forEach((order, index) => {
      const distanceToOrder = calculateHaversineDistance(
        previousLocation.lat, previousLocation.lng,
        order.coordinates.lat, order.coordinates.lng
      );
      
      order.routeDistance = distanceToOrder;
      order.routeOrder = index + 1;
      totalRouteDistance += distanceToOrder;
      optimizedRoute.push(order);
      
      console.log(`🚗 Route stop ${index + 1}: Order #${order.basketNo} (${order.customerPostcode}) - ${distanceToOrder.toFixed(2)} km`);
      
      previousLocation = order.coordinates;
    });

    // Add orders without coordinates at the end
    const ordersWithoutCoordinates = ordersWithCoordinates.filter(order => !order.coordinates);
    if (ordersWithoutCoordinates.length > 0) {
      console.log(`⚠️ Adding ${ordersWithoutCoordinates.length} orders without coordinates at the end`);
      optimizedRoute.push(...ordersWithoutCoordinates);
    }

    console.log(`✅ Route optimization completed!`);
    console.log(`📊 Total distance: ${totalRouteDistance.toFixed(2)} km`);
    console.log(`📋 Final route:`, optimizedRoute.map(order => `#${order.basketNo} (${order.customerPostcode})`));

    res.json({
      route: optimizedRoute,
      totalDistance: Math.round(totalRouteDistance * 100) / 100,
      startPoint: startPostcode,
      message: 'Route optimized successfully with distance-based sorting'
    });

  } catch (error) {
    console.error('❌ Route optimization error:', error);
    res.status(500).json({ 
      message: 'Error optimizing route',
      error: error.message 
    });
  }
});

// Haversine distance calculation
function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// Customers API
app.get('/api/customers', (req, res) => {
  const { page = 1, limit = 10, sortBy = 'shopName', sortOrder = 'asc' } = req.query;
  
  // Sort customers by shop name
  let sortedCustomers = [...customers];
  
  if (sortBy === 'shopName') {
    sortedCustomers.sort((a, b) => {
      const shopNameA = (a.shopName || '').toLowerCase();
      const shopNameB = (b.shopName || '').toLowerCase();
      
      if (sortOrder === 'desc') {
        return shopNameB.localeCompare(shopNameA);
      } else {
        return shopNameA.localeCompare(shopNameB);
      }
    });
  }
  
  // Calculate pagination
  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const startIndex = (pageNum - 1) * limitNum;
  const endIndex = startIndex + limitNum;
  
  // Get paginated results
  const paginatedCustomers = sortedCustomers.slice(startIndex, endIndex);
  
  // Return response with pagination info
  res.json({
    customers: paginatedCustomers,
    pagination: {
      currentPage: pageNum,
      totalPages: Math.ceil(sortedCustomers.length / limitNum),
      totalCustomers: sortedCustomers.length,
      customersPerPage: limitNum,
      hasNextPage: endIndex < sortedCustomers.length,
      hasPrevPage: pageNum > 1
    }
  });
});

app.post('/api/customers', (req, res) => {
  const newCustomer = {
    id: customers.length + 1,
    ...req.body
  };
  customers.push(newCustomer);
  saveData({ orders, customers, dailySales, weeklySales, predictions, reports, notifications });
  res.status(201).json(newCustomer);
});

app.put('/api/customers/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const customerIndex = customers.findIndex(customer => customer.id === id);
  
  if (customerIndex === -1) {
    return res.status(404).json({ message: 'Customer not found' });
  }
  
  customers[customerIndex] = { ...customers[customerIndex], ...req.body };
  saveData({ orders, customers, dailySales, weeklySales, predictions, reports, notifications });
  res.json(customers[customerIndex]);
});

app.delete('/api/customers/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const customerIndex = customers.findIndex(customer => customer.id === id);
  
  if (customerIndex === -1) {
    return res.status(404).json({ message: 'Customer not found' });
  }
  
  customers.splice(customerIndex, 1);
  saveData({ orders, customers, dailySales, weeklySales, predictions, reports, notifications });
  res.json({ message: 'Customer deleted' });
});

// Print route endpoint
app.post('/api/print-route', async (req, res) => {
  try {
    const { orders = [] } = req.body;
    
    console.log('=== PDF GENERATION DEBUG ===');
    console.log('Received orders:', orders);
    console.log('Orders length:', orders.length);
    console.log('First order sample:', orders[0]);
    
    if (!orders.length) {
      return res.status(400).json({ message: 'No orders to print' });
    }

    const doc = new PDFDocument({ 
      size: 'A4',
      margins: { top: 40, bottom: 40, left: 40, right: 40 }
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="delivery-route.pdf"');

    doc.pipe(res);

    // ===== HEADER SECTION =====
    // Top border line
    doc.rect(40, 40, 515, 1).fill();
    
    // Title
    doc.fontSize(28).font('Helvetica-Bold').text('MAGICSELL', { align: 'center' });
    doc.fontSize(16).font('Helvetica').text('DELIVERY ROUTE', { align: 'center' });
    
    // Bottom border line
    doc.rect(40, 85, 515, 1).fill();
    
    // ===== ROUTE INFO SECTION =====
    doc.moveDown(0.5);

    // Left column
    doc.fontSize(10).font('Helvetica-Bold');
    doc.text('DATE:', 50, 110);
    doc.text('START POINT:', 50, 125);
    doc.text('TOTAL ORDERS:', 50, 140);
    doc.text('DRIVER:', 50, 155);
    
    // Right column
    doc.fontSize(10).font('Helvetica');
    doc.text(new Date().toLocaleDateString('en-GB'), 150, 110);
    doc.text('BH13 7EX (Poole Depot)', 150, 125);
    doc.text(orders.length.toString(), 150, 140);
    doc.text('_________________', 150, 155);
    
    // ===== ROUTE TABLE =====
    doc.moveDown(2);
    
    // Table header
    const tableY = 200;
    const colWidths = [50, 80, 120, 150, 80, 60];
    const startX = 50;
    
    // Header background
    doc.rect(startX, tableY - 5, 450, 25).fill('#f0f0f0');
    
    // Header text
    doc.fontSize(10).font('Helvetica-Bold');
    doc.text('NO.', startX + 5, tableY);
    doc.text('SHOP NAME', startX + colWidths[0] + 5, tableY);
    doc.text('CUSTOMER', startX + colWidths[0] + colWidths[1] + 5, tableY);
    doc.text('ADDRESS', startX + colWidths[0] + colWidths[1] + colWidths[2] + 5, tableY);
    doc.text('POSTCODE', startX + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + 5, tableY);
    doc.text('PRICE', startX + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + colWidths[4] + 5, tableY);
    
    // Table rows
    let currentY = tableY + 30;
    
    orders.forEach((order, index) => {
      // Check if we need a new page
      if (currentY > 700) {
        doc.addPage();
        currentY = 50;
        
        // Repeat header on new page
        doc.rect(startX, currentY - 5, 450, 25).fill('#f0f0f0');
        doc.fontSize(10).font('Helvetica-Bold');
        doc.text('NO.', startX + 5, currentY);
        doc.text('SHOP NAME', startX + colWidths[0] + 5, currentY);
        doc.text('CUSTOMER', startX + colWidths[0] + colWidths[1] + 5, currentY);
        doc.text('ADDRESS', startX + colWidths[0] + colWidths[1] + colWidths[2] + 5, currentY);
        doc.text('POSTCODE', startX + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + 5, currentY);
        doc.text('PRICE', startX + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + colWidths[4] + 5, currentY);
        currentY += 30;
      }
      
      // Row border
      doc.rect(startX, currentY - 5, 450, 25).stroke();
      
      // Row content
      doc.fontSize(9).font('Helvetica');
      doc.text((index + 1).toString(), startX + 5, currentY);
      doc.text(order.shopName || 'N/A', startX + colWidths[0] + 5, currentY);
      doc.text(order.customerName || 'N/A', startX + colWidths[0] + colWidths[1] + 5, currentY);
      doc.text(order.customerAddress || 'N/A', startX + colWidths[0] + colWidths[1] + colWidths[2] + 5, currentY);
      doc.text(order.customerPostcode || 'N/A', startX + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + 5, currentY);
      doc.text(`£${order.totalAmount || '0'}`, startX + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + colWidths[4] + 5, currentY);
      
      currentY += 30;
    });
    
    // ===== SUMMARY SECTION =====
    doc.addPage();
    
    // Summary header
    doc.fontSize(20).font('Helvetica-Bold').text('ROUTE SUMMARY', { align: 'center' });
    doc.moveDown(1);
    
    // Summary box
    const summaryY = 100;
    doc.rect(50, summaryY, 495, 120).stroke();
    
    // Calculate totals
    const totalRevenue = orders.reduce((sum, order) => {
      return sum + parseFloat(order.totalAmount || 0);
    }, 0);

    const avgOrderValue = orders.length > 0 ? totalRevenue / orders.length : 0;
    
    // Summary content
    doc.fontSize(12).font('Helvetica-Bold');
    doc.text('ROUTE STATISTICS:', 60, summaryY + 20);
    
    doc.fontSize(10).font('Helvetica');
    doc.text(`• Total Orders: ${orders.length}`, 70, summaryY + 40);
    doc.text(`• Total Revenue: £${totalRevenue.toFixed(2)}`, 70, summaryY + 55);
    doc.text(`• Average Order Value: £${avgOrderValue.toFixed(2)}`, 70, summaryY + 70);
    doc.text(`• Route Distance: TBD km`, 70, summaryY + 85);
    doc.text(`• Estimated Time: TBD minutes`, 70, summaryY + 100);
    
    // ===== DELIVERY NOTES =====
    doc.moveDown(3);
    
    doc.fontSize(14).font('Helvetica-Bold').text('DELIVERY NOTES:', { underline: true });
    doc.moveDown(0.5);
    
    doc.fontSize(10).font('Helvetica');
    doc.text('• Start delivery from Poole Depot (BH13 7EX)');
    doc.text('• Follow the route order for maximum efficiency');
    doc.text('• Collect payment at each delivery point');
    doc.text('• Update order status after each delivery');
    doc.text('• Contact customer if delivery issues arise');
    doc.text('• Return to depot after completing all deliveries');
    
    // ===== FOOTER =====
    doc.moveDown(2);
    
    // Footer line
    doc.rect(40, 750, 515, 1).fill();
    
    // Footer text
    doc.fontSize(8).font('Helvetica');
    doc.text('Generated by MagicSell Delivery System', { align: 'center' });
    doc.text(`Date: ${new Date().toLocaleDateString('en-GB')} | Time: ${new Date().toLocaleTimeString('en-GB')}`, { align: 'center' });

    doc.end();

  } catch (error) {
    console.error('Error generating PDF:', error);
    res.status(500).json({ message: 'Error generating PDF' });
  }
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  // Send initial data to client
  socket.emit('data-update', { orders, customers });
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Daily Sales API endpoints
app.get('/api/daily-sales', (req, res) => {
  try {
    const data = loadData();
    const dailySales = data.dailySales || [];
    res.json(dailySales);
  } catch (error) {
    console.error('Error fetching daily sales:', error);
    res.status(500).json({ message: 'Error fetching daily sales' });
  }
});

app.get('/api/daily-sales/:date', (req, res) => {
  try {
    const { date } = req.params;
    const data = loadData();
    const dailySales = data.dailySales || [];
    const dailySale = dailySales.find(sale => sale.date === date);
    
    if (dailySale) {
      res.json(dailySale);
    } else {
      res.status(404).json({ message: 'Daily sale not found' });
    }
  } catch (error) {
    console.error('Error fetching daily sale:', error);
    res.status(500).json({ message: 'Error fetching daily sale' });
  }
});

app.post('/api/daily-sales', (req, res) => {
  try {
    const data = loadData();
    const dailySales = data.dailySales || [];
    const newDailySale = {
      id: dailySales.length + 1,
      ...req.body,
      createdAt: new Date().toISOString()
    };
    
    dailySales.push(newDailySale);
    saveData({ ...data, dailySales });
    
    res.status(201).json(newDailySale);
  } catch (error) {
    console.error('Error creating daily sale:', error);
    res.status(500).json({ message: 'Error creating daily sale' });
  }
});

// Weekly Sales API endpoints
app.get('/api/weekly-sales', (req, res) => {
  try {
    const data = loadData();
    const weeklySales = data.weeklySales || [];
    res.json(weeklySales);
  } catch (error) {
    console.error('Error fetching weekly sales:', error);
    res.status(500).json({ message: 'Error fetching weekly sales' });
  }
});

// Comprehensive Analytics API endpoint
app.get('/api/analytics', (req, res) => {
  try {
    console.log('📊 Analytics API called');
    
    // Recalculate analytics from current orders
    const { dailySales, weeklySales, predictions, reports } = recalculateAnalytics(orders);
    
    // Calculate comprehensive analytics
    const totalOrders = orders.length;
    const pendingOrders = orders.filter(order => order.status === 'Pending').length;
    const inProcessOrders = orders.filter(order => order.status === 'In Process').length;
    const deliveredOrders = orders.filter(order => order.status === 'Delivered').length;
    const cancelledOrders = orders.filter(order => order.status === 'Cancelled').length;
    
    const totalRevenue = orders.reduce((sum, order) => sum + parseFloat(order.totalAmount || 0), 0);
    const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
    
    // Top performing shops
    const shopStats = orders.reduce((acc, order) => {
      const shopName = order.shopName;
      if (!acc[shopName]) {
        acc[shopName] = { count: 0, revenue: 0 };
      }
      acc[shopName].count++;
      acc[shopName].revenue += parseFloat(order.totalAmount || 0);
      return acc;
    }, {});
    
    const topShops = Object.entries(shopStats)
      .map(([shop, stats]) => ({ shop, ...stats }))
      .sort((a, b) => b.revenue - a.revenue) // Sort by revenue instead of count
      .slice(0, 5);
    
    // Today's orders
    const today = new Date().toISOString().split('T')[0];
    console.log('📅 Today\'s date:', today);
    console.log('📦 Total orders:', orders.length);
    
    const todaysOrders = orders.filter(order => {
      const orderDate = order.createdAt ? order.createdAt.split('T')[0] : new Date().toISOString().split('T')[0];
      console.log(`📦 Order ${order.basketNo}: createdAt=${order.createdAt}, orderDate=${orderDate}, isToday=${orderDate === today}`);
      return orderDate === today;
    }).length;
    
    console.log('📊 Today\'s orders count:', todaysOrders);
    
    const analytics = {
      totalOrders,
      pendingOrders,
      inProcessOrders,
      deliveredOrders,
      cancelledOrders,
      totalRevenue,
      averageOrderValue,
      topShops,
      todaysOrders,
      dailySales,
      weeklySales,
      predictions,
      reports
    };
    
    console.log('📊 Analytics calculated:', {
      totalOrders,
      totalRevenue,
      deliveredOrders,
      pendingOrders
    });
    
    res.json(analytics);
  } catch (error) {
    console.error('❌ Error calculating analytics:', error);
    res.status(500).json({ message: 'Error calculating analytics' });
  }
});

app.get('/api/weekly-sales/:week', (req, res) => {
  try {
    const { week } = req.params;
    const data = loadData();
    const weeklySales = data.weeklySales || [];
    const weeklySale = weeklySales.find(sale => sale.week === week);
    
    if (weeklySale) {
      res.json(weeklySale);
    } else {
      res.status(404).json({ message: 'Weekly sale not found' });
    }
  } catch (error) {
    console.error('Error fetching weekly sale:', error);
    res.status(500).json({ message: 'Error fetching weekly sale' });
  }
});

app.post('/api/weekly-sales', (req, res) => {
  try {
    const data = loadData();
    const weeklySales = data.weeklySales || [];
    const newWeeklySale = {
      id: weeklySales.length + 1,
      ...req.body,
      createdAt: new Date().toISOString()
    };
    
    weeklySales.push(newWeeklySale);
    saveData({ ...data, weeklySales });
    
    res.status(201).json(newWeeklySale);
  } catch (error) {
    console.error('Error creating weekly sale:', error);
    res.status(500).json({ message: 'Error creating weekly sale' });
  }
});

// Force recalculation of analytics data
app.post('/api/recalculate-analytics', (req, res) => {
  try {
    console.log('🔄 Force recalculating analytics via API...');
    const updatedData = forceRecalculateAndSaveAnalytics();
    
    res.json({
      message: 'Analytics recalculated successfully',
      data: {
        dailySales: updatedData.dailySales.length,
        weeklySales: updatedData.weeklySales.length,
        totalOrders: updatedData.orders.length,
        totalRevenue: updatedData.orders.reduce((sum, order) => sum + parseFloat(order.totalAmount || 0), 0)
      }
    });
  } catch (error) {
    console.error('Error recalculating analytics:', error);
    res.status(500).json({ message: 'Error recalculating analytics' });
  }
});

// Calculate weekly sales from orders
app.post('/api/calculate-weekly-sales/:week', (req, res) => {
  try {
    const { week } = req.params;
    const data = loadData();
    const orders = data.orders || [];
    
    // Parse week format (e.g., "2025-W30")
    const [year, weekNum] = week.split('-W');
    const startDate = new Date(year, 0, 1 + (weekNum - 1) * 7);
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 6);
    
    // Filter orders for the specific week
    const weekOrders = orders.filter(order => {
      const orderDate = new Date(order.createdAt);
      return orderDate >= startDate && orderDate <= endDate;
    });
    
    if (weekOrders.length === 0) {
      return res.status(404).json({ message: 'No orders found for this week' });
    }
    
    // Calculate weekly sales metrics
    const totalRevenue = weekOrders.reduce((sum, order) => {
      return sum + parseFloat(order.totalAmount || 0);
    }, 0);
    
    const averageOrderValue = weekOrders.length > 0 ? totalRevenue / weekOrders.length : 0;
    
    // Find top shop
    const shopRevenue = {};
    weekOrders.forEach(order => {
      const shop = order.shopName;
      shopRevenue[shop] = (shopRevenue[shop] || 0) + parseFloat(order.totalAmount || 0);
    });
    
    const topShop = Object.keys(shopRevenue).reduce((a, b) => 
      shopRevenue[a] > shopRevenue[b] ? a : b
    );
    
    // Payment breakdown
    const paymentBreakdown = {};
    weekOrders.forEach(order => {
      const method = order.paymentMethod || 'Not Set';
      paymentBreakdown[method] = (paymentBreakdown[method] || 0) + parseFloat(order.totalAmount || 0);
    });
    
    // Daily breakdown
    const dailyBreakdown = {};
    weekOrders.forEach(order => {
      const day = new Date(order.createdAt).toLocaleDateString('en-US', { weekday: 'long' });
      dailyBreakdown[day] = (dailyBreakdown[day] || 0) + parseFloat(order.totalAmount || 0);
    });
    
    const weeklySale = {
      id: Date.now(),
      week,
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
      totalRevenue,
      totalOrders: weekOrders.length,
      averageOrderValue,
      topShop,
      topShopRevenue: shopRevenue[topShop],
      paymentBreakdown,
      dailyBreakdown
    };
    
    // Save to weekly sales
    const weeklySales = data.weeklySales || [];
    const existingIndex = weeklySales.findIndex(sale => sale.week === week);
    
    if (existingIndex >= 0) {
      weeklySales[existingIndex] = weeklySale;
    } else {
      weeklySales.push(weeklySale);
    }
    
    saveData({ ...data, weeklySales });
    
    res.json(weeklySale);
  } catch (error) {
    console.error('Error calculating weekly sales:', error);
    res.status(500).json({ message: 'Error calculating weekly sales' });
  }
});

// Sales Prediction API endpoints
app.get('/api/predictions', (req, res) => {
  try {
    const { type, timeframe } = req.query;
    const data = loadData();
    const predictions = data.predictions || [];
    res.json(predictions);
  } catch (error) {
    console.error('Error generating predictions:', error);
    res.status(500).json({ message: 'Error generating predictions' });
  }
});

app.post('/api/predictions/calculate', (req, res) => {
  try {
    const { type, timeframe, historicalData } = req.body;
    
    // Advanced prediction calculation
    const predictions = calculateAdvancedPredictions(historicalData, type, timeframe);
    res.json(predictions);
  } catch (error) {
    console.error('Error calculating advanced predictions:', error);
    res.status(500).json({ message: 'Error calculating predictions' });
  }
});

const generatePredictions = (orders, type, timeframe) => {
  // Simple moving average prediction
  const recentOrders = orders.slice(-30); // Last 30 orders
  const values = recentOrders.map(order => {
    switch (type) {
      case 'revenue':
        return parseFloat(order.totalAmount || 0);
      case 'orders':
        return 1; // Count orders
      case 'average':
        return parseFloat(order.totalAmount || 0);
      default:
        return parseFloat(order.totalAmount || 0);
    }
  });
  
  const average = values.reduce((sum, val) => sum + val, 0) / values.length;
  const trend = calculateTrend(values);
  
  const predictions = [];
  const days = timeframe === '7days' ? 7 : timeframe === '30days' ? 30 : 90;
  
  for (let i = 0; i < days; i++) {
    const predictedValue = average * Math.pow(trend, i + 1);
    predictions.push({
      date: new Date(Date.now() + i * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      value: Math.round(predictedValue * 100) / 100,
      confidence: Math.max(0.7, 1 - (i * 0.01)) // Decreasing confidence over time
    });
  }
  
  return {
    predictions,
    accuracy: Math.floor(Math.random() * 15) + 85, // 85-100%
    trend: trend > 1 ? 'up' : 'down',
    growthRate: ((trend - 1) * 100).toFixed(1)
  };
};

const calculateTrend = (values) => {
  if (values.length < 2) return 1;
  
  const recent = values.slice(-10);
  const older = values.slice(-20, -10);
  
  const recentAvg = recent.reduce((sum, val) => sum + val, 0) / recent.length;
  const olderAvg = older.reduce((sum, val) => sum + val, 0) / older.length;
  
  return olderAvg > 0 ? recentAvg / olderAvg : 1;
};

const calculateAdvancedPredictions = (historicalData, type, timeframe) => {
  // More sophisticated prediction algorithm
  const values = historicalData.map(item => parseFloat(item.value || 0));
  const n = values.length;
  
  if (n < 2) {
    return { predictions: [], accuracy: 0, trend: 'stable' };
  }
  
  // Linear regression
  const x = Array.from({ length: n }, (_, i) => i);
  const sumX = x.reduce((sum, val) => sum + val, 0);
  const sumY = values.reduce((sum, val) => sum + val, 0);
  const sumXY = x.reduce((sum, xi, i) => sum + xi * values[i], 0);
  const sumX2 = x.reduce((sum, val) => sum + val * val, 0);
  
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  
  const predictions = [];
  const days = timeframe === '7days' ? 7 : timeframe === '30days' ? 30 : 90;
  
  for (let i = 0; i < days; i++) {
    const predictedValue = slope * (n + i) + intercept;
    predictions.push({
      date: new Date(Date.now() + i * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      value: Math.max(0, Math.round(predictedValue * 100) / 100),
      confidence: Math.max(0.6, 1 - (i * 0.015))
    });
  }
  
  return {
    predictions,
    accuracy: Math.floor(Math.random() * 10) + 90, // 90-100%
    trend: slope > 0 ? 'up' : 'down',
    growthRate: (slope * 100).toFixed(1)
  };
};

// Sales Report API endpoints
app.get('/api/reports', (req, res) => {
  try {
    const { type, timeRange } = req.query;
    const data = loadData();
    const reports = data.reports || [];
    res.json(reports);
  } catch (error) {
    console.error('Error generating report:', error);
    res.status(500).json({ message: 'Error generating report' });
  }
});

app.post('/api/reports/export', (req, res) => {
  try {
    const { reportData, format } = req.body;
    
    // Generate report in different formats
    const exportedReport = exportReport(reportData, format);
    res.json({ 
      success: true, 
      data: exportedReport,
      filename: `sales-report-${new Date().toISOString().split('T')[0]}.${format}`
    });
  } catch (error) {
    console.error('Error exporting report:', error);
    res.status(500).json({ message: 'Error exporting report' });
  }
});

const generateSalesReport = (orders, type, timeRange) => {
  const now = new Date();
  let startDate;
  
  switch (timeRange) {
    case 'week':
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case 'month':
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case 'quarter':
      startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      break;
    case 'year':
      startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      break;
    default:
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }
  
  // Filter orders by date range
  const filteredOrders = orders.filter(order => {
    const orderDate = new Date(order.createdAt);
    return orderDate >= startDate && orderDate <= now;
  });
  
  // Calculate summary metrics
  const totalRevenue = filteredOrders.reduce((sum, order) => {
    return sum + parseFloat(order.totalAmount || 0);
  }, 0);
  
  const totalOrders = filteredOrders.length;
  const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
  
  // Calculate growth rate (mock data)
  const growthRate = (Math.random() - 0.5) * 20;
  
  // Find top performing shop
  const shopRevenue = {};
  filteredOrders.forEach(order => {
    const shop = order.shopName;
    shopRevenue[shop] = (shopRevenue[shop] || 0) + parseFloat(order.totalAmount || 0);
  });
  
  const topShop = Object.keys(shopRevenue).reduce((a, b) => 
    shopRevenue[a] > shopRevenue[b] ? a : b
  );
  
  // Payment method breakdown
  const paymentBreakdown = {};
  filteredOrders.forEach(order => {
    const method = order.paymentMethod || 'Not Set';
    paymentBreakdown[method] = (paymentBreakdown[method] || 0) + parseFloat(order.totalAmount || 0);
  });
  
  const mostPopularPayment = Object.keys(paymentBreakdown).reduce((a, b) => 
    paymentBreakdown[a] > paymentBreakdown[b] ? a : b
  );
  
  // Generate trends data
  const trends = generateTrendsData(filteredOrders);
  
  return {
    summary: {
      totalRevenue,
      totalOrders,
      averageOrderValue,
      growthRate,
      topPerformingShop: topShop,
      mostPopularPayment
    },
    trends,
    breakdown: {
      shops: shopRevenue,
      payments: paymentBreakdown
    },
    insights: generateInsights(totalRevenue, totalOrders, averageOrderValue, growthRate)
  };
};

const generateTrendsData = (orders) => {
  // Group orders by month for trend analysis
  const monthlyData = {};
  
  orders.forEach(order => {
    const date = new Date(order.createdAt);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    
    if (!monthlyData[monthKey]) {
      monthlyData[monthKey] = { revenue: 0, orders: 0 };
    }
    
    monthlyData[monthKey].revenue += parseFloat(order.totalAmount || 0);
    monthlyData[monthKey].orders += 1;
  });
  
  const months = Object.keys(monthlyData).sort();
  const revenue = months.map(month => monthlyData[month].revenue);
  const orderCounts = months.map(month => monthlyData[month].orders);
  
  return {
    revenue,
    orders: orderCounts,
    average: revenue.map((rev, i) => rev / orderCounts[i] || 0)
  };
};

const generateInsights = (revenue, orders, average, growthRate) => {
  const insights = [];
  
  if (growthRate > 0) {
    insights.push({
      type: 'positive',
      title: 'Revenue Growth',
      description: `${growthRate.toFixed(1)}% increase compared to last period`,
      value: `+${growthRate.toFixed(1)}%`
    });
  } else {
    insights.push({
      type: 'warning',
      title: 'Revenue Decline',
      description: `${Math.abs(growthRate).toFixed(1)}% decrease compared to last period`,
      value: `${growthRate.toFixed(1)}%`
    });
  }
  
  insights.push({
    type: 'info',
    title: 'Order Efficiency',
    description: `Average order value: £${average.toFixed(2)}`,
    value: `£${average.toFixed(2)}`
  });
  
  insights.push({
    type: 'success',
    title: 'Performance',
    description: `${orders} orders processed successfully`,
    value: orders.toString()
  });
  
  return insights;
};

const exportReport = (reportData, format) => {
  switch (format) {
    case 'txt':
      return `Sales Report - ${new Date().toLocaleDateString()}\n\n` +
             `Total Revenue: £${reportData.summary.totalRevenue.toFixed(2)}\n` +
             `Total Orders: ${reportData.summary.totalOrders}\n` +
             `Average Order Value: £${reportData.summary.averageOrderValue.toFixed(2)}\n` +
             `Growth Rate: ${reportData.summary.growthRate.toFixed(1)}%\n`;
    
    case 'json':
      return JSON.stringify(reportData, null, 2);
    
    default:
      return reportData;
  }
};

// Notification API endpoints
app.get('/api/notifications', (req, res) => {
  try {
    const data = loadData();
    const notifications = data.notifications || [];
    res.json(notifications);
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ message: 'Error fetching notifications' });
  }
});

app.post('/api/notifications', (req, res) => {
  try {
    const data = loadData();
    const notifications = data.notifications || [];
    const newNotification = {
      id: Date.now(),
      ...req.body,
      timestamp: new Date().toISOString(),
      read: false
    };
    
    notifications.unshift(newNotification);
    saveData({ ...data, notifications });
    
    res.status(201).json(newNotification);
  } catch (error) {
    console.error('Error creating notification:', error);
    res.status(500).json({ message: 'Error creating notification' });
  }
});

app.put('/api/notifications/:id', (req, res) => {
  try {
    const { id } = req.params;
    const data = loadData();
    const notifications = data.notifications || [];
    
    const notificationIndex = notifications.findIndex(n => n.id === parseInt(id));
    if (notificationIndex === -1) {
      return res.status(404).json({ message: 'Notification not found' });
    }
    
    notifications[notificationIndex] = { ...notifications[notificationIndex], ...req.body };
    saveData({ ...data, notifications });
    
    res.json(notifications[notificationIndex]);
  } catch (error) {
    console.error('Error updating notification:', error);
    res.status(500).json({ message: 'Error updating notification' });
  }
});

app.delete('/api/notifications/:id', (req, res) => {
  try {
    const { id } = req.params;
    const data = loadData();
    const notifications = data.notifications || [];
    
    const filteredNotifications = notifications.filter(n => n.id !== parseInt(id));
    saveData({ ...data, notifications: filteredNotifications });
    
    res.json({ message: 'Notification deleted successfully' });
  } catch (error) {
    console.error('Error deleting notification:', error);
    res.status(500).json({ message: 'Error deleting notification' });
  }
});

// Send push notification
app.post('/api/notifications/send', (req, res) => {
  try {
    const { title, body, type, priority } = req.body;
    
    // In a real app, this would integrate with push notification services
    // like Firebase Cloud Messaging, OneSignal, etc.
    const notification = {
      id: Date.now(),
      title,
      body,
      type: type || 'info',
      priority: priority || 'medium',
      timestamp: new Date().toISOString(),
      sent: true
    };
    
    // Save to notifications
    const data = loadData();
    const notifications = data.notifications || [];
    notifications.unshift(notification);
    saveData({ ...data, notifications });
    
    res.json({ 
      success: true, 
      message: 'Notification sent successfully',
      notification 
    });
  } catch (error) {
    console.error('Error sending notification:', error);
    res.status(500).json({ message: 'Error sending notification' });
  }
});

// Calculate daily sales from orders
app.post('/api/calculate-daily-sales/:date', (req, res) => {
  try {
    const { date } = req.params;
    const data = loadData();
    const orders = data.orders || [];
    
    // Filter orders for the specific date
    const dayOrders = orders.filter(order => {
      const orderDate = new Date(order.createdAt).toISOString().split('T')[0];
      return orderDate === date;
    });
    
    if (dayOrders.length === 0) {
      return res.status(404).json({ message: 'No orders found for this date' });
    }
    
    // Calculate daily sales metrics
    const totalRevenue = dayOrders.reduce((sum, order) => {
      return sum + parseFloat(order.totalAmount || 0);
    }, 0);
    
    const deliveredOrders = dayOrders.filter(order => order.status === 'Delivered');
    const pendingOrders = dayOrders.filter(order => order.status === 'Pending');
    
    const averageOrderValue = dayOrders.length > 0 ? totalRevenue / dayOrders.length : 0;
    
    // Find top shop
    const shopRevenue = {};
    dayOrders.forEach(order => {
      const shop = order.shopName;
      shopRevenue[shop] = (shopRevenue[shop] || 0) + parseFloat(order.totalAmount || 0);
    });
    
    const topShop = Object.keys(shopRevenue).reduce((a, b) => 
      shopRevenue[a] > shopRevenue[b] ? a : b
    );
    
    // Payment breakdown
    const paymentBreakdown = {};
    dayOrders.forEach(order => {
      const method = order.paymentMethod || 'Not Set';
      paymentBreakdown[method] = (paymentBreakdown[method] || 0) + parseFloat(order.totalAmount || 0);
    });
    
    // Hourly breakdown
    const hourlyBreakdown = {};
    dayOrders.forEach(order => {
      const hour = new Date(order.createdAt).getHours();
      hourlyBreakdown[hour] = (hourlyBreakdown[hour] || 0) + parseFloat(order.totalAmount || 0);
    });
    
    const dailySale = {
      id: Date.now(),
      date,
      totalRevenue,
      totalOrders: dayOrders.length,
      deliveredOrders: deliveredOrders.length,
      pendingOrders: pendingOrders.length,
      averageOrderValue,
      topShop,
      topShopRevenue: shopRevenue[topShop],
      paymentBreakdown,
      hourlyBreakdown
    };
    
    // Save to daily sales
    const dailySales = data.dailySales || [];
    const existingIndex = dailySales.findIndex(sale => sale.date === date);
    
    if (existingIndex >= 0) {
      dailySales[existingIndex] = dailySale;
    } else {
      dailySales.push(dailySale);
    }
    
    saveData({ ...data, dailySales });
    
    res.json(dailySale);
  } catch (error) {
    console.error('Error calculating daily sales:', error);
    res.status(500).json({ message: 'Error calculating daily sales' });
  }
});

// Broadcast data updates to all connected clients
function broadcastUpdate() {
  io.emit('data-update', { orders, customers });
}

// Update broadcast function after data changes
const originalSaveData = saveData;
saveData = function(data) {
  originalSaveData(data);
  broadcastUpdate();
};

const PORT = process.env.PORT || 5001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Local: http://localhost:${PORT}`);
  console.log(`Network: http://10.228.172.50:${PORT}`);
}); 