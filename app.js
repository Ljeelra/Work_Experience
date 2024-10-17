
// app.js 임시

import axios from 'axios';
import * as cheerio from 'cheerio';
import { pool, logPoolStatus } from './db/mysql.js';
import { closePool } from './db/db.js';

//스크랩 사이트 목록
import bepa from './scraping/bepa.js';
import btp from './scraping/btp.js';
import cba from './scraping/cba.js';
import cbtp from './scraping/cbtp.js';
import cepa from './scraping/cepa.js';
import ctp from './scraping/ctp.js';
import dgtp from './scraping/dgtp.js';
import djbea from './scraping/djbea.js';
import djtp from './scraping/djtp.js';
import fanfandaero from './scraping/fanfandaero.js';
import gbsa from './scraping/gbsa.js';
import gbtp from './scraping/gbtp.js';
import gdtp from './scraping/gdtp.js';
import gepa from './scraping/gepa.js';
import giba from './scraping/giba.js';
import giupmadang from './scraping/giupmadang-view.js';
import gjtp from './scraping/gjtp.js';
import gntp from './scraping/gntp.js';
import gwep from './scraping/gwep.js';
import gwtp from './scraping/gwtp.js';
import itp from './scraping/itp.js';
import jba from './scraping/jba.js';
import jbsc from './scraping/jbsc.js';
import jbtp from './scraping/jbtp.js';
import jepa from './scraping/jepa.js';
import jntp from './scraping/jtp.js';
import jungsoventure from './scraping/jungsoventure.js';
import kocca from './scraping/kocca.js';
import kstartup from './scraping/kstartup.js';
import riia from './scraping/riia.js';
import sba from './scraping/sba.js';
import seoultp from './scraping/seoultp.js';
import sjtp from './scraping/sjtp.js';
import sosanggongin24 from './scraping/sosanggongin24.js';
import ubpi from './scraping/ubpi.js';
import utp from './scraping/utp.js';


const scrapingFunctions = {
    bepa: bepa,
    btp: btp,
    cba: cba,
    cbtp: cbtp,
    cepa: cepa,
    ctp: ctp,
    dgtp: dgtp,
    djbea: djbea,
    djtp: djtp,
    fanfandaero: fanfandaero,
    gbsa: gbsa,
    gbtp: gbtp,
    gdtp: gdtp,
    gepa: gepa,
    giba: giba,
    giupmadang: giupmadang,
    gjtp: gjtp,
    gntp: gntp,
    gwep: gwep,
    gwtp: gwtp,
    itp: itp,
    jba: jba,
    jbsc: jbsc,
    jbtp: jbtp,
    jepa: jepa,
    jntp: jntp,
    jungsoventure: jungsoventure,
    kocca: kocca,
    kstartup: kstartup,
    riia: riia,
    sba: sba,
    seoultp: seoultp,
    sjtp: sjtp,
    sosanggongin24: sosanggongin24,
    ubpi: ubpi,
    utp: utp,
};


const sites = ['bepa', 'btp', 'cba', 'cbtp', 'cepa', 'ctp', 'dgtp', 'djbea', 'fanfandaero', 'gbsa', 'gbtp', 'gdtp', 'gepa', 'giba', 'giupmadang',
     'gjtp', 'gntp', 'gwep', 'gwtp', 'itp', 'jba', 'jbsc', 'jbtp', 'jepa', 'jntp', 'jungsoventure', 'kocca', 'kstartup', 'riia', 'sba', 'seoultp', 'sjtp', 'sosanggongin24', 'ubpi', 'utp'];

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