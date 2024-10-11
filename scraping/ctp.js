import axios from 'axios';
import * as cheerio from "cheerio";
import { saveDetail, getAllPathIds } from '../db/db.js';

const chunkSize = 50;
const baseUrl = 'http://www.ctp.or.kr/business/data.do';
const detailBaseUrl = 'http://www.ctp.or.kr/business/datadetail.do?seq=';
const axiosInstance = axios.create({
    timeout: 60000, // 60초 타임아웃
    headers: {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.3',
        'Cache-Control': 'max-age=0',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': 'http://www.ctp.or.kr/business/data.do',
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


async function getListPathIds(page){
    const pathIds = [];
    const listUrl = `${baseUrl}?&pn=${page}`
    try{
        //console.log(`${page}페이지 pathid 추출 시작합니다`);
        const response = await axiosInstance.get(listUrl);
        const $ = cheerio.load(response.data);

        $('tbody tr').each((index, element) => {
            // span.list-ing이 있는 tr에서만 처리
            const listIngElement = $(element).find('td.d-none.d-lg-table-cell span.list-ing');
            const listingText = listIngElement.text().trim();
            //console.log('텍스트값확인:', listingText);
            if (listIngElement.length > 0 && !listingText.includes('공지')) {
                const link = $(element).find('a').attr('href'); // a 태그의 href 가져오기
                const pathidMatch = link.match(/seq=(\d+)/); // seq 값을 정규 표현식으로 추출
                let requestEndedOn = $(element).find('td.d-none.d-lg-table-cell span.cod1.pr-4').text().trim();
                if (!requestEndedOn) {
                    requestEndedOn = '상시';
                }
                if (pathidMatch) {
                    const pathid = pathidMatch[1];
                    pathIds.push({ pathId: pathid, requestEndedOn });
                }
            }
        });
        


        //console.log(pathIds);
        return pathIds;

    } catch(error){
        console.log('gtp.getListPathIds() 에러 발생: ',error);
        if (error.response && error.response.status === 503) {
            await new Promise(resolve => setTimeout(resolve, 5000)); // 5초 대기
            return getListPathIds(page); // 재시도
        }
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
        return scrapedData.filter(data => !existingPathIds.includes(data.pathId));
    } catch (error) {
        console.error('Error fetching existing path IDs:', error);
        return []; // 오류 발생 시 빈 배열 반환
    }
}

async function scrapeDetailPage(dataList, siteName){
    const data = {
        pathId: dataList.pathId,
        site: siteName,
        title: null,
        announcementDate: null,
        requestEndedOn: dataList.requestEndedOn,
        contents: null,
        contentImage: [],
        attachmentFile: []
    };
    try{  
        const detailUrl = `${detailBaseUrl}${dataList.pathId}`;
        const detailHtml = await axiosInstance.get(detailUrl);
        const $ = cheerio.load(detailHtml.data);

        data.title = $('div.boardTitle').find('h3').text().trim();
        data.announcementDate = $('div.boardInfo ul').find('li').eq(1).text().trim();

        const board = $('div.boardContent');
        const imgTags = board.find('img');
        const maxSrcLength = 5000;

        if(imgTags.length > 0){
            imgTags.each((index, element) => {
                const imgSrc = $(element).attr('src');
                if (imgSrc && imgSrc.length < maxSrcLength) {
                    if (imgSrc.startsWith('/')) {
                        data.contentImage.push(`http://www.ctp.or.kr${imgSrc}`);
                    } else {
                        // 절대 경로일 경우, 그대로 추가
                        data.contentImage.push(imgSrc);
                    }
                }
            });
            //console.log(data.contentImage);
        } 
        const txtArray =[];
        board.find('p').each((index, element) => {
            const ptext = $(element).text().trim();
            if (ptext) {
                txtArray.push(ptext);
            }
        });
        if (txtArray.length > 0) {
            data.contents = txtArray.join(' ');
        }

        const file = $('div.boardAttach');
        file.find('li a').each((index, element) => {
            const fileNm = $(element).text().trim();
            const href = $(element).attr('href');
            if (href) {
                const fileUrl = `http://www.ctp.or.kr${href}`;
                data.attachmentFile.push({
                    fileNm: fileNm,
                    fileLink: fileUrl
                });
            }
        });

        //console.log(data);
        return data;
    } catch(error){
        console.log('scrapeDetailPage() 에러 발생: ',error);
    }
}


const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function ctp(){
    const siteName = 'ctp';
    try{
        const pathIdPromises  = [];
        const totalPages = 360;

        //totalpage에서 '마감'인 것 제외하고 pathId 추출
        for (let page = 1; page <= totalPages; page++) {
            pathIdPromises.push(getListPathIds(page));
            await delay(100);
        }

        const allPathIds = await Promise.all(pathIdPromises);

        // 2차원 배열을 1차원 배열로 변환
        const flattenedPathIds = allPathIds.flat();
        //console.log(flattenedPathIds);

        //pathId 필터링
        const filterPathIds = await filterPathId(flattenedPathIds, siteName);
        if (filterPathIds.length === 0) {
            console.log('모든 데이터가 필터링되었습니다. 새로운 데이터가 없습니다.');
            return;
        }
    
        console.log(`필터링된 후 데이터 개수: ${filterPathIds.length}`);

        //상세페이지 추출
        const detailDataPromises = filterPathIds.map(pathId => 
            scrapeDetailPage(pathId, siteName)
        );
        const detailDataResults = await Promise.all(detailDataPromises);
        const filteredDataResults = detailDataResults.filter(data => data !== null);


        //데이터 저장
        await saveDataInChunks(filteredDataResults, siteName);
    } catch(error){
        console.log('ctp()에러 발생', error);
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

//ctp();
export default ctp;