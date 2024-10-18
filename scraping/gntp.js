import axios from 'axios';
import * as cheerio from "cheerio";
import { saveDetail, getAllPathIds } from '../db/db.js';
import iconv from 'iconv-lite';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const chunkSize = 50;
const listUrl = 'https://www.gntp.or.kr/biz/apply';
const detailBaseUrl = 'https://www.gntp.or.kr/biz/applyInfo/';
const MAX_RETRIES = 3;
const row = 10;
const axiosInstance = axios.create({
    timeout: 60000, // 60초 타임아웃
    responseType: 'arraybuffer',
    headers: {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.3',
        'Cache-Control': 'max-age=0',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': 'https://www.itp.or.kr/intro.asp?tmid=13',
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
            console.log(`${page}페이지 pathid 추출 시작합니다`);
            
            const response = await axiosInstance.post(listUrl,{pageIndex:page, ing:'checked'});
            const decodedHtml = iconv.decode(Buffer.from(response.data), 'UTF-8')
            const $ = cheerio.load(decodedHtml);

            let dataFound = false;
    
            $('tbody#gridData tr.table-contents').each((index, element) => {

                const href = $(element).find('td.de-writeless a').attr('onclick');
                if (href) { 
                    const seqMatch = href.match(/applyInfo\/(\d+)/);
                    if (seqMatch) {
                        const seqValue = seqMatch[1];
                        pathIds.push(seqValue);
                        dataFound = true;
                    }
                }

            });       
            
            if (!dataFound) {
                console.log('pathId 추출이 종료되었습니다.');
                break;
            }
    
            //console.log(pathIds);
            page++;
        } catch(error){
            console.log('gntp.getPathIds() 에러 발생: ',error);
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

async function scrapeDetailPage(pathIds, siteName){
    const data = {
        pathId: pathIds,
        site: siteName,
        title: null,
        requestStartedOn: null,
        requestEndedOn: null,
        assistance: null,
        department:null,
        manager: null,
        contact: [],
        attachmentFile: [],
        contentImage: []
    };
    let retries = 0;
    while (retries < MAX_RETRIES) {
        try{
            const detailUrl = `${detailBaseUrl}${pathIds}`;
            //console.log(detailUrl);
            const detailHtml = await axiosInstance.post(detailUrl);
            const decodedHtml = iconv.decode(Buffer.from(detailHtml.data), 'UTF-8')
            const $ = cheerio.load(decodedHtml);

            const tableBox=$('table.de-biz-table tbody tr');
            data.title = tableBox.find('td.de-head-title').text().trim();
            if (!data.title) {
                console.warn(`제목을 찾을 수 없습니다. pathId: ${data.pathId}`);
            }

            const dateTerm = tableBox.eq(1).find('td').eq(3).text().trim();
            const applyDate = dateTerm.split('~');
            data.requestStartedOn = applyDate[0]?.trim() || 'N/A';
            data.requestEndedOn = applyDate[1]?.trim() || 'N/A';

            data.assistance = tableBox.eq(2).find('td').text().trim();
            data.department = tableBox.eq(3).find('td').eq(1).text().trim();
            data.manager = tableBox.eq(3).find('td').eq(3).text().trim();

            const contactValue = tableBox.find('tr').find('td').eq(1).text().trim(); // 문의 연락처
            const emailValue = tableBox.find('tr').find('td').eq(3).text().trim(); // 이메일
            data.contact.push(contactValue, emailValue);

            const attachmentRows = tableBox.filter((i, row) => {
                return $(row).find('td').eq(0).text().includes('첨부') || $(row).find('td').eq(0).text().includes('공고문');
            });

            attachmentRows.each((i, row) => {
                const fileNm = $(row).find('td').eq(1).text().trim(); // 파일 이름
                const fileOnclick = $(row).find('button.btn-download').first().attr('onclick'); // 다운로드 버튼 onclick 속성
                const fileMatch = fileOnclick.match(/'([^']+)'/); // 정규 표현식으로 fileSaveNm 추출

                if (fileMatch) {
                    const fileUrl = fileMatch[1]; // 추출된 파일 이름
                    const fileLink = fileUrl.startsWith('https://') ? fileUrl : fileUrl.startsWith('/') ? `https://www.gntp.or.kr${fileUrl}` : null;
                    data.attachmentFile.push({
                        fileNm: fileNm,
                        fileLink: fileLink
                    });
                }
            });

            //본문 이미지
            const board = $('div.detail-contents');
            const imgTags = board.find('img');
            if (imgTags.length > 0) {
                imgTags.each((index, element) => {
                    const imgNm = $(element).attr('alt') || `image_${data.title}_${index}`;
                    const imgSrc = $(element).attr('src');
                    if (imgSrc) {
                        const base64Match = imgSrc.match(/^data:image\/(png|jpg|jpeg);base64,(.+)$/);
                        if (base64Match) {
                            const imageDir = path.join(__dirname, 'images', 'jbimages'); // 'images/gwimages' 폴더 경로 설정
                            fs.ensureDirSync(imageDir);
                            try {
                                const buffer = Buffer.from(base64Match[2], 'base64'); // 디코딩
                                const now = new Date();
                                const year = now.getFullYear(); 
                                const month = String(now.getMonth() + 1).padStart(2, '0'); 
                                const day = String(now.getDate()).padStart(2, '0'); 
                                
                                const formattedDate = `${year}-${month}-${day}`; 
                                const fileName = `${imgNm.replace(/\s+/g, '_')}_${pathIds}_${index}_${formattedDate}.png` // 이미지 이름 설정
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
                            console.warn(`Invalid base64 format for image: ${imgNm} in URL: ${pathIds}`);
                        } else {
                            // Base64가 아닐 경우 절대 경로를 사용하여 이미지 src 저장
                            const fullImgSrc = imgSrc.startsWith('/') ? `http://www.gntp.or.kr${imgSrc}` : imgSrc;
                            data.contentImage.push({ imgNm, img: fullImgSrc });
                        }
                    } else {
                        console.warn(`imgSrc is undefined for element: ${index} in URL: ${pathIds}`);
                    }
                });
            }
            
            //console.log(data);
            return data;
        } catch(error){
            console.log(`scrapedetaildata()에서 에러 발생:  ${error.message}`, error);
            retries++;
            if (retries < MAX_RETRIES) {
                console.log(`재시도 중... (${retries}/${MAX_RETRIES})`);
                await new Promise(res => setTimeout(res, 2000)); // 2초 대기
            } else {
                console.error(`최대 재시도 횟수를 초과했습니다. pathId: ${data.pathId}`);
                return null;
            }
        }
    }
}

async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}


async function gntp(){
    const siteName = 'gntp';
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
        const filteredDataResults = [];
        for (const pathId of filterPathIds) {
            const data = await scrapeDetailPage(pathId, siteName);
            if (data !== null) {
                filteredDataResults.push(data);
            }
            await delay(2000); // 2초 딜레이 추가
        }

        //DB 저장 함수 호출
        await saveDataInChunks(filteredDataResults, siteName);

    } catch(error){
        console.log('itp()에서 에러가 발생 : ',error);
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

//gntp();
export default gntp;