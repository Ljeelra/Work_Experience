
// app.js 임시

import axios from 'axios';
import * as cheerio from 'cheerio';
import { pool, logPoolStatus } from './db/mysql.js';
import giupmadang from './scraping/giupmadang.js'; // 경로를 올바르게 설정하세요.
import { closePool } from './db/db.js';

const scrapingFunctions = {
    giupmadang: giupmadang
};

const sites = ['giupmadang'];

async function runTasks(tasks, maxConcurrent) {
    const queue = [...tasks];
    const results = [];

    const runTask = async () => {
        while (queue.length > 0) {
            const task = queue.shift();
            if (task) {
                try {
                    await task();
                    results.push({ status: 'success' });
                } catch (error) {
                    console.error('Error executing task:', error);
                    results.push({ status: 'failed', error });
                }
            }
        }
    };

    const workers = Array.from({ length: maxConcurrent }, runTask);
    await Promise.all(workers);
    return results;
}

async function scrapeSites() {
    const tasks = sites.map(site => {
        return async () => {
            console.log(`Starting scrape for site: ${site}`);
            const functionName = site;
            if (typeof scrapingFunctions[functionName] === 'function') {
                console.log('\x1b[34m%s\x1b[0m', `${site} scraping list start`);
                try {
                    await retry(() => scrapingFunctions[functionName](), 3);
                    console.log('\x1b[34m%s\x1b[0m', `${site} scraping list complete`);
                    await logPoolStatus(); // 커넥션 풀 상태 확인
                } catch (error) {
                    if (axios.isAxiosError(error) || error.code === 'ETIMEDOUT') {
                        console.error(`Skipping ${site} due to error:`, error);
                    } else {
                        console.error(`Failed to complete scraping list for ${site}:`, error);
                    }
                }
            } else {
                console.log(`Function ${functionName} not defined`);
            }
            console.log(`Completed scrape for site: ${site}`);
        };
    });

    try {
        await runTasks(tasks, 2);
    } catch (error) {
        console.error('Error in scrapeSites:', error);
        throw error; // 에러가 발생하면 프로세스를 종료하지 않도록 throw
    } finally {
        console.log('scrapeSites 완료');
    }
}

function delayTime(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function retry(scrapeSite, retries, timeout = 300000) {
    let attempt = 0;
    while (attempt < retries) {
        try {
            const result = await Promise.race([
                scrapeSite(),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Task timeout')), timeout)
                )
            ]);
            return result;  // 타임아웃이 발생하지 않으면 결과 반환
        } catch (error) {
            attempt++;
            if (attempt < retries && error.message === 'Task timeout') {
                console.log(`Retrying ${scrapeSite.name}... (${attempt + 1}/${retries})`);
                continue;
            } else {
                throw error;
            }
        }
    }
}

async function run() {
    try {
        await logPoolStatus();
        await scrapeSites();
        await delayTime(5000);
    } catch (error) {
        console.error('Error in run method:', error);
    } finally {
        await closePool();
        process.exit(0);
    }
}

run();