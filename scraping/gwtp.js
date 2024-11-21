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
const baseUrl = 'https://www.gwtp.or.kr/gwtp/bbsNew_list.php?code=sub01b&keyvalue=sub01';
const detailBaseUrl = 'https://www.gwtp.or.kr/gwtp/bbsNew_view.php?bbs_data=';
const row = 10;
const axiosInstance = axios.create({
    timeout: 60000, // 60초 타임아웃
    headers: {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.3',
        'Cache-Control': 'max-age=0',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': 'https://www.gwtp.or.kr/gwtp/bbsNew_list.php?code=sub01b&keyvalue=sub01',
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

async function getPathIds() {
    try{
        const getHtml =  await axiosInstance.get(baseUrl);
        const $ = cheerio.load(getHtml.data);
        const pathIds = [];
        $('tbody tr').each((index, element) => {
            const buttonText = $(element).find('td:nth-child(1) button').text().trim(); // 첫 번째 td의 button 텍스트
        
            // 첫 번째 td의 button이 '공지'이고, 두 번째 td의 a의 button이 '모집중'인지 확인
            if (buttonText === '공지') {
                const titlebutton = $(element).find('td:nth-child(2) a button').text().trim();
                
                // 모집중 버튼인지 확인
                if (titlebutton === '모집중') {
                    const href = $(element).find('td:nth-child(2) a').attr('href'); // href 추출
                    const match = href.match(/bbs_data=([^&]+)/);
                    if (match && match[1]) {
                        const pathId = match[1]; 
                        pathIds.push(pathId);
                    }
                }
            }
        });

        //console.log(pathIds);
        return pathIds;
    }catch(error){
        console.error('gwtp Error fetching total pages:', error);
        return 1;
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
        console.error('gwtp Error fetching existing path IDs:', error);
        return []; // 오류 발생 시 빈 배열 반환
    }
}

async function checkUpdateStatus(){

}

async function scrapeDetailPage(pathId, siteName){
    const data = {
        pathId: pathId,
        site: siteName,
        title: null,
        announcementDate: null,
        contents: null,
        contentImage: [],
        attachmentFile: []
    };
        try{

            //console.log(detailUrl);
            const detailHtml = await axiosInstance.get(`${detailBaseUrl}${pathId}`);
            const $ = cheerio.load(detailHtml.data);

            const titleText = $('tr:nth-child(1) th.pt-3.pb-3').contents().filter(function() {
                return this.type === 'text'; // 텍스트 노드만 필터링
            }).text().trim();
            data.title= titleText.replace("제 목 : ", "");
            
            const tableBox = $('table.table tbody tr');
            data.announcementDate = tableBox.eq(1).find('td').eq(1).text().trim();

            tableBox.eq(2).find('a').each((index, file) =>{
                const fileNm = $(file).text().trim();
                const fileHref = $(file).attr('href');
                if(fileHref){
                    const fileLink = `https://www.gwtp.or.kr/gwtp/${fileHref}`;
                    data.attachmentFile.push({
                        fileNm: fileNm,
                        fileLink: fileLink
                    });
                }
            });

            //이미지
            const imgbox = tableBox.eq(3);
            const imgTags = imgbox.find('img');
            if (imgTags.length > 0) {
                            
                imgTags.each((index, element) => {
                    const imgNm = $(element).attr('title') || `image_${index}`;
                    const imgSrc = $(element).attr('src');
                    if (imgSrc) {
                        const base64Match = imgSrc.match(/^data:image\/(png|jpg|jpeg);base64,(.+)$/);
                        if (base64Match) {
                            const imageDir = path.join(__dirname, 'images', 'gwimages'); 
                            fs.ensureDirSync(imageDir);
                            try {
                                const buffer = Buffer.from(base64Match[2], 'base64'); // 디코딩
                                const now = new Date();
                                const year = now.getFullYear(); 
                                const month = String(now.getMonth() + 1).padStart(2, '0'); 
                                const day = String(now.getDate()).padStart(2, '0'); 

                                const formattedDate = `${year}-${month}-${day}`; 
                                const sanitizedPathId = pathId.replace(/\|\|/g, '_');
                                const fileName = `${imgNm.replace(/[^\w.-]+/g, '_')}_${sanitizedPathId}_${formattedDate}.png`;
                                const filePath = path.join(imageDir, fileName); // 이미지 파일 경로
                                //console.log('Saving image to:', filePath);
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
                            const fullImgSrc = imgSrc.startsWith('/') ? `http://www.gwtp.or.kr${imgSrc}` : imgSrc;
                            data.contentImage.push({ imgNm, img: fullImgSrc });
                        }
                    } else {
                        console.warn(`imgSrc is undefined for element: ${index} in URL: ${pathId}`);
                    }
                });
            }
            const txtArray =[];
            imgbox.find('p').each((index, element) => {
                const ptext = $(element).text().trim();
                if (ptext) {
                    txtArray.push(ptext);
                }
            });
            if (txtArray.length > 0) {
                data.contents = txtArray.join(' ');
            }

            //console.log(data);
            return data;
        } catch(error){
            //console.log(`scrapedetaildata()에서 에러 발생:  ${error.message}`, error);
            console.error(`gwtp scrapteDetail()에서 에러 발생: ${data.pathId}`, error)
            
        }

}

async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function gwtp(){
    const siteName= 'gwtp';
    try{        
        //pathId, status 스크랩
        const pathIds= await getPathIds();
   
        //데이터 업데이트를 위한 필터링
        const filterForUpdate = await filterOutdatedPathId(pathIds, siteName);

        //필터링된 pathId의 상태를 업데이트
        await updateStatus(filterForUpdate, siteName);

        //데이터 저장을 위한 필터링
        const filterPathIds = await filterPathId(pathIds, siteName);
        if (filterPathIds.length === 0) {
            console.log('모든 데이터가 필터링되었습니다. 새로운 데이터가 없습니다.');
            return;
        }
    
        console.log(`필터링된 후 데이터 개수: ${filterPathIds.length}`);

        //상세페이지 스크랩
        const filteredDataResults = [];
        console.log(`상세페이지 스크랩 시작합니다`);
        for (const pathId of filterPathIds) {
            const data = await scrapeDetailPage(pathId, siteName);
            if (data !== null) {
                filteredDataResults.push(data);
            }
            await delay(2000); // 2초 딜레이 추가
        }

        //DB 저장
        await saveDataInChunks(filteredDataResults, siteName);

    } catch(error){
        console.error(`gwtp()에서 에러,${error.message}: `,error)
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

gwtp();
export default gwtp;