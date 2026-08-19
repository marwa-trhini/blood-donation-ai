const mongoose = require('mongoose');

const { mongodbUri, mongodbDbName } = require('./env');



async function connectDB() {

  try {

    await mongoose.connect(mongodbUri, { dbName: mongodbDbName });

    console.log(`MongoDB connected successfully (database: ${mongodbDbName})`);

  } catch (error) {

    console.error('MongoDB connection failed:', error.message);

    process.exit(1);

  }

}



module.exports = connectDB;

