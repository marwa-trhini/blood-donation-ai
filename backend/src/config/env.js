require('dotenv').config();



function requireEnv(name) {

  const value = process.env[name];



  if (!value) {

    throw new Error(`Missing required environment variable: ${name}`);

  }



  return value;

}



module.exports = {

  port: Number(process.env.PORT) || 5000,

  mongodbUri: requireEnv('MONGODB_URI'),

  jwtSecret: requireEnv('JWT_SECRET'),

  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',

  nodeEnv: process.env.NODE_ENV || 'development',

  aiServiceUrl: process.env.AI_SERVICE_URL || 'http://localhost:8000',

  aiServiceTimeoutMs: Number(process.env.AI_SERVICE_TIMEOUT_MS) || 20000,

};

