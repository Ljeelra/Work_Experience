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
const baseUrl = 'http://www.jbsc.or.kr/bbs/board.php?bo_table=sub01_09&page=';
const detailBaseUrl = 'http://www.jbsc.or.kr/bbs/board.php?bo_table=sub01_09&wr_id=';
const axiosInstance = axios.create({
    timeout: 90000, // 60초 타임아웃
    headers: {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.3',
        'Cache-Control': 'max-age=0',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': 'http://www.jbsc.or.kr/bbs/board.php?bo_table=sub01_09',
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
            const response = await axiosInstance.get(listUrl);
            const $ = cheerio.load(response.data);

            let stopExtraction = false;
    
            $('tbody tr').each((index, element) => {
                const status = $(element).find('td.td_subject span.nbiz_con_txt06');
                if (status.length > 0) {
                    stopExtraction = true;
                    return false; // each 루프 중단
                }

                const href = $(element).find('td.td_subject a').attr('href'); // href 속성 값을 가져옵니다.
                const hrefMatch = href.match(/wr_id=(\d+)/); // 정규 표현식으로 seq 값을 추출합니다.

                if (hrefMatch) {
                    const pathId = hrefMatch[1]; 
                    pathIds.push(pathId);
                    //console.log(pathId); 
                }

            });       
            
            if (stopExtraction) {
                console.log('pathId 추출이 종료되었습니다.');
                break; // while 루프 중단
            }
    
            //console.log(pathIds);
            page++;
        } catch(error){
            console.log('jbsc.getPathIds() 에러 발생: ',error);
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

async function scrapeDetailPage(pathId, siteName){
    const data={
        title:null,
        site: siteName,
        pathId: pathId,
        category: null,
        announcementDate: null,
        requestStartedOn: null,
        requestEndedOn: null,
        supportTarget: null,
        department: null,
        manager: null,
        contact: null,
        attachmentFile: [],
        contents: null,
        contentImage: []
    };
    try{ 
        const detailUrl = `${detailBaseUrl}${pathId}`
        const detailHtml = await axiosInstance.get(detailUrl);
        const $ = cheerio.load(detailHtml.data);

        data.title = $('#bo_v_title').text().trim();
        // console.log(data.title);
        data.announcementDate = $('section#bo_v_info').find('strong').eq(1).text().trim();
        const info = $('div.tbl_frs01.tbl_wrap tbody tr');
        info.each((index, element) => {
            const th = $(element).find('th').text().trim();
            const td = $(element).find('td').text().trim();
          
            switch (th) {
              case '지원분야':
                data.category = td;
                break;
              case '지원대상':
                data.supportTarget = td;
                break;
              case '접수일정':
                const dateTerm = td;
                const resultDate = dateTerm.replace(/\(.*?\)/g, '').trim();
                const applyDate = resultDate.split('~');
                data.requestStartedOn = applyDate[0]?.trim() || 'N/A';
                data.requestEndedOn = applyDate[1]?.trim() || 'N/A';
                break;
              case '담당부서':
                data.department = td;
                break;
              case '담당자':
                data.manager = td;
                break;
              case '전화번호':
                data.contact = td;
                break;
              default:
            }
          });

        const file = $('section#bo_v_file ul li');
        file.each((index, element) => {
            const fileNm = $(element).find('strong').text().trim();
            const fileHref = $(element).find('a').attr('href');
            //console.log('href 추출확인: ',fileHref);
            const fileLink = fileHref.startsWith('https://') ? fileHref : 
            fileHref.startsWith('http://') ? fileHref : fileHref.startsWith('/') ? `http://www.jbsc.or.kr${fileHref}` : null;
            data.attachmentFile.push({
                fileNm: fileNm,
                fileLink: fileLink
            });

        });

        const imgbox = $('#bo_v_con');
        const imgTags = imgbox.find('img');
        if (imgTags.length > 0) {
                            
            imgTags.each((index, element) => {
                const imgNm = $(element).attr('alc') || `image_${data.title}_${index}`;
                const imgSrc = $(element).attr('src');
                
                if (imgSrc) {
                    const base64Match = imgSrc.match(/^data:image\/(png|jpg|jpeg);base64,(.+)$/);
                    if (base64Match) {
                        const imageDir = path.join(__dirname, 'images', 'jbscimages'); // 'images/gwimages' 폴더 경로 설정
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
                        const fullImgSrc = imgSrc.startsWith('/') ? `http://www.jbsc.or.kr${imgSrc}` : imgSrc;
                        data.contentImage.push({ img: imgNm, imgSrc: fullImgSrc });
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
    }catch(error){
        console.log(`scrapeDetailPage() 에러: ${error.message}`, error);
    }
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function jbsc(){
    const siteName = 'jbsc';
    try{
        const pathIds = await getPathIds();
        //console.log(pathIds);

        const filterePathIds = await filterPathId(pathIds,siteName);
        if (filterePathIds.length === 0) {
            console.log('모든 데이터가 필터링되었습니다. 새로운 데이터가 없습니다.');
            return;
        }
        console.log(`필터링된 후 데이터 개수: ${filterePathIds.length}`);

        const detailDataResults = [];
        for (let i = 0; i < filterePathIds.length; i += chunkSize2) {
            const chunk = filterePathIds.slice(i, i + chunkSize2);
            const chunkResults = await Promise.all(chunk.map(async (pathId) => {
                const data = await scrapeDetailPage(pathId, siteName);
                if (data !== null) {
                    return data;
                }
                await delay(3000); // 3초 딜레이 추가
                return null;
            }));

            detailDataResults.push(...chunkResults.filter(data => data !== null));
        }

        // 데이터 저장
        await saveDataInChunks(detailDataResults, siteName);
    }catch(error){

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

//jbsc();
export default jbsc;