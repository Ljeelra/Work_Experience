import axios from 'axios';
import * as cheerio from "cheerio";
import { saveDetail, getAllPathIds } from '../db/db.js';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const chunkSize = 50;
const baseUrl = 'https://www.djtp.or.kr/sub010101';
const detailBaseUrl = 'https://www.djtp.or.kr/sub010101/view/id/';
const row = 10;
const axiosInstance = axios.create({
    timeout: 60000, // 60초 타임아웃
    headers: {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.3',
        'Cache-Control': 'max-age=0',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': 'https://www.djtp.or.kr/',
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
});

async function getPathIds(){
    const pathIds = [];
    let page = 1;
    while (true) {
        try{
            //console.log(`${page}페이지 pathid 추출 시작합니다`);
            const listUrl = `${baseUrl}/index/page/${page}`;
            const response = await axiosInstance.get(listUrl);
            const $ = cheerio.load(response.data);

            let stopExtraction = false;
    
            $('tbody tr').each((index, element) => {
                const status = $(element).find('td.subject span.progress.progress2');
                if (status.length > 0) {
                    stopExtraction = true;
                    return false; // each 루프 중단
                }

                const href = $(element).find('td.subject a').attr('href'); // href 속성 값을 가져옵니다.
                const hrefMatch = href.match(/id\/(\d+)/); // 정규 표현식으로 seq 값을 추출합니다.

                if (hrefMatch) {
                    const pathId = hrefMatch[1]; // 추출된 seq 값을 가져옵니다.
                    pathIds.push(pathId);
                    //console.log(seqValue); // seq 값을 출력합니다.
                }

            });       
            
            if (stopExtraction) {
                console.log('pathId 추출이 종료되었습니다.');
                break; // while 루프 중단
            }
    
            //console.log(pathIds);
            page++;
        } catch(error){
            console.error('djtp.getListPathIds() 에러 발생: ',error);
        }

    }
    return pathIds;
}

async function filterPathId(scrapedData, siteName) {
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

async function scrapeDetailPage(pathId, siteName){
    const data={
        title:null,
        site: siteName,
        pathId: pathId,
        announcementDate: null,
        requestStartedOn: null,
        requestEndedOn: null,
        attachmentFile: [],
        contents: null,
        contentImage: []
    };
    try{
        const detailUrl = `${detailBaseUrl}${pathId}`
        const detailHtml = await axiosInstance.get(detailUrl);
        const $ = cheerio.load(detailHtml.data);

        data.title = $('div.newsfeed-view').find('strong.newsfeed-subject').text().trim();
        // console.log(data.title);
        data.announcementDate = $('div.newsfeed-info').find('dd').eq(1).text().trim();
        const dateTerm = $('div.newsfeed-info').find('dd').eq(4).text().trim();
        const resultDate = dateTerm.replace(/\(.*?\)/g, '').trim();
        const applyDate = resultDate.split('~');
        data.requestStartedOn = applyDate[0]?.trim() || 'N/A';
        data.requestEndedOn = applyDate[1]?.trim() || 'N/A';
   


        const file = $('ul.file-list');
        file.find('a').each((index, element) => {
            const fileNm = $(element).text().trim();
            const fileHref = $(element).attr('href');
            const fileLink = fileHref.startsWith('https://') ? fileHref : fileHref.startsWith('/') ? `https://www.djtp.or.kr${fileHref}` : null;
            data.attachmentFile.push({
                fileNm: fileNm,
                fileLink: fileLink
            });

        });
        

        //console.log(data);
        return data;
    }catch(error){
        console.error(`djtp.scrapeDetailPage() 에러: ${error.message}`, error);
    }
}

async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function djtp(){
    const siteName = 'djtp';
    try{
        const pathIds = await getPathIds();
        //console.log(pathIds);

        const filterPathIds = await filterPathId(pathIds,siteName);
        if (filterPathIds.length === 0) {
            console.log('모든 데이터가 필터링되었습니다. 새로운 데이터가 없습니다.');
            return;
        }
        console.log(`필터링된 후 데이터 개수: ${filterPathIds.length}`);

        const filteredDataResults = [];
        console.log(`상세페이지 스크랩 시작합니다`);
        for (const pathId of filterPathIds) {
            const data = await scrapeDetailPage(pathId, siteName);
            if (data !== null) {
                filteredDataResults.push(data);
                await delay(2000); // 2초 딜레이 추가
            }
        }

        // 데이터 저장
        await saveDataInChunks(filteredDataResults, siteName);
    }catch(error){
        console.error(`djtp() 에러, ${error.message}:`, error);
    }
}

async function saveDataInChunks(data, siteName) {
    console.log(`한번에 저장 가능 데이터 개수: ${data.length}`); // 총 데이터 개수 출력
    for (let i = 0; i < data.length; i += chunkSize) {
        const chunk = data.slice(i, i + chunkSize);
        try {
            await saveDetail(chunk, siteName);
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


export default djtp;