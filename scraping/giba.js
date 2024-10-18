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
const baseUrl = 'https://giba.or.kr/fe/bizinfo/bizannounce/NR_list.do?bbsCd=11&rowPerPage=10&searchType=&searchStatus=2000&searchKey=0001&currentPage=';
const detailBaseUrl = 'https://giba.or.kr/fe/bizinfo/bizannounce/NR_view.do?bbsCd=11&currentPage=1&rowPerPage=10&searchStatus=2000&searchKey=0001&bizAnnoSeq=';
const axiosInstance = axios.create({
    timeout: 90000, // 60초 타임아웃
    headers: {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.3',
        'Cache-Control': 'max-age=0',
        'Content-Type': 'application/x-www-form-urlencoded',
        //'Referer': 'https://www.gepa.kr/contents/madang/selectMadangList.do?menuId=223',
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

async function getPathIds(){
    const pathIds = [];
    let page = 1;
    while (true) {
        try{
            console.log(`${page}페이지 pathid 추출 시작합니다`);
            const listUrl = `${baseUrl}${page}`;
            //console.log(listUrl);
            const response = await axiosInstance.get(listUrl);
            const $ = cheerio.load(response.data);

            //console.log($.html());

            let dataFound = false;
    
            const tableBox = $('div.list_vtb_w table.list_vtb.notice_list tbody');
            tableBox.find('tr').each((index, element) => {
                const href = $(element).find('td.cell_title a.lk_title').attr('href');
                //console.log('href 추출 체크: ', href);
                if(href){
                    const hrefMatch = href.match(/javascript:BIZ.view\('([^']+)'\)/); 
    
                    if (hrefMatch) {
                        const idValue = hrefMatch[1];
                        pathIds.push(idValue);
                        dataFound = true;
                        //console.log(seqValue); 
                    }
                }
            });       
            
            if (!dataFound) {
                console.log('pathId 추출이 종료되었습니다.');
                break; // while 루프 중단
            }
    
            page++;
        } catch(error){
            console.log('giba.getPathIds() 에러 발생: ',error);
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
        overview: null,
        attachmentFile: []
    };
    try{
        const detailUrl =`${detailBaseUrl}${pathId}`
        //console.log(detailUrl);
        const detailHtml = await axiosInstance.get(detailUrl);
        const $ = cheerio.load(detailHtml.data);

        const titleBox = $('div.vskintit_tb');
        data.title = titleBox.find('div.vskintit').text().trim();
        data.category = titleBox.find('span.lk_kind').text().trim();

        const content = $('div.vskin_z');
        data.announcementDate = content.find('div.vskinsub_low').eq(0).find('div.vskinsub_td.vskinsub_right dd div.vsk_data').text().trim();

        const dateTerm = content.find('div.vskinsub_low').eq(1).find('dd div.vsk_data').text().trim();
        const applyDate = dateTerm.split('~');
        data.requestStartedOn = applyDate[0]?.trim() || 'N/A';
        data.requestEndedOn = applyDate[1]?.trim() || 'N/A';

        const editText = $('div.vskin_editor');
        const txtArray =[];
        editText.find('span').each((index, element) => {
            const ptext = $(element).text().trim().replace(/\n+/g, '\n');
            if (ptext) {
                txtArray.push(ptext);
            }
        });
        const editTxt = editText.text().trim().replace(/\n+/g, '\n');
        if(editTxt){
            txtArray.push(editTxt);
        }

        if (txtArray.length > 0) {
            data.overview = txtArray.join(' ');
        }
        
        const file = $('div.vskin_adf_low');
        file.find('ul.vskadf_vlist li').each((index, element) => {
            const fileNm = $(element).find('div.vskadf_vwpsp').text().trim();
            const fileHref = $(element).find('a').attr('href');
            if (fileHref) {
                const fileLink = fileHref.startsWith('https://') ? fileHref : fileHref.startsWith('/') ? `https://giba.or.kr${fileHref}` : null; 
                data.attachmentFile.push({
                    fileNm: fileNm,
                    fileLink: fileLink
                });
            }
        });


        //console.log(data);
        return data;
    } catch(error){
        //console.log(`scrapedetaildata()에서 에러 발생:  ${error.message}`, error);
        console.error(`scrapteDetail()에서 에러 발생: ${data.pathId}`, error)
        
    }

}

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function giba(){
    const siteName = 'giba';
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
        for (const pathId of filterPathIds) {
            const data = await scrapeDetailPage(pathId, siteName);
            detailDataResults.push(data);
            await delay(1000); // 각 요청 후 0.5초 대기
        }
        const filteredDataResults = detailDataResults.filter(data => data !== null);

        //DB 저장 함수 호출
        await saveDataInChunks(filteredDataResults, siteName);

    } catch(error){
        console.log('jntp()에서 에러가 발생 : ',error);
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

//giba();
export default giba;