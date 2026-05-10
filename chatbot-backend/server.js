require("dotenv").config();

const express = require("express");
const cors = require("cors");
const axios = require("axios");
const csv = require("csvtojson");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;

// GOOGLE SHEET CSV EXPORT URL
// your excel sheet url, amrita, make sure that these urls have public access, else you need auth which will just complicate things for you
  const SHEET_URL =
  "https://docs.google.com/spreadsheets/d/1_v6T9yWYxs0p4A8BKQAUZnxS6plFGDWi/export?format=csv";
  
// CACHE
let cachedData = null;
let lastFetchTime = 0;

const CACHE_DURATION = 1000 * 60 * 5; // 5 mins

// Fetch sheet data
async function fetchSheetData() {
  const now = Date.now();

  // Use cache
  if (
    cachedData &&
    now - lastFetchTime < CACHE_DURATION
  ) {
    return cachedData;
  }

  // Download CSV
  const response = await axios.get(SHEET_URL);

  const csvText = response.data;

  // Convert CSV -> JSON
  const jsonData = await csv().fromString(csvText);

  // Cache data
  cachedData = jsonData;
  lastFetchTime = now;

  return jsonData;
}

// Find relevant rows
function getRelevantRows(data, query) {
  const lowerQuery = query.toLowerCase();

  return data.filter((row) => {
    return Object.values(row).some((value) =>
      String(value)
        .toLowerCase()
        .includes(lowerQuery)
    );
  });
}

// Chat endpoint
app.post("/chat", async (req, res) => {
  try {
    const { message } = req.body;

    // Fetch sheet data
    const sheetData = await fetchSheetData();

    // Try finding relevant rows
    let relevantRows = getRelevantRows(
      sheetData,
      message
    );

    // fallback
    if (relevantRows.length === 0) {
      relevantRows = sheetData.slice(0, 20);
    }

    // Limit rows
    relevantRows = relevantRows.slice(0, 20);

    // Prompt
    const prompt = `
You are an intelligent assistant.

Answer ONLY using the spreadsheet data.

Spreadsheet Data:
${JSON.stringify(relevantRows, null, 2)}

User Question:
${message}

If answer is not found in data,
say:
"Data not found in spreadsheet"
`;

    // Gemini API call
    const geminiResponse = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        contents: [
          {
            parts: [
              {
                text: prompt,
              },
            ],
          },
        ],
      }
    );

    const answer =
      geminiResponse.data.candidates?.[0]
        ?.content?.parts?.[0]?.text ||
      "No response";

    res.json({
      answer,
    });
  } catch (error) {
    console.error(
      error.response?.data || error.message
    );

    res.status(500).json({
      error: "Something went wrong",
    });
  }
});

app.listen(PORT, () => {
  console.log(
    `Server running on port ${PORT}`
  );
});