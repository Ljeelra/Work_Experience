process.env.NODE_TLS_REJECT_UNAUTHORIZED ="0";
import axios from 'axios';
import * as cheerio from "cheerio";
import { saveDetail, getAllPathIds } from '../db/db.js';

const chunkSize = 50;
const listUrl = 'https://dgtp.or.kr/bbs/BoardControll.do';
const detailBaseUrl = 'https://dgtp.or.kr/bbs/BoardControllView.do';
const MAX_RETRIES = 3;
const row = 10;
const axiosInstance = axios.create({
    timeout: 60000, // 60초 타임아웃
    headers: {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.3',
        'Cache-Control': 'max-age=0',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': 'https://dgtp.or.kr/bbs/BoardControll.do',
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
    family: 4
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

async function getTotalPages(searchBbsState) {
    try {
        console.log(`totalPage 추출을 시작합니다`);
        const response = await axiosInstance.post(listUrl, { bbsId: 'BBSMSTR_000000000003', pageUnit: row, searchBbsState: searchBbsState, pageIndex: 1 });
        if (!response.data) return 0;

        const $ = cheerio.load(response.data);
        const pagenation = $('ul.pagination');
        let totalPages = '';
        // 페이지가 한 페이지인지 여러 페이지인지 확인
        if (pagenation.find('li.active').length === 1 && pagenation.find('li').length === 1) {
            totalPages = 1;
            return totalPages;
        } else {
            // 여러 페이지일 경우
            const pageHref = pagenation.find('a').last().attr('href');
            if (pageHref) {
                const pageMatch = pageHref.match(/=(\d+)/);
                if (pageMatch) {
                    totalPages = parseInt(pageMatch[1], 10);
                    //console.log(totalPages);
                }
            }
            return totalPages || 0; // 페이지 수가 없을 경우 0 반환
        }
    } catch (error) {
        console.error('getTotalPages()에서 에러가 발생:', error);
        return 0;
    }
}

async function getPathIds(searchBbsState) {
    try {
        const totalPages = await getTotalPages(searchBbsState);
        //console.log(totalPages);
        
        const pathIdsPromises = Array.from({ length: totalPages }, (_, i) => (async (page) => {
            try {
                const response = await axiosInstance.post(listUrl, { bbsId: 'BBSMSTR_000000000003', searchBbsState : searchBbsState, pageIndex: page, pageUnit: row });
                if (!response.data) return [];

                const $ = cheerio.load(response.data);
                const pathIds = [];
                $('table.nth3left.tablelist tbody tr').each((i, element) => {
                    const pathIdHref = $(element).find('span.tooltiptext a').attr('onclick');
                    //console.log(`${searchBbsState}`,pathIdHref);
                    const pathIdMatch = pathIdHref.match(/javascript:fn_egov_inqire_notice\('([^']+)'/);
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
        console.error(`getPathIds()에서 에러가 발생:`, error);
        return [];
    }
}

async function scrapeDetailPage(pathIds, siteName){
    const data = {
        pathId: pathIds,
        site: siteName,
        title: null,
        announcementDate: null,
        department: null,
        requestStartedOn: null,
        requestEndedOn: null,
        contents: null,
        contentImage: [],
        attachmentFile: []
    };
    let retries = 0;
    while (retries < MAX_RETRIES) {
        try{
            const detailHtml = await axiosInstance.post(detailBaseUrl,{ bbsId: 'BBSMSTR_000000000003', nttId: pathIds, pageIndex: 1, pageUnit: row});
            const $ = cheerio.load(detailHtml.data);

            $('table.tableview tbody tr').each((index, element) => {
                const thElements = $(element).find('th');
                const tdElements = $(element).find('td');
              
                thElements.each((i, th) => {
                  const thText = $(th).text().trim();
                  const td = $(tdElements[i]);
                  const tdText = td.text().trim();
              
                  switch (thText) {
                    case '제목':
                      data.title = tdText;
                      break;
                    case '접수기간':
                      const spanText = td.find('span').text().trim();
                      if (spanText === '상시모집') {
                        data.requestStartedOn = spanText;
                        data.requestEndedOn = null;
                      } else {
                        td.find('span').remove(); // td 내의 span 요소를 제거
                        const removeTdText = td.text().trim();
                        const applyDate = removeTdText.split('~');
                        data.requestStartedOn = applyDate[0]?.trim() || 'N/A';
                        data.requestEndedOn = applyDate[1]?.trim() || 'N/A';
                      }
                      break;
                    case '부서명':
                      data.department = tdText;
                      break;
                    case '작성일':
                      data.announcementDate = tdText;
                      break;
                    default:
                      break;
                  }
                });
              });

            //첨부파일
            const file = $('ul.attach');
            file.find('a').each((index, element) => {
                const fileNm = $(element).text().trim();
                const href = $(element).attr('href');
                const match = href.match(/javascript:fn_egov_encDownFile\('([^']+)'\)/);
                const filelink = 'https://dgtp.or.kr/cmm/fms/EncFileDown.do?encFileId='; 
                if (match) {
                    const fileid = match[1];
                    const encodeFileid = encodeURIComponent(fileid);
                    const fileUrl = `${filelink}${encodeFileid}`;
                    data.attachmentFile.push({
                        fileNm: fileNm,
                        fileLink: fileUrl
                    });
                }
            });

            //본문 글 or 이미지
            const board = $('td.pd30');
            const imgTags = board.find('img');
            const maxSrcLength = 5000;

            if(imgTags.length > 0){
                imgTags.each((index, element) => {
                    // const imgNm = $(element).attr('alt');
                    const imgSrc = $(element).attr('src');
                    if (imgSrc && imgSrc.length < maxSrcLength) {
                        if (imgSrc.startsWith('/')) {
                            data.contentImage.push(`https://dgtp.or.kr${imgSrc}`);
                        } else {
                            // 절대 경로일 경우, 그대로 추가
                            data.contentImage.push(imgSrc);
                        }
                    }
                });
                //console.log(data.contentImage);
            } 
            const txtArray =[];
            board.find('div').each((index, element) => {
                const ptext = $(element).text().trim().replace(/[\n\t]/g, '');
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
            retries++;
            if (retries < MAX_RETRIES) {
                console.log(`재시도 중... (${retries}/${MAX_RETRIES})`);
                await new Promise(res => setTimeout(res, 2000)); // 2초 대기
            } else {
                console.error(`최대 재시도 횟수를 초과했습니다. pathId: ${data.pathId}`);
                return null;
            }
        }
    }
}

async function dgtp(){
    const siteName = 'dgtp';
    try{
        let pathIds=[];
        //pathId 추출
        // const openPathIds = await getPathIds(1);
        // const ongoingPathIds = await getPathIds(2);
        const [ongoingPathIds, openPathIds] = await Promise.all([getPathIds(2), getPathIds(4)]);
        
        pathIds = [...ongoingPathIds, ...openPathIds];
        console.log(`총 ${pathIds.length}개의 pathId가 스크랩되었습니다.`);

        const filterPathIds = await filterPathId(pathIds,siteName);
        if (filterPathIds.length === 0) {
            console.log('모든 데이터가 필터링되었습니다. 새로운 데이터가 없습니다.');
            return;
        }
    
        console.log(`필터링된 후 데이터 개수: ${filterPathIds.length}`);

        //상세페이지 스크랩
        const detailDataPromises = filterPathIds.map(pathId => 
            scrapeDetailPage(pathId, siteName)
        );
        const detailDataResults = await Promise.all(detailDataPromises);
        const filteredDataResults = detailDataResults.filter(data => data !== null);

        //DB 저장 함수 호출
        await saveDataInChunks(filteredDataResults, siteName);

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

dgtp();
export default dgtp;