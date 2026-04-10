// src/api/local-officials.js
export default async function handler(req, res) {
  const { address } = req.query;
  const ciceroKey = process.env.REACT_APP_CICERO_API_KEY;

  if (!address) {
    return res.status(400).json({ error: 'Address is required' });
  }

  if (!ciceroKey) {
    return res.status(500).json({ error: 'Cicero API key not configured' });
  }

  try {
    const url = `https://app.cicerodata.com/v3.1/official/?address=${encodeURIComponent(address)}&format=json&key=${ciceroKey}`;

    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    res.status(200).json(data);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch local officials' });
  }
}