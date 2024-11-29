//process.env.NODE_TLS_REJECT_UNAUTHORIZED ="0";
import axios from 'axios';
import * as cheerio from "cheerio";
import { saveDetail, getAllPathIds, updateStatus } from '../db/db.js';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const chunkSize = 50;
const chunkSize2 = 10;
const baseUrl = 'https://www.ubpi.or.kr/sub/?mcode=';
const row = 10;
const axiosInstance = axios.create({
    timeout: 60000, // 60초 타임아웃
    headers: {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.3',
        'Cache-Control': 'max-age=0',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': 'https://www.ubpi.or.kr/sub/?mcode=0401010000',
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
        const response = await axiosInstance.get(`${baseUrl}0401010000`);
        const $ = cheerio.load(response.data);

        $('ul.lnb li').each((index, element) => {
            const href = $(element).find('a').attr('href');
            const hrefMatch = href.match(/mcode=(\w+)/);
            if (hrefMatch) {
                const no = hrefMatch[1];
                if (no) {
                    menu.push(no);
                }
            }
        });
        return menu;
    } catch(error){
        console.error('ubpi getNo() 에러 발생 : ',error);
    }   
}

async function getPathIds(listUrl){
    const pathIds = [];
    let page = 1;
    try{
        const response = await axiosInstance.get(listUrl);
        const $ = cheerio.load(response.data);

        $('div.board-text table tbody tr').each((index, element)=>{
            const status = $(element).find('td.status em.st_ing');
            if (status.length) {
                const href = $(element).find('td.tit a').attr('href');
                const hrefMatch = href.match(/no=(\d+)/);

                if (hrefMatch) {
                    const pathId = hrefMatch[1]; 
                    pathIds.push(pathId);
                }
            }
        });

        return pathIds;
    }catch(error){
        console.error('ubpi getPathIds() 에러 발생 : ',error);
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
        console.error('ubpi Error fetching existing path IDs:', error);
        return []; // 오류 발생 시 빈 배열 반환
    }
}   

async function filterOutdatedPathId(scrapedData, siteName) {
    try {
        const existingPathIds = await getAllPathIds(siteName);
        
        if (!Array.isArray(existingPathIds)) {
            throw new Error('Existing Path IDs is not an array');
        }
        return existingPathIds.filter(pathId => !scrapedData.includes(pathId));
    } catch (error) {
        console.error('gwtp Error fetching existing path IDs:', error);
        return []; // 오류 발생 시 빈 배열 반환
    }
}

async function scrapeDetailPage(onlyPathId, siteName, menuNo){
    const data={
        title:null,
        site: siteName,
        pathId: `${menuNo}:${onlyPathId}`,
        announcementDate: null,
        contents: null,
        attachmentFile: [],
        manager: []
    };
    try{
        const detailUrl = `${baseUrl}${menuNo}&no=${onlyPathId}`;
        const detailHtml = await axiosInstance.get(detailUrl);
        const $ = cheerio.load(detailHtml.data);

        const titleBox = $('div.titBox p.tit');
        titleBox.find('span').remove();
        data.title = titleBox.text().trim();
        data.announcementDate = $('div.titBox p.topinfo').text().trim();

        const contentBox = $('div.viewBox');

        const file = contentBox.find('div.down_box');
        file.find('a').each((index, element) => {
            const fileNm = $(element).text().trim();
            const fileHref = $(element).attr('href');
            if (fileHref) {
                const fileLink = fileHref.startsWith('https://') ? fileHref : fileHref.startsWith('/') ? `https://www.ubpi.or.kr${fileHref}` : null; 
                data.attachmentFile.push({
                    fileNm: fileNm,
                    fileLink: fileLink
                });
            }
        });

        const managerInfo = contentBox.find('div.guideInfo_box .inner ul.list li');
        managerInfo.each((index, element) => {
            const label = $(element).find('span').text().trim();
            const value = $(element).contents().not($(element).find('span')).text().trim(); 
            data.manager[label] = value; 
        });

        contentBox.find('div.down_box').remove();
        contentBox.find('div.guideInfo_box').remove();
        contentBox.find('h4.ttl01:contains("신청양식 및 첨부서류")').remove();
        contentBox.find('h4.ttl01:contains("담당자 연락처")').remove();

        data.contents = contentBox.text().trim().replace(/\t/g, '').replace(/\n+/g, '\n').replace(/^\d+\n/gm, match => match.trim());
        
        

        //console.log(data);
        return data;
    }catch(error){
        console.error(`ubpi scrapeDetailPage() 에러: ${error.message}`, error);
    }
}

async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

let menuList = [];

async function ubpi(){
    const siteName = 'ubpi';
    const allPathIds = [];
    try{
        menuList = await getNo();
        menuList = [...new Set(menuList)];
        //console.log(menuList);
        
        for(const no of menuList){
            const listUrl = `${baseUrl}${no}`;
            const pathIds = await getPathIds(listUrl);
            for (const pathId of pathIds) {
                allPathIds.push(`${no}:${pathId}`);
                await delay(2000);
            }
        }
        //console.log(allPathIds);

        const filterForUpdate = await filterOutdatedPathId(allPathIds, siteName);
        // 필터링된 pathId의 상태를 업데이트
        if (filterForUpdate.length > 0) {
            await updateStatus(filterForUpdate, siteName);
        } else {
            console.log('No outdated pathIds to update.');
        }


        const filterPathIds = await filterPathId(allPathIds, siteName);
        if (filterPathIds.length === 0) {
            console.log('모든 데이터가 필터링되었습니다. 새로운 데이터가 없습니다.');
            return;
        }
        console.log(`필터링된 후 데이터 개수: ${filterPathIds.length}`);
        //console.log(filterPathIds);

        const detailDataResults = [];
        console.log(`상세페이지 스크랩을 시작합니다`);
        for (let i = 0; i < filterPathIds.length; i += chunkSize2) {
            const chunk = filterPathIds.slice(i, i + chunkSize2);
            const chunkResults = await Promise.all(chunk.map(async (pathId) => {
                const [menuNo, onlyPathId] = pathId.split(':'); // menuNo와 pathId 분리
                const data = await scrapeDetailPage(onlyPathId, siteName, menuNo); // 필요시 menuNo도 함께 전달
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
        console.error('ubpi() 에러 발생: ',error)
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

//ubpi();
export default ubpi;