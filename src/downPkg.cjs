const fs = require('fs');
const path = require('path');
const request = require('request');
const readline = require('readline');

const dotenv = require('dotenv');
const ENV = (process.env.NODE_ENV) ? `.${process.env.NODE_ENV}` : '.prod';
const envFile = `.env${ENV}`;

// 檢查 env 文件
try {
    fs.accessSync(envFile, fs.constants.F_OK);
} catch (error) {
    console.log(`${envFile} 不存在。`);
    waitForExit(() => {
        process.exit(1); // 退出程式,返回錯誤碼 1
    });
    return;
}

// 讀取 env 文件
const { parsed: env } = dotenv.config({ path: envFile });

try {
    fs.accessSync('./package-lock.json', fs.constants.F_OK);
} catch (error) {
    console.log('package-lock.json 不存在。');
    waitForExit(() => {
        process.exit(1); // 退出程式,返回錯誤碼 1
    });
    return;
}

// 指定根據package-lock.json中記錄的信息下載依賴
const packageLock = JSON.parse(fs.readFileSync('./package-lock.json', 'utf-8'));

// 指定將依賴下載到當前目錄下的npm-dependencies-tgz目錄
const downUrl = env.UPLOAD_DIR || './npm-pkg-tgz';

if (!fs.existsSync(downUrl)) {
    fs.mkdirSync(downUrl);
}

// 收集依賴的下載路徑
const tgz = [];

// 當前下載索引
let currentDownIndex = 0;

// 下載失敗時,重試次數
const retryTimes = 3;

// 當前重試計數
let currentTryTime = 0;

// 重試次數內仍舊下載失敗的鏈接
const downloadFailTgz = [];

for (const pkg in packageLock.packages) {
    if (!packageLock.packages[pkg].resolved) continue;
    const tgzUrl = packageLock.packages[pkg].resolved.split('?')[0];
    tgz.push(tgzUrl);
}

// 下載依賴
function doDownload(url) {
    const outUrl = url.split('/').pop();
    let outUrl2 = [outUrl];
    if (outUrl.includes('?')) {
        outUrl2 = outUrl.split('?');
    }

    let outputDir = path.join(downUrl, outUrl2[0]);
    outputDir = getUniqueFileName(outputDir);

    let receivedBytes = 0;
    let totalBytes = 0;

    const req = request({
        method: 'GET',
        uri: url,
        timeout: 60000,
    });

    req.on('response', (data) => {
        totalBytes = Number.parseInt(data.headers['content-length'], 10);
    });

    req.on('data', function (chunk) {
        receivedBytes += chunk.length;
        const progress = (receivedBytes / totalBytes * 100).toFixed(2);
        process.stdout.write(`\r下載進度: ${progress}% (${receivedBytes} / ${totalBytes} bytes)`);
    });

    req.on('end', () => {
        console.log(`下載完成: ${url}`);
        currentDownIndex++;
        if (currentDownIndex < tgz.length) {
            doDownload(tgz[currentDownIndex]);
        } else {
            console.log('全部下載完成');
            waitForExit(() => {
                process.exit(0); // 退出程式,返回錯誤碼 0
            });
        }
    });

    req.on('error', (err) => {
        console.log(`下載失敗: ${url}`);
        console.log(err);
        currentTryTime++;
        if (currentTryTime < retryTimes) {
            console.log(`重試第${currentTryTime}次`);
            doDownload(url);
        } else {
            currentTryTime = 0;
            downloadFailTgz.push(url);
            currentDownIndex++;
            if (currentDownIndex < tgz.length) {
                doDownload(tgz[currentDownIndex]);
            } else {
                console.log('全部下載完成');
                console.log('以下鏈接下載失敗:');
                console.log(downloadFailTgz);
                waitForExit(() => {
                    process.exit(0); // 退出程式,返回錯誤碼 0
                });
            }
        }
    });

    req.pipe(fs.createWriteStream(outputDir));
}

// 獲取唯一檔名
function getUniqueFileName(filePath) {
  let count = 1;
  let fileName = filePath;
  const ext = path.extname(filePath);
  const baseName = path.basename(filePath, ext);
  const dir = path.dirname(filePath);

  while (fs.existsSync(fileName)) {
      fileName = path.join(dir, `${baseName}(${count})${ext}`);
      count++;
  }

  return fileName;
}

// 開始下載
doDownload(tgz[currentDownIndex]);

// 等待用戶按任意鍵退出
function waitForExit(callback) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    console.log('按Enter鍵退出...');

    // 監聽鍵盤輸入
    rl.input.on('data', () => {
        rl.close();
        if (callback) callback();
    });

    // 監聽 Ctrl+C 事件
    rl.on('SIGINT', () => {
        rl.close();
        process.exit(0);
    });
}
