//process.env.NODE_TLS_REJECT_UNAUTHORIZED ="0";
import axios from 'axios';
import * as cheerio from "cheerio";
import iconv from 'iconv-lite';
import { saveDetail, getAllPathIds } from '../db/db.js';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const chunkSize = 50;
const baseUrl = 'https://www.cbtp.or.kr';
const listUrl = 'https://www.cbtp.or.kr/index.php?control=bbs&board_id=saup_notice&lm_uid=387';
const detailBaseUrl = 'https://www.gwtp.or.kr/gwtp/bbsNew_view.php?bbs_data=';
const row = 10;
const axiosInstance = axios.create({
    timeout: 60000, // 60초 타임아웃,
    responseType: 'arraybuffer',
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
        const getHtml =  await axiosInstance.get(listUrl);
        const decodedHtml = iconv.decode(Buffer.from(getHtml.data), 'EUC-KR');
        const $ = cheerio.load(decodedHtml);
        const pathIds = [];
        $('tbody.tb tr.notice').each((index, element) => {
            const altText = $(element).find('td.gray img').attr('alt'); // 첫 번째 td의 img alt 텍스트
            

            // 첫 번째 td의 img alt가 '공지'인지 확인
            if (altText === '공지') {
                const secondAltText = $(element).find('td:nth-child(2) img').attr('alt'); // 두 번째 td의 img alt 텍스트
                
                // 두 번째 td의 img alt가 '진행'인지 확인
                if (secondAltText === '진행') {
                    const href = $(element).find('td.subject a').attr('href'); // a 태그의 href 속성
                    if (href) {
                        const hrefMatch = href.match(/no=([^&]*)/);
                        if (hrefMatch) {
                            const pathId = hrefMatch[1];
                            pathIds.push({ href: href, pathId: pathId });
                        }
                    }
                }
            }
        });

        //console.log(pathIds);
        return pathIds;
    }catch(error){
        console.error('Error fetching total pages:', error);
        return 1;
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

async function scrapeDetailPage(detailUrl, pathId, siteName){
    const data = {
        pathId: pathId,
        site: siteName,
        title: null,
        category: null,
        implementingAgency: null,
        department: null,
        manager: [],
        requestStartedOn: null,
        requestEndedOn: null,
        contents: null,
        contentImage: [],
        attachmentFile: []
    };
    try{

        //console.log(detailUrl);
        const detailHtml = await axiosInstance.get(detailUrl);
        const decodedHtml = iconv.decode(Buffer.from(detailHtml.data), 'EUC-KR');
        const $ = cheerio.load(decodedHtml);
        
        const tableBox = $('table.bbs_view tbody.tb.read tr');
        data.title= tableBox.eq(0).find('td.subject').text().trim();   
        data.category = tableBox.eq(1).find('td').text().trim();

        const dateTerm = tableBox.eq(2).find('td').text().trim();
        const applyDate = dateTerm.split('~');
        data.requestStartedOn = applyDate[0]?.trim() || 'N/A';
        data.requestEndedOn = applyDate[1]?.trim() || 'N/A';
        data.implementingAgency = tableBox.eq(3).find('td').eq(0).text().trim();
        data.department = tableBox.eq(3).find('td').eq(1).text().trim();
        
        const rows = tableBox.slice(4, 6); // eq(4)와 eq(5) 선택
        rows.each((index, element) => {
            const thElements = $(element).find('th'); 
            const tdElements = $(element).find('td'); 
            let managerObj = {};
            thElements.each((thIndex, thElement) => {
                const key = $(thElement).text().trim(); 
                const value = $(tdElements[thIndex]).text().trim();
                managerObj[key] = value;
            });
            data.manager.push(managerObj);
        });

        //첨부파일
        tableBox.eq(6).find('a').each((index, file) =>{
            const fileNm = $(file).text().trim();
            const fileHref = $(file).attr('href');
            if(fileHref){
                const fileLink = fileHref.startsWith('https://') ? fileHref : fileHref.startsWith('/') ? `https://www.cbtp.or.kr${fileHref}` : null;
                data.attachmentFile.push({
                    fileNm: fileNm,
                    fileLink: fileLink
                });
            }
        });

        //이미지
        const imgbox = tableBox.eq(7);
        const imgTags = imgbox.find('img');
        if (imgTags.length > 0) {
                            
            imgTags.each((index, element) => {
                const imgNm = $(element).attr('title') || `image_${data.title}_${index}`;
                const imgSrc = $(element).attr('src');
                if (imgSrc) {
                    const base64Match = imgSrc.match(/^data:image\/(png|jpg|jpeg);base64,(.+)$/);
                    if (base64Match) {
                        const imageDir = path.join(__dirname, 'images', 'cbimages'); // 'images/gwimages' 폴더 경로 설정
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
                        const fullImgSrc = imgSrc.startsWith('/') ? `http://www.cbtp.or.kr${imgSrc}` : imgSrc;
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
            console.error(`cbtp.scrapteDetail()에서 에러 발생: ${data.pathId}`, error)
            
        }

}

async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function cbtp(){
    const siteName= 'cbtp';
    try{
        
        //pathId 스크랩
        const arrayHref = await getPathIds();
        const pathIds = arrayHref.map(item => item.pathId);

        // href 값만 추출하여 detailUrls 배열에 저장
        const detailUrls = arrayHref.map(item => `${baseUrl}${item.href}`);

        //필터링 체크
        const filterPathIds = await filterPathId(pathIds, siteName);
        if (filterPathIds.length === 0) {
            console.log('모든 데이터가 필터링되었습니다. 새로운 데이터가 없습니다.');
            return;
        }
    
        console.log(`필터링된 후 데이터 개수: ${filterPathIds.length}`);

        //상세페이지 스크랩
        const detailDataResults = [];
        console.log(`상세페이지 스크랩 시작합니다`);
        for (const [index, pathId] of filterPathIds.entries()) {
            const data = await scrapeDetailPage(detailUrls[index], pathId, siteName);
            if (data !== null) {
                detailDataResults.push(data);
            }
            await delay(3000); // 3초 딜레이 추가
        }

        //DB 저장
        await saveDataInChunks(detailDataResults, siteName);

    } catch(error){
        console.error(`cbtp()에서 에러,${error.message}: `,error)
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

//cbtp();
export default cbtp;