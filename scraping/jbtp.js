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
const listUrl = 'https://www.jbtp.or.kr/board/list.jbtp?boardId=BBS_0000006&menuCd=DOM_000000102001000000';
const detailBaseUrl = 'https://www.jbtp.or.kr/board/view.jbtp?menuCd=DOM_000000102001000000&boardId=BBS_0000006&dataSid=';
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

async function getTotalPages(gubun) {
    try {
        console.log(`totalPage 추출을 시작합니다`);
        const response = await axiosInstance.get(listUrl, {params: {gubun: gubun, pageNo: 1 }});
        if (!response.data) return 0;

        const decodedHtml = iconv.decode(Buffer.from(response.data), 'UTF-8')
        const $ = cheerio.load(decodedHtml);
        const pagenation = $('p.bbs_page');
        let totalPages = '';
        // 페이지가 한 페이지인지 여러 페이지인지 확인
        if (pagenation.find('a.on').length === 1 && pagenation.find('a').length === 5) {
            totalPages = 1;
            return totalPages;
        } else {
            // 여러 페이지일 경우
            const pageHref = pagenation.find('a').last().attr('href');
            if (pageHref) {
                const pageMatch = pageHref.match(/pageNo=(\d+)/);
                if (pageMatch) {
                    totalPages = parseInt(pageMatch[1], 10);
                    //console.log(totalPages);
                }
            }
            return totalPages || 0; // 페이지 수가 없을 경우 0 반환
        }
    } catch (error) {
        console.error('getTotalPages()에서 에러가 발생:', error);
        return 0;
    }
}

async function getPathIds(gubun) {
    try {
        const totalPages = await getTotalPages(gubun);
        console.log(totalPages);
        
        const pathIdsPromises = Array.from({ length: totalPages }, (_, i) => (async (page) => {
            try {
                const response = await axiosInstance.get(listUrl, {params:{ gubun : gubun, pageNo: page }});
                
                if (!response.data) return [];
                const decodedHtml = iconv.decode(Buffer.from(response.data), 'UTF-8')
                const $ = cheerio.load(decodedHtml);

                const pathIds = [];
                $('table.bbs_list_t tbody tr').each((i, element) => {
                    const pathIdHref = $(element).find('td.txt_left a').attr('href');
                    //console.log(`상태 ${gubun} :`,pathIdHref);
                    const pathIdMatch = pathIdHref.match(/dataSid=(\d+)/);
                    if (pathIdMatch) {
                        pathIds.push(pathIdMatch[1]);
                    }
                });
                return pathIds;
            } catch (error) {
                console.error(`getPathIds(${page})에서 에러가 발생:`, error);
                return [];
            }
        })(i + 1));

        const pathIdsArrays = await Promise.all(pathIdsPromises);
        //console.log(pathIdsArrays);
        return pathIdsArrays.flat();
    } catch (error) {
        console.error(`getPathIds()에서 에러가 발생:`, error);
        return [];
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

async function scrapeDetailPage(pathIds, siteName){
    const data = {
        pathId: pathIds,
        site: siteName,
        title: null,
        announcementDate: null,
        requestEndedOn: null,
        contents: null,
        contentImage: [],
        attachmentFile: []
    };
    let retries = 0;
    while (retries < MAX_RETRIES) {
        try{
            const detailUrl = `${detailBaseUrl}${pathIds}`;
            //console.log(detailUrl);
            const detailHtml = await axiosInstance.get(detailUrl);
            const $ = cheerio.load(detailHtml.data);

            data.title = $('div.bbs_vtop h4').text().trim();
            if (!data.title) {
                console.warn(`제목을 찾을 수 없습니다. pathId: ${data.pathId}`);
            }
            data.announcementDate = $('ul.txt_list').find('span').eq(1).text().trim();
            data.requestEndedOn = $('ul.txt_list').find('span').eq(4).text().replace(/ *-D-\d+/g, '').trim();
            if(!data.requestEndedOn){
                data.requestEndedOn = '상시';
            }

            //첨부파일
            const file = $('div.bbs_filedown');
            file.find('dd').each((index, element) => {
                $(element).find('span').remove();
                const fileNm = $(element).text().trim(); 
            
                const downloadLink = $(element).find('a.sbtn_down').attr('href');
                if (downloadLink) {
                    const fileLink = downloadLink.startsWith('https://') ? downloadLink : downloadLink.startsWith('/') ? `https://www.jbtp.or.kr${downloadLink}` : null;
                    data.attachmentFile.push({
                        fileNm: fileNm,
                        fileLink: fileLink
                    });
                }
            });

            //본문 글 or 이미지
            const board = $('div.wrap__contents');
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
                            console.warn(`Invalid base64 format for image: ${imgNm} in URL: ${pathIds}`);
                        } else {
                            // Base64가 아닐 경우 절대 경로를 사용하여 이미지 src 저장
                            const fullImgSrc = imgSrc.startsWith('/') ? `http://www.jbtp.or.kr${imgSrc}` : imgSrc;
                            data.contentImage.push({ imgNm, img: fullImgSrc });
                        }
                    } else {
                        console.warn(`imgSrc is undefined for element: ${index} in URL: ${pathId}`);
                    }
                });
            }
            
            const txtbox = $('div.bbs_con');
            const txtArray =[];
            txtbox.find('p').each((index, element) => {
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

async function jbtp(){
    const siteName = 'jbtp';
    try{
        let pathIds=[];
        //pathId 추출
        const [ongoingPathIds, openPathIds] = await Promise.all([getPathIds(2), getPathIds(3)]);
        
        const uniquePathIds = [...new Set([...ongoingPathIds, ...openPathIds])];
        pathIds = uniquePathIds;
        console.log(`총 ${pathIds.length}개의 pathId가 스크랩되었습니다.`);

        const filterPathIds = await filterPathId(pathIds,siteName);
        if (filterPathIds.length === 0) {
            console.log('모든 데이터가 필터링되었습니다. 새로운 데이터가 없습니다.');
            return;
        }
    
        console.log(`필터링된 후 데이터 개수: ${filterPathIds.length}`);

        //상세페이지 스크랩
        const detailDataPromises = filterPathIds.map(pathId => 
            scrapeDetailPage(pathId, siteName)
        );
        const detailDataResults = await Promise.all(detailDataPromises);
        const filteredDataResults = detailDataResults.filter(data => data !== null);

        // //DB 저장 함수 호출
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

//jbtp();
export default jbtp;