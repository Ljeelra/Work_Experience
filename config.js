import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.development' });

export const dbConfig = {
    host: process.env.MYSQL_HOST,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    waitForConnections: true,
    connectionLimit: 20,
    queueLimit: 0,
    connectTimeout: 15000
  };