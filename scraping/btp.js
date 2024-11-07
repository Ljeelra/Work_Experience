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
const baseUrl = 'https://www.btp.or.kr/kor/CMS/Board/Board.do?mCode=MN013&page=';
const detailBaseUrl = 'https://www.btp.or.kr/kor/CMS/Board/Board.do?mCode=MN013&mode=view&mgr_seq=16&board_seq=';
const row = 10;
const axiosInstance = axios.create({
    timeout: 60000, // 60초 타임아웃
    headers: {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.3',
        'Cache-Control': 'max-age=0',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': 'https://www.btp.or.kr/kor/CMS/Board/Board.do?robot=Y&mCode=MN013&page=1',
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
            const listUrl = `${baseUrl}${page}`;
            const response = await axiosInstance.get(listUrl);
            const $ = cheerio.load(response.data);

            let stopExtraction = false;
    
            $('tbody tr').each((index, element) => {
                const status = $(element).find('td.state span.status.st10');
                if (status.length > 0) {
                    // status.st10 요소가 있으면 루프를 중단합니다.
                    stopExtraction = true;
                    return false; // each 루프 중단
                }

                const href = $(element).find('td.subject p.stitle a').attr('href'); // href 속성 값을 가져옵니다.
                const seqMatch = href.match(/board_seq=(\d+)/); // 정규 표현식으로 seq 값을 추출합니다.

                if (seqMatch) {
                    const seqValue = seqMatch[1]; // 추출된 seq 값을 가져옵니다.
                    pathIds.push(seqValue);
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
            console.error('btp.getPathIds() 에러 발생: ',error);
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
        category: null,
        requestStartedOn: null,
        requestEndedOn: null,
        announcementDate: null,
        requirement: null,
        applyMethod: null,
        assistance: null,
        contact: null,
        attachmentFile: [],
        supportTarget: null,
        overview: null,
        contents: null,
        eventoverview: null,
        recruitoverview: null
    };
    try{
        const detailUrl = `${detailBaseUrl}${pathId}`
        const detailHtml = await axiosInstance.get(detailUrl);
        const $ = cheerio.load(detailHtml.data);

        data.title = $('div.board-biz-view').find('h3.view-tit').text().trim();
        // console.log(data.title);
        data.overview = $('div.txt-box').find('p').text().trim();
        const dateText = $('.top-txt-box p').eq(1).text();
        const dateMatch = dateText.match(/\d{4}\.\d{2}\.\d{2}/);
        if (dateMatch) {
            const date = dateMatch[0];
            // console.log('추출된 날짜:', date);
            data.announcementDate = date;
        }

        const board_info = $('div.board-biz-info');
        board_info.find('ul li').each((index, element)=> {
            const spanTit = $(element).find('span.tit').text().trim();
            $(element).find('span.tit').remove();
            const liTxt =  $(element).text().trim();

            switch(spanTit){
                case '지 원 대 상':
                    data.supportTarget = liTxt;
                    break;
                case '지 원 내 용':
                    data.assistance = liTxt;
                    break;
                case '참 가 자 격':
                    data.requirement = liTxt;
                    break;
                case '신 청 방 법 ':
                    data.applyMethod = liTxt;
                    break;
                case '접 수 기 간':
                    const applyDate = liTxt.split('~');
                    data.requestStartedOn = applyDate[0].trim();
                    data.requestEndedOn = applyDate[1].trim();
                    break;
                case '문 의 처':
                    data.contact = liTxt.replace(/\n|\t/g, '');
                    break;
                case '행 사 개 요':
                    data.eventoverview = liTxt;
                    break;
                case '모 집 내 용':
                    data.recruitoverview =liTxt;
                    break;
                case '시 험 항 목':
                    data.contents =liTxt;
                    break;
                default:
                    break;
            }
        });

        const file = $('ul.file-list');
        file.find('a').each((index, element) => {
            const fileNm = $(element).find('span').text().trim();
            const href = $(element).attr('href');
            const filelink = `https://www.btp.or.kr/${href}`; 
            data.attachmentFile.push({
                fileNm: fileNm,
                fileLink: filelink
            });

        });

        //console.log(data);
        return data;
    }catch(error){
        console.error(`btp.scrapeDetailPage() 에러: ${error.message}`, error);
    }
}

async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function btp(){
    const siteName = 'btp';
    try{
        const pathIds = await getPathIds();
        //console.log(pathIds);

        const filterPathIds = await filterPathId(pathIds,siteName);
        if (filterPathIds.length === 0) {
            console.log('모든 데이터가 필터링되었습니다. 새로운 데이터가 없습니다.');
            return;
        }
        console.log(`필터링된 후 데이터 개수: ${filterPathIds.length}`);

        const detailDataResults = [];
        console.log(`상세페이지 스크랩 시작합니다`);
        for (const pathId of filterPathIds) {
            const result = await scrapeDetailPage(pathId, siteName);
            if (result !== null) {
                detailDataResults.push(result);
            }
            await delay(2000); // 각 요청 사이에 2초 대기
        }

        // 데이터 저장
        await saveDataInChunks(detailDataResults, siteName);
    }catch(error){
        console.error(`btp() 에러: ${error.message}`, error);
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


export default btp;