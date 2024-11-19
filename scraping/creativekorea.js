import axios from 'axios';
import * as cheerio from 'cheerio';
import { saveDetail, getAllPathIds } from '../db/db.js';

const payload = {
    sdate: '',
    sdate_view: '',
    edate: '',
    edate_view: '',
    keyword1: '',
    pn: 1,
    sPtime: 'now',
    pagePerContents: 100,
    seq: '',
    rownum: ''
};

const axiosOption = {
    timeout: 30000,
    headers: {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
        'Cache-Control': 'max-age=0',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': 'https://ccei.creativekorea.or.kr/service/business_list.do',
        'Sec-Ch-Ua': '"Not:A-Brand";v="8", "Google Chrome";v="123", "Chromium";v="123"',
        'Sec-Ch-Ua-Arch': "x86",
        'Sec-Ch-Ua-Bitness': "64",
        'Sec-Ch-Ua-Full-Version-List': ' "Not:A-Brand";v="8.0.0.0", "Google Chrome";v="123.0.6312.86", "Chromium";v="123.0.6312.86"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Ch-Ua-Platform-Version': "10.0.0",
        'Sec-Ch-Ua-Wow64': "?0",
        'DNT': '1',
        'Upgrade-Insecure-Requests': '1',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
    },
    family: 4,
};
const instance = axios.create(axiosOption);

async function fetchData(listUrl, method) {
    try {
        if (method === 'post') {
            const response = await instance.post(listUrl, new URLSearchParams(payload));
            return response.data;
        } else if (method === 'get') {
            const response = await instance.get(listUrl);
            return response.data;
        }
    } catch (error) {
        if (error.code === 'ECONNABORTED') {
            console.error("Request timed out:", error);
        } else {
            console.error("Error fetching data:", error);
        }
        return null;
    }
}

async function fillterPathId(scrapedData, siteName){
    try {
        const existingPathIds = await getAllPathIds(siteName);
        // console.log('Scraped Data:', scrapedData);
        // console.log('Existing Path IDs:', existingPathIds);
        
        if (!Array.isArray(existingPathIds)) {
            throw new Error('Existing Path IDs is not an array');
        }
        return scrapedData.filter(pathId => !existingPathIds.includes(pathId));
    } catch (error) {
        console.error('Error fetching existing path IDs:', error);
        return []; // 오류 발생 시 빈 배열 반환
    }
}

async function scrapeData(nonExistingItems, chunkSize, site) {
    let continueFetching = true;
    let totalData = [];
    const baseUrl = 'https://ccei.creativekorea.or.kr/service/business_view.do?sdate=&sdate_view=&edate=&edate_view=&center_searching=&keyword1=&pn=1&sPtime=now&pagePerContents=10&seq=';
    const delayMs = 1000;

    while (continueFetching && nonExistingItems.length > 0) {
        const nonExistingItem = nonExistingItems.shift();
        const pathId = nonExistingItem.SEQ;
        const url = `${baseUrl}${pathId}`;
        const location = nonExistingItem.CD_NM2;
        const html = await fetchData(url, 'get');
        
        if (html) {
            const $ = cheerio.load(html);

            const title = $('th:contains("제목")').next('td').text().trim();
            const eligibility = $('th:contains("지원자격")').next('td').text().trim();
            const supportDetails = $('th:contains("지원사항")').next('td').text().trim();
            const programPeriodText = $('th:contains("프로그램 기간")').next('td').text().trim();
            const [startDate, endDate] = programPeriodText.split('~').map(date => date.trim());

            const attachments = [];
            $('.vw_download a').each((i, element) => {
                const fileName = $(element).find('.dwnname').text().trim();
                const fileUrl = $(element).attr('href');
                attachments.push({ fileName, fileUrl });
            });

            totalData.push({
                pathId: pathId,
                title: title ?? null,
                requirement: eligibility ?? null,
                assistance: supportDetails ?? null,
                requestStartedOn: startDate ?? null,
                requestEndedOn: endDate ?? null,
                attachmentFile: attachments.length > 0 ? JSON.stringify(attachments) : null,
                location: location ?? null,
                site: site
            });

            if (totalData.length >= chunkSize) {
                await saveDataInChunks(totalData,site);
                totalData = [];
            }

            await delayTime(delayMs);
        }
    }

    if (totalData.length > 0) {
        await saveDataInChunks(totalData, site);
        totalData = [];
    }
}

async function delayTime(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function saveDataInChunks(data, siteName) {
    console.log(data);
    if (!Array.isArray(data)) {
        console.error('Data is not an array:', data);
        throw new Error('Data is not an array');
    }
    if (data.length > 0) {
        try {
            await saveDetail(data, siteName);
        } catch (error) {
            if (error.code === 'ER_DUP_ENTRY') {
                console.warn('Duplicate entry found, skipping this record.');
               
            } else {
                console.error('Failed to insert all data:', error);
                throw error;
            }
        }
    }
}

async function creativekorea() {
    console.log('1111');
    const chunkSize = 10;
    const site = 'creativekorea';
    const listUrl = 'https://ccei.creativekorea.or.kr/service/business_list.json';

    const listData = await fetchData(listUrl, 'post');
    if (!listData || !listData.result || !listData.result.list) {
        console.error('Failed to fetch list data or list data is invalid.');
        return;
    }

    const seqMap = listData.result.list.reduce((acc, item) => {
        acc[item.SEQ] = item.CD_NM2;
        return acc;
    }, {});

    const uniqueSeqArray = Object.entries(seqMap).map(([SEQ, CD_NM2]) => ({
        SEQ,
        CD_NM2
    }));

    const nonExistingItems = await fillterPathId(uniqueSeqArray,site);

    if (nonExistingItems.length > 0) {
        await scrapeData(nonExistingItems, chunkSize, site);
    } else {
        console.log('No new data to scrape.');
    }
}

export default creativekorea;