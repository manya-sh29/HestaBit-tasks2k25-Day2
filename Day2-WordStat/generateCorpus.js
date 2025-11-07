const fs = require('fs');
const words = ["lorem", "ipsum", "dolor", "sit", "amet", "consectetur", "adipiscing", "elit"];
const totalWords = 200000;
let corpus = "";
for (let i = 0; i < totalWords; i++) {
  corpus += words[Math.floor(Math.random() * words.length)] + " ";
}
fs.writeFileSync("corpus.txt", corpus);
console.log("corpus.txt created with", totalWords, "words");
