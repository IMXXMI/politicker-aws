// api/congress-bills.js
// api/congress-bills.js   ← MUST be at project root
export default async function handler(req, res) {
  console.log("API route hit with query:", req.query);

  const { bioguideId } = req.query;
  const apiKey = process.env.REACT_APP_CONGRESS_API_KEY;

  if (!bioguideId) {
    return res.status(400).json({ error: "bioguideId is required" });
  }

  if (!apiKey) {
    return res.status(500).json({ error: "Congress API key missing on Vercel" });
  }

  try {
    const url = `https://api.congress.gov/v3/member/${bioguideId}/bills?limit=5&sort=latestActionDate&format=json`;

    const response = await fetch(url, {
      headers: { "X-API-Key": apiKey }
    });

    const data = await response.json();

    res.status(200).json(data);
  } catch (error) {
    console.error("Congress proxy error:", error);
    res.status(500).json({ error: "Failed to fetch from Congress.gov" });
  }
}