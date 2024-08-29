import pool from './mysql.js';

async function testConnection() {
  try {
    const connection = await pool.getConnection();
    console.log('DB 연결 성공!');
    connection.release(); // 연결 해제
  } catch (error) {
    console.error('Database connection failed:', error);
  }
}

testConnection();
