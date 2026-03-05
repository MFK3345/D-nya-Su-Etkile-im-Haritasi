const fs = require("fs");
const pdfParse = require("pdf-parse");
const countries = require("./countries");

const PDF_PATH = "./data/world_water.pdf";
const OUT_DIR = "./data";

async function run() {
  const buffer = fs.readFileSync(PDF_PATH);

  // ✅ ARTIK SORUNSUZ
  const data = await pdfParse(buffer);

  const text = data.text
    .replace(/\r/g, "")
    .split("\n")
    .map(l => l.trim())
    .filter(Boolean);

  console.log("📄 PDF okundu. Satır sayısı:", text.length);

  for (const c of countries) {
    const found = text.find(l =>
      l.toLowerCase().includes(c.name.toLowerCase()) ||
      c.aliases.some(a => l.toLowerCase().includes(a.toLowerCase()))
    );

    if (!found) continue;

    const json = {
      name: c.name,
      population: null,
      gdp: null,
      waterScore: 5,
      waterData: {
        info: {
          genel: "PDF verisinden özetlenecek",
          sorunlar: "PDF verisinden özetlenecek",
          cozumler: "PDF verisinden özetlenecek"
        },
        bolgeler: []
      },
      charts: {
        reserve: {
          years: [2015,2016,2017,2018,2019,2020,2021,2022,2023,2024],
          values: []
        },
        usage: [60, 25, 15]
      }
    };

    fs.writeFileSync(
      `${OUT_DIR}/${c.code}.json`,
      JSON.stringify(json, null, 2),
      "utf8"
    );

    console.log(`✅ ${c.code}.json üretildi`);
  }
}

run().catch(err => {
  console.error("❌ HATA:", err);
});
