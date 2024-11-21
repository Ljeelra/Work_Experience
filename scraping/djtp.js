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
const baseUrl = 'https://www.djtp.or.kr/pbanc?mid=a20101000000&nPage=';
const baseUrl2 = 'https://www.djtp.or.kr/board.es?mid=a20102000000&bid=0102&nPage=';
const detailBaseUrl = 'https://www.djtp.or.kr/board.es?mid=a20102000000&bid=0102&act=view&list_no=';
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
    const pathData = [];
    let page = 1;
    while(true){
        try{
            const listUrl = `${baseUrl}${page}`;
            const response = await axiosInstance.get(listUrl);
            const $ = cheerio.load(response.data);

            let stopExtraction = false;

            $('#board-list tbody tr').each((index, element)=> {
                const thirdTd = $(element).find('td').eq(3);
                const status = thirdTd.find('span.status.end[data-label="마감"]');
                
                if (status.length > 0) {
                    stopExtraction = true;
                    return false;
                }

                const secondTd = $(element).find('td').eq(2);
                const pathId = secondTd.find('strong').text().trim();
                if(pathId){
                    const rowData = {
                        pathId: pathId,
                        category: null,
                        title: null,
                        requestStartedOn: null,
                        requestEndedOn: null,
                        department: null,
                        attachmentFile: null
                    };
                    rowData.category = $(element).find('td[aria-label="유형"]').text().trim();
                    rowData.title = $(element).find('td[aria-label="공고명"] a').text().trim();
                    const dateTerm = $(element).find('td[aria-label="접수기간"]').text().trim();
                    const date = dateTerm.split('~');
                    rowData.requestStartedOn = date[0].replace(/\./g, '-');
                    rowData.requestEndedOn = date[1].replace(/\./g, '-');
                    rowData.department = $(element).find('td[aria-label="부서"]').text().trim();
                    rowData.attachmentFile = $(element).find('td[aria-label="공고명"] a').attr('href');
                    pathData.push(rowData);
                }
                
            });

            if (stopExtraction) {
                //console.log('pathId 추출이 종료되었습니다.');
                break;
            }

            page++;

        }catch(error){
            console.error(`djtp.js getPathIds error: `,error)

        }
    }
    return pathData;
}

async function getgPathIds(){
    const pathData = [];
    let page = 1;
    while (true) {
        try{
            //console.log(`${page}페이지 pathid 추출 시작합니다`);
            const listUrl2 = `${baseUrl2}${page}`;
            const response = await axiosInstance.get(listUrl2);
            const $ = cheerio.load(response.data);

            let stopExtraction = false;
    
            $('#board-list tbody tr').each((index, element) => {
                const status = $(element).find('td span.status.small.end:contains("완료")');
                if (status.length > 0) {
                    stopExtraction = true;
                    return false; // each 루프 중단
                }

                const onclick = $(element).find('td[aria-label="제목"] a').attr('onclick');
                const regex = /goView\('(\d+)'\)/;
                const onclickMatch = onclick.match(regex);

                if (onclickMatch) {
                    const gpathId = onclickMatch[1];
                    const rowData = {
                        pathId: gpathId,
                        category: null,
                        title: null,
                        requestStartedOn: null,
                        requestEndedOn: null,
                        announcementDate: null,
                        attachmentFile: null
                    };
                    rowData.category = $(element).find('td').eq(2).text().trim();
                    rowData.title = $(element).find('td[aria-label="제목"] a').text().trim();
                    const dateTerm = $(element).find('td').eq(4).text().trim();
                    let [startDate, endDate] = dateTerm.split('~');
                    endDate = endDate.replace(/\s?\(D-\d+\)/, '').trim();
                    rowData.requestStartedOn = startDate.replace(/\//g, '-');
                    rowData.requestEndedOn = endDate.replace(/\//g, '-');
                    let aDate = $(element).find('td[aria-label="등록일"]').text().trim();
                    rowData.announcementDate = aDate.replace(/\//g, '-');
                    pathData.push(rowData);
                }

            });       
            
            if (stopExtraction) {
                //console.log('pathId 추출이 종료되었습니다.');
                break;
            }
    
            page++;
    
        } catch(error){
            console.error('djtp.getPathIds() 에러 발생: ',error);
        }

    }

    return pathData;
}

async function filterPathId(scrapedData, siteName) {
    try {
        const existingPathIds = await getAllPathIds(siteName);
        //console.log('Existing Path IDs:', existingPathIds);  확인을 위한 로그
        if (!Array.isArray(existingPathIds)) {
            throw new Error('Existing Path IDs is not an array');
        }
        return scrapedData.filter(data => !existingPathIds.includes(data.pathId));
    } catch (error) {
        console.error('jungsoventure Error fetching existing path IDs:', error);
        return []; // 오류 발생 시 빈 배열 반환
    }
}


async function scrapeDetailFile(pathId, siteName){
    const attachmentFile =[];
    try{
        const detailUrl = `${detailBaseUrl}${pathId}`
        const detailHtml = await axiosInstance.get(detailUrl);
        const $ = cheerio.load(detailHtml.data);

        const file = $('div.file-wrap');
        file.find('a').each((index, element) => {
            const fileNm = $(element).text().trim();
            const fileHref = $(element).attr('href');
            const fileLink = fileHref.startsWith('https://') ? fileHref : fileHref.startsWith('/') ? `https://www.djtp.or.kr${fileHref}` : null;
            attachmentFile.push({
                fileNm: fileNm,
                fileLink: fileLink
            });

        });
        

        //console.log(attachmentFile);
        return attachmentFile;
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
        const rowData = await getPathIds(); 
        const growData = await getgPathIds();

        const filterData = await filterPathId(rowData,siteName);
        if (filterData.length === 0) {
            console.log('모든 데이터가 필터링되었습니다. 새로운 데이터가 없습니다.');
            return;
        }
        console.log(`필터링된 후 사업공고 데이터 개수: ${filterData.length}`);

        const filterGdata = await filterPathId(growData,siteName);
        if (filterGdata.length === 0) {
            console.log('모든 데이터가 필터링되었습니다. 새로운 데이터가 없습니다.');
            return;
        }
        console.log(`필터링된 후 일반사업공고 데이터 개수: ${filterGdata.length}`);
        console.log(`추가될 데이터 개수 : `,filterData.length+filterGdata.length);
        //console.log(filterGdata);
        const gDataResults = [];
        console.log(`일반공고 상세페이지 스크랩 시작합니다`);
        
        for (const gData of filterGdata) {
            const { pathId } = gData;
         
            //상세 페이지에서 첨부파일 정보를 가져오기
            const data = await scrapeDetailFile(pathId, siteName);
            
            if (data !== null) {
                // 데이터에서 첨부파일 정보를 gData에 추가
                gData.attachmentFile = data;  // 대소문자 일관성 맞추기
                gDataResults.push(gData);  // 업데이트된 gData를 결과 배열에 추가
                await delay(2000);  // 2초 딜레이 추가
            }
        }

        //console.log(gDataResults);

        // 데이터 저장
        await saveDataInChunks(filterData, siteName);
        await saveDataInChunks(gDataResults, siteName);
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

//djtp();
export default djtp;