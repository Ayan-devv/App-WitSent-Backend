require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

async function migrateIndexes() {
  const dbUri = process.env.DATABASE_URL;
  if (!dbUri) {
    console.error('DATABASE_URL is not set in .env');
    process.exit(1);
  }

  try {
    await mongoose.connect(dbUri, { dbName: 'whatsapp_saas' });
    console.log('Connected to MongoDB whatsapp_saas');

    const collection = mongoose.connection.db.collection('whatsappsessions');

    // 1. Clean up stale disconnected/pending sessions
    const deleteRes = await collection.deleteMany({
      isConnected: false
    });
    console.log(`Cleaned up ${deleteRes.deletedCount} disconnected/pending session(s)`);

    // 2. Drop existing userId_1_phoneNumber_1 index if it exists
    const indexes = await collection.indexes();
    const existingIndex = indexes.find(i => i.name === 'userId_1_phoneNumber_1');
    if (existingIndex) {
      console.log('Dropping existing index: userId_1_phoneNumber_1');
      await collection.dropIndex('userId_1_phoneNumber_1');
      console.log('Successfully dropped old userId_1_phoneNumber_1 index');
    }

    // 3. Create the new partial unique index that only applies to connected accounts
    console.log('Creating new partial unique index on { userId: 1, phoneNumber: 1 } for isConnected: true...');
    await collection.createIndex(
      { userId: 1, phoneNumber: 1 },
      {
        unique: true,
        partialFilterExpression: { isConnected: true }
      }
    );
    console.log('Successfully created partial unique index!');

    const updatedIndexes = await collection.indexes();
    console.log('Updated indexes:', JSON.stringify(updatedIndexes, null, 2));

    await mongoose.disconnect();
    console.log('Migration completed successfully.');
    process.exit(0);
  } catch (err) {
    console.error('Migration error:', err);
    process.exit(1);
  }
}

migrateIndexes();
