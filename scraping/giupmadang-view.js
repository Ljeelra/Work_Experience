import axios from "axios";
import * as cheerio from "cheerio";
import puppeteer from "puppeteer";
import { saveDetail } from '../db/db.js';

const baseUrl = 'https://www.bizinfo.go.kr/web/lay1/bbs/S1T122C128/AS/74/list.do';
const detailBaseUrl = 'https://www.bizinfo.go.kr/web/lay1/bbs/S1T122C128/AS/74/';
const row = 15;


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
        const getHtml =  await axios.get(url);
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
    try{
        const getHtml = await axios.get(url);
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
            return detailData(detailUrl);
        }).get();

        return await Promise.all(detailPromises);
        

    } catch (error) {
        console.error('Error scraping data:', error);
    }

}

//상세페이지 필요 데이터 추출
async function detailData(detailUrl) {

    try{
        const detailHtml = await axios.get(detailUrl);
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
        const applyMethod = $('.view_cont').find('.txt').eq(4).text();
        const contact = $('.view_cont').find('.txt').eq(5).text();

        const attachedFile = $('div.attached_file_list ul li');
        let attachedFileLength = attachedFile.length;
        let attachmentFile = null;
        let contentFile = null;
        if(attachedFile.length == 1){
            contentFile = $('div.right_btn').find('a').eq(1).attr('href');
            //console.log(contentFile);
        } else{
            attachmentFile = $('div.right_btn').eq(0).find('a').eq(1).attr('href');
            contentFile = $('div.right_btn').eq(1).find('a').eq(1).attr('href');
            
            //console.log(attachmentFile);
            //console.log(contentFile);
        }

        //console.log(title);
        
        return {
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
            contentFile
        };

    }catch(error){
        console.error('Error fetching detail page', error);
    }

};

async function startScrapePages(){
    try{
        const totalPages = await getTotalPage();
        const pagePromises = [];

        for(let cpage=1; cpage <= 5; cpage++){
            console.log(cpage+'페이지 스크랩중입니다.');
            pagePromises.push(scrapeData(cpage));
        }

        const allDataArrays = await Promise.all(pagePromises);
        const flattenedData = allDataArrays.flat().filter(data => data !== null);

        //DB삽입 함수 추가
        await saveDetail(flattenedData);

    }catch(error){

    }
}

startScrapePages();
export default startScrapePages;

