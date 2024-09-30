import axios from 'axios';
import * as cheerio from "cheerio";
import { saveDetail, getAllPathIds } from '../db/db.js';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const chunkSize = 50;
const listUrl = 'https://www.gbtp.or.kr/user/board.do';
const detailBaseUrl = 'https://www.gbtp.or.kr/user/boardDetail.do';
const row = 10;
const axiosInstance = axios.create({
    timeout: 60000, // 60초 타임아웃
    headers: {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.3',
        'Cache-Control': 'max-age=0',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': 'https://www.gbtp.or.kr/user/board.do',
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


async function getPathid() {
    const pathIds = [];
    let pageIndex = 1;

    while (true) {
        try {
            console.log(`${pageIndex}페이지 pathid 추출 시작합니다`);
            
            const response = await axiosInstance.post(listUrl, {
                pageIndex: pageIndex,
                recordCountPerPage : row,
                bbsId: 'BBSMSTR_000000000021',
                searchTerm: 'ing'
              } );
            const $ = cheerio.load(response.data);
            //console.log(response.data);
            // 실제 pathId 추출 로직을 여기에 추가
            let dataFound = false;
            $('table.tablelist tbody tr').each((index, element) => {
                const href = $(element).find('td.title a').attr('onclick');
                if (href) {
                    const regex = /javascript:fn_detail\('([^']+)',/;
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
    return pathIds;
}

async function scrapeDetailPage(pathId, siteName){
    const data = {
        pathId: pathId,
        site: siteName,
        title: null,
        announcementDate: null,
        manager: null,
        department:null,
        requestStartedOn: null,
        requestEndedOn: null,
        contents: null,
        contentImage: [],
        attachmentFile: []
    };
        try{

            //console.log(detailUrl);
            const detailHtml = await axiosInstance.post(detailBaseUrl, {bbsId: 'BBSMSTR_000000000021', nttNo:pathId});
            const $ = cheerio.load(detailHtml.data);

            $('table.tablelist tbody tr').each((index, element) => {
                const thElements = $(element).find('th');
                const tdElements = $(element).find('td');
              
                thElements.each((i, th) => {
                  const thText = $(th).text().trim();
                  const td = $(tdElements[i]);
                  const tdText = td.text().trim();
              
                  switch (thText) {
                    case '공고명':
                      data.title = tdText;
                      break;
                    case '접수기간/상태':
                        const dateTerm = tdText.replace(/[\n\t]/g, '').replace(/\s+/g, ' ').replace(/[()]/g, '').trim();
                        const applyDate = dateTerm.split('~');
                        data.requestStartedOn = applyDate[0]?.trim() || 'N/A';
                        data.requestEndedOn = applyDate[1]?.trim() || 'N/A';
                        break;
                    case '담당자/연락처':
                        data.manager = tdText;
                        break;
                    case '담당부서':
                        data.department = tdText;
                        break;
                    case '공고일':
                      data.announcementDate = tdText;
                        break;
                    default:
                        break;
                  }
                });
              });

            //첨부파일
            const file = $('tr');
            file.find('a.view_file_download').each((index, element) => {
                const fileNm = $(element).text().trim();
                const href = $(element).attr('onclick');
                //if(data.pathId ==='8016'|| data.pathId ==='7977'){console.log(`${data.pathId} href: `, href);}
                const match = href.match(/javascript:fn_egov_downFile\('([^']+)','([^']+)'\)/);
                if (match) {
                    const fileid = match[1];
                    const fileSn = match[2];
                    const fileUrl = `https://www.gbtp.or.kr/cmm/fms/FileDown.do?atchFileId=${fileid}&fileSn=${fileSn}`; 
                    
                    data.attachmentFile.push({
                        fileNm: fileNm,
                        fileLink: fileUrl
                    });
                }
            });

            //본문 글 or 이미지
            const board = $('td.viewcon');
            const imgTags = board.find('img');

            if (imgTags.length > 0) {
                imgTags.each((index, element) => {
                    const imgNm = $(element).attr('data-filename') || `image_${index}`;
                    const imgSrc = $(element).attr('src');
                    if (imgSrc) {
                        const base64Match = imgSrc.match(/^data:image\/(png|jpg|jpeg);base64,(.+)$/);
                        if (base64Match) {
                            try {
                                const buffer = Buffer.from(base64Match[2], 'base64'); // 디코딩
                                const now = new Date();
                                const year = now.getFullYear(); 
                                const month = String(now.getMonth() + 1).padStart(2, '0'); 
                                const day = String(now.getDate()).padStart(2, '0'); 

                                const formattedDate = `${year}-${month}-${day}`; 
                                const fileName = `${imgNm.replace(/\s+/g, '_')}_${pathId}_${index}_${formattedDate}.png` // 이미지 이름 설정
                                const filePath = path.join(__dirname, 'gbimages', fileName); // 이미지 파일 경로

                                fs.ensureDirSync(path.join(__dirname, 'gbimages')); // images 폴더 생성
                                if (!fs.existsSync(filePath)) {
                                    fs.writeFileSync(filePath, buffer); // 디코딩된 이미지 저장
                                    data.contentImage.push({ imgNm, img: filePath }); // 파일 경로 저장
                                } else {
                                    console.log(`파일이 이미 존재합니다: ${filePath}`);
                                }
                            } catch (error) {
                                console.error(`Error saving image for ${imgNm}:`, error);
                            }
                        } else if (imgSrc.startsWith('data:image/')) {
                            console.warn(`Invalid base64 format for image: ${imgNm} in URL: ${pathId}`);
                        } else {
                            // Base64가 아닐 경우 절대 경로를 사용하여 이미지 src 저장
                            const fullImgSrc = imgSrc.startsWith('/') ? `http://www.gbtp.or.kr${imgSrc}` : imgSrc;
                            data.contentImage.push({ imgNm, img: fullImgSrc });
                        }
                    } else {
                        console.warn(`imgSrc is undefined for element: ${index} in URL: ${pathIds}`);
                    }
                });
            }

            const txtArray =[];
            board.find('p').each((index, element) => {
                const ptext = $(element).text().trim();
                if (ptext) {
                    txtArray.push(ptext);
                }
            });
            if (txtArray.length > 0) {
                data.contents = txtArray.join(' ');
            }
            
            console.log(data);
            return data;
        } catch(error){
            //console.log(`scrapedetaildata()에서 에러 발생:  ${error.message}`, error);
            console.error(`scrapteDetail()에서 에러 발생: ${data.pathId}`, error)
            
        }

}

async function gbtp(){
    const siteName = 'gbtp';
    try{
        const pathIds = await getPathid();
        console.log(`총 ${pathIds.length}개의 pathId가 스크랩되었습니다.`);

        const filterPathIds = await filterPathId(pathIds,siteName);
        if (filterPathIds.length === 0) {
            console.log('모든 데이터가 필터링되었습니다. 새로운 데이터가 없습니다.');
            return;
        }
    
        console.log(`필터링된 후 데이터 개수: ${filterPathIds.length}`);

        //상세페이지 스크랩
        const detailDataPromises = filterPathIds.map(pathId => 
            scrapeDetailPage(pathId, siteName)
        );
        const detailDataResults = await Promise.all(detailDataPromises);
        const filteredDataResults = detailDataResults.filter(data => data !== null);

        //DB 저장 함수 호출
        await saveDataInChunks(filteredDataResults, siteName);

    } catch(error){
        console.log('gbtp()에서 에러가 발생 : ',error);
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

gbtp();
export default gbtp;