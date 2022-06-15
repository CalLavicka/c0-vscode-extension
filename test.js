const tar = require("./server/node_modules/tar");

// maps file paths to list of partial buffers
const fileData = {};

const onentry = entry => {
  fileData[entry.path] = [];
  entry.on('data', c => fileData[entry.path].push(c))
};

tar.t({ onentry, file: "test.tgz" }, err => {
  if (err) throw err;

  for (const [path, buffers] of Object.entries(fileData)) {
    const text = Buffer.concat(buffers).toString();
    console.log(`${path}: ${text}`);  
  }
});