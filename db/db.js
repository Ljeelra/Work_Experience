import { releaseObject } from 'puppeteer';
import pool from '../db/mysql.js';
import { getConnection, closeConnection } from '../db/mysql.js';


export async function saveDetail(data) {
    let insertQuery = 'INSERT INTO scrapedetail (category,title,department,implementingAgency,requestStartedOn,requestEndedOn,overview,applyMethod,applySite, contact, attachmentFile, contentFile)'+ 
    ' VALUES (?,?,?,?,?,?,?,?,?,?,?,?)';

    const insertPromises = data.map(async (data) =>{
        const {
            category,
            title,
            department,
            implementingAgency,
            requestStartedOn,
            requestEndedOn,
            overview,
            applyMethod,
            applySite,
            contact,
            attachmentFile,
            contentFile,
            viewCount
        } = data;

        return new Promise((resolve, reject) => {
            pool.query(insertQuery, [
                category,
                title,
                department,
                implementingAgency,
                requestStartedOn,
                requestEndedOn,
                overview,
                applyMethod,
                applySite,
                contact,
                attachmentFile,
                contentFile,
                viewCount
            ], (error, results) => {
                if (error) {
                    console.error('데이터 삽입 오류:', error);
                    reject(error);
                } else {
                    resolve(results);
                }
            });
        });
    });

    try {
        await Promise.all(insertPromises);
        console.log('모든 데이터가 성공적으로 삽입되었습니다.');
    } catch (error) {
        console.error('데이터 삽입 중 오류 발생:', error);
    }
}