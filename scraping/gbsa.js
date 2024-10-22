//process.env.NODE_TLS_REJECT_UNAUTHORIZED ="0";
import axios from 'axios';
import * as cheerio from "cheerio";
import { saveDetail, getAllPathIds } from '../db/db.js';
import https from 'https';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const chunkSize = 50;
const baseUrl = 'https://www.gbsa.or.kr';
const chunkSize2 = 10;
const axiosInstance = axios.create({
    timeout: 60000, // 60초 타임아웃
    headers: {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.3',
        'Cache-Control': 'max-age=0',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': 'https://www.gbsa.or.kr/pages/businessization_support.do',
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
    httpsAgent: new https.Agent({  
        rejectUnauthorized: false // SSL 인증서 검증 비활성화
    })
});


async function getintroUrl(){
    const hrefs = [];
    try{
        const listUrl =`${baseUrl}/pages/intro_startup.do`;
        const response = await axiosInstance.get(listUrl);
        const $ = cheerio.load(response.data);

        $('#snb1 ul li.hasSub').each((index, element)=>{
            const intro = $(element).find('div.d3 ul li.m1').eq(0);

            const href = intro.find('a').attr('href');
            if(href){
                hrefs.push(href);
            }
        });

        return hrefs;
    }catch(error){
        console.log('getPathIds() 에러 발생 : ',error);
    }

}

async function getAllHref(listUrl){
    const pathIds=[];
    try{
        const response = await axiosInstance.get(listUrl);
        const $ = cheerio.load(response.data);

        $('ul.spt_main_info li').each((index, element)=>{
            const href = $(element).find('a').attr('href');
            //console.log(href);
            if(href){
                pathIds.push(href);
            }
        });

        return pathIds;
    }catch(error){
        console.log('getAllHref()에서 에러가 발생했습니다.', error);
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
        businessPerpose: null,
        supportTarget: null,
        businessPerpose: null,
        applyMethod: null,
        applicationProcess: null,
        assistance: null,
        contentImage: []
    };
    try{
        const detailUrl = `${baseUrl}${pathId}`
        const detailHtml = await axiosInstance.get(detailUrl);
        const $ = cheerio.load(detailHtml.data);

        const box = $('div#content');
        data.title = box.find('div.sub_title h3').text().trim();
        const content_wrap = box.find('div.ctt-wrap');
        content_wrap.find('div.ctt').each((index, element)=>{
            const h4Element = $(element).find('h4').text().trim();
            let textValue = '';

            // p, ul li, ol li 중 하나의 텍스트 추출
            const pElement = $(element).find('p').first();
            if (pElement.length > 0) {
                textValue = pElement.text().trim();
            } else {
                const ulElement = $(element).find('ul li').first();
                if (ulElement.length > 0) {
                    textValue = ulElement.text().trim();
                } else {
                    const olElement = $(element).find('ol');
                    if (olElement.length > 0) {
                        const olItems = olElement.find('li').map((i, li) => {
                            const dt = $(li).find('dl dt').text().trim();
                            const dd = $(li).find('dl dd').text().trim();
                            return `${dt}: ${dd}`;
                        }).get().join(', ');
                        textValue = olItems; // ol 항목들을 콤마로 구분하여 저장
                    }
                }
            }

            switch (h4Element) {
                case '사업목적':
                    data.businessPerpose = textValue;
                    break;
                case '지원대상':
                    data.supportTarget = textValue;
                    break;
                case '신청방법':
                    data.applyMethod = textValue;
                    break;
                case '지원절차':
                    data.applicationProcess = textValue;
                    break;
                case '지원내용':
                    data.assistance = textValue;
                    break;
                default:
                    break;
            }
        });
        
        //이미지처리
        const imgTags = box.find('img');
        if (imgTags.length > 0) {             
            imgTags.each((index, element) => {
                const imgNm = $(element).attr('alt') || `image_${data.title}_${index}`;
                const imgSrc = $(element).attr('src');
                if (imgSrc) {
                    const base64Match = imgSrc.match(/^data:image\/(png|jpg|jpeg);base64,(.+)$/);
                    if (base64Match) {
                        const imageDir = path.join(__dirname, 'images', 'gbsaimages'); 
                        fs.ensureDirSync(imageDir);
                        try {
                            const buffer = Buffer.from(base64Match[2], 'base64'); // 디코딩
                            const now = new Date();
                            const year = now.getFullYear(); 
                            const month = String(now.getMonth() + 1).padStart(2, '0'); 
                            const day = String(now.getDate()).padStart(2, '0'); 

                            const formattedDate = `${year}-${month}-${day}`; 
                            const fileName = `${imgNm.replace(/\s+/g, '_')}_${pathId}_${index}_${formattedDate}.png` // 이미지 이름 설정
                            const filePath = path.join(imageDir, fileName); // 이미지 파일 경로

                            if (!fs.existsSync(filePath)) {
                                fs.writeFileSync(filePath, buffer); // 디코딩된 이미지 저장
                                data.contentImage.push({ imgNm, img: filePath }); // 파일 경로 저장
                            } else {
                                console.log(`파일이 이미 존재합니다: ${filePath}`);
                            }
                        } catch (error) {
                            console.error(`Error saving image for ${imgNm}:`, error);
                        }
                    } else if (imgSrc.startsWith('data:image/')) {
                        console.warn(`Invalid base64 format for image: ${imgNm} in URL: ${pathId}`);
                    } else {
                        // Base64가 아닐 경우 절대 경로를 사용하여 이미지 src 저장
                        const fullImgSrc = imgSrc.startsWith('/') ? `https://www.gbsa.or.kr${imgSrc}` : imgSrc;
                        data.contentImage.push({ imgNm, img: fullImgSrc });
                    }
                } else {
                    console.warn(`imgSrc is undefined for element: ${index} in URL: ${pathId}`);
                }
            });
        }
    
        //console.log(data);
        return data;
    }catch(error){
        console.log(`scrapeDetailPage() 에러: ${error.message}`, error);
    }
}

async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function gbsa(){
    const siteName = 'gbsa';
    const allHref = [];
    try{
        //각 카테고리별 introURL얻기
        const hrefList =  await getintroUrl();
        console.log('카테고리 소개 href추출이 완료되었습니다');

        //얻은 introUrl 페이지에서 href 얻기
        for(const pathId of hrefList){
            const listUrl = `${baseUrl}${pathId}`;
            const pathIds = await getAllHref(listUrl);
            for (const pathId of pathIds) {
                allHref.push(pathId);
            }
        }
        const hrefIds = [...new Set(allHref)];
        console.log('각 사업별 href 추출이 완료되었습니다.');
        
        //얻은 href 값을 pathId삼아 필터링
        const filterPathIds = await filterPathId(hrefIds, siteName);
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
        //console.log(detailDataResults);

        // 데이터 저장
        await saveDataInChunks(detailDataResults, siteName);
    
    } catch(error){
        console.log('gbsa() 에러 발생: ',error)
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

//gbsa();
export default gbsa;