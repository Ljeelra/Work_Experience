import { releaseObject } from 'puppeteer';
import pool from '../db/mysql.js';
import { getConnection, closeConnection } from '../db/mysql.js';


export async function saveDetail(data) {
    let insertQuery = `INSERT INTO creativekorea (pathId,category,title,department,implementingAgency, requirement, assistance, 
    requestStartedOn,requestEndedOn,overview,applyMethod,applySite, contact, attachmentFile, contentFile, site) 
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;

    const insertPromises = data.map(async (data) =>{
        const {
            pathId,
            category,
            title,
            department,
            implementingAgency,
            requirement,
            assistance,
            requestStartedOn,
            requestEndedOn,
            overview,
            applyMethod,
            applySite,
            contact,
            attachmentFile,
            contentFile,
            site
        } = data;

        return new Promise((resolve, reject) => {
            pool.query(insertQuery, [
                pathId,
                category,
                title,
                department,
                implementingAgency,
                requirement,
                assistance,
                requestStartedOn,
                requestEndedOn,
                overview,
                applyMethod,
                applySite,
                contact,
                attachmentFile,
                contentFile,
                site
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

export async function checkExist(pathId) {
    const selectQuery = 'SELECT COUNT(*) AS count FROM creativekorea WHERE pathId = ?';
    return new Promise((resolve, reject) => {
        pool.query(selectQuery, [pathId], (error, results) => {
            if (error) {
                console.error('중복 체크 오류:', error);
                return reject(error);
            }
            resolve(results[0].count > 0);
        });
    });
}