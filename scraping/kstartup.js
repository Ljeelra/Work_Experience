import axios from "axios";
import * as cheerio from "cheerio";
import { saveDetail, getAllPathIds } from '../db/db.js';

const chunkSize = 50;
const chunkSize2 = 10;
const row = 15;
const baseUrl = 'https://www.k-startup.go.kr/web/contents/bizpbanc-ongoing.do';
const postUrl = 'https://www.k-startup.go.kr/web/module/bizpbanc-ongoing_bizpbanc-inquiry-ajax.do?'
const detailBaseUrl = 'https://www.k-startup.go.kr/web/contents/bizpbanc-ongoing.do?schM=view&pbancSn=';
const payloads = [{
    pbancClssCd: 'PBC010',
    pbancEndYn:	'N',
    schStr: 'regist',
    scrapYn: '',
    suptBizClsfcCd:	'',
    suptReginCd: '',
    aplyTrgtCd: '',
    bizTrgtAgeCd: '',
    bizEnyyCd: '',
    siEng1: 'false',
    siEng2:	'false',
    siEng3:	'false',
    siEng4:	'false',
    siKor1:	'false',
    siKor2:	'false',
    siKor3:	'false',
    siAll:	'false',
    bizPbancNm:	''
},{
    pbancClssCd: 'PBC020',
    pbancEndYn:	'N',
    schStr: 'regist',
    scrapYn: '',
    suptBizClsfcCd:	'',
    suptReginCd: '',
    aplyTrgtCd: '',
    bizTrgtAgeCd: '',
    bizEnyyCd: '',
    siEng1: 'false',
    siEng2:	'false',
    siEng3:	'false',
    siEng4:	'false',
    siKor1:	'false',
    siKor2:	'false',
    siKor3:	'false',
    siAll:	'false',
    bizPbancNm:	''
}]

const axiosInstance = axios.create({
    timeout: 60000, // 60초 타임아웃
    headers: {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.3',
        'Cache-Control': 'max-age=0',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': 'https://www.k-startup.go.kr/web/contents/bizpbanc-ongoing.do',
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


//pathId 필터링-단일배열
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

//pathId 추출하는 함수
async function getPagePathId(payload) {
    const pathIds = [];
    let page = 1;

    while (true) {
        try {
            console.log(`${page}페이지 pathid 추출 시작합니다`);
            const response = await axiosInstance.post(`${postUrl}page=${page}`, {...payload});
            const html = response.data;
            const $ = cheerio.load(html);
            //console.log($.html());
            // 실제 pathId 추출 로직을 여기에 추가
            let dataFound = false;
            $('ul .notice').each((index, element) => {
                const href = $(element).find('div.right > div.middle > a').attr('href');
                if (href) {
                    const regex = /javascript:go_view\((\d+)\)/;
                    const match = href.match(regex);
                    if (match) {
                        const pathId = match[1];
                        //console.log(pathId);
                        pathIds.push(pathId);
                        dataFound = true;
                    }
                }
            });


            if (!dataFound) {
                console.log(`페이지 ${page}에 pathId가 없습니다.`);

                break;
            }

            // 다음 페이지로 이동
            page++;
        } catch (error) {
            if (error.response && error.response.status === 404) {
                console.log(`페이지 ${page}가 존재하지 않습니다. 추출 종료.`);
                break;
            }
            console.error(`페이지 ${page} 추출 중 오류 발생:`, error.message);
            break;
        }
    }

    return pathIds;
}

//상세페이지 스크래핑 함수
async function scrapeDetailPage(pathId, siteName){
    try{
        const detailUrl = `${detailBaseUrl}${pathId}`
        //console.log(detailUrl);
        const detailHtml = await axiosInstance.get(detailUrl);
        const $ = cheerio.load(detailHtml.data);

        const title = $('#scrTitle').text().trim();
        //console.log(`공고제목: `+title);

        const data = {
            site: siteName,
            title,
            pathId: pathId,
            category: null, //지원분야
            age: null,  //대상연령
            implementingAgency: null,   //기관명
            location: null, //지역
            requestStartedOn: null, //신청기간
            requestEndedOn: null, //신청기간
            agencyCate: null,   //기관구분
            foundingHistory: null,  //창업업력
            department: null,   //부서
            contents: null, //공고문소개글
            overview: null, //XX안내
            applyMethod: null, //지원방법
            applicationProcess: null, //선정절차
            requirement: null, //신청대상
            assistance: null, //지원내용
            applySite: null,
            document: null, //제출서류
            contact: null,  //문의처
            attachmentFile: []
        }
        const box = $('.box').find('p').text();
        data.contents = box;
        
        const bgbox = $('.bg_box');
        bgbox.find('ul.dot_list-wrap li.dot_list.bl02').each((index, element) => {
            const bgtitle = $(element).find('p.tit').text().trim();
            //console.log(`p.tit값: `+bgtitle);
            const text = $(element).find('p.txt').text().trim();
            //console.log(`p.text값: `+text);

            switch (bgtitle) {
                case '지원분야':
                    data.category = text;
                    break;
                case '대상연령':
                    data.age = text;
                    break;
                case '기관명':
                    data.implementingAgency = text;
                    break;
                case '지역':
                    data.location = text;
                    break;
                case '접수기간':
                    const dates = text.split('~').map(date => date.trim());
                    data.requestStartedOn = dates[0];
                    data.requestEndedOn = dates[1];
                    break;
                case '기관구분':
                    data.agencyCate = text;
                    break;
                case '창업업력':
                    data.foundingHistory = text;
                    break;
                case '담당부서':
                    data.department = text;
                    break;
                case '문의처':
                    data.contact = text;
                    break;
                default:
                    break;
            }
        });

        
        const info = $('.information_list-wrap');
        info.find('.information_list').each((index, element) => {
            const infotitle = $(element).find('p.title').text().trim();
            //console.log(`p.title값: `+infotitle);
            const content = $(element).find('.dot_list-wrap').text().trim().replace(/[\t\n\r]+/g, ' ');
            //console.log(`content값: `+ content);
            const infodetail = $(element).find('.txt');
            

            switch (infotitle) {
                case '신청방법 및 대상':
                    data.applyMethod = infodetail.eq(1).text().trim();
                    if (data.applyMethod.includes('온라인 접수')) {
                        const applyMethodText = $(element).find('.txt-button a').attr('href');
                        if (applyMethodText) {
                            const applyUrlMatch = applyMethodText.match(/\('([^']+)'\)/);
                            data.applySite = applyUrlMatch ? applyUrlMatch[1] : null;
                        }
                    }
                    //console.log(`신청방법:`+data.applyMethod);
                    const requirementText = infodetail.eq(2).text().trim();
                    const additionalText = $('.dot_list.bl').eq(0).text().trim();
                    data.requirement = requirementText + (additionalText ? ' *' + additionalText : '');
                    break;
                case '제출서류':
                    data.document = content;
                    break;
                case '선정절차 및 평가방법':
                    data.applicationProcess = content;
                    break;
                case '지원내용':
                    data.assistance = content;
                    break;
                case '문의처':
                    data.contact = content;
                    break;
                default:
                if (infotitle.includes('교육안내') || infotitle.includes('행사안내') || infotitle.endsWith('개요')) {
                    data.overview = content;
                }
                    break;
            }
        });

        const boardFiles = $('div.board_file');
        boardFiles.find('li.clear').each((index, element) => {
            const fileName = $(element).find('a.file_bg').text().trim();
            const fileUrl = $(element).find('a.btn_down').attr('href');
            if (fileName && fileUrl) {
                data.attachmentFile.push({ name: fileName, url: fileUrl });
            }
        });

        //console.log(data);
        return data;

    } catch(error){
        console.error(`Error scraping detail page for pathId ${pathId}:`, error);
    }
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function kstartup(){
    //PBC010이 공공기관, PBC020이 민간기관
    try{
         //공공기관, 민간기관 공고 목록에서 페이지 별로 pathId 추출하는 함수
    const siteName = 'kstartup';
    let allPathIds = {};
    for (const payload of payloads) {
        console.log(`Fetching pathIds for payload with pbancClssCd: ${payload.pbancClssCd}`);
        const pathIds = await getPagePathId(payload);
        allPathIds[payload.pbancClssCd] = pathIds;
        //console.log(`${payload.pbancClssCd}에서 추출된 pathIds:`, pathIds);
    }
    //console.log(allPathIds);

    const mergePathIds = allPathIds.PBC010.concat(allPathIds.PBC020);
    console.log(`총 ${mergePathIds.length}개의 pathId가 스크랩되었습니다.`);
    //console.log('Merged Path IDs:', mergePathIds);

    const filterePathIds = await filterPathId(mergePathIds,siteName);
    if (filterePathIds.length === 0) {
        console.log('모든 데이터가 필터링되었습니다. 새로운 데이터가 없습니다.');
        return;
    }

    console.log(`필터링된 후 데이터 개수: ${filterePathIds.length}`);
    
    const detailDataResults = [];
    for (let i = 0; i < filterePathIds.length; i += chunkSize) {
        const chunk = filterePathIds.slice(i, i + chunkSize);
        const chunkResults = await Promise.all(chunk.map(async (pathId) => {
            const data = await scrapeDetailPage(pathId, siteName); 
            return data !== null ? { ...data, site: siteName } : null; 
        }));

        detailDataResults.push(...chunkResults.filter(data => data !== null)); 
        await delay(5000); // 5초 딜레이 추가
    }
    
    //배치로 데이터 저장하는 함수
    await saveDataInChunks(detailDataResults, siteName);

    }catch(error){
        console.log(`kstartup()에서 에러 발생: `, error.message);
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

kstartup();
export default kstartup;