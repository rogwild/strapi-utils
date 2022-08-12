const fs = require('fs');
const path = require('path');

const allTests = [];
const startCommand = 'npm test';
let localDirname = __dirname;

const getAllTests = (folderPath) => {
    try {
        const dirs = fs.readdirSync(path.join(localDirname, folderPath));
        for (const dir in dirs) {
            const directory = dirs[dir];
            const currentFolderPath = path.normalize(`${folderPath}/${directory}`);

            const isDir = fs.statSync(path.join(localDirname, currentFolderPath)).isDirectory();

            if (isDir) {
                getAllTests(currentFolderPath);
            } else if (directory.indexOf('.test.js') > -1) {
                allTests.push(currentFolderPath);
            }
        }
    } catch (error) {
        console.log(error.message);
    }
};

function createScript(mainPath = '.') {
    try {
        localDirname = process.cwd();
        const cliFilePath = path.join(localDirname, 'tests.sh');
        getAllTests(mainPath);

        if (fs.existsSync(cliFilePath)) {
            fs.unlinkSync(cliFilePath);
        }

        for (const [index, testFile] of allTests.entries()) {
            let previousContent = '';
            if (fs.existsSync(cliFilePath)) {
                previousContent = fs.readFileSync(cliFilePath);
            }

            const writeToFile = (data) => {
                return fs.writeFileSync(cliFilePath, `${previousContent} ${data}`);
            };

            if (index == 0) {
                writeToFile(`${startCommand} ${testFile} &&`);
            } else if (index !== allTests.length - 1) {
                writeToFile(`${startCommand} ${testFile} &&`);
            } else {
                writeToFile(`${startCommand} ${testFile}`);
            }
        }
    } catch (error) {
        console.log(error.message);
    }
}

module.exports = { createScript };
