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
const chunkSize2 = 10;
const baseUrl = 'https://www.jejutp.or.kr/board/business/list?keyword=&size=30&businessDiv=&page=';
const detailBaseUrl = 'https://www.jejutp.or.kr/board/business/detail/json/';
const row = 10;
const axiosInstance = axios.create({
    timeout: 60000, // 60초 타임아웃
    headers: {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.3',
        'Cache-Control': 'max-age=0',
        'Content-Type': 'application/json',
        'Referer': 'https://www.jejutp.or.kr/board/business',
        'Sec-Ch-Ua': '"Google Chrome";v="129", "Not=A?Brand";v="8", "Chromium";v="129"',
        'Sec-Ch-Ua-Arch': "x86",
        'Sec-Ch-Ua-Bitness': "64",
        'Sec-Ch-Ua-Full-Version-List': ' "Not:A-Brand";v="8.0.0.0", "Google Chrome";v="123.0.6312.86", "Chromium";v="123.0.6312.86"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Ch-Ua-Platform-Version': "10.0.0",
        'Sec-Ch-Ua-Wow64': "?0",
        'DNT': '1',
        'Upgrade-Insecure-Requests': '1',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36'
    },
    family: 4,
});

async function getPathIds(){
    const pathIds = [];
    let page = 0;
    while (true) {
        try{
            //console.log(`${page}페이지 pathid 추출 시작합니다`);
            const listUrl = `${baseUrl}${page}`;
            const response = await axiosInstance.get(listUrl);
            const jsonData = response.data;
            //console.log('응답 데이터:', jsonData.content);
    
            if (!jsonData.content || !Array.isArray(jsonData.content)) {
                throw new Error('응답 데이터 형식이 올바르지 않습니다.');
            }


            for (const item of jsonData.content) {
                //console.log(item.anno_id);
                if (item.d_day <= 0 && item.d_day_time <= 0) {
                    console.log('d_day와 d_day_time 값이 0 이하인 항목을 만났습니다. 추출을 종료합니다.');
                    return pathIds; // while 루프 중단
                }
                pathIds.push(item.anno_id);
            }
    
            //console.log(pathIds);
            page++;
        } catch(error){
            console.error('jtp.getPathIds() 에러 발생: ',error);
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
        console.error('jtp Error fetching existing path IDs:', error);
        return []; // 오류 발생 시 빈 배열 반환
    }
}

async function scrapeDetailPage(pathId, siteName){
    const data={
        title:null,
        site: siteName,
        pathId: pathId,
        businessPeriod: null,
        announcementDate: null,
        requestStartedOn: null,
        requestEndedOn: null,
        department: null,
        manager: null,
        attachmentFile: [],
        contents: null,
        contentImage: []
    };
    try{
        const detailUrl = `${detailBaseUrl}${pathId}`
        const response = await axiosInstance.get(detailUrl);
        const detailData = response.data;

        data.title = detailData.anno.anno_name;
        // console.log(data.title);
        data.businessPeriod = `${detailData.anno.all_business_s_date} ~ ${detailData.anno.all_business_e_date}`;
        data.announcementDate = detailData.anno.receipt_s_date;
        data.department = detailData.anno.subject_dep;
        data.manager = `${detailData.anno.manager_name}(${detailData.anno.manager_cp})`;
        data.requestStartedOn = detailData.anno.anno_s_date;
        data.requestEndedOn = `${detailData.anno.anno_e_date} ${detailData.anno.receipt_e_hour}:${detailData.anno.receipt_e_minute}`;
   
        data.attachmentFile = detailData.anno.fileList.map(file => ({
            fileNm: file.real_file_name,
            fileLink: `https://www.jeis.or.kr/${file.save_path}/${file.save_file_name}`
        }));

        data.contentImage = detailData.imgfileList.map(image => ({
            imgNm: `${image.real_file_name}_${pathId}`,
            imgLink:`https://www.jeis.or.kr/${image.save_path}/${image.save_file_name}`
        }));

        const annoContents = detailData.anno.anno_contents;
        const decodedHtml = annoContents
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&');
        const $ = cheerio.load(decodedHtml);
        //console.log(annoContents);
        const imgTags = $('img');
        if (imgTags.length > 0) {
            imgTags.each((index, element) => {
                const imgNm = $(element).attr('alt') || `image_${data.title}_${index}`;
                const imgSrc = $(element).attr('src');
        
                if (imgSrc) {
                    const base64Match = imgSrc.match(/^data:image\/(png|jpg|jpeg);base64,(.+)$/);
                    if (base64Match) {
                        const imageDir = path.join(__dirname, 'images', 'jejuimages'); // 이미지 디렉토리
                        fs.ensureDirSync(imageDir); // 디렉토리 존재 확인 및 생성
                        
                        try {
                            const buffer = Buffer.from(base64Match[2], 'base64'); // Base64 디코딩
                            const now = new Date();
                            const year = now.getFullYear(); 
                            const month = String(now.getMonth() + 1).padStart(2, '0'); 
                            const day = String(now.getDate()).padStart(2, '0'); 
                            const formattedDate = `${year}-${month}-${day}`; 
                            const fileName = `${imgNm.replace(/\s+/g, '_')}_${pathId}_${index}_${formattedDate}.png`; // 이미지 파일 이름
                            const filePath = path.join(imageDir, fileName); // 이미지 파일 경로
        
                            if (!fs.existsSync(filePath)) {
                                fs.writeFileSync(filePath, buffer); // 이미지 파일 저장
                                data.contentImage.push({ imgNm, img: filePath }); // 이미지 정보 추가
                            } else {
                                console.log(`파일이 이미 존재합니다: ${filePath}`);
                            }
                        } catch (error) {
                            console.error(`Error saving image for ${imgNm}:`, error);
                        }
                    } else if (imgSrc.startsWith('data:image/')) {
                        console.warn(`Invalid base64 format for image: ${imgNm}`);
                    } else {
                        // Base64가 아닐 경우 절대 경로를 사용하여 이미지 src 저장
                        const fullImgSrc = imgSrc.startsWith('/') ? `http://www.gntp.or.kr${imgSrc}` : imgSrc;
                        data.contentImage.push({ imgNm, img: fullImgSrc });
                    }
                } else {
                    console.warn(`imgSrc is undefined for element: ${index}`);
                }
            });
        }
        

        //console.log(data);
        return data;
    }catch(error){
        console.error(`jtp scrapeDetailPage() 에러: ${error.message}`, error);
    }
}

async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function jtp(){
    const siteName = 'jtp';
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

        // 데이터 저장
        await saveDataInChunks(detailDataResults, siteName);
    }catch(error){
        console.error('jtp.getPathIds() 에러 발생: ', error);
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


export default jtp;