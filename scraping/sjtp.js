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
const baseUrl = 'https://sjtp.or.kr/bbs/board.php?bo_table=business01&page=';
const detailBaseUrl = 'https://sjtp.or.kr/bbs/board.php?bo_table=business01&wr_id=';
const row = 10;
const axiosInstance = axios.create({
    timeout: 60000, // 60초 타임아웃
    headers: {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.3',
        'Cache-Control': 'max-age=0',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': 'https://sjtp.or.kr/bbs/board.php?bo_table=business01',
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
            const listUrl = `${baseUrl}${page}`;
            const response = await axiosInstance.get(listUrl);
            const $ = cheerio.load(response.data);

            let stopExtraction = false;
    
            $('div.tbl_head01.tbl_wrap table tbody tr').each((index, element) => {
                const status = $(element).find('td.td_datetime.bo_status span.complete');
                if (status.length > 0) {
                    stopExtraction = true;
                    return false; // each 루프 중단
                }

                const href = $(element).find('td.td_subject a').attr('href'); // href 속성 값을 가져옵니다.
                const hrefMatch = href.match(/wr_id=(\d+)&page/); // 정규 표현식으로 seq 값을 추출합니다.

                if (hrefMatch) {
                    const pathId = hrefMatch[1]; // 추출된 seq 값을 가져옵니다.
                    pathIds.push(pathId);
                    //console.log(pathId); // seq 값을 출력합니다.
                }

            });       
            
            if (stopExtraction) {
                console.log('pathId 추출이 종료되었습니다.');
                break; // while 루프 중단
            }
    
            //console.log(pathIds);
            page++;
        } catch(error){
            console.log('gtp.getListPathIds() 에러 발생: ',error);
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
        implementingAgency: null,
        department: null,
        manager: [],
        attachmentFile: [],
        contents: null,
        contentImage: []
    };
    try{
        const detailUrl = `${detailBaseUrl}${pathId}`
        const detailHtml = await axiosInstance.get(detailUrl);
        const $ = cheerio.load(detailHtml.data);

        data.title = $('#bo_v_title').find('span.bo_v_tit').text().trim();
        // console.log(data.title);
        data.announcementDate = $('#bo_v_info').find('strong.if_date').text().trim();

        const headTable = $('div.recru_div table tbody tr');
        headTable.each((index, element) => {
            const thElements = $(element).find('th');
            const tdElements = $(element).find('td');
          
            thElements.each((i, th) => {
              const thText = $(th).text().trim();
              const td = $(tdElements[i]);
              const tdText = td.text().trim();
          
              switch (thText) {
                case '사업분야':
                    data.category= tdText;
                    break;
                case '접수기간':
                    const resultDate = tdText.replace(/\(.*?\)/g, '').trim();
                    const applyDate = resultDate.split('~');
                    data.requestStartedOn = applyDate[0]?.trim() || 'N/A';
                    data.requestEndedOn = applyDate[1]?.trim() || 'N/A';
                    break;
                case '주관기관명':
                    data.implementingAgency = tdText;
                    break;
                case '시행기관명':
                    data.department = tdText;
                    break;
                default:
                    break;
              }
            })
        });

        const rows = headTable.slice(2, 4); // eq(4)와 eq(5) 선택
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


        const file = $('#bo_v_file ul');
        file.find('a').each((index, element) => {
            const fileNm = $(element).text().trim();
            const fileHref = $(element).attr('href');
            const fileLink = fileHref.startsWith('https://') ? fileHref : fileHref.startsWith('/') ? `https://www.sjtp.or.kr${fileHref}` : null;
            data.attachmentFile.push({
                fileNm: fileNm,
                fileLink: fileLink
            });

        });

        const imgbox = $('#bo_v_con');
        const imgTags = imgbox.find('img');
        if (imgTags.length > 0) {
                            
            imgTags.each((index, element) => {
                const imgNm = $(element).attr('title') || `image_${data.title}_${index}`;
                const imgSrc = $(element).attr('src');
                
                if (imgSrc) {
                    const base64Match = imgSrc.match(/^data:image\/(png|jpg|jpeg);base64,(.+)$/);
                    if (base64Match) {
                        const imageDir = path.join(__dirname, 'images', 'sjimages'); // 'images/gwimages' 폴더 경로 설정
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
                        const fullImgSrc = imgSrc.startsWith('/') ? `http://www.sjtp.or.kr${imgSrc}` : imgSrc;
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

async function sjtp(){
    const siteName = 'sjtp';
    try{
        const pathIds = await getPathIds();
        //console.log(pathIds);

        const filterPathIds = await filterPathId(pathIds,siteName);
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

//sjtp();
export default sjtp;