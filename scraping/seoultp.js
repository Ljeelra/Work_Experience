import axios from "axios";
import * as cheerio from "cheerio";
import { saveDetail, getAllPathIds } from '../db/db.js';

const chunkSize = 50;
const chunkSize2 = 10;
const row = 15;


const listurl = `http://www.seoultp.or.kr/user/nd19746.do?`;
const detailBaseUrl = 'https://www.seoultp.or.kr/user/nd19746.do?View&boardNo=';
const axiosInstance = axios.create({
    timeout: 60000, // 60초 타임아웃
    headers: {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.3',
        'Cache-Control': 'max-age=0',
        'Content-Type': 'application/x-www-form-urlencoded',
        //'Referer': '',
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
        return scrapedData.filter(pathId => !existingPathIds.includes(pathId));
    } catch (error) {
        console.error('seoultp Error fetching existing path IDs:', error);
        return []; // 오류 발생 시 빈 배열 반환
    }
}

async function getListPathIds() {
    const pathIds = [];
    let page = 1;
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0'); // 월은 0부터 시작하므로 +1 필요
    const dd = String(today.getDate()).padStart(2, '0');
    let scraping = true;
    
    while(scraping) {
        try {
            const formattedDate = `${yyyy}.${mm}.${dd}`;
            const listHtml = await axiosInstance.get(listurl, { params: { page } });
            const $ = cheerio.load(listHtml.data);

            let stopping = false;

            $('table.board-list tbody tr').each((index, element) => {
                const dataText = $(element).find('td').eq(3).text().trim();
                const year = dataText.split('.')[0];

                if (year === '2023') {
                    stopping = true;
                    return false;
                }

                const href = $(element).find('td.left > a').attr('href');
                const regex = /javascript:goBoardView\('.*','.*','([^']*)'\);$/;
                const match = href.match(regex);
                const linkText = $(element).find('td.left > a').text().trim();
                
                const dateRegex1 = /~?(\d{1,2}\.\s?\d{1,2})\.?/; // 형식이 ~M.dd 또는 ~M.dd. 인 경우
                const dateRegex2 = /(\d{1,2})\/(\d{1,2})/; // 형식이 MM/dd 인 경우
                
                
                if (linkText.includes('모집마감')) {
                    return; // "모집마감"이 포함된 경우 추출하지 않음
                }
                let linkDate = null;

                const dateMatch1 = linkText.match(dateRegex1);
                if (dateMatch1) {
                    const [month, day] = dateMatch1[1].split('.').map(Number);
                    linkDate = new Date(yyyy, month - 1, day);
                    if(linkDate < today){
                        return;
                    }
                }

                const dateMatch2 = linkText.match(dateRegex2);
                if (dateMatch2) {
                    const [month, day] = dateMatch2.slice(1).map(Number);
                    linkDate = new Date(yyyy, month - 1, day);
                    if(linkDate < today){
                        return;
                    }
                }

                if (match) {
                    const pathId = match[1];
                    pathIds.push(pathId);
                }
            });

            if (stopping) {
                scraping = false;
            } else {
                page++;
            }
        } catch(error) {
            console.error('seoultp getListPathIds()에서 에러 발생', error);
        }
    }
    return pathIds;
}


async function scrapeDetailPage(pathId, siteName){
    const data = {
        pathId: pathId,
        site: siteName,
        title: null,
        requestEndedOn: null,
        announcementDate: null,//공고일
        contents: null,
        contentImage: [],
        attachmentFile: [],
        location: '서울'
    }
    try{
        const detailUrl = `${detailBaseUrl}${pathId}`;
        //console.log(detailUrl);

        const detailHtml = await axiosInstance.get(detailUrl);
        const $ = cheerio.load(detailHtml.data);

        data.title = $('table.board-write tbody tr').find('td').eq(0).text().trim();
        //console.log('공고제목: ', data.title);
        let aDate =  $('table.board-write tbody tr').find('td').eq(2).text().trim();
        data.announcementDate = aDate.replace(/\./g, '-');
        //console.log('공고일: ',data.announcementDate);

        const dateRegex1 = /~?(\d{1,2})\.\s?(\d{1,2})\.?/; // 형식이 ~M.dd 또는 ~M.dd. 인 경우
        const dateRegex2 = /(\d{2})\/(\d{2})/; // 형식이 MM/dd 인 경우

        let requestEndedOn = null;

        const dateMatch1 = data.title.match(dateRegex1);
        if (dateMatch1) {
            const month = dateMatch1[1].padStart(2, '0'); 
            const day = dateMatch1[2].padStart(2, '0'); 
            const currentYear = new Date().getFullYear(); 
            requestEndedOn = `${currentYear}-${month}-${day}`;
        }

        const dateMatch2 = data.title.match(dateRegex2);
        if (dateMatch2) {
            const month = dateMatch2[1].padStart(2, '0'); 
            const day = dateMatch2[2].padStart(2, '0'); 
            const currentYear = new Date().getFullYear(); 
            requestEndedOn = `${currentYear}-${month}-${day}`;
        }

        if (requestEndedOn) {
            data.requestEndedOn = requestEndedOn;
        }

        const tableCont = $('div.table-cont');
        const imgTags = tableCont.find('img');

        if(imgTags.length > 0){
            imgTags.each((index, element) => {
                const imgSrc = $(element).attr('src');
                if (imgSrc.startsWith('/')) {
                    data.contentImage.push(`http://www.seoultp.or.kr${imgSrc}`);
                } else {
                    // 절대 경로일 경우, 그대로 추가
                    //console.log(imgSrc);
                    data.contentImage.push(imgSrc);
                }
                data.contentImage.push(`http://www.seoultp.or.kr${imgSrc}`);
            });
            //console.log(data.contentImage);
        } else {
            const textContent = tableCont.text().trim();
            data.contents= textContent;
           //console.log(data.contents);
        }

        const file = $('ul.downfile-list li');
        file.each((index, element) => {
            const fileNm = $(element).find('a').text().trim();
            const onclick = $(element).find('a').attr('onclick');
            const regex = /attachfileDownload\('([^']+)',\s*'(\d+)'\)/;
            const amatch = onclick.match(regex);
            if(amatch){
                const fileLink = amatch[1].trim();
                const fileId = amatch[2].trim();
                const fileUrl = `http://www.seoultp.or.kr${fileLink}?attachNo=${fileId}`;
                
                data.attachmentFile.push({
                    fileNm: fileNm,
                    fileLink: fileUrl
                });
            } else{
                console.log('match값이 없습니다.');
            }

        });

        return data;
        
    }catch(error){
        console.error('seoultp 상세페이지 스크랩 에러: ', error);
    }
}

async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function seoultp(){
    const siteName = 'seoultp';

    try{
        //페이지 별로 pathId 추출 공고 함수 호출
        const pathId = await getListPathIds();
        console.log(`총 ${pathId.length}개의 pathId가 스크랩되었습니다.`);
        //console.log('pathid 배열 확인: ',pathId);
    
         //pathId 필터링
        const filterePathIds = await filterPathId(pathId,siteName);
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

        //DB 저장 함수 호출
        await saveDataInChunks(detailDataResults, siteName);

    }catch(error){
        console.error('seoultp() 에서 에러 발생: ',error);
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

//seoultp();
export default seoultp;