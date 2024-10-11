//process.env.NODE_TLS_REJECT_UNAUTHORIZED ="0";
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
const baseUrl = 'https://www.djbea.or.kr/menu?menuId=';
const row = 10;
const axiosInstance = axios.create({
    timeout: 60000, // 60초 타임아웃
    headers: {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.3',
        'Cache-Control': 'max-age=0',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': 'https://www.djbea.or.kr/board?menuId=MENU00525&siteId=null',
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


async function getPathIds(listUrl){
    const pathIds = [];
    let page = 1;
    try{
        const response = await axiosInstance.get(listUrl);
        const $ = cheerio.load(response.data);

        $('ol#subTabMenu li').each((index, element)=>{
            const href = $(element).find('a').attr('href');
            const hrefMatch = href.match(/menuId=([^&]*)/);
            if (hrefMatch) {
                const pathId = hrefMatch[1];
                pathIds.push(pathId);
            }
        });

        return pathIds;
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
        console.error('Error fetching existing path IDs:', error);
        return []; // 오류 발생 시 빈 배열 반환
    }
}    

async function scrapeDetailPage(pathId, siteName){
    const data={
        title:null,
        site: siteName,
        pathId: pathId,
        manager: null,
        department: null,
        businessPerpose: null,
        manager: null,
        supportTarget: null,
        assistance: null,
        department: null,
        applyMethod: null,
        applicationProcess: null
    };
    try{
        const detailUrl = `${baseUrl}${pathId}`
        const detailHtml = await axiosInstance.get(detailUrl);
        const $ = cheerio.load(detailHtml.data);

        data.title = $('table.field.all-open tbody').find('tr').eq(0).text().trim();
        
        const boardBox = $('table.field.all-open tbody tr');
        boardBox.each((index, element) => {
            const thElements = $(element).find('th');
            const tdElements = $(element).find('td');
          
            thElements.each((i, th) => {
                const thText = $(th).text().trim();
                const td = $(tdElements[i]);
                const tdText = td.text().trim();
          
                switch (thText) {
                    case '담당부서':
                        data.department = tdText;
                        break;
                    case '담당자':
                        data.manager = tdText;
                        break;
                    case '사업목적':
                        data.businessPerpose = tdText;
                        break;
                    case '지원대상':
                        data.supportTarget = tdText;
                        break;
                    case '지원내용':
                        data.assistance = tdText;
                        break;
                    case '지원절차':
                        data.applicationProcess = tdText;
                        break;
                    case '신청방법':
                        data.applyMethod = tdText;
                        break;
                    default:
                        break;
                }
            });
        });

    
        //console.log(data);
        return data;
    }catch(error){
        console.log(`scrapeDetailPage() 에러: ${error.message}`, error);
    }
}

const menuList = ['MENU00315', 'MENU00316', 'MENU00317', 'MENU00314', 'MENU00318'];

async function djbea(){
    const siteName = 'djbea';
    const allPathIds = [];
    try{
        for(const no of menuList){
            const listUrl = `${baseUrl}${no}`;
            const pathIds = await getPathIds(listUrl);
            allPathIds.push(pathIds);
        }
        const flattenedPathIds = allPathIds.flat();
        //console.log(flattenedPathIds);

        const filterPathIds = await filterPathId(flattenedPathIds, siteName);
        if (filterPathIds.length === 0) {
            console.log('모든 데이터가 필터링되었습니다. 새로운 데이터가 없습니다.');
            return;
        }
        console.log(`필터링된 후 데이터 개수: ${filterPathIds.length}`);

        const detailDataPromises = filterPathIds.map(pathId => 
            scrapeDetailPage(pathId, siteName)
        );
        const detailDataResults = await Promise.all(detailDataPromises);
        const filteredDataResults = detailDataResults.filter(data => data !== null);

        // 데이터 저장
        await saveDataInChunks(filteredDataResults, siteName);
    
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

//djbea();
export default djbea;