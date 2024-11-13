import axios from 'axios';
import axiosRetry from 'axios-retry';
import * as cheerio from "cheerio";
import { saveDetail, getAllPathIds } from '../db/db.js';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const chunkSize = 50;
const chunkSize2 = 10;
const menuUrl = 'https://www.jepa.kr/page/?site=new_jepa&mn=319';
const axiosInstance = axios.create({
    timeout: 90000, // 60초 타임아웃
    headers: {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.3',
        'Cache-Control': 'max-age=0',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': 'https://www.jepa.kr/bbs/?b_id=notice&site=new_jepa&mn=363&sc_category=%EC%9B%90%EC%8A%A4%ED%86%B1%EC%95%88%EB%82%B4',
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

// axiosRetry 설정: 3번까지 재시도, 재시도 간격은 1초
axiosRetry(axiosInstance, {
    retries: 3,
    retryDelay: (retryCount) => {
        console.log(`재시도 횟수: ${retryCount}`);
        return retryCount * 1000; // 재시도 간격 (밀리초)
    },
    retryCondition: (error) => {
        return error.code === 'ECONNABORTED' || error.response.status >= 500;
    },
});

async function getNo() {
    let menu=[];
    try{
        const response = await axiosInstance.get(menuUrl);
        const $ = cheerio.load(response.data);

        $('div#side_nemu_wrap > ul.menu_list_wrap > li').each((index, li) => {
            let category = $(li).find('> a').text().trim(); // 카테고리 추출
            if (category === '원스톱 사업안내') {
                category = '원스톱안내';
            }
        
            // li 내부의 ul.side_depth에서 '공지사항' 텍스트를 포함한 a 태그의 href 추출
            $(li).find('ul.side_depth li a').each((i, el) => {
                if ($(el).text().trim() === '공지사항') {
                    const href = $(el).attr('href');
                    const mnValue = href.match(/mn=(\d+)/); // mn= 뒤의 값 추출

                    if (mnValue) {
                        menu.push({
                            category: category,
                            menuId: mnValue[1] // mn= 뒤의 값만 저장
                        });
                    }
                }
            });
        });
        return menu;
    } catch(error){
        console.log('getNo() 에러 발생 : ',error);
    }   
}

async function getPathIds(listUrl){
    const pathIds = [];
    let page = 1;
    try{
        const response = await axiosInstance.get(listUrl);
        const $ = cheerio.load(response.data);

        const pagingCheck = $('#paginate_complex p').find('a').first();
        if(pagingCheck.length > 0){
            const pageHref = pagingCheck.attr('href');
            if (pageHref) {
                // 'page=' 뒤쪽 값을 제거
                const newUrl = pageHref.split('page=')[0]; 
                const filteredUrl = newUrl.split('?')[1];
                //console.log('필터링된 pageUrl: ',filteredUrl);
                while(true){
                    console.log(`${page} 에서 pathId를 추출합니다.`);

                    const pageUrl = `https://www.jepa.kr/bbs/bbs_ajax?${filteredUrl}&page=${page}`;
                    const response = await axiosInstance.get(pageUrl);
                    const $ = cheerio.load(response.data);

                    let dataFound = false;

                    const board = $('#board_list table tbody tr');
                    board.each((index, element) => {
                        const status = $(element).find('td.sup_2');
                        if (status.length) {
                            const href = $(element).find('td.txt_l > div.title > a').attr('href');
                            const hrefMatch = href.match(/bs_idx=(\d+)/);
                            if (hrefMatch) {
                                const pathId = hrefMatch[1];
                                pathIds.push(pathId); // 추출한 href를 배열에 추가
                                dataFound = true;
                            }
                        }
                    });

                    if (!dataFound) {
                        console.log('pathId 추출이 종료되었습니다.');
                        break; // while 루프 중단
                    }

                    page++;
                }
                //console.log(`${listUrl}에서 추출된 pathIDs`,pathIds);
                return pathIds;
            }

        }else{
            const board = $('#board_list table tbody tr');
            board.each((index, element) => {
                const status = $(element).find('td.sup_2');
                if (status.length) {
                    const href = $(element).find('td.txt_l > div.title > a').attr('href');
                    const hrefMatch = href.match(/bs_idx=(\d+)/);
                    if (hrefMatch) {
                        const pathId = hrefMatch[1];
                        pathIds.push(pathId);
                    }
                }
            });
            //console.log(`${listUrl}에서 추출된 pathIDs`,pathIds);
            return pathIds;
        }
        
    }catch(error){
        console.log('getPathIds() 에러 발생 : ',error);
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
        console.error('jepa Error fetching existing path IDs:', error);
        return []; // 오류 발생 시 빈 배열 반환
    }
}

async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function scrapeDetailPage(pathId, menuId, siteName){
    const data={
        title:null,
        site: siteName,
        pathId: pathId,
        announcementDate: null,
        requestStartedOn: null,
        requestEndedOn: null,
        contents: null,
        attachmentFile: [],
    };
    try{
        const detailUrl = `https://www.jepa.kr/bbs/bbs_ajax/?b_id=notice&site=new_jepa&mn=${menuId}&type=view&bs_idx=${pathId}`;
        //console.log(`상세페이지 URL : `,detailUrl);
        const detailHtml = await axiosInstance.get(detailUrl);
        const $ = cheerio.load(detailHtml.data);
        
        const boardBox = $('div.board_view');
        data.title = boardBox.find('div.title').text().trim();
        let dateTerm = boardBox.find('div.info span').text().trim();
        dateTerm = dateTerm.replace('신청기간 :', '').trim();
        const applyDate = dateTerm.split('~');
        data.requestStartedOn = applyDate[0]?.trim() || '';
        data.requestEndedOn = applyDate[1]?.trim() || '';
        const infoText = $('div.info').contents().filter(function() {
            return this.type === 'text';
        }).text().trim();
        const date = infoText.split('/')[1].trim();
        data.announcementDate = date;

        const file = boardBox.find('ul#file_list li');
        file.each((index, element) => {
            const fileNm = $(element).find('a').text().trim();
            const fileHref = $(element).find('a').attr('href');
            //console.log('href 추출확인: ',fileHref);
            const fileLink = fileHref.startsWith('https://') ? fileHref : 
            fileHref.startsWith('http://') ? fileHref : fileHref.startsWith('/') ? `https://www.jepa.kr${fileHref}` : null;
            data.attachmentFile.push({
                fileNm: fileNm,
                fileLink: fileLink
            });

        });


        const txtArray =[];
        boardBox.find('div.board_view_contents').each((index, element) => {
            const ptext = $(element).text().trim();
            const aTag = $(element).find('a');
            if (ptext) {
                txtArray.push(ptext);
            }
            if(aTag.length>0){
                const aHref = aTag.attr('href');
                txtArray.push(aHref);
            }
        });

        if (txtArray.length > 0) {
            data.contents = txtArray.join(' ');
        }

        //console.log(data);
        return data;
    }catch(error){
        console.error(`jepa scrapeDetailPage() 에러: ${error.message}`, error);
    }
}


async function jepa(){
    const siteName = 'jepa';
    let menuDataList = [];
    const menuIds = [];
    const allPathIds=[];
    try{
        menuDataList = await getNo();
        //console.log(menuDataList);

        // const menuId = menuDataList.map(item => item.menuId); // pathId 배열 생성
        // menuIds.push(...menuId);
        
        for (const item of menuDataList) { // menuList의 각 항목을 item으로 설정
            const listUrl = `https://www.jepa.kr/bbs/bbs_ajax/?b_id=notice&site=new_jepa&mn=${item.menuId}&sc_category=${item.category}`;
            const pathIds = await getPathIds(listUrl);
            
            for (const pathId of pathIds) {
                allPathIds.push({ pathId, menuId: item.menuId });
            }
        }
        console.log(`추출된 PathId는 총 ${allPathIds.length} 입니다. `);

        const filterePathIds = allPathIds.map(item => item.pathId); // filterPathIds에 pathId 값만 저장
        const filteredPathIds = await filterPathId(filterePathIds, siteName);
        if (filteredPathIds.length === 0) {
            console.log('모든 데이터가 필터링되었습니다. 새로운 데이터가 없습니다.');
            return;
        }
        console.log(`필터링된 후 데이터 개수: ${filteredPathIds.length}`);

        const detailDataResults = [];
        console.log(`상세페이지 스크랩 시작합니다`);
        for (let i = 0; i < filteredPathIds.length; i += chunkSize2) {
            const chunk = filteredPathIds.slice(i, i + chunkSize2);
            const chunkResults = await Promise.all(chunk.map(async (pathId) => {
                const item = allPathIds.find(item => item.pathId === pathId); // 현재 pathId에 해당하는 item 찾기
                const data = await scrapeDetailPage(pathId, item.menuId, siteName); // pathId와 menuId를 함께 전달
                if (data !== null) {
                    return data;
                }
                return null;
            }));
            
            detailDataResults.push(...chunkResults.filter(data => data !== null));
            await delay(3000); // 3초 딜레이 추가
        }

        // 데이터 저장
        await saveDataInChunks(detailDataResults, siteName);
    
    } catch(error){
        console.error('jepa() 에러 발생: ',error)
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

//jepa();
export default jepa;