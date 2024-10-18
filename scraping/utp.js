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
const chunkSize2 = 10;
const baseUrl = 'https://www.utp.or.kr/include/contents.php?mnuno=M0000018&menu_group=1&sno=0102&task=list&s_state=1&sear=&page=';
const detailBaseUrl ='https://www.utp.or.kr/proc/re_ancmt/list.php?task=getItem&_=1728022912998&seq=';
const axiosInstance = axios.create({
    timeout: 60000, // 60초 타임아웃
    headers: {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.3',
        'Cache-Control': 'max-age=0',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': 'https://www.utp.or.kr/include/contents.php?mnuno=M0000018&menu_group=1&sno=0102&task=list&page=&s_state=1&sear=',
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
            console.log(`${page}페이지 pathid 추출 시작합니다`);
            const listUrl = `https://www.utp.or.kr/proc/re_ancmt/list.php?task=list&s_state=1&sear=&_=1728021840236&page=${page}`;
            const response = await axiosInstance.get(listUrl);
            const jsonData = response.data;
            //console.log(jsonData);
            let dataFound = false;
    
            if (jsonData.data && Array.isArray(jsonData.data)) {
                const codes = jsonData.data.map(item => item.seq);
                if (codes.length > 0) {
                    pathIds.push(...codes);
                    dataFound = true;
                } else {
                    console.log(`페이지 ${page}에 pathIds가 없습니다.`);
                    break;
                  }
            }

            if (!dataFound) {
                console.log(`페이지 ${page}에 pathId가 없습니다.`);
                break;
            }
            //console.log(pathIds);
            page++;
        } catch(error){
            console.log('utp/getListPathIds() 에러 발생: ',error);
            break;
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
    
    try{
        const dataList = {
            site: siteName,
            pathId: pathId,
            title: null, 
            overview:null,
            requestStartedOn: null, //신청기간
            requestEndedOn: null,
            announcementDate: null,
            businessPeriod: null,
            contents: null,
            supportTarget: null, //지원대상
            contact: [],//문의처
            attachmentFile: []//첨부파일
        }
        const detailUrl = `${detailBaseUrl}${pathId}`;
        const response = await axiosInstance.post(detailUrl, {sprtBizCd: pathId} );
        const jsonData = response.data;
        //console.log(json);
     
        dataList.title = jsonData.data.title;
        dataList.overview = jsonData.data.content;
        dataList.requestStartedOn = jsonData.data.apply_start_dt;
        dataList.requestEndedOn = jsonData.data.apply_end_dt;
        dataList.announcementDate = jsonData.data.created_dt	;
        dataList.businessPeriod = `${jsonData.data.notice_start_date} ~ ${jsonData.data.notice_end_date}`;
        dataList.contents = jsonData.data.outline;
        dataList.supportTarget = jsonData.data.supported_target;
        dataList.contact = jsonData.data.contact_info;

        jsonData.files.forEach(file => {
            const fileLink = `https://www.utp.or.kr/proc/re_ancmt/download.php?seq=${file.re_seq}&no=${file.f_no}`;
            const fileNm = file.f_source;
            
            dataList.attachmentFile.push({
                fileNm: fileNm,
                fileLink: fileLink
            });
        });
    
        //console.log(dataList);
    return dataList;
    }catch(error){
        console.log('상세페이지스크랩 중 에러 발생', error);
    }

}

async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function utp(){
    const siteName = 'utp';
    try{
        //pathId 추출
        let pathIds = [];
        let allIds = await getPathIds();
        const uniqueIds = Array.from(new Set(allIds));
        pathIds = uniqueIds;
        console.log(`총 ${pathIds.length}개의 pathId가 스크랩되었습니다.`);

        const filterPathIds = await filterPathId(pathIds,siteName);
        if (filterPathIds.length === 0) {
            console.log('모든 데이터가 필터링되었습니다. 새로운 데이터가 없습니다.');
            return;
        }
    
        console.log(`필터링된 후 데이터 개수: ${filterPathIds.length}`);

        //상세페이지 스크랩
        const detailDataResults = [];
        for (let i = 0; i < filterPathIds.length; i += chunkSize2) {
            const chunk = filterPathIds.slice(i, i + chunkSize2);
            const chunkResults = await Promise.all(chunk.map(async (pathId) => {
                const data = await scrapeDetailPage(pathId, siteName);
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
        console.log('utp()에서 에러가 발생 : ',error);
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

//utp();
export default utp;