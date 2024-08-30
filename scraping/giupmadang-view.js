import axios from "axios";
import * as cheerio from "cheerio";
import puppeteer from "puppeteer";
import { saveDetail, checkExist } from '../db/db.js';

const baseUrl = 'https://www.bizinfo.go.kr/web/lay1/bbs/S1T122C128/AS/74/list.do';
const detailBaseUrl = 'https://www.bizinfo.go.kr/web/lay1/bbs/S1T122C128/AS/74/';
const row = 15;

//Axioserror: socket hang up 에러, 코드: ECONNRESET
// Axios 인스턴스 설정
const axiosInstance = axios.create({
    timeout: 30000, // 30초 타임아웃
    headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
        'Cache-Control': 'max-age=0',
        'DNT': '1',
        'Upgrade-Insecure-Requests': '1'
    },
    family: 4,
});

//페이지포함 된 URL 생성 함수
async function getPageUrl(cpage) {
    const url = new URL(baseUrl);
    url.searchParams.set('rows', row);
    url.searchParams.set('cpage', cpage);
    //console.log(url);
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

//공고 목록에서 상세페이지 주소 추출하는 함수
async function scrapeData(cpage) {
    const url = await getPageUrl(cpage);
    console.log(cpage+'페이지 스크랩중입니다.');
    try{
        const getHtml = await axiosInstance.get(url);
        const $ = cheerio.load(getHtml.data);
        const table = $('div.table_Type_1 table');
        const tableRows = table.find('tbody tr');

        // for(const list of tableRows){ 
        //     const views = $(list).find('td').last().text().trim();
        //     const detail = $(list).find('.txt_l > a').attr('href');
        //     const detailUrl = detailBaseUrl+detail; 
            
        //     await detailData(detailUrl);
        // }
        const detailPromises = tableRows.map(async (index, list) => {
            const views = $(list).find('td').last().text().trim();
            const detail = $(list).find('.txt_l > a').attr('href');
            const detailUrl = detailBaseUrl + detail;

            const urlParams = new URLSearchParams(new URL(detailUrl).search);
            
            
            //중복데이터 체크
            const pathId = urlParams.get('pblancId');           
            const exists = await checkExist(pathId);
            if (exists) {
                console.log(`중복된 데이터: ${pathId}`);
                return null;  // 중복된 경우 null 반환
            }

            return detailData(detailUrl, pathId);
        }).get();

        const detailDataResults = await Promise.all(detailPromises);
        

        return detailDataResults.filter(data => data !== null);
        

    } catch (error) {
        console.error('Error scraping data:', error);
    }

}

//상세페이지 필요 데이터 추출
async function detailData(detailUrl, pathId) {

    try{
        const detailHtml = await axiosInstance.get(detailUrl);
        const $ = cheerio.load(detailHtml.data);    
        


        const category = $('.category').text().trim();
        const title = $('h2.title').text().trim();
        const local = $('.view_cont').find('.txt').eq(0).text().trim();
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
            //console.log(contentFile);
        } else{
            attachmentFile = $('div.right_btn').eq(0).find('a').eq(1).attr('href');
            contentFile = $('div.right_btn').eq(1).find('a').eq(1).attr('href');
            
            //console.log(attachmentFile);
            //console.log(contentFile);
        }

        //console.log(title);

        const siteName = 'giupmadang';
        
        return {
            pathId,
            category,
            title,
            department:local,
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

async function startScrapePages(){
    try{
        const totalPages = await getTotalPage();
        const pagePromises = [];

        for(let cpage=1; cpage <= totalPages; cpage++){
            pagePromises.push(scrapeData(cpage));
        }

        const allDataArrays = await Promise.all(pagePromises);
        const flattenedData = allDataArrays.flat();

        console.log(`총 ${flattenedData.length}개의 데이터가 스크랩되었습니다.`);

        //DB삽입 함수
        await saveDetail(flattenedData);

    }catch(error){
        console.error('startScrapePages에서 오류 발생:', error);
    }
}

startScrapePages();
export default startScrapePages;

