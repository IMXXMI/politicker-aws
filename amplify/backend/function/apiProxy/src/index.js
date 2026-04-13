/**
 * Congress.gov member proxy.
 * Returns bio, sponsored bills (with URLs + latest action), and cosponsored bills.
 * GET /?bioguideId=W000804
 *
 * CORS headers are set by the Lambda Function URL config — do NOT duplicate them here.
 */

const TYPE_TO_SLUG = {
  HR: 'house-bill', S: 'senate-bill',
  HRES: 'house-resolution', SRES: 'senate-resolution',
  HJRES: 'house-joint-resolution', SJRES: 'senate-joint-resolution',
  HCONRES: 'house-concurrent-resolution', SCONRES: 'senate-concurrent-resolution',
};

function ordinal(n) {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

function billUrl(congress, type, number) {
  const slug = TYPE_TO_SLUG[type] || (type || '').toLowerCase();
  if (!congress || !slug || !number) return null;
  return `https://www.congress.gov/bill/${ordinal(congress)}-congress/${slug}/${number}`;
}

function formatAction(action) {
  if (!action) return null;
  return action.actionDate ? `${action.actionDate}: ${action.text}` : action.text || null;
}

function shapeBill(b) {
  return {
    title: b.title || b.shortTitle || 'Untitled Bill',
    latestAction: formatAction(b.latestAction),
    congressUrl: billUrl(b.congress, b.type, b.number),
  };
}

exports.handler = async (event) => {
  const { bioguideId } = event.queryStringParameters || {};

  if (!bioguideId) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'bioguideId is required' }),
    };
  }

  const apiKey = process.env.CONGRESS_API_KEY;
  const q = apiKey ? `&api_key=${encodeURIComponent(apiKey)}` : '';
  const base = `https://api.congress.gov/v3/member/${bioguideId}`;

  try {
    const [memberRes, billsRes, cosponsoredRes] = await Promise.all([
      fetch(`${base}?format=json${q}`),
      fetch(`${base}/sponsored-legislation?limit=6&sort=latestActionDate&format=json${q}`),
      fetch(`${base}/cosponsored-legislation?limit=8&sort=latestActionDate&format=json${q}`),
    ]);

    const [memberData, billsData, cosponsoredData] = await Promise.all([
      memberRes.json(),
      billsRes.json(),
      cosponsoredRes.json(),
    ]);

    const bills = (billsData.sponsoredLegislation || []).map(shapeBill);
    const cosponsoredBills = (cosponsoredData.cosponsoredLegislation || []).map(b => ({
      title: b.title || b.shortTitle || 'Untitled Bill',
      latestAction: formatAction(b.latestAction),
    }));

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        member: memberData.member || null,
        bills,
        cosponsoredBills,
      }),
    };
  } catch (err) {
    console.error('Congress proxy error:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Proxy failed' }),
    };
  }
};
