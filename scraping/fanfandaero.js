import axios from 'axios';
import * as cheerio from "cheerio";
import { saveDetail, getAllPathIds } from '../db/db.js';

const chunkSize = 50;
const baseUrl = 'https://fanfandaero.kr/portal/preSprtBizPbanc.do';
const pageUnit = 8;

const axiosInstance = axios.create({
    timeout: 60000, // 60초 타임아웃
    headers: {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.3',
        'Cache-Control': 'max-age=0',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': 'https://fanfandaero.kr/portal/preSprtBizPbanc.do',
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

async function getPathid() {
    const listUrl = 'https://fanfandaero.kr/portal/selectSprtBizPbancList.do';
    const sprtBizCdList = [];
    let pageIndex = 1;

    while (true) {
        try {
            console.log(`${pageIndex}페이지 pathid 추출 시작합니다`);
            
            const response = await axiosInstance.post(listUrl, {
                pageIndex: pageIndex,
                pageUnit: pageUnit
              } );
            const data = response.data;
            //console.log(response.data);
            // 실제 pathId 추출 로직을 여기에 추가
            let dataFound = false;
           
            if (data.sprtBizApplList && Array.isArray(data.sprtBizApplList)) {
                const codes = data.sprtBizApplList.map(item => item.sprtBizCd);
                if (codes.length > 0) {
                  sprtBizCdList.push(...codes);
                  dataFound = true;
                } else {
                  console.log(`페이지 ${pageIndex}에 sprtBizCd가 없습니다.`);
                  break;
                }
            } else {
                console.log(`페이지 ${pageIndex}에 sprtBizApplList가 없습니다.`);
                break;
            }

            if (!dataFound) {
                console.log(`페이지 ${pageIndex}에 pathId가 없습니다.`);
                break;
            }

            // 다음 페이지로 이동
            pageIndex++;
        } catch (error) {
            if (error.response && error.response.status === 404) {
                console.log(`페이지 ${pageIndex}가 존재하지 않습니다. 추출 종료.`);
                break;
            }
            console.error(`페이지 ${pageIndex} 추출 중 오류 발생:`, error.message);
            break;
        }
    }   
    //console.log('sprtBizCdList 체크:',sprtBizCdList);
    return sprtBizCdList;
}

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

async function scrapeDetailPage(pathId, siteName){
    
    try{
        const data = {
            site: siteName,
            title: null, 
            pathId: pathId,
            category: null,
            projectType:null, //사업유형
            requestStartedOn: null, //신청기간
            requestEndedOn: null,
            businessPeriod: null, //사업기간
            businessPerpose: null,//사업목적
            announcementDate: null,//공고일
            overview: null,//사업개요,목적
            recruitoverview: null,//모집개요
            requirement: null,//신청자격
            supportTarget: null, //지원대상
            supportScale:null, //지원규모
            assistance: null,//지원내용
            applicationProcess: null,//선정방법,지원절차
            applyMethod: null,//신청방법
            applySite: null,
            contentImage: [],
            document: null,//제출서류
            contact: [],//문의처
            caution: null,//유의사항
            etc: null,//기타사항
            attachmentFile: [],//첨부파일
            contents: null, //주요내용 넣어야겠다
            location: null
        }
        const detailUrl = 'https://fanfandaero.kr/portal/selectSprtBizPbancDetailSummaryList.do';
        const response = await axiosInstance.post(detailUrl, {sprtBizCd: pathId} );
        const json = response.data;
        //console.log(json);
     
        data.title = json.resultSummaryList.sprtBizNm;
        data.category = json.resultSummaryList.sprtBizTyNm;
        data.projectType = json.resultSummaryList.sprtBizCg1Nm;
        data.requestStartedOn = json.resultSummaryList.rcritBgngYmd;
        data.requestEndedOn = json.resultSummaryList.rcritEndYmd;
        data.location = '전국';

        const detailUrl2='https://fanfandaero.kr/portal/selectSprtBizPbancDetailInfoList.do';
        const response2 = await axiosInstance.post(detailUrl2, {sprtBizCd: pathId} );
        const json2 = response2.data;
        //console.log(json2);
        //itemNm, txtDc, fileStreCours값이 세가지 있는데 fileStrecours가 null이 아니고 txtDc가 null이면 fileStreCours값 추출, 둘다 null이 아니면 txtDe와 fileStreCours값을 합쳐서 삽입
        const fileURl = 'https://fanfandaero.kr/download.do?fileName=';
        const imgUrl = 'https://fanfandaero.kr/downloadEncrypt.do?fileName=';
        json2.spinPb.spinPbScDList.forEach(spinPbScD => {
            spinPbScD.spinPbImDList.forEach(item => {
            const { itemNm,txtDc, fileStreCours, fileStreCoursOrg, itemWonFileNm, itemBgngYmd, itemEndYmd, spinPbPdDList } = item;

            if (item.fileStreCours && item.itemWonFileNm) {
                const fileExtension = item.itemWonFileNm.split('.').pop().toLowerCase();
                if (['jpg', 'png'].includes(fileExtension)) {
                    const imgdownloadLink = `https://fanfandaero.kr/downloadEncrypt.do?fileName=${item.fileStreCours}`;
                    const imgName = item.itemWonFileNm;
                    data.contentImage.push({imgNm:imgName, imgUrl:imgdownloadLink});
                } else if (['pdf', 'hwp', 'hwpx'].includes(fileExtension)) {
                    const filedownloadLink = `https://fanfandaero.kr/download.do?fileName=${item.fileStreCoursOrg}&wonFileName=${item.file}`;
                    const fileNm = item.itemWonFileNm;
                    data.attachmentFile.push({fileNm:fileNm, fileURl:filedownloadLink});
                }
            }
            // console.log(data.contentImage);
            // console.log(data.attachmentFile);

            if (spinPbScD.seNm === '문의처') {
                data.contact.push({ itemNm, txtDc });
            }
            //console.log('공고제목: ',data.title, ' 문의처: ', data.contact);

            // itemNm에 따라 적절한 필드에 값 할당
            switch (itemNm) {
                case '사업목적':
                    data.businessPerpose = item.txtDc;
                    //console.log('사업목적: '+data.businessPerpose);
                    break;
                case '사업기간':
                    if (itemBgngYmd && itemEndYmd) {
                        data.businessPeriod = `${itemBgngYmd} ~ ${itemEndYmd}`;
                    }
                    //console.log('사업기간: '+data.businessPeriod);
                    break;
                case '지원대상':
                    if (txtDc) data.supportTarget = item.txtDc;
                    //console.log('지원대상: '+data.supportTarget);
                    break;
                case '지원규모':
                    if (txtDc) data.supportScale = item.txtDc;
                    //console.log('지원규모: '+data.supportScale);
                case '지원내용':
                    if (txtDc) data.requirement = txtDc;
                    //console.log('지원내용: '+data.assistance);
                    break;
                case '신청자격':
                    if (txtDc) data.requirement = item.txtDc;
                    //console.log('신청자격: '+data.requirement);
                    break;
                case '제출서류':
                    if (txtDc) {
                        const spinPbDcDList = item.spinPbDcDList || [];
                        spinPbDcDList.forEach(dcItem => {
                            if (txtDc.startsWith('f1')) {
                                data.document = dcItem.addDc || ''; // 필요한 필드에 저장
                            } else {
                                data.document = txtDc; // txtDc를 기본값으로 저장
                            }
                        });
                    }
                    //console.log('제출서류: '+data.document);
                    break;
                case '진행절차':
                    const spinPbPdDList = item.spinPbPdDList || []; // spinPbPdDList 가져오기
                    if (spinPbPdDList.length > 0) {
                        data.applicationProcess = spinPbPdDList.map(pecdItem => pecdItem.pecdItemNm).join(', ');
                    } else if (txtDc) {
                        const fileExtension = txtDc.split('.').pop().toLowerCase();
                        if (!['jpg', 'png', 'pdf', 'hwp', 'hwpx'].includes(fileExtension)) {
                            data.applicationProcess = null;
                        } else {
                            data.applicationProcess = txtDc;
                        }
                    }
                    //console.log('공고제목: '+data.title+' 진행절차: '+data.applicationProcess);
                    break;
                default:
                    break;
            }
        });
    });

    return data;
    }catch(error){
        console.log('상세페이지스크랩 중 에러 발생', error);
    }

}

async function fanfandaero() {
    const siteName = 'fanfandaero';
    try{
        //page별 pathId 구하는 함수
        const pathIds = await getPathid();
        //pathId 필터링 함수
        const filterePathIds = await filterPathId(pathIds,siteName);
        if (filterePathIds.length === 0) {
            console.log('모든 데이터가 필터링되었습니다. 새로운 데이터가 없습니다.');
            return;
        }
        console.log(`필터링된 후 데이터 개수: ${filterePathIds.length}`);

        //상세페이지 스크랩 함수
        const deatailDataPromises = filterePathIds.map(pathId => 
            scrapeDetailPage(pathId, siteName).then(data => ({ ...data, site: siteName }))
        );
        //데이터 promise.all() 처리
        const filteredDataResults = await Promise.all(deatailDataPromises);
        
        //db 데이터 저장함수
        await saveDataInChunks(filteredDataResults, siteName);
    

    } catch(error){
        console.log('fanfandaero() 에러 발생', error);
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

//fanfandaero();
export default fanfandaero;