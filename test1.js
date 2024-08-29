import axios from "axios";
import * as cheerio from "cheerio";
import puppeteer from "puppeteer";

const url = 'https://www.bizinfo.go.kr/web/lay1/bbs/S1T122C128/AS/74/list.do';
const baseUrl = 'https://www.bizinfo.go.kr/web/lay1/bbs/S1T122C128/AS/74/';


async function scrapeData() {
    
    try{
        const getHtml = await axios.get(url);
        const $ = cheerio.load(getHtml.data);
        const table = $('div.table_Type_1 table');
        const tableRows = table.find('tbody tr');

        for(const list of tableRows){
            
            const no = $(list).find('td').first().text().trim();
            const category = $(list).find('.txt_l').prev().text().trim(); 
            const title = $(list).find('.txt_l').text().trim();
            const detail = $(list).find('.txt_l > a').attr('href');
            const applyDate = $(list).find('.txt_l').next().text().trim();
            const local = $(list).find('td').eq(4).text().trim();
            const agency = $(list).find('td').eq(5).text().trim();
            const postDate = $(list).find('td').eq(6).text().trim();
            const views = $(list).find('td').last().text().trim();
           
            const detailUrl = baseUrl+detail;
            // console.log(detail);

            //console.log(detailUrl);    
            await detailData(detailUrl);


        }
        

    } catch (error) {
        console.error('Error scraping data:', error);
    }

}

async function detailData(detailUrl) {

    //const browser = await puppeteer.launch();
    //const page = await browser.newPage();

    try{
        const detailHtml = await axios.get(detailUrl);
        const $ = cheerio.load(detailHtml.data);    
        
        const category = $('.category').text().trim();
        const title = $('h2.title').text().trim();

        // const test = $('.title_area').html();
        // console.log('title_area의 html요소', test);
        
       

        const local = $('.view_cont').find('.txt').eq(0).text().trim();
        const agency = $('.view_cont').find('.txt').eq(1).text().trim();
        
        let applyDate = $('.view_cont').find('.txt').eq(2).text().trim();
        applyDate = applyDate.replace(/[\n\t]/g, '');
        const date = applyDate.split('~');

        const summary= $('.view_cont').find('.txt').eq(3).text().trim();
        const applyWay = $('.view_cont').find('.txt').eq(4).text().trim();
        const contact = $('.view_cont').find('.txt').eq(5).text().trim();
        
        //const viewer = $('#iframe').html();
        
        const attachedFile = $('div.right_btn').eq(0).find('a').eq(1).attr('href');
        const outputFile = $('div.right_btn').eq(1).find('a').eq(1).attr('href');

        console.log(date);
        console.log(date.length);
        //console.log(applyDate.length);
        //console.log(outputFile);
        
        //Puppeteer 동적 스크래핑을 위한 라이브러리를 사용해야 함. 그래야 qr코드 이미지가 스캔된다.
        // await page.goto(detailUrl, { waitUntil: 'networkidle2' });
        // const qrImg = await page.evaluate(() => {
        //     return document.querySelector('#qr_img_tit')?.src || 'QR 이미지 X';
        // });
        // console.log('QR Image Src:', qrImg);
        //#iframe 이름 스크래핑은 puppeteer로 진행해야함

        //본문출력 바로보기는 puppeteer로 진행해야함
        //const outputFileViewer = $('div.right_btn').eq(1).find('a').eq(0).attr('href');
        //const outputFileViewertitle = $('div.right_btn').eq(1).find('a').eq(0).attr('title');
        

    }catch(error){
        console.error('Error fetching detail page', error);
    }

};

scrapeData();


