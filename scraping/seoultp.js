import axios from "axios";
import * as cheerio from "cheerio";
import { saveDetail, getAllPathIds } from '../db/db.js';

const chunkSize = 50;
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
        console.error('Error fetching existing path IDs:', error);
        return []; // 오류 발생 시 빈 배열 반환
    }
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
            console.log(`${page}페이지 pathid 추출 시작합니다`);
            const formattedDate = `${yyyy}.${mm}.${dd}`;
            //console.log(formattedDate);
    
            const listHtml = await axiosInstance.get(listurl, {params: {page}});
            const $ = cheerio.load(listHtml.data);
            
            //console.log(listHtml.data);
            //공고 등록일이 2023년도인 공고가 나오면 while문 페이지 스크랩 종료
            let stopping = false;
            $('table.board-list tbody tr').each((index, element) =>{
            const dataText = $(element).find('td').eq(3).text().trim();
            //console.log('공고작성일: '+dataText);
            const year = dataText.split('.')[0];
            //console.log('공고작성년도: '+year);

            if(year ==='2023'){
                stopping = true;
                return false;
            }
            //a태그 text 값에 (~M.dd)가 있고 오늘 날짜랑 비교해서 이전이면 스크랩할 필요 없음.
                const href = $(element).find('td.left > a').attr('href');
                //console.log('href값',href);
                const regex = /javascript:goBoardView\('.*','.*','([^']*)'\);$/;
                const match = href.match(regex);
                //console.log('match:',match);

                const linkText = $(element).find('td.left > a').text().trim();
                //console.log('a text값: ', linkText);
                const dateRegex = /~?(\d{1,2}\.\s?\d{1,2})/; // 형식이 ~M.dd 인 경우
                const dateMatch = linkText.match(dateRegex);
                //console.log('dateMatch 값: ', dateMatch);

                if (linkText.includes('모집마감')) {
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
            console.log('getListPathIds()에서 에러 발생',error);
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
        data.announcementDate =  $('table.board-write tbody tr').find('td').eq(2).text().trim();
        //console.log('공고일: ',data.announcementDate);

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
        console.log('상세페이지 스크랩에서 에러: ', error);
    }
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
        const detailDataPromises = filterePathIds.map(pathId => 
            scrapeDetailPage(pathId, siteName).then(data => ({ ...data, site: siteName }))
        );
        const detailDataResults = await Promise.all(detailDataPromises);
        const filteredDataResults = detailDataResults.filter(data => data !== null);

        //DB 저장 함수 호출
        await saveDataInChunks(filteredDataResults, siteName);

    }catch(error){
        console.log('seoultp() 에서 에러 발생: ',error);
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

seoultp();
export default seoultp;