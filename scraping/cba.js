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
const baseUrl = 'https://www.cba.ne.kr/home/sub.php?menukey=172';
const detailBaseUrl = 'https://www.cba.ne.kr/home/sub.php?menukey=172&mod=view&scode=00000004&no=';
const chunkSize2 = 10;
const axiosInstance = axios.create({
    timeout: 60000, // 60초 타임아웃
    headers: {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.3',
        'Cache-Control': 'max-age=0',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': 'https://www.cba.ne.kr/home/sub.php?menukey=172',
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
    // httpsAgent: new https.Agent({  
    //     rejectUnauthorized: false // SSL 인증서 검증 비활성화
    // })
});

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

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function getListPathIds(){
    const pathIds = [];
    let page = 1;
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0'); // 월은 0부터 시작하므로 +1 필요
    const dd = String(today.getDate()).padStart(2, '0');
    let scraping = true;
    while(scraping){
        try{
            //console.log(`${page}페이지 pathid 추출 시작합니다`);
            const formattedDate = `${yyyy}.${mm}.${dd}`;
            //console.log(formattedDate);
            let listUrl = `${baseUrl}&mod=&scode=00000004&page=${page}`;
            const listHtml = await axiosInstance.get(listUrl);
            const $ = cheerio.load(listHtml.data);
            
            //console.log(listHtml.data);
            //공고 등록일이 2023년도인 공고가 나오면 while문 페이지 스크랩 종료
            let stopping = false;
            $('table.board.m_board tbody tr').each((index, element) =>{
            const dataText = $(element).find('td').eq(4).text().trim();
            //console.log('공고작성일: '+dataText);
            const year = dataText.split('/')[0];
            //console.log('공고작성년도: '+year);

            if(year ==='2023'){
                stopping = true;
                return false;
            }
            //a태그 text 값에 (~M.dd)가 있고 오늘 날짜랑 비교해서 이전이면 스크랩할 필요 없음.
                const href = $(element).find('td.txt_left a').attr('href');
                //console.log('href값',href);
                const regex = /no=(\d+)/;
                const match = href.match(regex);
                //console.log('match:',match);

                const linkText = $(element).find('td.txt_left a').text().trim();
                //console.log('a text값: ', linkText);
                const dateRegex = /~?(\d{1,2}\.\s?\d{1,2})/; // 형식이 ~M.dd 인 경우
                const dateMatch = linkText.match(dateRegex);
                //console.log('dateMatch 값: ', dateMatch);

                if (linkText.includes('마감')) {
                    //console.log("모집마감이 포함된 경우, pathId 추출하지 않음.");
                    return; // "모집마감"이 포함된 경우 추출하지 않음
                }

                if (dateMatch) {
                    const [month, day] = dateMatch[1].split('.').map(Number);
                    const linkDate = new Date(yyyy, month - 1, day); 
                    if (linkDate < today) {
                        //console.log(`오늘(${formattedDate})보다 이전 날짜가 있습니다: ${linkDate}`);
                        return; // 오늘 날짜보다 이전인 경우 pathId를 추출하지 않음
                    }
                }
            
                if(match){
                    const pathId = match[1];
                    //console.log('pathId 출력: ',pathId);
                    pathIds.push(pathId);
                }               
    
            });
    
            if (stopping) {
                scraping = false;
              } else {
                page++;
              }
        } catch(error){
            console.error('cba.getListPathIds()에서 에러 발생',error);
        }
    }
    //console.log('pathIds 출력: ',pathIds);
    return pathIds;
}

async function scrapeDetailPage(pathId, siteName){
    const data = {
        pathId: pathId,
        site: siteName,
        title: null,
        announcementDate: null,//공고일
        contents: null,
        contentImage: [],
        attachmentFile: []
    }
    try{
        const detailUrl = `${detailBaseUrl}${pathId}`;
        //console.log(detailUrl);

        const detailHtml = await axiosInstance.get(detailUrl);
        const $ = cheerio.load(detailHtml.data);

        const info = $('table.board_insert.m_board_insert tbody')
        data.title = info.find('tr').eq(0).text().trim();
        //console.log('공고제목: ', data.title);
        let date = info.find('tr').eq(1).find('td').eq(1).text().trim();
        date = date.replace(/\./g, '-');
        data.announcementDate = date;
        //console.log('공고일: ',data.announcementDate);

        const imgbox = $('div.substance');
        const imgTags = imgbox.find('img');
        if (imgTags.length > 0) {
                            
            imgTags.each((index, element) => {
                const imgNm = $(element).attr('title') || `image_${data.title}_${index}`;
                const imgSrc = $(element).attr('src');
                
                if (imgSrc) {
                    const base64Match = imgSrc.match(/^data:image\/(png|jpg|jpeg);base64,(.+)$/);
                    if (base64Match) {
                        const imageDir = path.join(__dirname, 'images', 'cbaimages'); // 'images/gwimages' 폴더 경로 설정
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
                        const fullImgSrc = imgSrc.startsWith('/') ? `https://www.cba.ne.kr${imgSrc}` : imgSrc;
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

        const file = info.find('tr').eq(2);
        file.find('div.clearfix').each((index, element) => {
            const firstAnchor = $(element).children('a').first(); // div.clearfix 내 첫 번째 a 태그 선택
            const fileNm = firstAnchor.text().trim(); 
            const href = firstAnchor.attr('href'); 
        
            if (href) {
                const fileUrl = `https://www.cba.ne.kr${href}`;
        
                data.attachmentFile.push({
                    fileNm: fileNm,
                    fileLink: fileUrl
                });
            } else {
                console.log('href 속성이 없습니다.');
            }
        });

        //console.log(data);
        return data;
        
    }catch(error){
        console.error('cba 상세페이지 스크랩에서 에러: ', error);
    }
}

async function cba(){
    const siteName = 'cba';

    try{
        //페이지 별로 pathId 추출 공고 함수 호출
        const pathId = await getListPathIds();
        const pathIds = [...new Set(pathId)];
        console.log(`총 ${pathIds.length}개의 pathId가 스크랩되었습니다.`);
        //console.log('pathid 배열 확인: ',pathIds);
    

         //pathId 필터링
        const filterePathIds = await filterPathId(pathIds,siteName);
        if (filterePathIds.length === 0) {
            console.log('모든 데이터가 필터링되었습니다. 새로운 데이터가 없습니다.');
            return;
        }
    
        console.log(`필터링된 후 데이터 개수: ${filterePathIds.length}`);      
    
        //상세페이지 스크랩
        const detailDataResults = [];
        console.log(`상세페이지 스크랩 시작합니다`);
        for (let i = 0; i < filterePathIds.length; i += chunkSize2) {
            const chunk = filterePathIds.slice(i, i + chunkSize2);
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
        console.error('cba() 에서 에러 발생: ',error);
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

//cba();
export default cba;