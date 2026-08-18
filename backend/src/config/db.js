const mongoose = require('mongoose');

const { mongodbUri } = require('./env');



async function connectDB() {

  try {

    await mongoose.connect(mongodbUri);

    console.log('MongoDB connected successfully');

  } catch (error) {

    console.error('MongoDB connection failed:', error.message);

    process.exit(1);

  }

}



module.exports = connectDB;

