import axios from "axios";
import * as cheerio from "cheerio";
import { saveDetail, getAllPathIds } from '../db/db.js';

const chunkSize = 50;
const chunkSize2 = 10;
const row = 15;

const listurl = 'https://www.riia.or.kr/';
const axiosInstance = axios.create({
    timeout: 60000, // 60초 타임아웃
    headers: {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.3',
        'Cache-Control': 'max-age=0',
        'Content-Type': 'application/x-www-form-urlencoded',
        //'Referer': 'https://gn.riia.or.kr//board/businessAnnouncement',
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


async function getlocCode() {
    let loclist=[];
    try{
        
        const response = await axiosInstance.get(listurl);
        const $ = cheerio.load(response.data);

        //console.log(response.data);

        $('ul.area-box li').each((index, element) => {
            const onClickValue = $(element).attr('onclick');
            if (onClickValue) {
                const urlMatch = onClickValue.match(/go\('http:\/\/(.*?)\.riia\.or\.kr'\)/);
                if (urlMatch) {
                    loclist.push(urlMatch[1]);
                }
            }
        });
        return loclist;
    } catch(error){

    }   
}

async function getTotalPages(regionUrl, headers){
    try {

        const response = await axiosInstance.get(regionUrl,{headers: headers});
        const $ = cheerio.load(response.data);

        //console.log($.html());

        // .irpe_pageing_control 클래스 내의 data-page 속성에서 가장 큰 값을 찾음
        const pageNumbers = $('.irpe_pageing_control ul:has(.num)').find('.num').map((index, element) => {
            const pageNumber = $(element).attr('data-page');
            return pageNumber ? parseInt(pageNumber, 10) : null;
        }).get();

        //console.log('Extracted page numbers:', pageNumbers);

        const totalPages = Math.max(...pageNumbers);
        return totalPages;
    } catch (error) {
        console.error('Error fetching data:', error.message);
        if (error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response headers:', error.response.headers);
            console.error('Response data:', error.response.data);
        } 
    }
}

async function getpathId(regionUrl, headers) {
    try {
        const dataList = [];
        const response = await axiosInstance.get(regionUrl, {headers : headers});
        const $ = cheerio.load(response.data);

        $('.irpe_tablelist tbody tr').each((index, element) => {
            const stateSpan = $(element).find('span.state');
            
            // 'span.state'가 존재하고 'span.state.deadline'이 아닌 경우에만 데이터 추출
            if (stateSpan.length && stateSpan.hasClass('deadline') === false) {
                const href = $(element).find('a').attr('href').trim();
                const pathId = href.split('view/')[1];
                const title = $(element).find('td').eq(1).text().trim().replace(/[\s\n]*new[\s\n]*$/, '');
                const requestPeriod = $(element).find('td').eq(2).text().trim();
                const [requestStartedOn, requestEndedOn] = requestPeriod.split('~').map(date => date.trim());
                const status = stateSpan.text().trim();
                const announcementDate = $(element).find('td').eq(4).text().trim();

                dataList.push({
                    pathId,
                    title,
                    requestStartedOn, 
                    requestEndedOn,
                    announcementDate
                });
            }
        });

        return dataList;
    } catch (error) {
        console.error(`Error fetching data from ${regionUrl}:`, error);
        return [];
    }
}


async function filterPathId(allPageData, siteName) {
    try {
        const existingPathIds = await getAllPathIds(siteName);
        //console.log('Existing Path IDs:', existingPathIds);  확인을 위한 로그
        if (!Array.isArray(existingPathIds)) {
            throw new Error('Existing Path IDs is not an array');
        }
        return allPageData.filter(data => !existingPathIds.includes(data.pathId));
    } catch (error) {
        console.error('Error fetching existing path IDs:', error);
        return []; // 오류 발생 시 빈 배열 반환
    }
}

async function getDetailedData(detailUrl, pathId, headers){
    try{
        const detailHtml = await axiosInstance.get(detailUrl, {headers : headers});
        const $ = cheerio.load(detailHtml.data);

        const attachmentFile = [];
        const contentImage = [];
        const contents = [];

        //첨부파일 로직부터
        $('.irpe_list_box1 dl').each((index, element) => {
            const attachmentName = $(element).find('dd a').text().trim();
            const attachmentLink = $(element).find('dd a').attr('href');
            if (attachmentName && attachmentLink) {
                attachmentFile.push({ name: attachmentName, link: attachmentLink });
            }
        });
        // 이미지 추출
        $('div.irpe_list_more_conbox.fw_nnR.clearfix.ck-content figure img').each((index, element) => {
            const imgSrc = $(element).attr('src').trim();
            contentImage.push(imgSrc);
        });

        //텍스트 추출
        $('div.irpe_list_more_conbox.fw_nnR.clearfix.ck-content p span').each((i, element) => {
            const text = $(element).text().trim();
            if (text) {
                contents.push(text);
            }
        });
        const combinedContents = contents.join(' ');
        contents.length = 0; // 기존 배열 내용 삭제
        contents.push(combinedContents);
        
        // console.log('Attachment Files:', attachmentFile);
        // console.log('Images:', img);
        // console.log('Combined Contents:', combinedContents);
        // console.log('Contents:', contents);
        return {
            attachmentFile,
            contentImage,
            contents,
        };

    }catch(error){
        console.error('Error extracting detail data:', error);
        return null;
    }

}

let locCode= [];


async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function riia(){
    const siteName = 'riia';
    try{
        //추출한 지역코드로 해당 지역 공고 사이트 들어가는 url 생성
        locCode = await getlocCode();
        //console.log(locCode);
        //지역별 공고 목록 페이지에서 상태 진행중인 공고의 pathId, 접수기간, 작성일 추출하는 함수 호출
        if (locCode.length > 0) {
            for (const code of locCode) {
                const regionUrl = `https://${code}.riia.or.kr/board/businessAnnouncement`;
                //console.log(`지역별 공고목록 리스트 url생성: ${code}: ${regionUrl}`);

                const headers = {
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/png,image/svg+xml,*/*;q=0.8',
                    'Accept-Encoding': 'gzip, deflate, br, zstd',
                    'Accept-Language': 'ko-KR,ko;q=0.8,en-US;q=0.5,en;q=0.3',
                    'Connection': 'keep-alive',
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    'Referer': `https://${code}.riia.or.kr/`,
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0',
                };
                

                const totalPages = await getTotalPages(regionUrl, headers);
                //console.log(`Total pages for region ${code}: ${totalPages}`);


                let allPageData = [];
                // 지역 공고 목록에서 유니크키와 접수 기간, 공고일 추출
                for (let page = 1; page <= totalPages; page++) {
                    const pageUrl = `${regionUrl}?page=${page}`;
                    const idtime = await getpathId(pageUrl, headers);
                    allPageData = allPageData.concat(idtime);
                    //console.log(`Announcements for region ${code} on page ${page}:`, idtime);
                }
                //추출한 유니크키 db에 있는지 필터링하는 함수 호출
                const filterePathIds = await filterPathId(allPageData,siteName);
                if (filterePathIds.length === 0) {
                        console.log('모든 데이터가 필터링되었습니다. 새로운 데이터가 없습니다.');
                        continue;
                    }
                console.log(`필터링된 후 데이터 개수: ${filterePathIds.length}`);
                
            //상세페이지에서 db에 삽입할 데이터 return받고 return받은 데이터에 추출했던 유니크키랑 접수기간, 공고일 데이터 합치기
            const detailedDataResults = [];
            for (let i = 0; i < filterePathIds.length; i += chunkSize2) {
                const chunk = filterePathIds.slice(i, i + chunkSize2);
                const chunkResults = await Promise.all(chunk.map(async (data) => {
                    const detailUrl = `${regionUrl}/view/${data.pathId}`;
                    //console.log('detailUrl 체크:' + detailUrl);
                    const detailedData = await getDetailedData(detailUrl, data.pathId, headers);
                    return detailedData ? {
                        ...detailedData,
                        ...data,
                        site: siteName,
                        location: code
                    } : null;
                }));

                detailedDataResults.push(...chunkResults.filter(data => data !== null));
                await delay(3000); // 3초 딜레이 추가
            }

            //db저장함수 호출
            await saveDataInChunks(detailedDataResults, siteName);
            }
        }
    
    } catch(error){
        console.log('riia() 에러 발생: ',error)
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

//riia();
export default riia;