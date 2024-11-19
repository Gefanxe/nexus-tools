const fs = require('fs');
const path = require('path');
const request = require('request');
const readline = require('readline');
const moveFile = require('move-file');

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

// 設置參數
const REPO_URL = env.NEXUS_UPLOAD_API;
const USERNAME = env.NEXUS_ADMIN;
const PASSWORD = env.NEXUS_PASS;
const DIRECTORY = env.UPLOAD_DIR || "./npm-pkg-tgz";  // 默認目錄為當前目錄
const UPLOADED_OK_DIR = env.UPLOADED_DIR || "./npm-pkg-tgz-uploaded";  // 默認目錄為當前目錄

// 讀取目錄中的所有 .tgz 文件
fs.readdir(DIRECTORY, (err, files) => {
    if (err) {
        console.error(`無法讀取目錄: ${err}`);
        return;
    }

    // 遍歷文件
    const tgzFiles = files.filter(file => path.extname(file) === '.tgz');
    if (tgzFiles.length === 0) {
        console.log('沒有找到 .tgz 文件。');
        waitForExit();
        return;
    }

    let uploadCount = 0;
    let uploadFailCount = 0;

    tgzFiles.forEach(file => {
        const filePath = path.join(DIRECTORY, file);

        uploadFile(file, filePath, (isFail) => {
            if (isFail) uploadFailCount++;
            uploadCount++;
            if (uploadCount === tgzFiles.length) {
                console.log(`完成上傳,總數:${tgzFiles.length},失敗:${uploadFailCount}`);
                waitForExit();
            }
        });
    });
});

// 上傳文件的函數
function uploadFile(file, filePath, callback) {
    const formData = {
        'npm.asset': fs.createReadStream(filePath)
    };

    request.post({
        url: REPO_URL,
        auth: {
            user: USERNAME,
            pass: PASSWORD
        },
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'multipart/form-data'
        },
        formData: formData
    }, (error, response, body) => {
        let isFail = false;
        if (error) {
            console.error(`上傳 ${filePath} 時出錯: ${error.message}`);
            isFail = true;
        } else {
            console.log(`Uploaded: ${filePath} - HTTP Status: ${response.statusCode}`);
            // 移動到完成的資料夾
            const movePath = path.join(UPLOADED_OK_DIR, file);
            moveFile(filePath, movePath, { overwrite: true })
        }
        callback(isFail);
    });
}

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