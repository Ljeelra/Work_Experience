import axios from "axios";
import puppeteer from 'puppeteer';
import { saveDetail, getAllPathIds } from '../db/db.js';

const chunkSize = 50;
const maxConcurrentPages = 5;

const axiosInstance = axios.create({
    timeout: 60000, // 60초 타임아웃
    headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
        'Cache-Control': 'max-age=0',
        'DNT': '1',
        'Upgrade-Insecure-Requests': '1'
    },
    family: 4,
});

const apiEndpoints = [
    'https://www.sbiz.or.kr/sup/policy/json/policyfound.do',
    'https://www.sbiz.or.kr/sup/policy/json/policygrow.do',
    'https://www.sbiz.or.kr/sup/policy/json/policycomeback.do',
    'https://www.sbiz.or.kr/sup/policy/json/policystartup.do',
    'https://www.sbiz.or.kr/sup/policy/json/policymarket.do',
    'https://www.sbiz.or.kr/sup/policy/json/policygrnty.do'
]


async function fetchDataFromApi(apiUrl) {
    try {
        const response = await axiosInstance.get(apiUrl);
        return response.data;
    } catch (error) {
        console.error(`Error fetching data from API ${apiUrl}:`, error);
        return null;
    }
}

//pathID 필터링
async function filterPathId(scrapedData, siteName) {
    try {
        const existingPathIds = await getAllPathIds(siteName);
        if (!Array.isArray(existingPathIds)) {
            throw new Error('Existing Path IDs is not an array');
        }
        return scrapedData.filter(data => !existingPathIds.includes(data.pathId));
    } catch (error) {
        console.error('Error fetching existing path IDs:', error);
        return [];
    }
}

//상세페이지 스크랩
async function scrapeDetails(url, page) {
    try {

        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
        await page.setViewport({ width: 1280, height: 800 });
        
        // page.on('console', msg => {
            //     console.log(`PAGE LOG [${msg.type()}]: ${msg.text()}`);
            // });
        await page.goto(url, { waitUntil: 'load', timeout: 30000 });
        console.log('상세페이지 스크랩 시작합니다.');

        await page.waitForFunction(() => document.readyState === 'complete', { timeout: 30000 });

        await page.waitForSelector('.list-view-cont-box', { timeout: 30000 });

        const result = await page.evaluate(() => {
            const title = document.querySelector('.list-view-title')?.innerText.trim() || '';
            const category = document.querySelector('.list-view-top').querySelectorAll('.list-view-top-sort')[0]?.innerText.trim() || '';
            const year = document.querySelector('.list-view-top').querySelectorAll('.list-view-top-sort')[1]?.innerText.trim() || '';
            const supportScale = document.querySelectorAll('.list-view-cont-box')[0]?.innerText.trim() || '';
            const requirement = document.querySelectorAll('.list-view-cont-box')[1]?.innerText.trim() || '';
            const assistance = document.querySelectorAll('.list-view-cont-box')[2]?.innerText.trim() || '';
            const applicationProcess = document.querySelectorAll('.list-view-cont-box')[3]?.innerText.trim() || '';
            const applyMethod = document.querySelectorAll('.list-view-cont-box')[4]?.innerText.trim() || '';
            const faq = document.querySelectorAll('.list-view-cont-box')[5]?.innerText.trim() || '';
            const siteName = 'sosanggongin';

            return {
                title,
                category,
                year,
                supportScale,
                requirement,
                assistance,
                applicationProcess,
                applyMethod,
                faq,
                site: siteName
            };
        });

        console.log('추출된 데이터:', result);
        return result;
    } catch (error) {
        console.error(`에러 상세페이지 스크랩 함수 from ${url}:`, error);
        return null;
    }
}

//상세페이지 멀티스크랩
async function scrapeMultipleDetails(urls) {
    const browser = await puppeteer.launch({ headless: false });
    const pagePromises = [];
    
    for (let i = 0; i < urls.length; i += maxConcurrentPages) {
        // 현재 청크에 해당하는 URL들을 가져옵니다.
        const chunk = urls.slice(i, i + maxConcurrentPages);
        
        // 현재 청크의 URL들을 처리하는 프로미스를 생성합니다.
        const chunkPromises = chunk.map(async (url) => {
            const page = await browser.newPage();
            try {
                const result = await scrapeDetails(url, page);
                return result;
            } catch (error) {
                console.error(`Error scraping ${url}:`, error);
                return null;
            } finally {
                await page.close();
            }
        });
        
        // 현재 청크의 모든 프로미스가 완료될 때까지 기다립니다.
        const chunkResults = await Promise.all(chunkPromises);
        pagePromises.push(...chunkResults);
    }
    
    await browser.close();
    return pagePromises;
}

//스크랩 시작
async function sosanggongin() {
    const siteName = 'sosanggongin';

    try {
        const apiPromises = apiEndpoints.map(apiUrl => fetchDataFromApi(apiUrl));
        const apiResults = await Promise.all(apiPromises);

        const allData = [];

        for (const result of apiResults) {
            if (result && result.item) {
                for (const area of result.item) {
                    if (area.items && area.items.length > 0) {
                        area.items.forEach(item => {
                            const detailUrl = item.url;
                            const pathId = item.url.split('bbsSn=')[1];

                            allData.push({ pathId, detailUrl });
                        });
                    }
                }
            }
        }

        console.log(`총 ${allData.length} 개의 상세 페이지 URL.`);

        const filteredData = await filterPathId(allData, siteName);

        if (filteredData.length === 0) {
            console.log('모든 데이터가 필터링 되었습니다. 새로운 데이터가 없습니다.');
            return;
        }

        console.log(`필터링 후, ${filteredData.length} 개의 페이지를 스크랩해서 DB에 삽입할 수 있습니다.`);

        const detailedData = await scrapeMultipleDetails(filteredData.map(data => data.detailUrl));

        //await saveDataInChunks(detailedData, siteName);

    } catch (error) {
        console.error('에러 sosanggongin() 함수:', error);
    }
}

//데이터 insert
async function saveDataInChunks(data, siteName) {
    console.log(`Total data to insert: ${data.length}`);
    for (let i = 0; i < data.length; i += chunkSize) {
        const chunk = data.slice(i, i + chunkSize);
        try {
            await saveDetail(chunk, siteName);
        } catch (error) {
            if (error.code === 'ER_DUP_ENTRY') {
                console.warn('Duplicate entry found.');
            } else {
                console.error('Failed to insert all data:', error);
                throw error;
            }
        }
    }
}

//sosanggongin();
export default sosanggongin;
