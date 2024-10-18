import axios from 'axios';
import axiosRetry from 'axios-retry';
import * as cheerio from "cheerio";
import { saveDetail, getAllPathIds } from '../db/db.js';

const chunkSize = 50;
const chunkSize2 = 10;
const listUrl = 'https://www.itp.or.kr/intro.asp?tmid=13';
const detailBaseUrl = 'https://www.itp.or.kr/intro.asp?tmid=13&seq=';
const MAX_RETRIES = 3;
const row = 10;
const axiosInstance = axios.create({
    timeout: 90000, // 60초 타임아웃
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

axiosRetry(axiosInstance, {
    retries: MAX_RETRIES,
    retryDelay: (retryCount) => {
        console.log(`재시도 횟수: ${retryCount}`);
        return retryCount * 2000; // 재시도 간격 (밀리초)
    },
    retryCondition: (error) => {
        if (!error.response) {
            console.log("네트워크 오류로 인해 재시도합니다.");
            return true; // 네트워크 오류인 경우 재시도
        }
        return error.response.status >= 500;
    },
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

async function getTotalPages(searchPeriod) {
    try {
        const response = await axiosInstance.post(listUrl, { PageShowSize: row, search_period: searchPeriod, PageNum: 1 });
        if (!response.data) return 0;

        const $ = cheerio.load(response.data);
        const pagenation = $('div.paging_area');
        const pageHref = pagenation.find('a').last().attr('href');
        const pageMatch = pageHref.match(/javascript:fncBoardPage\((\d+)\)/);
        let totalPages='';
        if(pageMatch){
            totalPages = parseInt(pageMatch[1], 10);
            //console.log(totalPages);
        }
        return totalPages;
    } catch (error) {
        console.error('getTotalPages()에서 에러가 발생:', error);
        return 0;
    }
}

async function getPathIds(searchPeriod) {
    try {
        const totalPages = await getTotalPages(searchPeriod);

        const pathIdsPromises = Array.from({ length: totalPages }, (_, i) => (async (page) => {
            try {
                const response = await axiosInstance.post(listUrl, { search_period: searchPeriod, PageNum: page, PageShowSize: row });
                if (!response.data) return [];

                const $ = cheerio.load(response.data);
                const pathIds = [];
                $('table.list tbody tr').each((i, element) => {
                    const pathIdHref = $(element).find('td.subject a').attr('href');
                    const pathIdMatch = pathIdHref.match(/javascript:fncShow\('(\d+)'\)/);
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
        return pathIdsArrays.flat();
    } catch (error) {
        console.error('getPathIds()에서 에러가 발생:', error);
        return [];
    }
}

async function scrapeDetailPage(pathIds, siteName){
    const data = {
        pathId: pathIds,
        site: siteName,
        title: null,
        announcementDate: null,
        department:null,
        requestEndedOn: null,
        contents: null,
        contentImage: [],
        attachmentFile: []
    };
        try{
            const detailUrl = `${detailBaseUrl}${pathIds}`;
            //console.log(detailUrl);
            const detailHtml = await axiosInstance.get(detailUrl);
            const $ = cheerio.load(detailHtml.data);

            data.title = $('h5.view_title span').text().trim();
            if (!data.title) {
                console.warn(`제목을 찾을 수 없습니다. pathId: ${data.pathId}`);
            }
            data.announcementDate = $('div.dl_sub_view dd.vdd').eq(1).text().trim();
            data.department = $('div.dl_sub_view dd.vdd').eq(2).text().trim();
            data.requestEndedOn = $('div.dl_sub_view dd.vdd').eq(4).text().trim();
            if(!data.requestEndedOn){
                data.requestEndedOn = '상시';
            }

            //첨부파일
            const file = $('dl.view');
            file.find('a').each((index, element) => {
                const fileNm = $(element).attr('title').trim();
                const href = $(element).attr('href');
                const match = href.match(/javascript:fncFileDownload\('([^']+)','([^']+)'\)/);
                const filelink = 'https://www.itp.or.kr/common/COM_FILEDOWN.ASP?a=bbs&b='; 
                if (match) {
                    const fileid = match[2];
                    const fileUrl = `${filelink}${fileid}`;
                    data.attachmentFile.push({
                        fileNm: fileNm,
                        fileLink: fileUrl
                    });
                }
            });

            //본문 글 or 이미지
            const board = $('div.editor');
            const imgTags = board.find('img');
            const maxSrcLength = 5000;

            if(imgTags.length > 0){
                imgTags.each((index, element) => {
                    const imgNm = $(element).attr('alt');
                    const imgSrc = $(element).attr('src');
                    if (imgSrc && imgSrc.length < maxSrcLength) {
                        if (imgSrc.startsWith('/')) {
                            data.contentImage.push({imgNm: imgNm, img: `http://www.ctp.or.kr${imgSrc}`});
                        } else {
                            // 절대 경로일 경우, 그대로 추가
                            data.contentImage.push({imgNm: imgNm, img: imgSrc});
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
            
            //console.log(data);
            return data;
        } catch(error){
            console.log(`scrapedetaildata()에서 에러 발생:  ${error.message}`, error);
        }
    
}

async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function itp(){
    const siteName = 'itp';
    try{
        let pathIds=[];
        //pathId 추출
        // const openPathIds = await getPathIds(1);
        // const ongoingPathIds = await getPathIds(2);
        const [openPathIds, ongoingPathIds] = await Promise.all([getPathIds(1), getPathIds(2)]);
        
        pathIds = [...ongoingPathIds, ...openPathIds];
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


        //DB 저장 함수 호출
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

//itp();
export default itp;