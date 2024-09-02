import mysql from 'mysql2/promise';
import { dbConfig } from '../config.js';

const pool = mysql.createPool(dbConfig);

export async function getConnection() {
    return await pool.getConnection();
}

export async function closeConnection(connection) {
    connection.release();
}

export async function logPoolStatus() {
    const totalConnections = pool.pool._allConnections.length;
    const freeConnections = pool.pool._freeConnections.length;
    const queueSize = pool.pool._connectionQueue.length;

    console.log(`Total connections: ${totalConnections}`);
    console.log(`Free connections: ${freeConnections}`);
    console.log(`Pending connections: ${queueSize}`);
}

export default pool;