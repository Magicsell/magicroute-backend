const fs = require('fs');
const path = require('path');

console.log('🔄 Starting data migration...');

// Source and destination files
const localDataFile = path.join(__dirname, 'data.json');
const productionDataFile = path.join(__dirname, 'data_production.json');

try {
  // Check if local data exists
  if (!fs.existsSync(localDataFile)) {
    console.error('❌ Local data file not found:', localDataFile);
    process.exit(1);
  }

  // Read local data
  const localData = JSON.parse(fs.readFileSync(localDataFile, 'utf8'));
  console.log('📊 Local data loaded:', {
    orders: localData.orders?.length || 0,
    customers: localData.customers?.length || 0,
    dailySales: localData.dailySales?.length || 0,
    weeklySales: localData.weeklySales?.length || 0
  });

  // Backup existing production data if it exists
  if (fs.existsSync(productionDataFile)) {
    const backupFile = productionDataFile.replace('.json', `_backup_${new Date().toISOString().split('T')[0]}.json`);
    fs.copyFileSync(productionDataFile, backupFile);
    console.log('💾 Production data backed up to:', backupFile);
  }

  // Write to production data file
  fs.writeFileSync(productionDataFile, JSON.stringify(localData, null, 2));
  console.log('✅ Data migrated to production file:', productionDataFile);

  // Verify migration
  const migratedData = JSON.parse(fs.readFileSync(productionDataFile, 'utf8'));
  console.log('🔍 Migration verification:', {
    orders: migratedData.orders?.length || 0,
    customers: migratedData.customers?.length || 0,
    dailySales: migratedData.dailySales?.length || 0,
    weeklySales: migratedData.weeklySales?.length || 0
  });

  console.log('🎉 Data migration completed successfully!');

} catch (error) {
  console.error('❌ Migration failed:', error.message);
  process.exit(1);
} 