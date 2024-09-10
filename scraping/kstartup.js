import axios from "axios";
import * as cheerio from "cheerio";
import { saveDetail, getAllPathIds } from '../db/db.js';

const chunkSize = 50;
const row = 20;
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


//pathId 필터링
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

//pathId 추출하는 함수
async function getPagePathId(payload, startPage = 1) {
    const pathIds = [];
    let page = startPage;

    while (true) {
        try {
            console.log('pathid추출 시작합니다');
            const response = await axiosInstance.post(`${postUrl}page=${page}`, {...payload});
            const html = response.data;
            const $ = cheerio.load(html);
            //console.log(response.data);
            // 실제 pathId 추출 로직을 여기에 추가
            let dataFound = false;
            $('ul .notice').each((index, element) => {
                const href = $(element).find('div.right > div.middle > a').attr('href');
                if (href) {
                    const regex = /javascript:go_view\((\d+)\)/;
                    const match = href.match(regex);
                    if (match) {
                        const pathId = match[1];
                        console.log(pathId);
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
async function scrapeDetailPage(pbancClssCd){
    try{
        axios
    } catch{

    }
}

async function kstartup(){
    //PBC010이 공공기관, PBC020이 민간기관

    //공공기관, 민간기관 공고 목록에서 페이지 별로 pathId 추출하는 함수
    const siteName = 'kstartup';
    let allPathIds = {};
    for (const payload of payloads) {
        console.log(`Fetching pathIds for payload with pbancClssCd: ${payload.pbancClssCd}`);
        const pathIds = await getPagePathId(payload);
        allPathIds[payload.pbancClssCd] = pathIds;
        console.log(`${payload.pbancClssCd}에서 추출된 pathIds:`, pathIds);
    }
    console.log(allPathIds);


     const filterePathIds = await filterPathId(siteName, allPathIds);
    // if (filterePathIds.length === 0) {
    //     console.log('모든 데이터가 필터링되었습니다. 새로운 데이터가 없습니다.');
    //     return;
    // }


    //상세페이지 스크랩 함수
    // for (const pathId of filteredPublicPathIds) {
    //     await scrapeDetailPage(pathId);
    // }

    // for (const pathId of filteredPrivatePathIds) {
    //     await scrapeDetailPage(pathId);
    // }

    //배치로 데이터 저장하는 함수


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