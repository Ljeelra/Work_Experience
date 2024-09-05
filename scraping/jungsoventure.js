import axios from "axios";
import * as cheerio from "cheerio";
import { saveDetail, getAllPathIds } from '../db/db.js';

const baseUrl = 'https://www.smes.go.kr/main/sportsBsnsPolicy';
const detailBaseUrl = 'https://www.smes.go.kr/main/sportsBsnsPolicy/view';
const row = 20;
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
        'Referer': 'https://www.smes.go.kr/main/sportsBsnsPolicy',
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
async function getPageUrl(curPage) {
    const url = new URL(baseUrl);
    url.searchParams.set('cntPerPage', row);
    url.searchParams.set('curPage', curPage);
    //console.log('페이지 포함 된 URL 생성 : '+url);
    return url.toString();
}

//전체 페이지 수를 추출하는 함수
async function getTotalPage() {
    try{
        const url = await getPageUrl(1);
        const getHtml =  await axiosInstance.get(url);
        const $ = cheerio.load(getHtml.data);
        const pagenation = $('ul.paging');
        const lastPageLink = pagenation.find('a[title="마지막 페이지"]').attr('href');

        if (!lastPageLink) {
            console.error('마지막 페이지 링크를 찾을 수 없습니다.');
            return 1;
        }

        const totalPage = new URL(lastPageLink, baseUrl).searchParams.get('curPage');
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
async function scrapeData(curPage) {
    const url = await getPageUrl(curPage);
    console.log(`${curPage} 페이지 스크랩중입니다.`);
    try {
        const getHtml = await axiosInstance.get(url);
        const $ = cheerio.load(getHtml.data);
        
        const tableRows = $('.tbl-wrap:not(.map) .tbl-list01:not(#sf_table) tbody tr');
        
        const detailPromises = tableRows.map(async (index, row) => {
            const category = $(row).find('td').eq(4).text().trim();
            //console.log(category);
            const href = $(row).find('a').attr('href'); // a 태그의 href 속성 추출
            const regex = /javascript:fn_include_popOpen2\('(\d+)',\s*'(\d+)',\s*'(\w+)',\s*'([^']*)',\s*'([^']*)',\s*'([^']*)'\)/;
            const matches = href.match(regex);

            if (matches) {
                // 정규표현식으로 추출된 값
                const [pblancSeq, index, cntcInsttCd, pblancId, insttNm, pblancNowStat] = matches.slice(1);

                const finalPathId = pblancId && pblancId.trim() !== '' ? pblancId : pblancSeq;
            
                // 상세 페이지 URL 생성
                const detailUrl = new URL(detailBaseUrl);
                detailUrl.searchParams.set('viewPblancSeq', pblancSeq);
                detailUrl.searchParams.set('viewCntcInsttCd', cntcInsttCd);
                detailUrl.searchParams.set('viewPage', ''); // 빈 값일 경우 추가하지 않아도 됨
                detailUrl.searchParams.set('viewPblancId', pblancId);
                detailUrl.searchParams.set('viewInsttNm', encodeURIComponent(insttNm));
                detailUrl.searchParams.set('pblancNowStat', encodeURIComponent(pblancNowStat));
                detailUrl.searchParams.set('viewPblancNm', ''); // 빈 값일 경우 추가하지 않아도 됨
                detailUrl.searchParams.set('backCd', 'Y');
                
                return {
                    category: category,
                    pathId: finalPathId,
                    detailUrl: detailUrl.toString()
                };
                //console.log('상세 페이지 URL:', detailUrl.toString());
            } else {
                console.error('정규 표현식 불일치: href:', href);
            }
        }).get();

        return await Promise.all(detailPromises);
    } catch (error) {
        console.error('Error scraping data:', error);
        return [];
    }
}

//상세페이지 필요 데이터 추출
async function detailData(detailUrl, pathId, category) {

    try{
        const detailHtml = await axiosInstance.get(detailUrl);
        const $ = cheerio.load(detailHtml.data);    
        
        const title = $('.subject').text().trim();

        const targetTable = $('table.tbl-list01').not('#sf_table');
        const firstTdValue = targetTable.find('td').first().text().trim();
        //console.log(firstTdValue);

        const data = {
            title,
            pathId: pathId,
            category,
            implementingAgency: firstTdValue,
            overview: null,
            supportScale: null,
            assistance: null,
            requirement: null,
            requestStartedOn: null,
            requestEndedOn: null,
            applicationMethod: null,
            contact: null,
            announcementFile: null,
            location: null,
            contentImage:[]
        };

        const localMatch = title.match(/\[([^\]]+)\]/); // 대괄호 안의 모든 글자 추출
        if (localMatch) {
            data.location = localMatch[1];
        }

        $('dl').each((index, element) => {
            const subtitle = $(element).find('dt').text();
            const cleanedSubtitle = subtitle ? subtitle.trim() : '';
            
            const content = $(element).find('dd').html();
            const cleanedContent = content ? content.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim() : '';

            switch (true) {
                case cleanedSubtitle.includes('사업개요'):
                    data.overview = cleanedContent;
                    break;
                case cleanedSubtitle.includes('지원규모'):
                    data.supportScale = cleanedContent;
                    break;
                case cleanedSubtitle.includes('지원내용'):
                    data.assistance = cleanedContent;
                    break;
                case cleanedSubtitle.includes('지원대상'):
                    data.requirement = cleanedContent;
                    break;
                case cleanedSubtitle.includes('신청기간'):
                    let applyDate = cleanedContent.replace(/[\n\t]/g, ''); // 줄바꿈과 탭 문자 제거
                    const date = applyDate.split('~');
                    let requestStarted = date[0]?.trim() || 'N/A';
                    let requestEnded = date[1]?.trim();

                    if (!requestEnded || requestEnded === '') {
                        requestEnded = requestStarted;
                    } else if (!isNaN(Date.parse(requestEnded))) {
                        requestEnded = new Date(requestEnded).toISOString().split('T')[0]; // YYYY-MM-DD 형식으로 변환
                    }

                    if (!isNaN(Date.parse(requestStarted))) {
                        requestStarted = new Date(requestStarted).toISOString().split('T')[0]; // YYYY-MM-DD 형식으로 변환
                    }

                    data.requestStartedOn = requestStarted;
                    data.requestEndedOn = requestEnded;
            
                    break;
                case cleanedSubtitle.includes('신청방법'):
                    data.applicationMethod = cleanedContent;
                    break;
                case cleanedSubtitle.includes('문의처'):
                    data.contact = cleanedContent;
                    break;
                case cleanedSubtitle.includes('공고문'):
                    const fileUrl = $(element).find('dd a').attr('href');
                    data.announcementFile = fileUrl ? fileUrl.trim() : null;
                    break;
            }

            // Extract images
            $(element).find('dd img').each((i, img) => {
                const imgSrc = $(img).attr('src');
                if (imgSrc) {
                    data.contentImage.push(imgSrc.trim());
                }
            });
        });

        if (data.contentImage.length === 0) {
            data.contentImage = null; 
        } else {
            data.contentImage = JSON.stringify(data.contentImage); 
        }

        // console.log('상세페이지에서 추출된 데이터:', {
        //     title:data.title,
        //     pathId:data.pathId,
        //     category:data.category,
        //     overview: data.overview,
        //     supportScale: data.supportScale,
        //     supportContent: data.supportContent,
        //     requirement: data.requirement,
        //     requestStartedOn: data.requestStartedOn,
        //     requestEndedOn: data.requestEndedOn,
        //     contact: data.contact,
        //     announcementFile: data.announcementFile,
        //     location: data.location,
        //     contentImage: data.images
        // });

        return data;

    }catch(error){
        console.error('Error fetching detail page', error);
    }

};

async function jungsoventure() {
    const siteName = 'jungsoventure';
    try {
        const totalPages = await getTotalPage();
        const pagePromises = [];

        for (let curPage = 1; curPage <= totalPages; curPage++) {
            pagePromises.push(scrapeData(curPage));
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
            const detail = await detailData(data.detailUrl, data.pathId, data.category);
            return { ...detail, site: siteName };
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

export default jungsoventure;

