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
const chunkSize2 = 10;
const listUrl = 'https://pms.gtp.or.kr/web/business/webBusinessList.do?';
const detailBaseUrl = 'https://pms.gtp.or.kr/web/business/webBusinessView.do?b_idx=';
const pageUnit = 10;
const bsAreaMap = {
    'CD003004001': '서울',
    'CD003004002': '인천',
    'CD003004003': '가평군',
    'CD003004004': '고양시',
    'CD003004005': '과천시',
    'CD003004006': '광명시',
    'CD003004007': '광주시',
    'CD003004008': '구리시',
    'CD003004009': '군포시',
    'CD003004010': '김포시',
    'CD003004011': '남양주시',
    'CD003004012': '동두천시',
    'CD003004013': '부천시',
    'CD003004014': '성남시',
    'CD003004015': '수원시',
    'CD003004016': '시흥시',
    'CD003004017': '안산시',
    'CD003004018': '안성시',
    'CD003004019': '안양시',
    'CD003004020': '양주시',
    'CD003004021': '양평군',
    'CD003004022': '여주시',
    'CD003004023': '연천군',
    'CD003004024': '오산시',
    'CD003004025': '용인시',
    'CD003004026': '의왕시',
    'CD003004027': '의정부시',
    'CD003004028': '이천시',
    'CD003004029': '파주시',
    'CD003004030': '평택시',
    'CD003004031': '포천시',
    'CD003004032': '하남시',
    'CD003004033': '화성시',
    'CD003004034': '기타'
};
const axiosInstance = axios.create({
    timeout: 60000, // 60초 타임아웃
    headers: {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.3',
        'Cache-Control': 'max-age=0',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': 'https://pms.gtp.or.kr/web/business/webBusinessList.do?',
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

async function filterPathId(scrapedData, siteName) {
    try {
        const existingPathIds = await getAllPathIds(siteName);
        // console.log('Scraped Data:', scrapedData);
        // console.log('Existing Path IDs:', existingPathIds);
        
        if (!Array.isArray(existingPathIds)) {
            throw new Error('Existing Path IDs is not an array');
        }
        return scrapedData.filter(data => !existingPathIds.includes(data.pathId));
    } catch (error) {
        console.error('Error fetching existing path IDs:', error);
        return []; // 오류 발생 시 빈 배열 반환
    }
}

async function getListPathIds(){
    const dataList = [];
    let page = 1;
    let scraping = true;

    try{
        while(scraping){
            try{
                //console.log(`${page}페이지 pathid 추출 시작합니다`);
                const listHtml = await axiosInstance.post(listUrl,{page: page, pageUnit: pageUnit});
                const $ = cheerio.load(listHtml.data);
                
                let allClosed = true;
                $('table.t01 tbody tr').each((index, element) => {
                    const ymd = $(element).find('td.last').text().trim();
                    if (ymd == '마감'){
                        return true;
                    } else{
                        allClosed = false;
                        const pathId = $(element).find('td.subject a').attr('onclick').match(/'(\d+)'/)[1];
                        //console.log('pathId 값: ',pathId);
                        const requestdate = ymd.split('~').map(date => date.trim());
                        const requestStartedOn = requestdate[0];
                        const requestEndedOn = requestdate[1];
                        const implementingAgency = $(element).find('td').eq(4).text().trim();
                        dataList.push({ pathId, requestStartedOn, requestEndedOn, implementingAgency });
                    }

                });

                if (allClosed) {
                    console.log('마감된 페이지를 만났습니다. 추출을 종료합니다.');
                    scraping = false;
                } else {
                    page++;
                }
            } catch(error){
                console.log('getlistPathIds() while에서 에러 발생: ', error);
                //scraping = false;
            }
        }
        //console.log(dataList);
        return dataList;
    } catch(error){
        console.error('gtp.getListPathIds() 에러 발생: ',error);
    }

}

async function scrapeDetailPage(dataList, siteName){
    const data = {
        pathId: dataList.pathId,
        site: siteName,
        title: null,
        category: null,
        department: null,
        manager: null,
        supportTarget: null,
        location: null,
        contents: null,
        contentImage: [],
        attachmentFile: []
    };
    try{
        const detailUrl = `${detailBaseUrl}${dataList.pathId}`;
        //console.log(detailUrl);

        const detailHtml = await axiosInstance.get(detailUrl);
        const $ = cheerio.load(detailHtml.data);

        data.title = $('div.txtView').find('h3').text().trim();
        //console.log('공고제목: ', data.title);
        
        $('div.txtinfor:not(.f.mb20)').each((index, element) => {
            $(element).find('dl').each((i, dl) => {
                const dtElements = $(dl).find('dt'); // 현재 dl의 모든 dt 요소
                const ddElements = $(dl).find('dd'); // 현재 dl의 모든 dd 요소
                
                dtElements.each((j, dt) => {
                    const title = $(dt).text().trim(); // dt 값
                    const value = $(ddElements[j]).text().trim(); // 해당하는 dd 값
                    
                    switch (title) {
                        case '사업유형':
                            data.category = value;
                            //console.log('사업유형: ', data.category);
                            break;
                        case '담당부서':
                            data.department = value;
                            //console.log('담당부서: ', data.department);
                            break;
                        case '사업 담당자':
                            data.manager = value;
                            //console.log('사업 담당자: ', data.manager);
                            break;
                        case '지원대상구분':
                            data.supportTarget = value;
                            //console.log('지원대상구분: ', data.supportTarget);
                            break;
                        case '지역':
                            const regionCode = $(dl).find('span.bs_areacd').text().trim();
        
                            // 스크립트에서 지역 이름 추출
                            const areaName = bsAreaMap[regionCode] || '지역 정보 없음';
                            data.location = areaName;
                            //console.log('지역: ', data.location);
                            break;
                    }
                });
            });
        });

        const txtcont = $('div.txtcontent');
        const imgTags = txtcont.find('img');

        if (imgTags.length > 0) {
                            
            imgTags.each((index, element) => {
                const imgNm = $(element).attr('title') || `image_${data.title}_${index}`;
                const imgSrc = $(element).attr('src');
                
                if (imgSrc) {
                    const base64Match = imgSrc.match(/^data:image\/(png|jpg|jpeg);base64,(.+)$/);
                    if (base64Match) {
                        const imageDir = path.join(__dirname, 'images', 'gtpimages'); // 'images/gwimages' 폴더 경로 설정
                        fs.ensureDirSync(imageDir);
                        try {
                            const buffer = Buffer.from(base64Match[2], 'base64'); // 디코딩
                            const now = new Date();
                            const year = now.getFullYear(); 
                            const month = String(now.getMonth() + 1).padStart(2, '0'); 
                            const day = String(now.getDate()).padStart(2, '0'); 

                            const formattedDate = `${year}-${month}-${day}`; 
                            const fileName = `${imgNm.replace(/\s+/g, '_')}_${dataList.pathId}_${index}_${formattedDate}.png` // 이미지 이름 설정
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
                        const fullImgSrc = imgSrc.startsWith('/') ? `http://www.pms.gtp.or.kr${imgSrc}` : imgSrc;
                        data.contentImage.push({ img: imgNm, imgSrc: fullImgSrc });
                    }
                } else {
                    console.warn(`imgSrc is undefined for element: ${index} in URL: ${pathId}`);
                }
            });
        }
        const txtArray =[];
        txtcont.find('p').each((index, element) => {
            $(element).find('span').each((i, span) => {
                const spanText = $(span).text().trim();
                if (spanText) {
                    txtArray.push(spanText);
                }
            });
        });
        if (txtArray.length > 0) {
            data.contents = txtArray.join(' ');
        }

        const file = $('div.txtinfor.f');
        file.find('dl').each((index, element) => {
            const fileNm = $(element).find('a').text().trim();
            const href = $(element).find('a').attr('href');
            if (href) {
                const fileUrl = `https://pms.gtp.or.kr${href}`;
                data.attachmentFile.push({
                    fileNm: fileNm,
                    fileLink: fileUrl
                });
            }
        });


        console.log(data);
        return data;
    } catch(error){
        console.error('상세페이지 스크랩에서 에러 발생: ', error);
    }
}

async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function gtp(){
    const siteName = 'gtp';

    try{
        //페이지 별로 pathId 추출 공고 함수 호출
        const dataList = await getListPathIds();
        console.log(`총 ${dataList.length}개의 pathId가 스크랩되었습니다.`);
    
        //pathId 필터링
        const filterePathIds = await filterPathId(dataList,siteName);
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
                await delay(3000); // 3초 딜레이 추가
                return data;
            }));

            detailDataResults.push(...chunkResults.filter(data => data !== null));
        }

        //데이터 결합
        const combinedResults = filteredDataResults.map(detailData => {
            // dataList에서 detailData.pathId에 해당하는 항목 찾기
            const relatedData = dataList.find(item => item.pathId === detailData.pathId);

            // 관련 데이터와 상세 데이터를 결합
            return {
                ...detailData,
                requestStartedOn: relatedData.requestStartedOn,
                requestEndedOn: relatedData.requestEndedOn,
                implementingAgency: relatedData.implementingAgency
            };
        });

        //console.log(combinedResults);

        //DB 저장 함수 호출
        await saveDataInChunks(combinedResults, siteName);

    }catch(error){
        console.error('gtp() 에서 에러 발생: ',error);
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

//gtp();
export default gtp;