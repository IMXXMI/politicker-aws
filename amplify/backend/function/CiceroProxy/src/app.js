const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
app.use(cors({ origin: '*' }));

// Cicero
app.get('/cicero', async (req, res) => {
  const { zip } = req.query;
  const key = process.env.CICERO_API_KEY;
  if (!zip || !key) return res.status(400).json({ error: 'Missing zip or key' });
  const url = `https://app.cicerodata.com/v3.1/official/?key=${key}&address=${zip}&district_type=NATIONAL_LOWER,STATE_LOWER,STATE_UPPER&format=json`;
  try {
    const response = await fetch(url, { timeout: 15000 });
    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({ error: 'Cicero error', details: text });
    }
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = app;