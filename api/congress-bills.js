// api/congress-bills.js
export default async function handler(req, res) {
  const { bioguideId } = req.query;
  const apiKey = process.env.REACT_APP_CONGRESS_API_KEY;

  if (!bioguideId) {
    return res.status(400).json({ error: 'bioguideId is required' });
  }

  if (!apiKey) {
    return res.status(500).json({ error: 'Congress API key not configured' });
  }

  try {
    const url = `https://api.congress.gov/v3/member/${bioguideId}/bills?limit=6&sort=latestActionDate&format=json`;

    const response = await fetch(url, {
      headers: {
        'X-API-Key': apiKey,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    res.status(200).json(data);
  } catch (error) {
    console.error('Congress proxy error:', error);
    res.status(500).json({ error: 'Failed to fetch bills' });
  }
}