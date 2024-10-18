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
const baseUrl = 'https://www.gepa.kr/contents/madang/selectMadangbbsList.do?madang2_cds=&madang3_cds=&madang1_cds=&searchKeywords=&searchCondition=madang_nm&madang_cd=0&madang_keywords=&madang_status=PRO&madang_startdate=&madang_enddate=&pageIndex=1&menuId=223';
const detailBaseUrl = 'https://www.gepa.kr/contents/madang/selectMadangListView.do?menuId=223&selectedId=';
const axiosInstance = axios.create({
    timeout: 90000, // 60초 타임아웃
    headers: {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.3',
        'Cache-Control': 'max-age=0',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': 'https://www.gepa.kr/contents/madang/selectMadangList.do?menuId=223',
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

async function getTotalPage(){
    try {
        console.log(`totalPage 추출을 시작합니다`);
        const response = await axiosInstance.get(baseUrl);
        if (!response.data) return 0;
        const $ = cheerio.load(response.data);
        const pagenation = $('ul.paginate');
        let totalPages = '';
        // 페이지가 한 페이지인지 여러 페이지인지 확인
        if (pagenation.find('li.active').length === 1 && pagenation.find('li').length === 1) {
            totalPages = 1;
            return totalPages;
        } else {
            // 여러 페이지일 경우
            const pageHref = pagenation.find('a').last().text().trim();   
            totalPages = parseInt(pageHref, 10);
            //console.log(totalPages);
                
            return totalPages || 0; // 페이지 수가 없을 경우 0 반환
        }
    } catch (error) {
        console.error('getTotalPages()에서 에러가 발생:', error);
        return 0;
    }
}

async function getPathIds(){
    const pathIds = [];
    let page = 1;
    const totalPage = await getTotalPage();
    while (page<=totalPage) {
        try{
            console.log(`${page}페이지 pathid 추출 시작합니다`);
            const pathUrl = `https://www.gepa.kr/contents/madang/selectMadangbbsList.do?`;
            const response = await axiosInstance.post(pathUrl,{madang_cd: 0, menuId: 223, searchCondition: 'madang_nm', madang_status: 'PRO', pageIndex: page});
            const $ = cheerio.load(response.data);

            let dataFound = false;
    
            $('table.basic_table tbody tr').each((index, element) => {

                const href = $(element).find('td').eq(2).find('a').attr('onclick');
                if (href) { 
                    const seqMatch = href.match(/fnLinkView\('([^']+)'\)/);
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

async function scrapeDetailPage(pathId, siteName){
    const data={
        title:null,
        site: siteName,
        pathId: pathId,
        manager: null,
        department: null,
        announcementDate: null,
        requestStartedOn: null,
        requestEndedOn: null,
        contents: null,
        attachmentFile: [],
        contentImage: []
    };
    try{
        const detailUrl = `${detailBaseUrl}${pathId}`;
        //console.log(`상세페이지 URL : `,detailUrl);
        const detailHtml = await axiosInstance.get(detailUrl);
        const $ = cheerio.load(detailHtml.data);
        
        $('table.basic_table tbody tr').each((index, element) => {

            const thElements = $(element).find('th');
            const tdElements = $(element).find('td');
          
            if (thElements.length > 0) {
                thElements.each((i, th) => {
                const thText = $(th).text().trim();
                const td = $(tdElements[i]);
                const tdText = td.text().trim();
            
                switch (thText) {
                    case '제목':
                        data.title= tdText;
                        break;
                    case '모집기간':
                        const dateTerm = tdText.replace(/[\n\t]/g, '').replace(/\s+/g, ' ').replace(/[()]/g, '').trim();
                        const applyDate = dateTerm.split('~');
                        data.requestStartedOn = applyDate[0]?.trim() || 'N/A';
                        data.requestEndedOn = applyDate[1]?.trim() || 'N/A';
                        break;
                    case '담당부서':
                        data.department = tdText;
                        break;
                    case '담당자':
                        data.manager = {
                            name: tdText,
                            phone: null // 나중에 담당자번호를 추가할 것이므로 null로 초기화
                        };
                        break;
                    case '담당자번호':
                        // 담당자 번호를 data.manager에 추가
                        if (data.manager) {
                            data.manager.phone = tdText;
                        }
                        break;
                    case '작성일':
                        data.announcementDate = tdText;
                        break;
                    case '첨부파일':
                        td.find('a').each((index, element) => {
                            const fileNm = $(element).text().trim();
                            const fileHref = $(element).attr('href');
                            if (fileHref) {
                                const fileLink = fileHref.startsWith('https://') ? fileHref : fileHref.startsWith('/') ? `https://www.gepa.kr${fileHref}` : null; 
                                data.attachmentFile.push({
                                    fileNm: fileNm,
                                    fileLink: fileLink
                                });
                            }
                        });
                    
                        break;
                    default:
                    
                        break;
                }
                });
            } else{
                const imgTags = tdElements.find('img');
                if (imgTags.length > 0) {
                                    
                    imgTags.each((index, element) => {
                        const imgNm = $(element).attr('title') || `image_${data.title}_${index}`;
                        const imgSrc = $(element).attr('src');
                        if (imgSrc) {
                            const base64Match = imgSrc.match(/^data:image\/(png|jpg|jpeg);base64,(.+)$/);
                            if (base64Match) {
                                const imageDir = path.join(__dirname, 'images', 'gepaimages'); // 'images/gwimages' 폴더 경로 설정
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
                                const fullImgSrc = imgSrc.startsWith('/') ? `https://www.gepa.kr${imgSrc}` : imgSrc;
                                data.contentImage.push({ imgNm, img: fullImgSrc });
                            }
                        } else {
                            console.warn(`imgSrc is undefined for element: ${index} in URL: ${pathId}`);
                        }
                    });
                }

                const txtArray =[];
                tdElements.find('p').each((index, element) => {
                    const ptext = $(element).text().trim();
                    if (ptext) {
                        txtArray.push(ptext);
                    }
                });

                if (txtArray.length > 0) {
                    data.contents = txtArray.join(' ');
                }
            }
        });

        
        //console.log(data);
        return data;
    }catch(error){
        console.log(`scrapeDetailPage() 에러: ${error.message}`, error);
    }
}


function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function gepa(){
    const siteName = 'gepa';
    try{
        const pathIds = await getPathIds();
        console.log(`총 ${pathIds.length}개의 pathId가 스크랩되었습니다.`);

        const filterePathIds = await filterPathId(pathIds,siteName);
        if (filterePathIds.length === 0) {
            console.log('모든 데이터가 필터링되었습니다. 새로운 데이터가 없습니다.');
            return;
        }
        console.log(`필터링된 후 데이터 개수: ${filterePathIds.length}`);

        //상세페이지 스크랩
        const detailDataResults = [];
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

        // //DB 저장 함수 호출
        await saveDataInChunks(detailDataResults, siteName);

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

//gepa();
export default gepa;