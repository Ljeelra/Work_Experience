import axios from "axios";
import * as cheerio from "cheerio";
import { saveDetail, getAllPathIds } from '../db/db.js';

const baseUrl = 'https://www.bizinfo.go.kr/web/lay1/bbs/S1T122C128/AS/74/list.do';
const detailBaseUrl = 'https://www.bizinfo.go.kr/web/lay1/bbs/S1T122C128/AS/74/';
const row = 15;
const chunkSize = 50;

//Axioserror: socket hang up 에러, 코드: ECONNRESET
// Axios 인스턴스 설정
//1 헤더값
const axiosInstance = axios.create({
    timeout: 60000, // 60초 타임아웃
    headers: {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
        'Cache-Control': 'max-age=0',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': 'https://www.bizinfo.go.kr/web/lay1/bbs/S1T122C128/AS/74/list.do',
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

//페이지포함 된 URL 생성 함수
async function getPageUrl(cpage) {
    const url = new URL(baseUrl);
    url.searchParams.set('rows', row);
    url.searchParams.set('cpage', cpage);
    return url.toString();
}

//전체 페이지 수를 추출하는 함수
async function getTotalPage() {
    try{
        const url = await getPageUrl(1);
        const getHtml =  await axiosInstance.get(url);
        const $ = cheerio.load(getHtml.data);
        const pagenation = $('div.page_wrap');
        const lastPageLink = pagenation.find('a').last().attr('href');
        const totalPage = new URL(lastPageLink, baseUrl).searchParams.get('cpage');
        return parseInt(totalPage, 10);
    }catch(error){
        console.error('Error fetching total pages:', error);
        return 1;
    }
    
}
    
// 데이터베이스에 없는 pathId만 필터링
async function filterPathId(scrapedData, siteName) {
    try {
        const existingPathIds = await getAllPathIds(siteName);
        //console.log('Existing Path IDs:', existingPathIds);  확인을 위한 로그
        if (!Array.isArray(existingPathIds)) {
            throw new Error('Existing Path IDs is not an array');
        }
        return scrapedData.filter(data => !existingPathIds.includes(data.pathId));
    } catch (error) {
        console.error('Error fetching existing path IDs:', error);
        return []; // 오류 발생 시 빈 배열 반환
    }
}

//공고 목록에서 상세페이지 주소 추출하는 함수
async function scrapeData(cpage) {
    const url = await getPageUrl(cpage);
    console.log(`${cpage} 페이지 스크랩중입니다.`);
    try {
        const getHtml = await axiosInstance.get(url);
        const $ = cheerio.load(getHtml.data);
        const table = $('div.table_Type_1 table');
        const tableRows = table.find('tbody tr');
        const detailPromises = tableRows.map(async (index, list) => {
            const detail = $(list).find('.txt_l > a').attr('href');
            const detailUrl = detailBaseUrl + detail;

            const urlParams = new URLSearchParams(new URL(detailUrl).search);
            const pathId = urlParams.get('pblancId');           

            return { detailUrl, pathId };
        }).get();

        return await Promise.all(detailPromises);
    } catch (error) {
        console.error('Error scraping data:', error);
        return [];
    }
}

//상세페이지 필요 데이터 추출
async function detailData(detailUrl, pathId) {

    try{
        const detailHtml = await axiosInstance.get(detailUrl);
        const $ = cheerio.load(detailHtml.data);    
        

        const category = $('.category').text().trim();
        const title = $('h2.title').text().trim();
        let local='';
        if(title.includes('[')){
            local = title.slice(1,3);
        }
        const department = $('.view_cont').find('.txt').eq(0).text().trim();
        const agency = $('.view_cont').find('.txt').eq(1).text().trim();
        let applyDate = $('.view_cont').find('.txt').eq(2).text().trim();
        applyDate = applyDate.replace(/[\n\t]/g, '');
        const date = applyDate.split('~');
        let requestStarted = date[0]?.trim() || 'N/A';
        let requestEnded = date[1]?.trim();
        
        if(!requestEnded || requestEnded === '') {
            requestEnded = requestStarted;
        }else if (!isNaN(Date.parse(requestEnded))) {
            requestEnded = new Date(requestEnded).toISOString().split('T')[0]; // YYYY-MM-DD format
        }

        if (!isNaN(Date.parse(requestStarted))) {
            requestStarted = new Date(requestStarted).toISOString().split('T')[0]; // YYYY-MM-DD format
        }
        const summary= $('.view_cont').find('.txt').eq(3).text();

        let applyMethodOriginal = $('.view_cont').find('.txt').eq(4).text();
        const applyMethod = applyMethodOriginal

        let applySite, contact;
        if(applyMethod.includes('온라인 접수')){
            const applySiteAnchor = $('.view_cont').find('.txt').eq(5).find('a');
            applySite = applySiteAnchor.length > 0 ? applySiteAnchor.attr('href') : null;

            const contactElement = $('.view_cont').find('.txt').eq(6);
            const contactAnchor = contactElement.find('a');
            contact = contactAnchor.length > 0 ? contactAnchor.attr('href') : contactElement.text().trim();
        } else {
            // 일반적인 경우 applySite는 detailUrl 그대로 사용
            applySite = null;

            const contactElement = $('.view_cont').find('.txt').eq(5);
            const contactAnchor = contactElement.find('a');
            contact = contactAnchor.length > 0 ? contactAnchor.attr('href') : contactElement.text().trim();
        }

        const attachedFile = $('div.attached_file_list ul li');
        let attachedFileLength = attachedFile.length;
        let attachmentFile = null;
        let contentFile = null;
        if(attachedFileLength == 1){
            contentFile = $('div.right_btn').find('a').eq(1).attr('href');
        } else{
            attachmentFile = $('div.right_btn').eq(0).find('a').eq(1).attr('href');
            contentFile = $('div.right_btn').eq(1).find('a').eq(1).attr('href');
            
        }


        const siteName = 'giupmadang';
        
        return {
            pathId,
            category,
            title,
            location:local,
            department,
            implementingAgency:agency,
            requestStartedOn:requestStarted,
            requestEndedOn:requestEnded,
            overview:summary,
            applyMethod,
            contact,
            applySite:detailUrl,
            attachmentFile,
            contentFile,
            site:siteName
        };

    }catch(error){
        console.error('Error fetching detail page', error);
    }

};

async function giupmadang() {
    const siteName = 'giupmadang';
    try {
        const totalPages = await getTotalPage();
        const pagePromises = [];

        for (let cpage = 1; cpage <= totalPages; cpage++) {
            pagePromises.push(scrapeData(cpage));
        }

        const allDataArrays = await Promise.all(pagePromises);
        const allDetails = allDataArrays.flat();

        console.log(`총 ${allDetails.length}개의 상세페이지 URL이 스크랩되었습니다.`);

        const newDetailData = await filterPathId(allDetails, siteName);

        if (newDetailData.length === 0) {
            console.log('모든 데이터가 필터링되었습니다. 새로운 데이터가 없습니다.');
            return;
        }

        console.log(`필터링된 후 데이터 개수: ${newDetailData.length}`);

        // 상세 페이지에서 데이터 추출
        const detailDataPromises = newDetailData.map(async data => {
            return detailData(data.detailUrl, data.pathId);
        });
        const detailDataResults = await Promise.all(detailDataPromises);
        const filteredDataResults = detailDataResults.filter(data => data !== null);

        // DB 삽입 함수
        await saveDataInChunks(filteredDataResults, siteName);

    } catch (error) {
        console.error('giupmadang 함수에서 오류 발생:', error);
    }
}

// 배치로 데이터를 저장하는 함수
async function saveDataInChunks(data, siteName) {
    console.log(`Total data to insert: ${data.length}`); // 총 데이터 개수 출력
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

export default giupmadang;

