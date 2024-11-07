import axios from "axios";
import puppeteer from 'puppeteer';
import { saveDetail, getAllPathIds } from '../db/db.js';

const chunkSize = 50;
const maxConcurrentPages = 5;
const baseUrl = 'https://www.sbiz24.kr/#/pbanc';


const axiosInstance = axios.create({
    timeout: 60000, // 60초 타임아웃
    headers: {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
        
        'Cache-Control': 'max-age=0',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': 'https://www.sbiz24.kr/#/pbanc',
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


// 페이지네이션에서 총 페이지 수 추출
async function getTotalPage() {
    let browser;
    try {
        browser = await puppeteer.launch({ 
            headless: true, 
            timeout:30000,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']});
        const page = await browser.newPage();
        await page.goto(baseUrl);
        await page.waitForSelector('ul.pagination');

        // 마지막 페이지 버튼 클릭
        await page.click('ul.pagination li.btn-last button');
        await new Promise(resolve => setTimeout(resolve, 1000));

        // 총 페이지 수 추출
        const totalPages = await page.evaluate(() => {
            const activePageButton = document.querySelector('ul.pagination li.page-item.active button');
            return parseInt(activePageButton.innerText, 10);
        });

        return totalPages;
    } catch (error) {
        console.error('getTotalPage 함수에서 오류 발생:', error);
        throw error; // 에러를 상위 함수로 전달
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}


//pathID 필터링
async function filterPathId(scrapedData, siteName) {
    try {
        const existingPathIds = await getAllPathIds(siteName);
        if (!Array.isArray(existingPathIds)) {
            throw new Error('Existing Path IDs is not an array');
        }
        if (!Array.isArray(scrapedData)) {
            throw new Error('Scraped Data는 배열이 아닙니다');
        }
        return scrapedData.filter(data => !existingPathIds.includes(data.pathId));
    } catch (error) {
        console.error('sosanggongin Error fetching existing path IDs:', error);
        return [];
    }
}

//상세페이지 URL 생성
async function getDetailUrls(page) {
    try {
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

        // 페이지의 테이블이 로드될 때까지 대기
        await page.waitForSelector('table.q-table tbody', { timeout: 10000 });

        const result = await page.evaluate(() => {
            const rows = Array.from(document.querySelectorAll('table.q-table tbody tr.q-tr.cursor-pointer'));
            console.log('현재 페이지의 모든 행 수:', rows.length); // 추가된 로그

            // 현재 페이지의 신청 상태를 확인
            const hasApplicationClosed = rows.some(row => {
                const applyStatus = row.querySelector('td.c_aplyPsbltySe span');
                
                return applyStatus && applyStatus.textContent.trim() === '신청마감';
            });

            console.log('현재 페이지의 신청마감 여부:', hasApplicationClosed);
            // 신청가능한 링크 추출
            const links = rows
                .filter(row => {
                    const applyStatus = row.querySelector('td.c_aplyPsbltySe span');
                    return applyStatus && applyStatus.textContent.trim() === '신청가능'; // innerText 대신 textContent 사용
                })
                .map(row => {
                    const linkElement = row.querySelector('td.c_pbancNm a');
                    if (!linkElement) {
                        console.warn('링크 요소를 찾을 수 없습니다.');
                        return null;
                    }
                    const href = linkElement.getAttribute('href'); // getAttribute를 사용하여 href 추출
                    const uniqueIdMatch = href.match(/pbanc\/(\d+)/);
                    const uniqueId = uniqueIdMatch ? uniqueIdMatch[1] : '';
                    const url = uniqueId ? `https://www.sbiz24.kr/#/pbanc/${uniqueId}` : '';
                    return { url, uniqueId };
                })
                .filter(link => link !== null); // null 값을 필터링
                console.log('현재 페이지에서 추출된 링크 수:', links.length);
                return { links, hasApplicationClosed };
            });
            
        return result;
    } catch (error) {
        console.error('sosanggongin getDetailUrls 함수에서 오류 발생:', error);
        return { links: [], hasApplicationClosed: false };
    }
}

//상세페이지 스크랩
async function scrapeDetails(url, page) {
    try {
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
        await page.setViewport({ width: 1280, height: 800 });

        await page.setRequestInterception(true);
        console.log('상세페이지 스크랩 시작합니다.');
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
        await await new Promise((page) => setTimeout(page, 500));
        console.log('상세페이지 로드 완료');
        await page.waitForSelector('div.form-group ', { visible: true, timeout: 90000 });
        await page.waitForFunction(() => document.readyState === 'complete', { timeout: 60000 });

        const result = await page.evaluate((pageUrl) => {
            const data = {
                site: null,
                title: null,
                applySite: pageUrl,
                pathId: null,
                category: null,
                projectType: null,
                businessPeriod: null,
                requestStartedOn: null,
                requestEndedOn: null,
                contents: null,
                attachmentFile: [],
                location: null,
                contentImage: []
            };
            const siteName='sosanggongin24';
            data.site = siteName;

            const url = new URL(pageUrl);
            const hashPart = url.hash.replace('#/', ''); // '#/'를 제거
            data.pathId = hashPart.split('/').pop() || null;
            console.log('pathId:', data.pathId);

            const labels = Array.from(document.querySelectorAll('.form-group .form-field'));
            labels.forEach(field => {
                const parentDiv = field.closest('div.form-field');
                if (parentDiv && getComputedStyle(parentDiv).display === 'none') {
                    return; // display: none인 경우 스킵
                }
               // console.log(labels);

                const label = field.querySelector('label.ul-label');
                const span = field.querySelector('.form-wrap span');
                console.log(label);
                console.log(span);
                
                const labelTitle = label ? label.getAttribute('title') : null;
                const text = span ? span.textContent.trim() : null;
                console.log(`라벨 타이틀: ${labelTitle}`);
                console.log(`스팬 텍스트: ${text}`);
                 
                if (!text) {
                    console.log(`Warning: span의 텍스트가 비어 있습니다. labelTitle: ${labelTitle}`);
                } else {
                    console.log(`Info: span의 텍스트가 존재합니다. labelTitle: ${labelTitle}, text: ${text}`);
                }

                switch (labelTitle) {
                    case '공고명':
                        data.title = text;
                        //console.log(`공고명: ${data.title}`);
                        if (text.includes('[')) {
                            const locationMatch = text.match(/\[([^\]]+)\]/);
                            if (locationMatch) {
                                const locationText = locationMatch[1].trim();
            
                                const knownLocations = ['서울', '부산', '대구', '광주', '대전', '인천', '충청', '경기', '울산', '경북', '경남', '강원']; // 예시로 일부 지역명
                                const locationFound = knownLocations.some(location => locationText.includes(location));
                                if (locationFound) {
                                    data.location = locationText;
                                    //console.log(`지역: ${data.location}`);
                                }
                            }
                        }
                        break;
                    case '모집유형':
                        data.category = text;
                        //console.log(`모집유형: ${data.category}`);
                        break;
                    case '지원사업유형명':
                        data.projectType = text;
                        //console.log(`지원사업유형명: ${data.projectType}`);
                        break;
                    case '사업기간':
                        data.businessPeriod = text;
                        //console.log(`사업기간: ${data.businessPeriod}`);
                        break;
                    case '접수기간':
                        const dates = text.split('~').map(date => date.trim());
                        if (dates.length > 0) data.requestStartedOn = dates[0];
                        if (dates.length > 1) data.requestEndedOn = dates[1];
                        // console.log(`신청시작일: ${data.requestStartedOn}`);
                        // console.log(`신청마감일: ${data.requestEndedOn}`);
                    break;
                    case '공고내용':
                        const pElements = Array.from(document.querySelectorAll('div.f_pbancDtlCn div.form-wrap p'));
                        const contentsTexts = [];
                        const images = [];

                        pElements.forEach(p => {
                            // 텍스트 추출
                            const pText = p.textContent.trim();
                            if (pText.length > 0) {
                                contentsTexts.push(pText);
                            }

                            // 이미지 src 추출
                            const imgElements = p.querySelectorAll('img');
                            imgElements.forEach(img => {
                                const imgSrc = img.getAttribute('src');
                                if (imgSrc) {
                                    images.push(imgSrc);
                                }
                            });
                        });

                        data.contents = contentsTexts.join('\n');
                        data.contentImage = images;
                        break;
                    case '첨부파일':
                        const allDownloadLink = document.querySelector('div.file-group a[href]');
                        if (allDownloadLink) {
                            data.attachmentFile.push({
                                name: '전체 다운로드',
                                url: allDownloadLink.href
                            });
                        }
                        
                        break;
                    default:
                        break;
                
                }
            });
            
            if (!data.contentImage || data.contentImage.length === 0) {
                data.contentImage = null; 
            } else {
                data.contentImage = JSON.stringify(data.contentImage); 
            }
            return data;
        }, url);
        

        //개별 다운로드 링크를 추출하기 위한 클릭 이벤트 설정
        const individualLinks = [];
        page.on('request', request => {
            if (request.url().includes('/api/cmmn/file/') && (request.method() === 'GET' || request.method() === 'POST')) {
                //console.log(`다운로드 요청 URL: ${request.url()}`);
                individualLinks.push(request.url());  // 다운로드 URL을 배열에 저장
                request.abort();  // 다운로드 요청 차단
            } else {
                request.continue();
            }
        });

        // 개별 다운로드 버튼 클릭
        await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('.file-group button'));
            buttons.forEach(button => {
                if (!button.title.includes('미리보기') && button.style.display !== 'none') {
                    button.click();
                }
            });
        });

        // 페이지의 다운로드 링크를 배열에 추가
        result.attachmentFile = result.attachmentFile.concat(individualLinks.map(url => ({
            name: '개별 다운로드',
            url
        })));


        //console.log('추출된 데이터:', result);
        return result;
    } catch (error) {
        console.error(`sosanggongin 상세페이지 스크랩 에러 from ${url}:`, error);
        return null;
    }
}

//상세페이지 멀티스크랩
async function scrapeMultipleDetails(urls) {
    let browser = await puppeteer.launch({ 
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']});
    const pagePromises = [];
    for (const url of urls) {
        const page = await browser.newPage();
        try {
            const result = await scrapeDetails(url, page);
            pagePromises.push(result); // 결과를 수집합니다.
        } catch (error) {
            console.error(`Error scraping ${url}:`, error);
            pagePromises.push(null); // 에러가 발생하면 null을 추가합니다.
        } finally {
            await page.close(); // 페이지를 닫습니다.
        }
    }
    
    await browser.close();
    return pagePromises;
}

//스크랩 시작
async function sosanggonginmadang() {
    const siteName = 'sosanggongin24';
    let browser;
    try {
        //총페이지수 추출
        const totalPage = await getTotalPage();
        console.log(`총 페이지 수: ${totalPage}`);

        browser = await puppeteer.launch({ 
            headless: true, 
            timeout:0,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
         });
        const page = await browser.newPage();

        await page.goto(baseUrl);
        await page.waitForSelector('table.q-table tbody', { visible: true, timeout: 30000 });
        const allLinks = [];
        let shouldStop = false; // 페이지 스크래핑 종료 플래그

        for (let i = 1; i <= totalPage && !shouldStop; i++) {
            console.log(`${i} 페이지에서 상세 URL을 추출중입니다.`);

            if (i > 1) {
                // 페이지 이동 시 버튼 클릭
                console.log(`페이지 ${i} 이동 중...`);
                await page.click(`ul.pagination li.page-item:nth-child(${i + 2}) button`);
                console.log(`페이지 ${i} 클릭 완료`);
                // 페이지 로드 대기
                await page.waitForSelector('table.q-table tbody', { timeout: 10000 }); // 페이지가 완전히 로드될 때까지 대기
                console.log(`${i}페이지 로드가 완료되었습니다`);
            } else {
                await page.waitForSelector('table.q-table tbody', { timeout: 10000 });
                console.log(`${i}페이지 로드가 완료되었습니다`);
            }

            // 상세 URL을 추출합니다
            const { links, hasApplicationClosed } = await getDetailUrls(page);
            console.log(`페이지 ${i}에서 ${links.length} 개의 URL을 추출했습니다.`); // 각 페이지에서 URL 개수 확인

            allLinks.push(...links);
            shouldStop = hasApplicationClosed; // '신청마감' 페이지 발견 시 종료

            if (shouldStop) {
                console.log('신청마감 포함된 페이지 발견. 스크래핑 종료.');
                break;
            }
        }

        // 중복 URL 제거
        const uniqueLinks = Array.from(new Set(allLinks.map(link => link.url)));
        const uniquePathIds = Array.from(new Set(allLinks.map(link => link.uniqueId)));

        // allData 배열로 결합
        const allData = uniqueLinks.map((url, index) => ({
            url,
            pathId: uniquePathIds[index]
        }));
        // console.log(`중복없는 detailUrl: `+allData.uniqueLinks);
        //console.log('allData 구조 확인: '+JSON.stringify(allData, null, 2));
        
        
        //pathId 중복체크
        const filteredData = await filterPathId(allData, siteName);
        if (filteredData.length === 0) {
            console.log('모든 데이터가 필터링 되었습니다. 새로운 데이터가 없습니다.');
            return;
        }
        console.log(`필터링 된 ${filteredData.length} 개의 페이지를 스크랩해서 DB에 삽입할 수 있습니다.`);


        console.log(`상세페이지 스크랩 시작합니다`);
        const detailedData = await scrapeMultipleDetails(filteredData.map(data => data.url));

        await saveDataInChunks(detailedData, siteName);

    } catch (error) {
        console.error('에러 sosanggongin() 함수:', error);
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

//데이터 insert
async function saveDataInChunks(data, siteName) {
    console.log(`Total data to insert: ${data.length}`);
    for (let i = 0; i < data.length; i += chunkSize) {
        const chunk = data.slice(i, i + chunkSize);
        try {
            await saveDetail(chunk, siteName);
        } catch (error) {
            if (error.code === 'ER_DUP_ENTRY') {
                console.warn('Duplicate entry found.');
            } else {
                console.error('Failed to insert all data:', error);
                throw error;
            }
        }
    }
}

sosanggonginmadang();
export default sosanggonginmadang;
