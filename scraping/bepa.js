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
const chunkSize2 = 10;
const baseUrl = 'https://www.bepa.kr/kor/view.do?no=1502';
const row = 10;
const axiosInstance = axios.create({
    timeout: 60000, // 60초 타임아웃
    headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.3',
        'Cache-Control': 'max-age=0',
        'Content-Type': 'application/x-www-form-urlencoded',
        //'Referer': 'https://www.bepa.kr/kor/view.do?no=1502&idx=15197',
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

async function getNo() {
    let menu=[];
    try{
        
        const response = await axiosInstance.get(baseUrl);
        const $ = cheerio.load(response.data);

        //console.log(response.data);

        $('ul.left-menu li').each((index, element) => {
            const href = $(element).find('a').attr('href');
            const hrefMatch = href.match(/no=(\d+)/);
            if (hrefMatch) {
                const no = hrefMatch[1];
                if (no) {
                    menu.push(no);
                }
            }
        });
        return menu;
    } catch(error){
        console.log('getNo() 에러 발생 : ',error);
    }   
}

async function getPathIds(listUrl){
    const pathIds = [];
    let page = 1;
    while (true) {
        try {
            console.log(`${page}페이지 pathid 추출 시작합니다`);
            const url =`${listUrl}${page}`
            //console.log(url);
            const response = await axiosInstance.get(url);
            const $ = cheerio.load(response.data);
            // console.log('페이지 로드 완료');
            
            let dataFound = false;

            $('table.skin_01 tbody tr').each((index, element) => {
                const status = $(element).find('td.shape span.info_end');
                if (status.length > 0) {
                    return false; // each 루프 중단
                }

                const href = $(element).find('td.title a').attr('href');
                if (href) {
                    const hrefMatch = href.match(/idx=(\d+)&view=/);
                    if (hrefMatch) {
                        const pathId = hrefMatch[1];
                        pathIds.push(pathId);
                        dataFound = true; // 데이터가 있음을 표시
                    }
                }

            });

            if (!dataFound) {
                console.log('pathId 추출이 종료되었습니다.');
                break; // while 루프 중단
            }

            //console.log('현재까지 추출된 pathIds:', pathIds);
            page++;
        } catch (error) {
            console.log('getPathIds() 에러 발생: ', error);
            break; // 에러 발생 시 루프 중단
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

async function scrapeDetailPage(detailUrl, pathId, no, siteName){
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
        attachmentFile: [],
        contents: null,
        contentImage: []
    };
    try{
        const detailHtml = await axiosInstance.get(detailUrl);
        const $ = cheerio.load(detailHtml.data);

        data.category = $('div.page-title').text().trim();

        const boardBox = $('div#board_box dl.view_01');
        boardBox.each((index, element)=>{
            data.title = $(element).find('dt strong').text().trim();
            data.announcementDate = $(element).find('dd.day span').text().trim();

            const dateTerm = $(element).find('dd.info span').text().trim();
            const applyDate = dateTerm.split('~');
            data.requestStartedOn = applyDate[0]?.trim() || 'N/A';
            data.requestEndedOn = applyDate[1]?.trim() || 'N/A';

            

            //https://www.bepa.kr/board/downFile.do?siteId=kor&boardId=UXBID_00000000000003&nowUrl=/kor/view.do?no=1502&pageIndex=1&idx=15197&fidx=17392
            const files = $(element).find('dd.file');
            files.each((index, file) => {
                const fileTitle = $(file).find('strong').text().trim();
            
                switch (fileTitle) {
                    case '첨부파일':
                        $(file).find('a').each((index, filelist) => {
                            const fileNm = $(filelist).text().trim();
                            const fileHref = $(filelist).attr('onclick');
                            const fileMatch = fileHref.match(/javascript:downFile\((\d+)\)/);
                            
                            if (fileMatch) {
                                const fileId = fileMatch[1];
                                const fileLink = `https://www.bepa.kr/board/downFile.do?siteId=kor&boardId=UXBID_00000000000003&nowUrl=/kor/view.do?no=${no}&idx=${pathId}&fidx=${fileId}`;
            
                                data.attachmentFile.push({
                                    fileNm: fileNm,
                                    fileLink: fileLink
                                });
                            }
                        });
                        break;
                    case '주관':
                        data.implementingAgency = $(file).find('span').text().trim();
                        break;
                }
            });
        });

        const imgbox = $('dd.cont');
        const imgTags = imgbox.find('img');
        if (imgTags.length > 0) {
                            
            imgTags.each((index, element) => {
                const imgNm = $(element).attr('title') || `image_${data.title}_${index}`;
                const imgSrc = $(element).attr('src');
                
                if (imgSrc) {
                    const base64Match = imgSrc.match(/^data:image\/(png|jpg|jpeg);base64,(.+)$/);
                    if (base64Match) {
                        const imageDir = path.join(__dirname, 'images', 'bepaimages'); // 'images/gwimages' 폴더 경로 설정
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

async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

let menuList= [];

async function bepa(){
    const siteName = 'bepa';
    try{
        menuList = await getNo();
        // console.log(menuList);
        const allDetailedData = [];
        if (menuList.length > 0) {
            for (const no of menuList) {
                const listUrl = `https://www.bepa.kr/kor/view.do?no=${no}&periodState=ing&pageIndex=`;
                const pathIds = await getPathIds(listUrl);
                
                // 필터링 로직 추가
                const filterePathIds = await filterPathId(pathIds, siteName);
                if (filterePathIds.length === 0) {
                    console.log('모든 데이터가 필터링되었습니다. 새로운 데이터가 없습니다.');
                    continue; // 변경된 부분: continue로 다음 no로 넘어감
                }

                console.log(`필터링된 후 데이터 개수: ${filterePathIds.length}`);

                //상세페이지 스크랩
                const detailedDataResults = [];
                for (const pathId of filterePathIds) {
                    const detailUrl = `https://www.bepa.kr/kor/view.do?view=view&no=${no}&idx=${pathId}`;
                    await delay(2000);
                    const result = await scrapeDetailPage(detailUrl, pathId, no, siteName);
                    if (result !== null) {
                        detailedDataResults.push(result);
                    }
                }
                const filteredDataResults = detailedDataResults.filter(data => data !== null);
                
                // 모든 상세 데이터를 저장
                allDetailedData.push(...filteredDataResults);
                console.log(`no ${no}에 대해 ${filteredDataResults.length}개의 상세 데이터가 수집되었습니다.`);
            }
        }

        if (allDetailedData.length > 0) {
            await saveDataInChunks(allDetailedData, siteName);
        } else {
            console.log("새로운 데이터가 없어 저장할 수 없습니다");
        }
    
    } catch(error){
        console.log('bepa() 에러 발생: ',error)
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

//bepa();
export default bepa;