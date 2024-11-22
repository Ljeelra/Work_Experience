import {pool} from './db/mysql.js';

async function updateStatus() {
    try {
        const setStatusToZeroQueries = [

            `UPDATE site_bepa SET status = 0 WHERE STR_TO_DATE(requestEndedOn, '%Y-%m-%d') < DATE(CONVERT_TZ(NOW(), '+00:00', '+09:00'));`,
            `UPDATE site_btp SET status = 0 WHERE STR_TO_DATE(requestEndedOn, '%Y-%m-%d') < DATE(CONVERT_TZ(NOW(), '+00:00', '+09:00'));`,
            `UPDATE site_cba SET status = 0 WHERE STR_TO_DATE(requestEndedOn, '%Y-%m-%d') < DATE(CONVERT_TZ(NOW(), '+00:00', '+09:00'));`,
            `UPDATE site_cbtp SET status = 0 WHERE STR_TO_DATE(requestEndedOn, '%Y-%m-%d') < DATE(CONVERT_TZ(NOW(), '+00:00', '+09:00'));`,
            `UPDATE site_cepa SET status = 0 WHERE STR_TO_DATE(requestEndedOn, '%Y-%m-%d') < DATE(CONVERT_TZ(NOW(), '+00:00', '+09:00'));`,
            `UPDATE site_creativekorea SET status = 0 WHERE STR_TO_DATE(requestEndedOn, '%Y-%m-%d') < DATE(CONVERT_TZ(NOW(), '+00:00', '+09:00'));`,
            `UPDATE site_ctp SET status = 0 WHERE STR_TO_DATE(requestEndedOn, '%Y-%m-%d') < DATE(CONVERT_TZ(NOW(), '+00:00', '+09:00'));`,
            `UPDATE site_dgtp SET status = 0 WHERE STR_TO_DATE(requestEndedOn, '%Y-%m-%d') < DATE(CONVERT_TZ(NOW(), '+00:00', '+09:00'));`,
            `UPDATE site_djbea SET status = 0 WHERE STR_TO_DATE(requestEndedOn, '%Y-%m-%d') < DATE(CONVERT_TZ(NOW(), '+00:00', '+09:00'));`,
            `UPDATE site_djtp SET status = 0 WHERE STR_TO_DATE(requestEndedOn, '%Y-%m-%d') < DATE(CONVERT_TZ(NOW(), '+00:00', '+09:00'));`,
            `UPDATE site_fanfandaero SET status = 0 WHERE STR_TO_DATE(requestEndedOn, '%Y-%m-%d') < DATE(CONVERT_TZ(NOW(), '+00:00', '+09:00'));`,
            `UPDATE site_gbsa SET status = 0 WHERE STR_TO_DATE(requestEndedOn, '%Y-%m-%d') < DATE(CONVERT_TZ(NOW(), '+00:00', '+09:00'));`,
            `UPDATE site_gbtp SET status = 0 WHERE STR_TO_DATE(requestEndedOn, '%Y-%m-%d') < DATE(CONVERT_TZ(NOW(), '+00:00', '+09:00'));`,
            `UPDATE site_gdtp SET status = 0 WHERE requestEndedOn < DATE_FORMAT(CONVERT_TZ(NOW(), '+00:00', '+09:00'), '%Y-%m');`,
            `UPDATE site_gepa SET status = 0 WHERE STR_TO_DATE(requestEndedOn, '%Y-%m-%d') < DATE(CONVERT_TZ(NOW(), '+00:00', '+09:00'));`,
            `UPDATE site_giba SET status = 0 WHERE STR_TO_DATE(requestEndedOn, '%Y-%m-%d') < DATE(CONVERT_TZ(NOW(), '+00:00', '+09:00'));`,
            `UPDATE site_giupmadang SET status = 0 WHERE STR_TO_DATE(requestEndedOn, '%Y-%m-%d') < DATE(CONVERT_TZ(NOW(), '+00:00', '+09:00'));`,
            `UPDATE site_gjtp SET status = 0 WHERE STR_TO_DATE(requestEndedOn, '%Y-%m-%d') < DATE(CONVERT_TZ(NOW(), '+00:00', '+09:00'));`,
            `UPDATE site_gntp SET status = 0 WHERE STR_TO_DATE(requestEndedOn, '%Y-%m-%d') < DATE(CONVERT_TZ(NOW(), '+00:00', '+09:00'));`,
            `UPDATE site_gtp SET status = 0 WHERE STR_TO_DATE(requestEndedOn, '%Y-%m-%d') < DATE(CONVERT_TZ(NOW(), '+00:00', '+09:00'));`,
            `UPDATE site_gwep SET status = 0 WHERE STR_TO_DATE(requestEndedOn, '%Y-%m-%d') < DATE(CONVERT_TZ(NOW(), '+00:00', '+09:00'));`,
            `UPDATE site_gwtp SET status = 0 WHERE STR_TO_DATE(requestEndedOn, '%Y-%m-%d') < DATE(CONVERT_TZ(NOW(), '+00:00', '+09:00'));`,
            `UPDATE site_itp SET status = 0 WHERE STR_TO_DATE(requestEndedOn, '%Y-%m-%d') < DATE(CONVERT_TZ(NOW(), '+00:00', '+09:00'));`,
            `UPDATE site_jba SET status = 0 WHERE STR_TO_DATE(requestEndedOn, '%Y-%m-%d') < DATE(CONVERT_TZ(NOW(), '+00:00', '+09:00'));`,
            `UPDATE site_jbsc SET status = 0 WHERE STR_TO_DATE(requestEndedOn, '%Y-%m-%d') < DATE(CONVERT_TZ(NOW(), '+00:00', '+09:00'));`,
            `UPDATE site_jbtp SET status = 0 WHERE STR_TO_DATE(requestEndedOn, '%Y-%m-%d') < DATE(CONVERT_TZ(NOW(), '+00:00', '+09:00'));`,
            `UPDATE site_jepa SET status = 0 WHERE STR_TO_DATE(requestEndedOn, '%Y-%m-%d') < DATE(CONVERT_TZ(NOW(), '+00:00', '+09:00'));`,
            `UPDATE site_jntp SET status = 0 WHERE STR_TO_DATE(requestEndedOn, '%Y-%m-%d') < DATE(CONVERT_TZ(NOW(), '+00:00', '+09:00'));`,
            `UPDATE site_jtp SET status = 0 WHERE STR_TO_DATE(requestEndedOn, '%Y-%m-%d') < DATE(CONVERT_TZ(NOW(), '+00:00', '+09:00'));`,
            `UPDATE site_jungsoventure SET status = 0 WHERE STR_TO_DATE(requestEndedOn, '%Y-%m-%d') < DATE(CONVERT_TZ(NOW(), '+00:00', '+09:00'));`,
            `UPDATE site_kocca SET status = 0 WHERE STR_TO_DATE(requestEndedOn, '%Y-%m-%d') < DATE(CONVERT_TZ(NOW(), '+00:00', '+09:00'));`,
            `UPDATE site_kstartup SET status = 0 WHERE STR_TO_DATE(requestEndedOn, '%Y-%m-%d') < DATE(CONVERT_TZ(NOW(), '+00:00', '+09:00'));`,
            `UPDATE site_riia SET status = 0 WHERE STR_TO_DATE(requestEndedOn, '%Y-%m-%d') < DATE(CONVERT_TZ(NOW(), '+00:00', '+09:00'));`,
            `UPDATE site_sba SET status = 0 WHERE STR_TO_DATE(requestEndedOn, '%Y-%m-%d') < DATE(CONVERT_TZ(NOW(), '+00:00', '+09:00'));`,
            `UPDATE site_seoultp SET status = 0 WHERE STR_TO_DATE(requestEndedOn, '%Y-%m-%d') < DATE(CONVERT_TZ(NOW(), '+00:00', '+09:00'));`,
            `UPDATE site_sjtp SET status = 0 WHERE STR_TO_DATE(requestEndedOn, '%Y-%m-%d') < DATE(CONVERT_TZ(NOW(), '+00:00', '+09:00'));`,
            `UPDATE site_sosanggongin24 SET status = 0 WHERE STR_TO_DATE(requestEndedOn, '%Y-%m-%d') < DATE(CONVERT_TZ(NOW(), '+00:00', '+09:00'));`,
            `UPDATE site_ubpi SET status = 0 WHERE STR_TO_DATE(requestEndedOn, '%Y-%m-%d') < DATE(CONVERT_TZ(NOW(), '+00:00', '+09:00'));`,
            `UPDATE site_utp SET status = 0 WHERE STR_TO_DATE(requestEndedOn, '%Y-%m-%d') < DATE(CONVERT_TZ(NOW(), '+00:00', '+09:00'));`,
           
            
        ];

        const setStatusToOneQueries = [

            `UPDATE site_bepa SET status = 1 WHERE STR_TO_DATE(requestEndedOn, '%Y-%m-%d') >= DATE(CONVERT_TZ(NOW(), '+00:00', '+09:00'));`,
            `UPDATE site_btp SET status = 1 WHERE STR_TO_DATE(requestEndedOn, '%Y-%m-%d') >= DATE(CONVERT_TZ(NOW(), '+00:00', '+09:00'));`,
            `UPDATE site_cba SET status = 1 WHERE STR_TO_DATE(requestEndedOn, '%Y-%m-%d') >= DATE(CONVERT_TZ(NOW(), '+00:00', '+09:00'));`,
            `UPDATE site_cbtp SET status = 1 WHERE STR_TO_DATE(requestEndedOn, '%Y-%m-%d') >= DATE(CONVERT_TZ(NOW(), '+00:00', '+09:00'));`,
            `UPDATE site_cepa SET status = 1 WHERE STR_TO_DATE(requestEndedOn, '%Y-%m-%d') >= DATE(CONVERT_TZ(NOW(), '+00:00', '+09:00'));`,
            `UPDATE site_creativekorea SET status = 1 WHERE STR_TO_DATE(requestEndedOn, '%Y-%m-%d') >= DATE(CONVERT_TZ(NOW(), '+00:00', '+09:00'));`,
            `UPDATE site_ctp SET status = 1 WHERE STR_TO_DATE(requestEndedOn, '%Y-%m-%d') >= DATE(CONVERT_TZ(NOW(), '+00:00', '+09:00'));`,
            `UPDATE site_dgtp SET status = 1 WHERE STR_TO_DATE(requestEndedOn, '%Y-%m-%d') >= DATE(CONVERT_TZ(NOW(), '+00:00', '+09:00'));`,
            `UPDATE site_djbea SET status = 1 WHERE STR_TO_DATE(requestEndedOn, '%Y-%m-%d') >= DATE(CONVERT_TZ(NOW(), '+00:00', '+09:00'));`,
            `UPDATE site_djtp SET status = 1 WHERE STR_TO_DATE(requestEndedOn, '%Y-%m-%d') >= DATE(CONVERT_TZ(NOW(), '+00:00', '+09:00'));`,
            `UPDATE site_fanfandaero SET status = 1 WHERE STR_TO_DATE(requestEndedOn, '%Y-%m-%d') >= DATE(CONVERT_TZ(NOW(), '+00:00', '+09:00'));`,
            `UPDATE site_gbsa SET status = 1 WHERE STR_TO_DATE(requestEndedOn, '%Y-%m-%d') >= DATE(CONVERT_TZ(NOW(), '+00:00', '+09:00'));`,
            `UPDATE site_gbtp SET status = 1 WHERE STR_TO_DATE(requestEndedOn, '%Y-%m-%d') >= DATE(CONVERT_TZ(NOW(), '+00:00', '+09:00'));`,
            `UPDATE site_gdtp SET status = 1 WHERE STR_TO_DATE(requestEndedOn, '%Y-%m-%d') >= DATE(CONVERT_TZ(NOW(), '+00:00', '+09:00'));`,
            `UPDATE site_gepa SET status = 1 WHERE STR_TO_DATE(requestEndedOn, '%Y-%m-%d') >= DATE(CONVERT_TZ(NOW(), '+00:00', '+09:00'));`,
            `UPDATE site_giba SET status = 1 WHERE STR_TO_DATE(requestEndedOn, '%Y-%m-%d') >= DATE(CONVERT_TZ(NOW(), '+00:00', '+09:00'));`,
            `UPDATE site_giupmadang SET status = 1 WHERE STR_TO_DATE(requestEndedOn, '%Y-%m-%d') >= DATE(CONVERT_TZ(NOW(), '+00:00', '+09:00'));`,
            `UPDATE site_gjtp SET status = 1 WHERE STR_TO_DATE(requestEndedOn, '%Y-%m-%d') >= DATE(CONVERT_TZ(NOW(), '+00:00', '+09:00'));`,
            `UPDATE site_gntp SET status = 1 WHERE STR_TO_DATE(requestEndedOn, '%Y-%m-%d') >= DATE(CONVERT_TZ(NOW(), '+00:00', '+09:00'));`,
            `UPDATE site_gtp SET status = 1 WHERE STR_TO_DATE(requestEndedOn, '%Y-%m-%d') >= DATE(CONVERT_TZ(NOW(), '+00:00', '+09:00'));`,
            `UPDATE site_gwep SET status = 1 WHERE STR_TO_DATE(requestEndedOn, '%Y-%m-%d') >= DATE(CONVERT_TZ(NOW(), '+00:00', '+09:00'));`,
            `UPDATE site_gwtp SET status = 1 WHERE STR_TO_DATE(requestEndedOn, '%Y-%m-%d') >= DATE(CONVERT_TZ(NOW(), '+00:00', '+09:00'));`,
            `UPDATE site_itp SET status = 1 WHERE STR_TO_DATE(requestEndedOn, '%Y-%m-%d') >= DATE(CONVERT_TZ(NOW(), '+00:00', '+09:00'));`,
            `UPDATE site_jba SET status = 1 WHERE STR_TO_DATE(requestEndedOn, '%Y-%m-%d') >= DATE(CONVERT_TZ(NOW(), '+00:00', '+09:00'));`,
            `UPDATE site_jbsc SET status = 1 WHERE STR_TO_DATE(requestEndedOn, '%Y-%m-%d') >= DATE(CONVERT_TZ(NOW(), '+00:00', '+09:00'));`,
            `UPDATE site_jbtp SET status = 1 WHERE STR_TO_DATE(requestEndedOn, '%Y-%m-%d') >= DATE(CONVERT_TZ(NOW(), '+00:00', '+09:00'));`,
            `UPDATE site_jepa SET status = 1 WHERE STR_TO_DATE(requestEndedOn, '%Y-%m-%d') >= DATE(CONVERT_TZ(NOW(), '+00:00', '+09:00'));`,
            `UPDATE site_jntp SET status = 1 WHERE STR_TO_DATE(requestEndedOn, '%Y-%m-%d') >= DATE(CONVERT_TZ(NOW(), '+00:00', '+09:00'));`,
            `UPDATE site_jtp SET status = 1 WHERE STR_TO_DATE(requestEndedOn, '%Y-%m-%d') >= DATE(CONVERT_TZ(NOW(), '+00:00', '+09:00'));`,
            `UPDATE site_jungsoventure SET status = 1 WHERE STR_TO_DATE(requestEndedOn, '%Y-%m-%d') >= DATE(CONVERT_TZ(NOW(), '+00:00', '+09:00'));`,
            `UPDATE site_kocca SET status = 1 WHERE STR_TO_DATE(requestEndedOn, '%Y-%m-%d') >= DATE(CONVERT_TZ(NOW(), '+00:00', '+09:00'));`,
            `UPDATE site_kstartup SET status = 1 WHERE STR_TO_DATE(requestEndedOn, '%Y-%m-%d') >= DATE(CONVERT_TZ(NOW(), '+00:00', '+09:00'));`,
            `UPDATE site_riia SET status = 1 WHERE STR_TO_DATE(requestEndedOn, '%Y-%m-%d') >= DATE(CONVERT_TZ(NOW(), '+00:00', '+09:00'));`,
            `UPDATE site_sba SET status = 1 WHERE STR_TO_DATE(requestEndedOn, '%Y-%m-%d') >= DATE(CONVERT_TZ(NOW(), '+00:00', '+09:00'));`,
            `UPDATE site_seoultp SET status = 1 WHERE STR_TO_DATE(requestEndedOn, '%Y-%m-%d') >= DATE(CONVERT_TZ(NOW(), '+00:00', '+09:00'));`,
            `UPDATE site_sjtp SET status = 1 WHERE STR_TO_DATE(requestEndedOn, '%Y-%m-%d') >= DATE(CONVERT_TZ(NOW(), '+00:00', '+09:00'));`,
            `UPDATE site_sosanggongin24 SET status = 1 WHERE STR_TO_DATE(requestEndedOn, '%Y-%m-%d') >= DATE(CONVERT_TZ(NOW(), '+00:00', '+09:00'));`,
            `UPDATE site_ubpi SET status = 1 WHERE STR_TO_DATE(requestEndedOn, '%Y-%m-%d') >= DATE(CONVERT_TZ(NOW(), '+00:00', '+09:00'));`,
            `UPDATE site_utp SET status = 1 WHERE STR_TO_DATE(requestEndedOn, '%Y-%m-%d') >= DATE(CONVERT_TZ(NOW(), '+00:00', '+09:00'));`,
            
        ];

        const setStatusToTwoQueries = [
            `UPDATE site_bepa SET status = 2 WHERE requestEndedOn IS NULL;`,
            `UPDATE site_btp SET status = 2 WHERE requestEndedOn IS NULL;`,
            `UPDATE site_cba SET status = 2 WHERE requestEndedOn IS NULL;`,
            `UPDATE site_cbtp SET status = 2 WHERE requestEndedOn IS NULL;`,
            `UPDATE site_cepa SET status = 2 WHERE requestEndedOn IS NULL;`,
            `UPDATE site_creativekorea SET status = 2 WHERE requestEndedOn IS NULL;`,
            `UPDATE site_ctp SET status = 2 WHERE requestEndedOn IS NULL;`,
            `UPDATE site_dgtp SET status = 2 WHERE requestEndedOn IS NULL;`,
            `UPDATE site_djbea SET status = 2 WHERE requestEndedOn IS NULL;`,
            `UPDATE site_djtp SET status = 2 WHERE requestEndedOn IS NULL;`,
            `UPDATE site_fanfandaero SET status = 2 WHERE requestEndedOn IS NULL;`,
            `UPDATE site_gbsa SET status = 2 WHERE requestEndedOn IS NULL;`,
            `UPDATE site_gbtp SET status = 2 WHERE requestEndedOn IS NULL;`,
            `UPDATE site_gdtp SET status = 2 WHERE requestEndedOn IS NULL;`,
            `UPDATE site_gepa SET status = 2 WHERE requestEndedOn IS NULL;`,
            `UPDATE site_giba SET status = 2 WHERE requestEndedOn IS NULL;`,
            `UPDATE site_giupmadang SET status = 2 WHERE requestEndedOn IS NULL;`,
            `UPDATE site_gjtp SET status = 2 WHERE requestEndedOn IS NULL;`,
            `UPDATE site_gntp SET status = 2 WHERE requestEndedOn IS NULL;`,
            `UPDATE site_gtp SET status = 2 WHERE requestEndedOn IS NULL;`,
            `UPDATE site_gwep SET status = 2 WHERE requestEndedOn IS NULL;`,
            `UPDATE site_gwtp SET status = 2 WHERE requestEndedOn IS NULL;`,
            `UPDATE site_itp SET status = 2 WHERE requestEndedOn IS NULL;`,
            `UPDATE site_jba SET status = 2 WHERE requestEndedOn IS NULL;`,
            `UPDATE site_jbsc SET status = 2 WHERE requestEndedOn IS NULL;`,
            `UPDATE site_jbtp SET status = 2 WHERE requestEndedOn IS NULL;`,
            `UPDATE site_jepa SET status = 2 WHERE requestEndedOn IS NULL;`,
            `UPDATE site_jntp SET status = 2 WHERE requestEndedOn IS NULL;`,
            `UPDATE site_jtp SET status = 2 WHERE requestEndedOn IS NULL;`,
            `UPDATE site_jungsoventure SET status = 2 WHERE requestEndedOn IS NULL;`,
            `UPDATE site_kocca SET status = 2 WHERE requestEndedOn IS NULL;`,
            `UPDATE site_kstartup SET status = 2 WHERE requestEndedOn IS NULL;`,
            `UPDATE site_riia SET status = 2 WHERE requestEndedOn IS NULL;`,
            `UPDATE site_sba SET status = 2 WHERE requestEndedOn IS NULL;`,
            `UPDATE site_seoultp SET status = 2 WHERE requestEndedOn IS NULL;`,
            `UPDATE site_sjtp SET status = 2 WHERE requestEndedOn IS NULL;`,
            `UPDATE site_sosanggongin24 SET status = 2 WHERE requestEndedOn IS NULL;`,
            `UPDATE site_ubpi SET status = 2 WHERE requestEndedOn IS NULL;`,
            `UPDATE site_utp SET status = 2 WHERE requestEndedOn IS NULL;`,       
        ];

        

        // Status를 0으로 설정
        for (const query of setStatusToZeroQueries) {
            try {
                const tableName = query.split(' ')[1];
                const [result] = await pool.query(query);
                console.log(`Successfully processed ${result.affectedRows} rows in ${tableName}.`);
            } catch (err) {
                console.error('Error updating data:', err);
                throw err;
            }
        }

        // Status를 1로 설정
        for (const query of setStatusToOneQueries) {
            try {
                const tableName = query.split(' ')[1];
                const [result] = await pool.query(query);
                console.log(`Successfully processed ${result.affectedRows} rows in ${tableName}.`);
            } catch (err) {
                console.error('Error updating data:', err);
                throw err;
            }
        }

        // Status를 2로 설정
        for (const query of setStatusToTwoQueries) {
            try {
                const tableName = query.split(' ')[1];
                const [result] = await pool.query(query);
                console.log(`Successfully processed ${result.affectedRows} rows in ${tableName}.`);
            } catch (err) {
                console.error('Error updating data:', err);
                throw err;
            }
        }
    } catch (error) {
        console.error('Error updating status:', error);
    }
}

async function closeConnection() {
    pool.end(err => {
        if (err) {
            return console.error('Error ending the connection:', err);
        }
        console.log('Database connection closed.');
    });
}

async function update() {
    await updateStatus();
    await closeConnection();
}

update();