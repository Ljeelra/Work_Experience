// process.env.NODE_TLS_REJECT_UNAUTHORIZED ="0";
import axios from 'axios';
import * as cheerio from "cheerio";
import { saveDetail, getAllPathIds } from '../db/db.js';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { title } from 'process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const chunkSize = 50;
const baseUrl = 'http://www.cepa.or.kr/business/business.do?pm=4&ms=23';
const chunkSize2 = 10;
const axiosInstance = axios.create({
    timeout: 60000, // 60초 타임아웃
    headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.3',
        'Cache-Control': 'max-age=0',
        'Content-Type': 'application/x-www-form-urlencoded',
        //'Referer': 'https://www.bepa.kr/kor/view.do?no=1502&idx=15197',
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

async function getNo() {
    let menu=[];
    try{
        
        const response = await axiosInstance.get(baseUrl);
        const $ = cheerio.load(response.data);

        //console.log(response.data);

        $('div#accordion div.card').each((index, element) => {
            // div.card 내부의 모든 a 태그를 찾습니다.
            $(element).find('a').each((idx, anchor) => {
                const href = $(anchor).attr('href');
                const hrefMatch = href.match(/ms=([^&]+)/);
                if (hrefMatch) {
                    const no = hrefMatch[1];
                    if (no) {
                        menu.push(no);
                    }
                }
            });
        });
        return menu;
    } catch(error){
        console.log('getNo() 에러 발생 : ',error);
    }   
}

async function getTotalPage(listUrl){
    try {
        //console.log(`totalPage 추출을 시작합니다`);
        const response = await axiosInstance.post(listUrl);
        if (!response.data) return 0;

        const $ = cheerio.load(response.data);
        const paging = $('section.container');
        let totalPages = '';
        // 페이지가 한 페이지인지 여러 페이지인지 확인
        const pageText = $('p').text();

        // 정규 표현식으로 값 추출
        const match = pageText.match(/\(\d+\/(\d+) page\)/);
        if (match) {
            const totalPages = match[1];
            console.log('총 페이지 수:', totalPages);
            return totalPages;
        } else {
            console.log('페이지 정보를 찾을 수 없습니다.');
        }
    } catch (error) {
        console.error('getTotalPages()에서 에러가 발생:', error);
        return 0;
    }
}

async function getPathIds(listUrl){
    const pathIds = [];
    let page = 1;
    const totalPage = await getTotalPage(listUrl);
    while (page <= totalPage) {
        try {
            console.log(`${page}페이지 pathid 추출 시작합니다`);
            const url =`${listUrl}${page}`
            //console.log(url);
            const response = await axiosInstance.get(url);
            const $ = cheerio.load(response.data);
            // console.log('페이지 로드 완료');            
            
            let dataFound = false;
            let shouldBreak = false;

            const list = $('table.table tbody tr');
            list.each((index, element) => {
                const status = $(element).find('td').eq(1).text().trim();
                const dateText = $(element).find('td').eq(3).text().trim();
                const year = dateText.split('-')[0];
                //console.log(year);

                // 년도가 2022이면 루프 종료
                if (year === '2022') {
                    //console.log('2022년 데이터 발견, 루프 종료');
                    shouldBreak = true; // 종료 조건을 true로 설정
                    return false; // 각 루프를 중단하여 다음 반복으로 넘어감
                }

                if (status === '진행중') {
                    const href = $(element).find('td.tbl-subject a').attr('href');
                    if (href) {
                        const hrefMatch = href.match(/seq=(\d+)/);
                        if (hrefMatch) {
                            const pathId = hrefMatch[1];
                            pathIds.push(pathId);
                            dataFound = true; // 데이터가 있음을 표시
                        }
                    }
                   
                }
            });

            if (shouldBreak) {
                break; // while 루프 종료
            }

            //console.log('현재까지 추출된 pathIds:', pathIds);
            page++;
        } catch (error) {
            console.log('getPathIds() 에러 발생: ', error);
            break; // 에러 발생 시 루프 중단
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

async function scrapeDetailPage(detailUrl, pathId, no, siteName){
    const data={
        title:null,
        site: siteName,
        pathId: pathId,
        category: null,
        announcementDate:null,
        requestStartedOn:null,
        requestEndedOn:null,
        businessPeriod: null,
        attachmentFile: [],
        contents: null,
        contentImage: []
    };
    try{
        const detailHtml = await axiosInstance.get(detailUrl);
        const $ = cheerio.load(detailHtml.data);
        // title이 null이 아닐 때를 확인하는 조건 수정
        const titleCheck = $('div.pvzone').find('h5').text().trim();
        //console.log('titleCheck: ',titleCheck);
        if (titleCheck) {  // titleCheck가 존재하면
            data.category = $('ul.un-styled.d-flex.pv-info li:first-child span').text().trim();
            data.title = titleCheck; // title이 null이 아닐 경우 값을 저장
            data.businessPeriod = $('li.align-items-center span').eq(1).text().trim();

            const file = $('div.pv-list ul li');
            file.each((index, element) => {
                const fileNm = $(element).contents().filter((_, el) => el.nodeType === 3).text().trim();

                const fileHref = $(element).find('a').attr('href');
                const fileLink = fileHref.startsWith('https://') ? fileHref : fileHref.startsWith('/') ? `https://www.cepa.or.kr${fileHref}` : null;
                data.attachmentFile.push({
                    fileNm: fileNm,
                    fileLink: fileLink
                });
            });

            const imgbox = $('div.dCon.tcenter.mgb50');
            const txtArray = [];
            imgbox.find('p').each((index, element) => {
                const ptext = $(element).text().trim();
                if (ptext) {
                    txtArray.push(ptext);
                }
            });

            if (txtArray.length > 0) {
                data.contents = txtArray.join(' ');
            }
        }else {  // 제목이 없는 경우
            const realUrl = `https://www.cepa.or.kr/board/boardDetail.do?pm=4&ms=${no}&seq=${pathId}`;
            const cepaHtml = await axiosInstance.get(realUrl);
            const $ = cheerio.load(cepaHtml.data);
            data.title = $('table.table thead tr th').text().trim();
            //console.log(`${no}, ${pathId} title: `, data.title);

            const infoBody = $('table.table tbody');
            const firstRow = infoBody.find('tr').eq(0).find('ul li');

            firstRow.each((index, element) => {
                const text = $(element).text().trim(); 
                if (text.startsWith('모집기간 :')) {
                    const dateTerm = text.split(' : ')[1].split('~').map(date => date.trim());
                    data.requestStartedOn = dateTerm[0];
                    data.requestEndedOn = dateTerm[1];
                } else if (text.startsWith('작성일 :')) {
                    data.announcementDate = text.split(' : ')[1].trim();
                }
            });

            // 첨부파일 추출
            const file = infoBody.find('tr').eq(1);
            file.find('a').each((index, element) => {
                const fileNm = $(element).text().trim(); // 링크 텍스트를 파일 이름으로 저장
                const fileHref = $(element).attr('href');
                const fileLink = fileHref.startsWith('https://') ? fileHref : fileHref.startsWith('/') ? `https://www.cepa.or.kr${fileHref}` : null;
                data.attachmentFile.push({
                    fileNm: fileNm,
                    fileLink: fileLink
                });
            });
        }
        


    
        //console.log(data);
        return data;
    }catch(error){
        console.log(`scrapeDetailPage() 에러: ${error.message}`, error);
    }
}

let menuList= [];

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function cepa(){
    const siteName = 'cepa';
    try{
        menuList = await getNo();
        //console.log(menuList);
        const allDetailedData = [];
        if (menuList.length > 0) {
            for (const no of menuList) {
                const listUrl = `http://www.cepa.or.kr/business/business.do?pm=4&ms=${no}&pn=`;
                const pathIds = await getPathIds(listUrl);
                //console.log(`${no} 유니크키 확인: `,pathIds);
                //필터링 로직 추가
                const filterePathIds = await filterPathId(pathIds, siteName);
                if (filterePathIds.length === 0) {
                    console.log('모든 데이터가 필터링되었습니다. 새로운 데이터가 없습니다.');
                    continue; // 변경된 부분: continue로 다음 no로 넘어감
                }

                console.log(`필터링된 후 데이터 개수: ${filterePathIds.length}`);

                //상세페이지 스크랩
                const detailDataResults = [];
                for (let i = 0; i < filterePathIds.length; i += chunkSize2) {
                    const chunk = filterePathIds.slice(i, i + chunkSize2);
                    const chunkResults = await Promise.all(chunk.map(async (pathId) => {
                        const detailUrl = `https://www.cnsp.or.kr/project/view.do?seq=${pathId}`;
                        const data = await scrapeDetailPage(detailUrl, pathId, no, siteName);
                        if (data !== null) {
                            return data;
                        }
                        await delay(3000); // 3초 딜레이 추가
                        return null;
                    }));

                    detailDataResults.push(...chunkResults.filter(data => data !== null));
                }

                allDetailedData.push(...detailDataResults);
                console.log(`no ${no}에 대해 ${detailDataResults.length}개의 상세 데이터가 수집되었습니다.`);
            }
        }

        if (allDetailedData.length > 0) {
            await saveDataInChunks(allDetailedData, siteName);
        } else {
            console.log("새로운 데이터가 없어 저장할 수 없습니다");
        }
    
    } catch(error){
        console.log('bepa() 에러 발생: ',error)
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

//cepa();
export default cepa;