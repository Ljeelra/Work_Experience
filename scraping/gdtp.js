import axios from 'axios';
import * as cheerio from "cheerio";
import { saveDetail, getAllPathIds } from '../db/db.js';
import https from 'https';
import iconv from 'iconv-lite';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const chunkSize = 50;
const chunkSize2 = 10;
const baseUrl = 'https://gdtp.or.kr/sproject/index';
const detailBaseUrl ='https://gdtp.or.kr/sproject/view/';
const axiosInstance = axios.create({
    timeout: 60000, // 60초 타임아웃
    headers: {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.3',
        'Cache-Control': 'max-age=0',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': 'https://gdtp.or.kr/sproject/index/?',
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
    httpsAgent: new https.Agent({  
        rejectUnauthorized: false // SSL 인증서 검증 비활성화
    })
});

async function getPathIds() {
    const pathIds = [];
    let page = 1;
    while (true) {
        try {
            //console.log(`${page}페이지 pathid 추출 시작합니다`);
            const response = await axiosInstance.get(`${baseUrl}/?=&page=${page}`);
            const $ = cheerio.load(response.data);

            let itemsFound = false;
            $('div.item').each((index, element) => {
                const dateText = $(element).find('.txt_area p.date').text().trim();
                const cateText = $(element).find('.txt_area p.cate').text().trim();

                if (dateText.includes('2024년')) {
                    const href = $(element).find('a').attr('href');
                    const match = href.match(/view\/(\d+)/);
                    if (match) {
                        const value = match[1];

                        pathIds.push({ pathId: value, cate: cateText});
                        itemsFound = true;
                    }
                }
            });

            if (!itemsFound) {
                console.log('더 이상 항목이 없습니다. 루프를 종료합니다.');
                break;
            }

            page++;
        } catch (error) {
            console.error('gdtp getPathIds() 에러 발생: ', error);
            break;
        }
    }

    //console.log(pathIds);
    return pathIds;
}

async function filterPathId(scrapedData, siteName) {
    try {
        const existingPathIds = await getAllPathIds(siteName);
        //console.log('Scraped Data:', scrapedData);
        //console.log('Existing Path IDs:', existingPathIds);
        
        if (!Array.isArray(existingPathIds)) {
            throw new Error('Existing Path IDs is not an array');
        }
        return scrapedData.filter(pathId => !existingPathIds.includes(pathId));
    } catch (error) {
        console.error('Error fetching existing path IDs:', error);
        return []; // 오류 발생 시 빈 배열 반환
    }
}

async function scrapeDetailPage(cate, pathId, siteName){
    const data = {
        pathId: pathId,
        site: siteName,
        title: null,
        category: cate,
        businessPeriod: null,
        assistance: null,
        requestStartedOn: null,
        requestEndedOn: null,
        supportTarget: null,
        businessPerpose: null,
        contact: []
    };
    try{
        const detailUrl = `${detailBaseUrl}${pathId}`;
        //console.log(detailUrl);
        const detailHtml = await axiosInstance.get(detailUrl);
        const $ = cheerio.load(detailHtml.data);
        
        data.title= $('section.pstitle').find('h3').text().trim();
        const dateTerm = $('div.sgroup.sgroup01').find('.psc_cont').text().trim();
        const applyDate = dateTerm.split('~');
        data.requestStartedOn = applyDate[0]?.trim() || 'N/A';
        data.requestEndedOn = applyDate[1]?.trim() || 'N/A';
        data.assistance = $('div.sgroup.sgroup02').find('.psc_cont').text().trim().replace(/[\n\t]/g, '');
        data.supportTarget = $('div.sgroup.sgroup03').find('.psc_cont').text().trim().replace(/\n/g, '');
        data.businessPerpose = $('div.sgroup.sgroup04').find('.psc_cont').text().trim();
        const teamText = $('div.psc_dot1.mb15').text().trim();
        if (teamText) {
            data.contact.push(teamText); // contact에 추가
        }
        $('table.itbl tbody tr').each((index, element) => {
            const rowData = $(element).find('td').map((i, td) => $(td).text().trim()).get();
            data.contact.push(rowData.join(' ')); // 행의 텍스트를 공백으로 연결하여 contact에 추가
        });

        //console.log(data);
        return data;
        } catch(error){
            //console.log(`scrapedetaildata()에서 에러 발생:  ${error.message}`, error);
            console.error(`gdtp.scrapteDetail()에서 에러 발생: ${data.pathId}`, error)
            
        }

}

async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}


async function gdtp(){
    const siteName = 'gdtp';
    try{
        //pathId 추출
        const idCate = await getPathIds();
        const cate = idCate.map(item => item.cate);
        const pathIds = idCate.map(item => item.pathId);
        console.log(`총 ${pathIds.length}개의 pathId가 스크랩되었습니다.`);

        const filterPathIds = await filterPathId(pathIds,siteName);
        //console.log(`필터링된 pathId: ${filterPathIds}`);
        if (filterPathIds.length === 0) {
            console.log('모든 데이터가 필터링되었습니다. 새로운 데이터가 없습니다.');
            return;
        }
        console.log(`필터링된 후 데이터 개수: ${filterPathIds.length}`);

        //상세페이지 스크랩
        const detailDataResults = [];
        console.log(`상세페이지 스크랩 시작합니다`);
        for (let i = 0; i < filterPathIds.length; i += chunkSize2) {
            const chunk = filterPathIds.slice(i, i + chunkSize2);
            const chunkResults = await Promise.all(chunk.map(async (pathId) => {
                const index = pathIds.indexOf(pathId); // 해당 pathId의 인덱스 찾기
                const category = index !== -1 ? cate[index] : null;
                const data = await scrapeDetailPage(category, pathId, siteName);
                if (data !== null) {
                    return data;
                }
                return null;
            }));
            
            detailDataResults.push(...chunkResults.filter(data => data !== null));
            await delay(3000); // 3초 딜레이 추가
        }

        //DB 저장 함수 호출
        await saveDataInChunks(detailDataResults, siteName);

    } catch(error){
        console.error('gdtp()에서 에러가 발생 : ',error);
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

//gdtp();
export default gdtp;