import pool from '../db/mysql.js';

// 데이터 삽입 함수
export async function saveDetail(data) {
    const insertQuery = `INSERT INTO giupmadang (pathId,category,title,department,implementingAgency, requirement, assistance, 
    requestStartedOn,requestEndedOn,overview,applyMethod,applySite, contact, attachmentFile, contentFile, site) 
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON DUPLICATE KEY UPDATE 
    category = VALUES(category),
    title = VALUES(title),
    department = VALUES(department),
    implementingAgency = VALUES(implementingAgency),
    requirement = VALUES(requirement),
    assistance = VALUES(assistance),
    requestStartedOn = VALUES(requestStartedOn),
    requestEndedOn = VALUES(requestEndedOn),
    overview = VALUES(overview),
    applyMethod = VALUES(applyMethod),
    applySite = VALUES(applySite),
    contact = VALUES(contact),
    attachmentFile = VALUES(attachmentFile),
    contentFile = VALUES(contentFile),
    site = VALUES(site)`;

    const insertPromises = data.map(async (entry) => {
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
        } = entry;

        return executeQuery(insertQuery, [
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
        ]);
    });

    try {
        await Promise.all(insertPromises);
        console.log('모든 데이터가 성공적으로 삽입되었습니다.');
    } catch (error) {
        console.error('데이터 삽입 중 오류 발생:', error);
    }
}

// 중복 체크 함수
export async function checkExist(pathId) {
    const selectQuery = 'SELECT COUNT(*) AS count FROM creativekorea WHERE pathId = ?';
    try {
        const result = await executeQuery(selectQuery, [pathId]);
        return result.count > 0;
    } catch (error) {
        console.error('중복 체크 오류:', error);
        throw error; // 예외를 상위 호출자에게 전달
    }
}

// 쿼리 실행 함수
async function executeQuery(query, params = [], timeout = 45000) {
    let connection;
    try {
        connection = await pool.getConnection();
        await connection.query('SET SESSION MAX_EXECUTION_TIME=?', [timeout]); // 쿼리 타임아웃 설정
        const queryPromise = connection.query(query, params);
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Query timeout')), timeout)
        );
        const result = await Promise.race([queryPromise, timeoutPromise]);
        console.log(`Successfully executed query: ${result.affectedRows || result.length} rows affected.`);
        return result;
    } catch (err) {
        console.error('Error executing query:', err);
        throw err; // 예외를 상위 호출자에게 전달
    } finally {
        if (connection) connection.release(); // 연결 반환
    }
}
