const mongoose = require('mongoose');

mongoose.set('strictQuery', true);

const connectMongoose = async () => {
  const mongoUri = process.env.MONGODB_URI;

  try {
    await mongoose.connect(mongoUri, {
      autoIndex: true,
    });
    console.log('Mongoose connected');
  } catch (error) {
    console.error('Mongoose connection error:', error.message);
    process.exit(1);
  }
};

module.exports = connectMongoose;

