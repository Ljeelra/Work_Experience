process.env.NODE_TLS_REJECT_UNAUTHORIZED ="0";
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
const baseUrl = 'https://www.gjtp.or.kr/home/business.cs';
const axiosInstance = axios.create({
    timeout: 60000, // 60초 타임아웃
    headers: {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.3',
        'Cache-Control': 'max-age=0',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': 'https://www.gjtp.or.kr/home/business.cs',
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
    let pageIndex = 1;
    while (true) {
        try{
            console.log(`${pageIndex}페이지 pathid 추출 시작합니다`);
            const response = await axiosInstance.post(baseUrl,{progress:'ING', pageUnit:30, pageIndex: pageIndex});
            const $ = cheerio.load(response.data);

            let hasHref = false;

            $('table.list-table tbody tr').each((index, element) => {

                const href = $(element).find('td.tal a').attr('href'); // href 속성 값을 가져옵니다.
                const bsnssIdMatch = href.match(/bsnssId=([^&]*)/);
                if (href) {
                    const bsnssIdMatch = href.match(/bsnssId=([^&]*)/);
                    if (bsnssIdMatch) {
                        const pathId = bsnssIdMatch[1];
                        pathIds.push({ href: href, pathId: pathId });
                        hasHref = true;
                    }
                }

            });       
            
            if (!hasHref) {  // href가 없으면 루프를 종료합니다.
                console.log('더 이상 추출할 pathId가 없습니다. 추출을 종료합니다.');
                break;  // while 루프 중단
            }
    
            //console.log(pathIds);
            pageIndex++;
        } catch(error){
            console.log('gtp.getPathIds() 에러 발생: ',error);
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

async function scrapeDetailPage(detailUrl, pathId, siteName){
    const data = {
        pathId: pathId,
        site: siteName,
        title: null,
        supportScale: null,
        overview: null,
        businessPeriod: null,
        manager: [],
        department:null,
        requestStartedOn: null,
        requestEndedOn: null,
        contents: null,
        contentImage: [],
        attachmentFile: []
    };
        try{

            //console.log(detailUrl);
            const detailHtml = await axiosInstance.get(detailUrl);
            const $ = cheerio.load(detailHtml.data);

            data.title= $('div.viewHeader').find('h3').text().trim();

            $('table.contable tbody tr').each((index, element) => {
                const thElements = $(element).find('th');
                const tdElements = $(element).find('td');
              
                thElements.each((i, th) => {
                  const thText = $(th).text().trim();
                  const td = $(tdElements[i]);
                  const tdText = td.text().trim();
              
                  switch (thText) {
                    case '지원규모':
                      data.supportScale = tdText.replace(/[\n\t]/g, '');
                      break;
                    case '접수기간':
                        const dateTerm = tdText.replace(/[\n\t]/g, '').replace(/\s+/g, ' ').replace(/[()]/g, '').trim();
                        const applyDate = dateTerm.split('~');
                        data.requestStartedOn = applyDate[0]?.trim() || 'N/A';
                        data.requestEndedOn = applyDate[1]?.trim() || 'N/A';
                        break;
                    case '사업기간':
                        data.businessPeriod = tdText;
                        break;
                    case '담당부서':
                        data.department = tdText;
                        break;
                    case '총괄담당자':
                        data.manager.push( tdText.replace(/[\n\t]/g, ''));
                        break;
                    case '사업담당자':
                        data.manager.push( tdText.replace(/[\n\t]/g, ''));
                        break;
                    case '첨부파일':
                        td.find('li a').each((index, file) =>{
                            const fileNm = $(file).text().trim();
                            const fileHref = $(file).attr('href');
                            if(fileHref){
                                const fileLink = `https://www.gjtp.or.kr/home/business.cs${fileHref}`;
                                data.attachmentFile.push({
                                    fileNm: fileNm,
                                    fileLink: fileLink
                                });
                            }
                        });
                        break;
                    case '사업내용':
                        const imgTags = $(td).find('img');
                        if (imgTags.length > 0) {
                            const imageDir = path.join(__dirname, 'images', 'gjimages'); // 'images/gjimages' 폴더 경로 설정
                            fs.ensureDirSync(imageDir);

                            imgTags.each((index, element) => {
                                const imgNm = $(element).attr('data-filename') || `image_${index}`;
                                const imgSrc = $(element).attr('src');
                                if (imgSrc) {
                                    const base64Match = imgSrc.match(/^data:image\/(png|jpg|jpeg);base64,(.+)$/);
                                    if (base64Match) {
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
                                        const fullImgSrc = imgSrc.startsWith('/') ? `http://www.gjtp.or.kr${imgSrc}` : imgSrc;
                                        data.contentImage.push({ imgNm, img: fullImgSrc });
                                    }
                                } else {
                                    console.warn(`imgSrc is undefined for element: ${index} in URL: ${pathIds}`);
                                }
                            });
                        }

                        const contentText = tdText; // '사업내용' td의 텍스트 가져오기
                        if (contentText) {
                            data.contents = contentText; // data.contents에 저장
                        }
                        break;
                    default:
                        break;
                  }
                });
              });           
            
            //console.log(data);
            return data;
        } catch(error){
            //console.log(`scrapedetaildata()에서 에러 발생:  ${error.message}`, error);
            console.error(`scrapteDetail()에서 에러 발생: ${data.pathId}`, error)
            
        }

}


async function gjtp(){
    const siteName= 'gjtp'
    try{
        //pathId 스크랩
        const arrayHref = await getPathIds();
        const pathIds = arrayHref.map(item => item.pathId);
        const detailUrls = arrayHref.map(item => `${baseUrl}${item.href}`);
        //console.log(detailUrls);
        //필터링 체크
        const filterPathIds = await filterPathId(pathIds, siteName);
        if (filterPathIds.length === 0) {
            console.log('모든 데이터가 필터링되었습니다. 새로운 데이터가 없습니다.');
            return;
        }
    
        console.log(`필터링된 후 데이터 개수: ${filterPathIds.length}`);

        //상세페이지 스크랩
        const detailDataPromises = filterPathIds.map((pathId, index) => 
            scrapeDetailPage(detailUrls[index], pathId, siteName)
        );
        const detailDataResults = await Promise.all(detailDataPromises);
        const filteredDataResults = detailDataResults.filter(data => data !== null);

        //DB 저장
        await saveDataInChunks(filteredDataResults, siteName);

    } catch(error){
        console.log(`gjtp()에서 에러,${error.message}: `,error)
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

//gjtp();
export default gjtp;