const cp = require('child_process');
const cpus = require('os').cpus();
const puppeteer = require('puppeteer');
const mkdirp = require('mkdirp');
const path = require('path');
const cfgs = require('./confs');
const processHubCreator = require('./processHubCreator');

function union(list) {
    const tmp = {};
    for (let link of list) {
        tmp[link] = 0 || tmp[link]++
    }
    return Object.keys(tmp);
}

async function getPageLinks(browser, pageURL) {
    const page = await browser.newPage();
    await page.goto(pageURL, { waitUntil: 'networkidle2' });
    const pageLinks = await page.evaluate(() => Array.prototype.slice.call(document.querySelectorAll('.Yetd.page-item>a')).map(
        a => a.href
    ));
    await page.close();
    return union(pageLinks);
}

async function getBroadCastList(browser, pageURL) {
    console.log(`Start to get broadcast list in ${pageURL}`)
    const page = await browser.newPage();
    await page.goto(pageURL, { waitUntil: 'networkidle2' });
    const broadCastList = await page.evaluate(() => Array.prototype.slice
        .call(document.querySelectorAll('li.dOi2>.dOi2.text>a'))
        .map(
            a => a.href
        )
    );
    console.log(`Get broadcast list in ${pageURL}: ${broadCastList.join(', ')}`)
    await page.close();
    return broadCastList;
}


(async function main() {
    const browser = await puppeteer.launch();

    console.log('Ready to get page links');
    const pageLinks = await getPageLinks(browser, cfgs.PAGE_URL);
    console.log(`Got pages ${pageLinks.join(', ')}`);

    let totalBroadCastLinks = [];
    const processPool = [];

    mkdirp(path.join(__dirname, cfgs.DIR), function (err) {
        if (err) {
            return console.error(err);
        }
        console.log("Directory created successfully!");
    });

    for (let pageLink of pageLinks) {
        const tmp = await getBroadCastList(browser, pageLink);
        totalBroadCastLinks = totalBroadCastLinks.concat(tmp);
    }
    const totalCount = totalBroadCastLinks.length;
    let finishedCount = 0;
    console.log(`Got broad bast links, total counts ${totalCount}`);

    function registerBuilder(process) {
        const evtHub = processHubCreator(process);

        evtHub.on('finish-workload', ({ pid }) => {
            finishedCount += 1;
            console.log(`Sub process[${pid}] finished, jobs remaining ${totalCount - finishedCount}`)
            try {
                if (finishedCount === totalCount) {
                    console.log('All done');
                    killAll();
                }
            } catch (e) {
                console.error('error when cleaning up...')
            }
        });

        evtHub.on('idle', ({ pid }) => {
            const link = totalBroadCastLinks[0];
            if (!link) {
                return;
            }
            try {
                console.log(`Assign ${link} to ${pid}`)
                dispatchJob(link, pid);
            } catch (e) {
                console.error(`error on main process when dispatch new job to ${pid}, retring...`);
                dispatchJob(link, pid);
            }
        });

        function dispatchJob(link, pid) {
            evtHub.send('start-workload', {
                link,
                pid
            });
            totalBroadCastLinks = totalBroadCastLinks.slice(1)
        }
    }



    function killAll() {
        for (subProcess of processPool) {
            console.log(`kill sub process`)
            subProcess.kill(subProcess.pid);
        }
        console.log(`kill main process`)
        process.exit(1);
    }

    /**
     * spawn the child process
     */
    var fork = cp.fork;
    for (var i = 0; i <= cpus.length - 1; i++) {
        console.log('Spawning sub process');
        const childProcess = fork('./worker.js');
        processPool.push(childProcess);
        registerBuilder(childProcess)
    }

    process.on('exit', function (code) {
        return console.log(`About to exit with code ${code}`);
    });
})()