import mysql from 'mysql2/promise';
import { dbConfig } from '../config';

const pool = mysql.createPool(dbConfig);

export async function getConnection() {
    return await pool.getConnection();
}

export async function closeConnection(connection) {
    connection.release();
}

export default pool;