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
const baseUrl = 'http://www.sba.seoul.kr/Pages/ContentsMenu/Company_Support.aspx/GetData';
const detailBaseUrl = 'http://www.sba.seoul.kr/Pages/ContentsMenu/Company_Support_Detail.aspx/GetData';
const row = 10;
const axiosInstance = axios.create({
    timeout: 60000, // 60초 타임아웃
    headers: {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.3',
        'Cache-Control': 'max-age=0',
        'Content-Type': 'application/json; charset=utf-8',
        'Referer': 'http://www.sba.seoul.kr/Pages/ContentsMenu/Company_Support.aspx?C=6FA70790-6677-EC11-80E8-9418827691E2',
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
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 Firefox/132.0',
        'X-requested-With': 'XMLHttpRequest'
    },
    family: 4,
});

async function getPathIds(){
    const pathIds = [];
    let page = 1;
    while (true) {
        try{
            console.log(`${page}페이지 pathid 추출 시작합니다`);
            const response = await axiosInstance.post(baseUrl, {param:{P_PAGE_NUM:page, P_PAGING:12, P_ORDER: 'END', P_MENU_ID: '6FA70790-6677-EC11-80E8-9418827691E2'}});
            const jsonData = response.data;
            //console.log(JSON.stringify(response.data, null, 2));
            if (!jsonData.d || !Array.isArray(jsonData.d.contents)) {
                console.error('응답 데이터 형식이 올바르지 않거나 contents가 배열이 아닙니다.', jsonData);
                break; // 종료 또는 다른 처리
            }

            for (const item of jsonData.d.contents) {
                if (parseInt(item.new_txt_mig_date_diff, 10) < 0) {
                    console.log('new_txt_mig_date_diff가 0 미만인 항목을 만났습니다. 추출을 종료합니다.');
                    return pathIds; 
                }
                
                pathIds.push(item.recordId);
            }
    
            //console.log(pathIds);
            page++;
        } catch(error){
            console.log('sba.getPathIds() 에러 발생: ',error);
        }

    }
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
        implementingAgency: null,
        requestStartedOn: null,
        requestEndedOn: null,
        manager: [],
        attachmentFile: [],
        contents: null,
        contentImage: []
    };
    try{
        const response = await axiosInstance.post(detailBaseUrl, {param:{P_RECORDID: pathId, P_ORDER: 'END', P_MENU_ID: '6FA70790-6677-EC11-80E8-9418827691E2', P_TYPE: 'Detail'}});
        const detailData = response.data;

        data.title = detailData.d.contents[0].new_name || null;
        data.requestStartedOn = detailData.d.contents[0].new_dt_mig_sdate || null;
        data.requestEndedOn = detailData.d.contents[0].new_dt_mig_edate || null;
        data.implementingAgency = detailData.d.contents[0].new_txt_mig_org_nm || null;
        const contentsBox = detailData.d.contents[0].new_ntxt_mig_content || null;
        if (contentsBox) {
            const imgRegex = /<img[^>]+src="([^">]+)"[^>]*title="([^">]*)"/g; // src와 title 속성 추출
            let match;
            while ((match = imgRegex.exec(contentsBox)) !== null) {
                const imgSrc = match[1]; // src 속성 값
                const imgTitle = match[2] || null; // title 속성 값
                data.contentImage.push({ img: imgTitle, src: imgSrc });
            }
            data.contents = contentsBox.replace(/<\/?p[^>]*>/g, '').replace(/<br[^>]*>/g, '')
                .replace(/<img[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
        } else {
            data.contents = ""; // contentsBox가 null일 경우 빈 문자열 할당
        }
        const managerNm = detailData.d.contents[0].new_txt_event_name || null;
        const managerPhone = detailData.d.contents[0].new_txt_event_phone || null;
        if(managerNm && managerPhone){

            data.manager.push({name: managerNm, phone: managerPhone});
        }

        for (const file of detailData.d.ContentsFiles) {
            if (file.FILEDIVISION === "DOC") {
                data.attachmentFile.push({
                    fileNM: file.FILE_NM,
                    fileLink: `http://www.sba.seoul.kr${file.FILE_PATH}`
                });
            }

        }


        
        //console.log(data);
        return data;
    }catch(error){
        console.log(`scrapeDetailPage() 에러: ${error.message}`, error);
    }
}

async function processInBatches(array, batchSize, asyncCallback) {
    const result = [];
    for (let i = 0; i < array.length; i += batchSize) {
        const batch = array.slice(i, i + batchSize);
        const batchResults = await Promise.all(batch.map(asyncCallback));
        result.push(...batchResults);
    }
    return result;
}

async function sba(){
    const siteName = 'sba';
    try{
        const pathIds = await getPathIds();
        console.log(pathIds.length+'개의 pathId를 추출하였습니다.');

        const filterPathIds = await filterPathId(pathIds,siteName);
        if (filterPathIds.length === 0) {
            console.log('모든 데이터가 필터링되었습니다. 새로운 데이터가 없습니다.');
            return;
        }
        console.log(`필터링된 후 데이터 개수: ${filterPathIds.length}`);

        const detailDataResults = await processInBatches(pathIds, 20, pathId => scrapeDetailPage(pathId, siteName));
        const filteredDataResults = detailDataResults.filter(data => data !== null);

        // 데이터 저장
        await saveDataInChunks(filteredDataResults, siteName);
    }catch(error){
        console.error('sba.getPathIds() 에러 발생: ', error);
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

sba();
export default sba;