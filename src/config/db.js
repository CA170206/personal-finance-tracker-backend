import mongoose from 'mongoose';

let isDbConnected = false;

export const connectDB = async () => {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/fintrack';

  try {
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
    });
    isDbConnected = true;
    console.log(`[FinTrack Database] MongoDB Connected: ${conn.connection.host}`);
    return conn;
  } catch (error) {
    isDbConnected = false;
    console.warn(`[FinTrack Database] MongoDB connection failed: ${error.message}`);
    console.warn('[FinTrack Database] Ensure MongoDB is running locally on port 27017 or provide MONGODB_URI in backend/.env');
    return null;
  }
};

export const getDbStatus = () => isDbConnected;

export default connectDB;

