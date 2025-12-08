export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  try {
    const apiKey = 'z3fcHlaLox1LIY2KFMSdhtSK4XtX7QOULfWLKR0t';
    const congress = 118;
    const listRes = await fetch(`https://api.congress.gov/v3/bill?api_key=${apiKey}&limit=1&congress=${congress}&format=json`);
    if (!listRes.ok) throw new Error('List API fail');
    const listData = await listRes.json();
    const billId = listData.bills[0]?.billId || 'hr1-118';
    const detailRes = await fetch(`https://api.congress.gov/v3/bill/${billId}?api_key=${apiKey}&format=json`);
    if (!detailRes.ok) throw new Error('Detail API fail');
    const data = await detailRes.json();
    res.status(200).json(data);
  } catch (error) {
    console.error('Bill proxy error:', error);
    res.status(500).json({ error: 'Failed to fetch bill' });
  }
}