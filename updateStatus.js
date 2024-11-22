import {pool} from './db/mysql.js';

const sites = ['bepa', 'btp', 'cba', 'cbtp', 'creativekorea', 'cepa', 'ctp', 'dgtp', 'djbea', 'djtp', 'fanfandaero', 'gbsa', 'gbtp', 'gdtp', 'gepa', 'giba', 'giupmadang',
    'gjtp', 'gntp', 'gtp', 'gwep', 'gwtp', 'itp', 'jba', 'jbsc', 'jbtp', 'jepa', 'jntp', 'jungsoventure', 'kocca', 'kstartup', 'riia', 'sba', 'seoultp', 'sjtp', 'sosanggongin24', 'ubpi', 'utp'];


    const buildDeleteQueries = () => {
        const queries = [];
        sites.forEach(site => {
            queries.push(
            `DELETE site_${site} 
            FROM site_${site}
            INNER JOIN (SELECT pathId, site FROM site_${site} WHERE status = 0) AS subquery
            ON site_${site}.pathId = subquery.pathId AND site_${site}.site = subquery.site`
            );
        });
        return queries;
    };
    

const runQueries = async (queries) => {
    for (const [index, query] of queries.entries()) {
        try {
            const [results] = await pool.query(query);
            console.log(`Query ${index + 1} executed successfully:`, results.affectedRows);
        } catch (error) {
            console.error(`Error executing query ${index + 1}:`, error);
            throw error;
        }
    }
};

const updateViewTable = async () => {
    try {
        const deleteQueries = buildDeleteQueries();
        await runQueries(deleteQueries);
        console.log('Enabled list updated successfully.');
    } catch (error) {
        console.error('Error updating enabled list:', error);
    }
};

const closeConnection = async () => {
    try {
        await pool.end();
        console.log('Database connection closed.');
    } catch (err) {
        console.error('Error ending the connection:', err);
        throw err;
    }
};

const update = async () => {
    await updateViewTable();
    await closeConnection();
};

update();