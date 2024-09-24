import axios from 'axios';
import * as cheerio from "cheerio";
import { saveDetail, getAllPathIds } from '../db/db.js';

const chunkSize = 50;
const row = 15;
const baseUrl ='https://www.kocca.kr/kocca/pims/list.do?menuNo=204104';
const detailBaseUrl = `https://www.kocca.kr/kocca/pims/view.do?&menuNo=204104&intcNo=`;
const fileBaseUrl = `https://pms.kocca.kr/pblanc/pblancPopupViewPage.do?pblancId=`;


const axiosInstance = axios.create({
    timeout: 60000, // 60초 타임아웃
    headers: {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.3',
        'Cache-Control': 'max-age=0',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': 'https://www.kocca.kr/kocca/pims/list.do?menuNo=204104',
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

async function getPagePathId(startPage = 1) {
    const pathIds = [];
    let page = startPage;

    while (true) {
        try {
            console.log(`${page}페이지 pathid 추출 시작합니다`);
            
            const response = await axiosInstance.get(baseUrl, { params: { pageIndex: page } } );
            const html = response.data;
            const $ = cheerio.load(html);
            //console.log(response.data);
            // 실제 pathId 추출 로직을 여기에 추가
            let dataFound = false;
            $('div.board_list01 table > tbody > tr').each((index, element) => {
                const href = $(element).find('td.AlignLeft > a').attr('href');
                if (href) {
                    const regex = /intcNo=([^&]+)/;
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

async function scrapeDetailPage(pathId, siteName){
    try{
        const detailUrl = `${detailBaseUrl}${pathId}`;
        //console.log(detailUrl);

        const detailHtml = await axiosInstance.get(detailUrl);
        const $ = cheerio.load(detailHtml.data);

        const title = $('div.board_title').text().trim();
        //console.log(`공고제목: `,title);

        const data = {
            site: siteName,
            title,
            pathId: pathId,
            category: null,
            requestStartedOn: null, //신청기간
            requestEndedOn: null,
            announcementDate: null,//공고일
            manager: null,//담당자
            overview: null,//사업개요,목적
            recruitoverview: null,//모집개요
            eventoverview: null,//행사개요
            requirement: null,//지원대상
            assistance: null,//지원내용
            applicationProcess: null,//선정방법,지원절차
            applyMethod: null,//신청방법
            applySite: null,
            contact: null,//문의처
            caution: null,//유의사항
            etc: null,//기타사항
            attachmentFile: [],//첨부파일
            contents: null
        }

        const board_info = $('div.board_info');
        board_info.find('ul.li_style01 > li').each((index, element) =>{
            const strongTitle = $(element).find('strong').text().trim();
            const span = $(element).find('span').text().trim();

            switch(strongTitle){
                case '분류':
                    data.category = span;
                    // console.log('분류: '+data.category);
                    break;
                case '접수시작일':
                    data.requestStartedOn = span;
                    // console.log('접수시작일: '+data.requestStartedOn);
                    break;
                case '접수마감일':
                    data.requestEndedOn = span;
                    // console.log('접수마감일: '+data.requestEndedOn);
                    break;  
                case '공고일':
                    data.announcementDate = span;
                    // console.log('공고일: '+data.announcementDate);
                    break;
                case '담당자':
                    data.manager = span;
                    // console.log('담당자: '+data.manager);
                    break;
                default:
                    break;
            }
        });

        const titleMap = {
            overview: ['사업목적', '사업개요'],
            requirement: ['세부내용 ', '신청자격','모집대상 및 신청자격'],
            applicationProcess: ['신청절차', '선정절차 및 평가기준', '선정방법'],
            recruitoverview: ['모집개요','참가기업 모집개요'],
            contact: ['문의처', '사업문의'],
            etc: ['기타 사항', '기타사항']
        };

        const board_cont = $('div.board_cont');
        board_cont.find('div.tender_con').each((index, element) =>{
            const conTitle = $(element).find('h4').text().trim();
            const tenderCon = $(element);
            tenderCon.find('h4').remove();
            const text = tenderCon.text().trim().replace(/<br\s*\/?>/gi, '').replace(/\n/g, '');

            let found = false;
            for (const [key, values] of Object.entries(titleMap)) {
                if (values.includes(conTitle)) {
                    data[key] = text;
                    found = true;
                    break;
                }
            }

            if(!found){            
                switch(conTitle){
                    case '행사개요':
                        data.eventoverview = text;
                        break;
                    case '지원내용':
                        data.assistance = text;
                        break;
                    case '신청방법':
                    case '신청서 접수':
                        data.applyMethod = text;
                        if (text.includes('온라인') || text.includes('온라인 접수')) {
                            const urlMatch = text.match(/https?:\/\/[^\s"'<>]+/g);
                            if (urlMatch) {
                                data.applySite = urlMatch.join(', ');
                            }
                        }
                        break;
                    case '유의사항':
                        data.caution = text;
                        break;
                    default:
                        data.contents = text;
                        break;
                }
            }
        });

        let fileList =[];
        let filelinkId='';
        //첨부파일 처리 로직
        const file = $('div.board_view01'). find('div.btn_area.area_center').eq(0);
        const fileLink = file.find('a.btn_link').attr('href');
        const regex = /javascript:openNoticeFileList2\('([^']+)'\)/;
        const fileLinkMatch = fileLink.match(regex);
        if (fileLinkMatch) {
            filelinkId = fileLinkMatch[1].trim();
        } else {
            console.log('값을 추출할 수 없습니다.');
        }
        //console.log('첨부파일 링크아이디: '+fileId);
        const fileUrl = `${fileBaseUrl}${filelinkId}`;
        fileList = await fileDownLink(fileUrl);
        //console.log(fileList);
        const policyName = '정책자료';
        const policyDownload = file.find('a.btn_download').attr('href');

        fileList.push({
            fileNm: policyName,
            fileUrl: policyDownload
        });

        // data.attachmentFile에 추가
        data.attachmentFile = fileList.map(file => ({
            fileNm: file.fileNm,
            fileUrl: file.fileUrl
        }));


        //console.log(data);
        return data;
    } catch(error){
        console.log('',error);
    }
}

async function fileDownLink(fileUrl) {
    const fileDownurl = 'https://pms.kocca.kr/file/innorix/download.do?dwnldUk=';
    try {
        //GET요청으로 fileId 가져오기
        const htmlResponse = await axios.get(fileUrl);
        const $ = cheerio.load(htmlResponse.data);

        const fileId = $('input#attfileId').attr('value');
        if (!fileId) {
            throw new Error('fileId를 HTML에서 추출할 수 없습니다.');
        }
        //console.log('추출된 fileId:', fileId);

        // POST 요청으로 파일 리스트 가져오기
        const postUrl = 'https://pms.kocca.kr/file/innorix/fileList.do';
        const headers = {
            'Accept': '*/*',
            'Accept-Encoding': 'gzip, deflate, br',
            'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
            'Connection': 'keep-alive',
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'Referer': `https://pms.kocca.kr/pblanc/pblancPopupViewPage.do?pblancId=${fileId}`,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
            'X-Requested-With': 'XMLHttpRequest'
        };

        const payload = new URLSearchParams({
            fileId: fileId,
            attachTypeId: ''
        }).toString();

        const postResponse = await axios.post(postUrl, payload, { headers: headers });


        if (postResponse.data && postResponse.data.result === 'ok') {
            const fileList = postResponse.data.fileList;
            //console.log('fileList:', JSON.stringify(fileList, null, 2));
            
            // fileList.forEach(file => {
            //     console.log(`파일명: ${file.fileNm}`);
            //     console.log(`다운로드 유니크: ${file.dwnldUk}`);
            // });

            return fileList.map(file => ({
                fileNm: file.fileNm,
                fileUrl: `${fileDownurl}${file.dwnldUk}`
            }));
        } else {
            throw new Error('예상치 못한 응답 형식입니다.');
        }
    } catch (error) {
        console.error('fileDownLink() 에러:', error);
    }
}

async function kocca(){
    const siteName = 'kocca';
    try{
        //공고 목록에서 페이지 별로 pathId 추출하는 함수
        //let allPathIds = {};
        const pathIds = await getPagePathId();
        console.log(`총 ${pathIds.length}개의 pathId가 스크랩되었습니다.`);
    
        const filterePathIds = await filterPathId(pathIds,siteName);
        if (filterePathIds.length === 0) {
            console.log('모든 데이터가 필터링되었습니다. 새로운 데이터가 없습니다.');
            return;
        }
    
        console.log(`필터링된 후 데이터 개수: ${filterePathIds.length}`);
    
        
        const detailDataPromises = filterePathIds.map(pathId => 
            scrapeDetailPage(pathId, siteName).then(data => ({ ...data, site: siteName }))
        );
        const detailDataResults = await Promise.all(detailDataPromises);
        const filteredDataResults = detailDataResults.filter(data => data !== null);
    
        //console.log(filteredDataResults);
        
    
     //배치로 데이터 저장하는 함수
    await saveDataInChunks(filteredDataResults, siteName);
    
    } catch(error){
        console.log('kocca() 에러 발생: ',error)
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

kocca();
export default kocca;
