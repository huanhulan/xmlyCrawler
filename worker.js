const puppeteer = require('puppeteer');
const http = require('http');
const fsPath = require('fs-path');
const path = require('path');

const processHubCreator = require('./processHubCreator');
const cfgs = require('./confs');
const cp = require('child_process');

const dirname = path.join(__dirname, cfgs.DIR);
const evtHub = processHubCreator(process);

let isIdling = true;

const sleep = async (timeout) => await new Promise((resolve, reject) => {
    setTimeout(() => {
        resolve()
    }, timeout);
});

const crawler = async (pageURL) => {
    try {
        const browser = await puppeteer.launch();
        const page = await browser.newPage();
        let title;
        let filename;

        const handleResp = async (response) => {
            try {
                const url = response.url();
                if (!url) {
                    return;
                }
                const split = url.split('/');
                tmp = split[split.length - 1];

                if (filename) {
                    // console.log(`Get new chunks of ${filename} from ${pageURL} on chrome, skip download initialization.`)
                    return;
                }
                if (!tmp.includes('m4a')) {
                    // console.log(`wrong file name of ${filename} from ${pageURL} on chrome, skip download initialization.`)
                    return;
                }

                filename = tmp;
                console.log(`Start downloading ${filename} from ${pageURL} on chrome, initialize download...`)
                download(url, title);
                evtHub.emit('close-browser')
            } catch (e) {
                console.log(`Error when processing response ${url} on page ${pageURL}, retrying`)
                handleResp(response)
            }

        }

        page.on('response', handleResp);

        page.on('load', async () => {
            try {
                console.log(`Load ${pageURL} successfully`);
                // for js initialization
                await sleep(500);
                title = await page.evaluate(() => document.querySelector('.HoAz.title-wrapper').innerText);
                await page.click('.HoAz.play-btn')
            } catch (e) {
                console.error(`Fail to find play button on ${pageURL}, restart`)
                setTimeout(() => crawler(pageURL), 100)
            }
        })

        await page.goto(pageURL, { waitUntil: 'networkidle2' });
        evtHub.once('close-browser', () => {
            browser.close();
        });
    } catch (e) {
        console.error(`Fail to load ${pageURL} on ${process.pid}, restart`)
        setTimeout(() => crawler(pageURL), 100)
    }
}


function idle() {
    isIdling = true;
    console.log("hello I am idling")
    evtHub.send("idle", { pid: process.pid })
}


function download(url, title) {
    var req = http.get(url, function (res) {
        const split = url.split('/');
        let filename = split[split.length - 1];
        var chunkData = "";
        res.setEncoding("binary"); //一定要设置response的编码为binary否则会下载下来的图片打不开
        res.on("data", function (chunk) {
            chunkData += chunk;
        });
        res.on("end", async () => {
            const localFileName = path.join(dirname, title + '.m4a')
            fsPath.writeFile(localFileName, chunkData, "binary", async function (err) {
                if (err) {
                    console.error(`Fail to download ${url}: ${err}`);
                }

                console.log(`Downloaded ${url}`);
                evtHub.emit('finish-workload', { pid: process.id })
                await sleep(200);
                evtHub.emit('idle', { pid: process.id })
            });
        });
        res.on("error", async function (err) {
            console.error(`Download request error! Ready to restart download ${url}`);
            await sleep(100)
            download(url, title)
        });
    })
}

evtHub.on('idle', idle);
evtHub.on('finish-workload', () => {
    evtHub.send('finish-workload', { pid: process.pid })
})
evtHub.on('start-workload', async function ({ link, pid }) {
    if (!isIdling || process.pid !== pid) { return }
    isIdling = false;
    await crawler(link);
});
idle();