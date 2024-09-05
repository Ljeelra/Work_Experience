import pool from '../db/mysql.js';

// 데이터 삽입 함수
export async function saveDetail(data, siteName) {
    const insertQuery = `INSERT INTO ${siteName} (
        pathId, category, year, title, department, implementingAgency, supportScale, requirement, assistance,
        requestStartedOn, requestEndedOn, overview, applicationProcess, applyMethod, applySite, contact, attachmentFile, contentFile, contentImage, site, location, faq
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    
    const insertPromises = data.map(async (entry, index) => {
        if (!entry || typeof entry !== 'object') {
            console.error(`Invalid entry at index ${index}:`, entry);
            return; // 잘못된 데이터는 건너뜁니다.
        }
    
        const {
            pathId,
            category,
            year,
            title,
            department,
            implementingAgency,
            supportScale,
            requirement,
            assistance,
            requestStartedOn,
            requestEndedOn,
            overview,
            applicationProcess,
            applyMethod,
            applySite,
            contact,
            attachmentFile,
            contentFile,
            contentImage,
            site,
            location,
            faq
        } = entry;
    
        return executeQuery(insertQuery, [
            pathId || null,
            category || null,
            year || null,
            title || null,
            department || null,
            implementingAgency || null,
            supportScale || null,
            requirement || null,
            assistance || null,
            requestStartedOn || null,
            requestEndedOn || null,
            overview || null,
            applicationProcess || null,
            applyMethod || null,
            applySite || null,
            contact || null,
            attachmentFile || null,
            contentFile || null,
            contentImage || null,
            site || null,
            location || null,
            faq || null
        ]);
    });
    
    try {
        await Promise.all(insertPromises);
        console.log('모든 데이터가 성공적으로 삽입되었습니다.');
    } catch (error) {
        console.error('데이터 삽입 중 오류 발생:', error);
    }
}

// 중복 체크를 위해 pathId를 받아오자
export async function getAllPathIds(siteName) {
    const selectQuery = `SELECT pathId FROM ${siteName}`;
    try {
        const result = await executeQuery(selectQuery);

        if (Array.isArray(result) && Array.isArray(result[0])) {
            const pathIds = result[0].map(row => row.pathId).filter(id => id !== undefined);
           
            return pathIds;
        }  else {
            console.error('Unexpected result format:', result);
            return [];
        }
    } catch (error) {
        console.error('pathId 조회 오류:', error);
        throw error; // 예외를 상위 호출자에게 전달
    }
}

// 쿼리 실행 함수
async function executeQuery(query, params = [], timeout = 45000) {
    let connection;
    try {
        connection = await pool.getConnection();
        //console.log(`Executing query: ${query}`); // 쿼리 실행 로그

        await connection.beginTransaction();
        await connection.query('SET SESSION MAX_EXECUTION_TIME=?', [timeout]); // 쿼리 타임아웃 설정
        const queryPromise = connection.query(query, params);
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Query timeout')), timeout)
        );
        const result = await Promise.race([queryPromise, timeoutPromise]);
        //console.log(`Successfully executed query: ${result.affectedRows || result.length} rows affected.`);
        
        await connection.commit();

        return result;
    } catch (err) {
        console.error('Error executing query:', err);
        if (connection) await connection.rollback();
        throw err; // 예외를 상위 호출자에게 전달
    } finally {
        if (connection) connection.release(); // 연결 반환
    }
}

export async function closePool() {
    try {
        await pool.end();
        console.log('Database connection pool closed.');
    } catch (error) {
        console.error('Error closing pool:', error);
    }
}
