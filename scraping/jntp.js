import axios from 'axios';
import * as cheerio from "cheerio";
import { saveDetail, getAllPathIds } from '../db/db.js';
import iconv from 'iconv-lite';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const chunkSize = 50;
const listUrl = 'http://www.jntp.or.kr/home/menu/245.do';
const detailBaseUrl = 'http://www.jntp.or.kr/home/menu/245.do?mode=view&announcement=';
const MAX_RETRIES = 3;
const row = 10;
const axiosInstance = axios.create({
    timeout: 60000, // 60초 타임아웃
    responseType: 'arraybuffer',
    headers: {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.3',
        'Cache-Control': 'max-age=0',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': 'http://www.jntp.or.kr/home/menu/245.do',
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
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 Firefox/131.0'
    },
    family: 4,
});

async function getPathIds(){
    const pathIds = [];
    let page = 1;
    while (true) {
        try{
            //console.log(`${page}페이지 pathid 추출 시작합니다`);
            const response = await axiosInstance.post(listUrl, { page: page, acceptState: '2'});
            const $ = cheerio.load(response.data);

            let stopExtraction = false;
    
            $('tbody tr').each((index, element) => {
                const status = $(element).find('img').attr('alt');
                if (status === '접수마감') {
                    // status.st10 요소가 있으면 루프를 중단합니다.
                    stopExtraction = true;
                    return false; // each 루프 중단
                }

                const href = $(element).find('td a').attr('href');
                const idMatch = href.match(/announcement=(\d+)/); 
                if (idMatch) {
                    const idValue = idMatch[1]; 
                    pathIds.push(idValue);
                    //console.log(seqValue); 
                }

            });       
            
            if (stopExtraction) {
                console.log('pathId 추출이 종료되었습니다.');
                break; // while 루프 중단
            }
    
            page++;
        } catch(error){
            console.log('gtp.getListPathIds() 에러 발생: ',error);
        }
        
    }
    //console.log(pathIds);
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
        console.error('jntp Error fetching existing path IDs:', error);
        return []; // 오류 발생 시 빈 배열 반환
    }
}

async function scrapeDetailPage(pathId, siteName){
    const data={
        title:null,
        site: siteName,
        pathId: pathId,
        implementingAgency: null,
        manager: null,
        requestStartedOn: null,
        requestEndedOn: null,
        businessPerpose: null,
        overview: null,
        document: null,
        contact: null,
        attachmentFile: []
    };
    try{
        const detailUrl =`${detailBaseUrl}${pathId}`
        //console.log(detailUrl);
        const detailHtml = await axiosInstance.get(detailUrl);
        const $ = cheerio.load(detailHtml.data);

        data.title=$('tbody tr').find('td').eq(0).text().trim();
        $('table.tbl_type1 tbody tr').each((index, element) => {

            const thElements = $(element).find('th');
            const tdElements = $(element).find('td');
          
            thElements.each((i, th) => {
              const thText = $(th).text().trim();
              const td = $(tdElements[i]);
              const tdText = td.text().trim();
          
              switch (thText) {
                case '접수기간':
                    const dateTerm = tdText.replace(/[\n\t]/g, '').replace(/\s+/g, ' ').replace(/[()]/g, '').trim();
                    const applyDate = dateTerm.split('~');
                    data.requestStartedOn = applyDate[0]?.trim() || 'N/A';
                    data.requestEndedOn = applyDate[1]?.trim() || 'N/A';
                    break;
                case '주관기관':
                    data.implementingAgency = tdText;
                    break;
                case '담당자':
                    data.manager = tdText;
                    break;
                case '문의처':
                    data.contact = tdText;
                    break;
                case '사업목적':
                  data.businessPerpose = tdText;
                    break;
                case '사업내용':
                  data.overview = tdText;
                    break;
                case '공동제출서류':
                  data.document = tdText;
                    break;
                case '첨부파일':
                    td.find('a').each((index, element) => {
                        const fileNm = $(element).text().trim();
                        const fileHref = $(element).attr('href');
                        if (fileHref) {
                            const fileLink = fileHref.startsWith('https://') ? fileHref : fileHref.startsWith('/') ? `https://www.cbtp.or.kr${fileHref}` : null; 
                            data.attachmentFile.push({
                                fileNm: fileNm,
                                fileLink: fileLink
                            });
                        }
                    });
                  
                    break;
                default:
                    break;
              }
            });
        });

        
        //console.log(data);
        return data;
    } catch(error){
        //console.log(`scrapedetaildata()에서 에러 발생:  ${error.message}`, error);
        console.error(`jntp scrapteDetail()에서 에러 발생: ${data.pathId}`, error)
        
    }

}

async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function jntp(){
    const siteName = 'jntp';
    try{
        const pathIds = await getPathIds();
        console.log(`총 ${pathIds.length}개의 pathId가 스크랩되었습니다.`);

        const filterPathIds = await filterPathId(pathIds,siteName);
        if (filterPathIds.length === 0) {
            console.log('모든 데이터가 필터링되었습니다. 새로운 데이터가 없습니다.');
            return;
        }    
        console.log(`필터링된 후 데이터 개수: ${filterPathIds.length}`);

        //상세페이지 스크랩
        const detailDataResults = [];
        console.log(`상세페이지 스크랩 시작합니다`);
        for (const pathId of filterPathIds) {
            const data = await scrapeDetailPage(pathId, siteName);
            detailDataResults.push(data);
            await delay(500); // 각 요청 후 0.5초 대기
        }
        const filteredDataResults = detailDataResults.filter(data => data !== null);

        //DB 저장 함수 호출
        await saveDataInChunks(filteredDataResults, siteName);

    } catch(error){
        console.error('jntp()에서 에러가 발생 : ',error);
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

//jntp();
export default jntp;