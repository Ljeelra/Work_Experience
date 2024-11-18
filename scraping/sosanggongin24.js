import axios from 'axios';
import * as cheerio from "cheerio";
import { saveDetail, getAllPathIds } from '../db/db.js';
import https from 'https';
import iconv from 'iconv-lite';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const chunkSize = 50;
const chunkSize2 = 10;
const baseUrl = 'https://www.sbiz24.kr/api/pbanc/pbancList';
const detailBaseUrl = 'https://www.sbiz24.kr/api/pbanc/';
const fileBaseUrl = 'https://www.sbiz24.kr/api/cmmn/file';


const axiosInstance = axios.create({
    timeout: 60000, // 60초 타임아웃
    headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Accept-Language': 'ko-KR,ko;q=0.8,en-US;q=0.5,en;q=0.3',
        'Cache-Control': 'max-age=0',
        'Content-Type': 'application/json',
        'Referer': 'https://www.sbiz24.kr/',
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
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
        'Origin-Method': 'GET'
    },
    family: 4,
    httpsAgent: new https.Agent({  
        rejectUnauthorized: false // SSL 인증서 검증 비활성화
    })
});


// 페이지네이션에서 총 페이지 수 추출
async function getTotalPage() {
    try {
        const response = await axiosInstance.post(baseUrl, {"sortModel":[],"search":{},"paging":true,"startRow":0,"endRow":10});
        const jsonData = response.data;

        // 총 페이지 수 추출
        const totalPages = jsonData.data.default.page.totalPages;
        const totalElements = jsonData.data.default.page.totalElements; 

        console.log(totalPages, totalElements);

        return { totalPages, totalElements };
    } catch (error) {
        console.error('getTotalPage 함수에서 오류 발생:', error);
        throw error; // 에러를 상위 함수로 전달
    } 
}



//pathID 필터링
async function filterPathId(scrapedData, siteName) {
    try {
        const existingPathIds = await getAllPathIds(siteName);
        if (!Array.isArray(existingPathIds)) {
            throw new Error('Existing Path IDs is not an array');
        }
        if (!Array.isArray(scrapedData)) {
            throw new Error('Scraped Data는 배열이 아닙니다');
        }
        return scrapedData.filter(pathId => !existingPathIds.includes(pathId));
    } catch (error) {
        console.error('sosanggongin Error fetching existing path IDs:', error);
        return [];
    }
}

//pathID 얻기
async function getPathIds(totalPost) {
    try {
        // getTotalPage 함수에서 totalPost 값을 얻어옴

        const totalElements = totalPost;
        const pbancSnValues = [];
        let startRow = 0;
        let endRow = 10;

        // 전체 데이터가 끝날 때까지 반복
        while (startRow < totalElements) {
            // 마지막 요청에서 endRow가 totalPost를 넘지 않도록 보정
            if (endRow > totalElements) {
                endRow = totalElements;
            }

            const response = await axiosInstance.post(baseUrl, {
                "sortModel": [],
                "search": {},
                "paging": true,
                "startRow": startRow,
                "endRow": endRow
            });

            const jsonData = response.data;
            const list = jsonData.data.default.list;

            for (const item of list) {
                if (item.aplyPsbltySe === 'N') {
                    console.log('aplyPsbltySe가 "N"인 데이터 발견. 추출 종료.');
                    return pbancSnValues; // 'N'이 나오면 추출 종료
                }
                if (item.aplyPsbltySe === 'Y') {
                    pbancSnValues.push(item.pbancSn);
                }
            }

            // 10개씩 요청하므로 startRow를 10씩 증가시킴
            startRow += 10;
            endRow += 10;

            // 마지막 페이지에서 endRow를 totalPost로 맞추기 위해 보정
            if (endRow > totalElements) {
                endRow = totalElements;
            }
        }

        console.log('추출된 pbancSn 값들:', pbancSnValues);
        return pbancSnValues;

    } catch (error) {
        console.error('getPbancSnValues 함수에서 오류 발생:', error);
        throw error; // 에러를 상위 함수로 전달
    }
}

//상세페이지 스크랩
async function scrapeDetails(pathId, siteName, detailUrl) {
    const data = {
        site: siteName,
        title: null,
        //applySite: ,
        pathId: pathId,
        category: null,
        projectType: null,
        businessPeriod: null,
        requestStartedOn: null,
        requestEndedOn: null,
        contents: null,
        attachmentFile: [],
        location: null,
        contentImage: []
    };
    try {
        const response = await axiosInstance.post(detailUrl);
        const jsonData = response.data;
        const jsonD = jsonData.data.default;

        data.title = jsonD.pbancNm;
        data.category = jsonD.rcrtTypeCdNm;
        data.projectType = jsonD.sprtBizTypeNm;
        const businessF = jsonD.bizPd.from;
        const businessT = jsonD.bizPd.to;
        data.businessPeriod = businessF+` ~ `+businessT;
        data.requestStartedOn = jsonD.rcptPd.from;
        data.requestEndedOn = jsonD.rcptPd.to;
        
        const htmlData = jsonD.pbancDtlCn;
        const $ = cheerio.load(htmlData);
        
        const imgTags = $('img');
        if (imgTags.length > 0) {
            imgTags.each((index, element) => {
                const imgNm = $(element).attr('alt') || `image_${data.title}_${index}`;
                const imgSrc = $(element).attr('src');
                if (imgSrc) {
                    if (imgSrc.startsWith('data:image/')) {
                        // Base64 이미지를 처리
                        const base64Match = imgSrc.match(/^data:image\/(png|jpg|jpeg);base64,(.+)$/);
                        if (base64Match) {
                            const imageDir = path.join(__dirname, 'images', 'scrapedImages'); // 이미지 저장 디렉토리
                            fs.ensureDirSync(imageDir); // 폴더가 없으면 생성
                            try {
                                const buffer = Buffer.from(base64Match[2], 'base64'); // base64 디코딩
                                const now = new Date();
                                const year = now.getFullYear(); 
                                const month = String(now.getMonth() + 1).padStart(2, '0'); 
                                const day = String(now.getDate()).padStart(2, '0');
                                
                                const formattedDate = `${year}-${month}-${day}`; 
                                const fileName = `${imgNm.replace(/\s+/g, '_')}_${pathId}_${index}_${formattedDate}.png`; // 파일 이름 설정
                                const filePath = path.join(imageDir, fileName); // 파일 경로 설정

                                if (!fs.existsSync(filePath)) {
                                    fs.writeFileSync(filePath, buffer); // 파일 저장
                                    data.contentImage.push({ imgNm, img: filePath }); // 이미지 경로 저장
                                } else {
                                    console.log(`파일이 이미 존재합니다: ${filePath}`);
                                }
                            } catch (error) {
                                console.error(`Error saving image for ${imgNm}:`, error);
                            }
                        }
                    } else {
                        // Base64가 아닐 경우 절대 경로를 사용하여 이미지 src 저장
                        const fullImgSrc = imgSrc.startsWith('/') ? `https://www.sbiz24.kr${imgSrc}` : imgSrc;
                        data.contentImage.push({ imgNm, img: fullImgSrc });
                    }
                } else {
                    console.warn(`imgSrc is undefined for element: ${index} in URL: ${pathId}`);
                }
            });
        }

        const txtArray =[];
        $('p, span').each((index, element) => {
            const ptext = $(element).text().trim();
            if (ptext) {
                txtArray.push(ptext);
            }
        });
    
        if (txtArray.length > 0) {
            data.contents = txtArray.join(' ');
        }                                  

        //파일
        const groupId = `pbancdoc-${pathId}`;
        const fileResponse = await axiosInstance.post(fileBaseUrl, {
            "search": {
                "delYn": false,
                "groupId": groupId,
                "tmprStrgYn": "N"
            }
        });
        const fileJsonData = fileResponse.data;
        const fileList = fileJsonData.data.default.list;

        fileList.forEach(file => {
            const fileDownUrl = `${fileBaseUrl}/${file.key}`;  // 파일 다운로드 URL 생성
            const fileNm = file.fileNm;
            const fileLink = fileDownUrl.startsWith('https://') ? fileDownUrl : fileDownUrl.startsWith('/') ? `${fileBaseUrl}/${file.key}` : null;
            // attachmentFile 배열에 파일 정보 저장
            data.attachmentFile.push({
                fileNm: fileNm,
                fileUrl: fileLink
            });
        });

        //console.log(data);
        return data;
    } catch (error) {
        console.error(`sosanggongin 상세페이지 스크랩 에러 from ${detailUrl}:`, error);
        return null;
    }
}

async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}


//스크랩 시작
async function sosanggonginmadang() {
    const siteName = 'sosanggongin24';
    try {
        //총페이지수 추출
        const { totalPages: totalPage, totalElements: totalPost } = await getTotalPage();
        console.log(`총 페이지 수, 게시물 수: ${totalPage}, ${totalPost}`);

        //유니크키 추출
        let pathIds = [];
        let allIds = await getPathIds(totalPost);
        const uniqueIds = Array.from(new Set(allIds));
        pathIds = uniqueIds;
        console.log(`총 ${pathIds.length}개의 pathId가 스크랩되었습니다.`);
       
        //pathId 중복체크
        const filteredData = await filterPathId(uniqueIds, siteName);
        if (filteredData.length === 0) {
            console.log('모든 데이터가 필터링 되었습니다. 새로운 데이터가 없습니다.');
            return;
        }
        console.log(`필터링 된 ${filteredData.length} 개의 페이지를 스크랩해서 DB에 삽입할 수 있습니다.`);


        const detailDataResults = [];
        console.log(`상세페이지 스크랩 시작합니다`);
        for (let i = 0; i < filteredData.length; i += chunkSize2) {
            const chunk = filteredData.slice(i, i + chunkSize2);
            const chunkResults = await Promise.all(chunk.map(async (pathId) => {
                const detailUrl = `${detailBaseUrl}${pathId}`;
                const data = await scrapeDetails(pathId, siteName, detailUrl);
                if (data !== null) {
                    return data;
                }
                return null;
            }));
            
            detailDataResults.push(...chunkResults.filter(data => data !== null));
            await delay(3000); // 3초 딜레이 추가
        }

        await saveDataInChunks(detailDataResults, siteName);

    } catch (error) {
        console.error('에러 sosanggongin() 함수:', error);
    }
}

//데이터 insert
async function saveDataInChunks(data, siteName) {
    console.log(`Total data to insert: ${data.length}`);
    for (let i = 0; i < data.length; i += chunkSize) {
        const chunk = data.slice(i, i + chunkSize);
        try {
            await saveDetail(chunk, siteName);
        } catch (error) {
            if (error.code === 'ER_DUP_ENTRY') {
                console.warn('Duplicate entry found.');
            } else {
                console.error('Failed to insert all data:', error);
                throw error;
            }
        }
    }
}

sosanggonginmadang();
export default sosanggonginmadang;
