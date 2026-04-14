/**
 * Multi-service API proxy.
 *
 * Routes:
 *   ?service=congress&bioguideId=W000804  → Congress.gov member info/bills
 *   ?service=cicero&address=...            → Cicero local officials lookup
 *
 * Default (no service param) = congress (backwards compatible).
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

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

async function handleCongress(params) {
  const { bioguideId } = params;
  if (!bioguideId) return json(400, { error: 'bioguideId is required' });

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

    return json(200, {
      member: memberData.member || null,
      bills,
      cosponsoredBills,
    });
  } catch (err) {
    console.error('Congress proxy error:', err);
    return json(500, { error: 'Proxy failed' });
  }
}

async function handleCicero(params) {
  const { address } = params;
  if (!address) return json(400, { error: 'address is required' });

  const apiKey = process.env.CICERO_API_KEY;
  if (!apiKey) return json(500, { error: 'CICERO_API_KEY not configured' });

  try {
    const url = `https://app.cicerodata.com/v3.1/official/?address=${encodeURIComponent(address)}&format=json&key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok) {
      console.error('Cicero upstream error:', res.status, data);
      return json(res.status, data);
    }
    return json(200, data);
  } catch (err) {
    console.error('Cicero proxy error:', err);
    return json(500, { error: 'Cicero proxy failed' });
  }
}

exports.handler = async (event) => {
  const params = event.queryStringParameters || {};
  const service = (params.service || 'congress').toLowerCase();

  switch (service) {
    case 'cicero':
      return handleCicero(params);
    case 'congress':
    default:
      return handleCongress(params);
  }
};
