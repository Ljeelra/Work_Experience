import pool from '../db/mysql.js';
import { getConnection, closeConnection } from '../db/mysql.js';

export async function saveDetail(data) {
    let insertQuery = 'INSERT INTO scrapedetail (category,title,department,implementingAgency,requestStartedOn,requestEndedOn,overview,applyMethod,applySite, contact, attachmentFile, contentFile, viewCount)'+ 
    ' VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)';
}
