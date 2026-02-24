const fs = require('fs');
const path = require('path');

const replacements = [
    { from: /테라피스트/g, to: '강사' },
    { from: /치료사/g, to: '강사' },
    { from: /병원/g, to: '센터' },
    { from: /치료/g, to: '수업' },
    { from: /환자/g, to: '회원' },
    { from: /진료/g, to: '운동' },
    { from: /원장/g, to: '센터장' },
];

function walkSync(dir, filelist = []) {
    if (!fs.existsSync(dir)) return filelist;
    fs.readdirSync(dir).forEach(file => {
        const dirFile = path.join(dir, file);
        if (fs.statSync(dirFile).isDirectory()) {
            if (!dirFile.includes('node_modules') && !dirFile.includes('.git') && !dirFile.includes('dist')) {
                filelist = walkSync(dirFile, filelist);
            }
        } else {
            if (dirFile.endsWith('.ts') || dirFile.endsWith('.tsx') || dirFile.endsWith('.sql')) {
                filelist.push(dirFile);
            }
        }
    });
    return filelist;
}

const dirsToSearch = [path.join(__dirname, 'src'), path.join(__dirname, 'sql')];
let allFiles = [];
dirsToSearch.forEach(dir => {
    allFiles = allFiles.concat(walkSync(dir));
});

let modifiedFilesCount = 0;

allFiles.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    let newContent = content;

    replacements.forEach(rep => {
        newContent = newContent.replace(rep.from, rep.to);
    });

    if (content !== newContent) {
        fs.writeFileSync(file, newContent, 'utf8');
        console.log(`Updated: ${file}`);
        modifiedFilesCount++;
    }
});

console.log(`Total files modified: ${modifiedFilesCount}`);
