import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider, TwitterAuthProvider, onAuthStateChanged, User } from 'firebase/auth';
import { getFirestore, collection, addDoc, onSnapshot, query, where } from 'firebase/firestore';
import './App.css';

const PROXY = 'https://corsproxy.io/?'; // CORS bypass

function App() {  // Line 9 — opening brace
  // Your state/useEffect here

  const [reps, setReps] = useState<Rep[]>([]);
  const [county, setCounty] = useState('');
  type Bill = {
    title: string;
    summary?: string;
    tldr?: string;
    keyPoints?: string[];
    earmarks?: string[];
  };
    const [zip, setZip] = useState('');
  type Rep = {
    name: string;
    party: string;
    photo: string;
    level: string;
    contact: string;
    phone: string;
    score: number;
    id: string;
    xHandle: string;
  };
  const [bill, setBill] = useState<Bill | null>(null);
  const [loading, setLoading] = useState(false);
  const [appName] = useState('Politicker');
  const [selectedRep, setSelectedRep] = useState<Rep | null>(null);
  type RepDetails = { bio: string; votes: string[]; bills: string[]; comments: string[] };
  const [repDetails, setRepDetails] = useState<RepDetails>({ bio: '', votes: [], bills: [], comments: [] });
  const [voterVerified, setVoterVerified] = useState(false);
  const [showPollBreakdown, setShowPollBreakdown] = useState(false);
  const [showEarmarkBreakdown, setShowEarmarkBreakdown] = useState(false);
  const [selectedEarmark, setSelectedEarmark] = useState<string | null>(null);
  const [showRepPollBreakdown, setShowRepPollBreakdown] = useState(false);
  const [selectedRepPoll, setSelectedRepPoll] = useState<string | null>(null);
  const [showCommentBreakdown, setShowCommentBreakdown] = useState(false);
  const [selectedComment, setSelectedComment] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showAuth, setShowAuth] = useState(false);
  const [isSignup, setIsSignup] = useState(true);
  const [showRepModal, setShowRepModal] = useState(false);
  const [expandedBio, setExpandedBio] = useState(false);
  const [expandedVotes, setExpandedVotes] = useState(false);
  const [expandedBills, setExpandedBills] = useState(false);
  const [expandedComments, setExpandedComments] = useState(false);
 

  // Poll states
  type PollResult = { yea: number; nay: number };
  type TieredPollResult = {
    [tier: string]: PollResult;
  };
  const [pollResults, setPollResults] = useState<PollResult>({ yea: 0, nay: 0 });
  const [earmarkPolls, setEarmarkPolls] = useState<{ [earmark: string]: TieredPollResult }>({});
  const [commentPolls, setCommentPolls] = useState<{ [comment: string]: TieredPollResult }>({});
  const [repPolls, setRepPolls] = useState<{ [repName: string]: { [tier: string]: { approve: number; disapprove: number } } }>({});
  const [registeredVotersEstimate, setRegisteredVotersEstimate] = useState(0);

  // Firebase config from .env
  const firebaseConfig = {
    apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
    authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
    storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.REACT_APP_FIREBASE_APP_ID
  };

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const googleProvider = new GoogleAuthProvider();
  const twitterProvider = new TwitterAuthProvider();

  // Auth listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        loadUserPolls(currentUser.uid);
      }
    });
    return () => unsubscribe();
  }, []);

  // Load polls from Firestore (real-time)
  const loadUserPolls = async (uid: string) => {
    if (bill) {
      const q = query(collection(db, 'polls'), where('userId', '==', uid), where('billTitle', '==', bill.title));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        let local = { yea: 0, nay: 0 };
        let out = { yea: 0, nay: 0 };
        let inDistrict = { yea: 0, nay: 0 };
        snapshot.docs.forEach(doc => {
          const poll = doc.data();
          if (poll.tier === 'local') local = poll.results;
          if (poll.tier === 'out') out = poll.results;
          if (poll.tier === 'in') inDistrict = poll.results;
          if (poll.earmark) setEarmarkPolls(prev => ({ ...prev, [poll.earmark]: poll.results }));
          if (poll.comment) setCommentPolls(prev => ({ ...prev, [poll.comment]: poll.results }));
          if (poll.rep) setRepPolls(prev => ({ ...prev, [poll.rep]: poll.results }));
        });
        // Aggregate main poll
        setPollResults({
          yea: (local.yea || 0) + (out.yea || 0) + (inDistrict.yea || 0),
          nay: (local.nay || 0) + (out.nay || 0) + (inDistrict.nay || 0)
        });
      });
      return unsubscribe;
    }
  };

  // Voter verification
  const verifyVoter = async (zipCode: string) => {
    try {
      const apiKey = process.env.REACT_APP_GOOGLE_API_KEY;
      if (!apiKey) throw new Error('Google API key missing');
      const url = `https://www.googleapis.com/civicinfo/v2/voterinfo?key=${apiKey}&address=${zipCode}&electionId=2000`;
      const res = await fetch(`${PROXY}${encodeURIComponent(url)}`);
      const data = await res.json();
      if (data.dropOffLocations || data.pollingLocations) {
        setVoterVerified(true);
        setRegisteredVotersEstimate(10000); // Mock
        alert('Voter verified!');
        return true;
      }
    } catch (err) {
      console.error('Voter verification error:', err);
      alert('Verification failed.');
    }
    return false;
  };

  // Signup/Login
  const handleSignup = async () => {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      await verifyVoter(zip); // Await for completion
      await addDoc(collection(db, 'users'), { uid: user.uid, email, verified: voterVerified, zip });
      setShowAuth(false);
    } catch (err) {
      if (err instanceof Error) {
        alert('Signup failed: ' + err.message);
      } else {
        alert('Signup failed: ' + String(err));
      }
    }
  };

  const handleLogin = async () => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
      setShowAuth(false);
    } catch (err) {
      if (err instanceof Error) {
        alert('Login failed: ' + err.message);
      } else {
        alert('Login failed: ' + String(err));
      }
    }
  };

  const handleGoogleLogin = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      await verifyVoter(zip); // Await for completion
      await addDoc(collection(db, 'users'), { uid: user.uid, email: user.email, verified: voterVerified, zip, provider: 'google' });
      setShowAuth(false);
    } catch (err) {
      console.error('Google login error:', err);
      if (err instanceof Error) {
        alert('Google login failed: ' + err.message);
      } else {
        alert('Google login failed: ' + String(err));
      }
    }
  };

  const handleXLogin = async () => {
    try {
      const result = await signInWithPopup(auth, twitterProvider);
      const user = result.user;
      await verifyVoter(zip); // Await for completion
      await addDoc(collection(db, 'users'), { uid: user.uid, email: user.email, verified: voterVerified, zip, provider: 'twitter' });
      setShowAuth(false);
    } catch (err) {
      console.error('X login error:', err);
      if (err instanceof Error) {
        alert('X login failed: ' + err.message);
      } else {
        alert('X login failed: ' + String(err));
      }
    }
  };

   useEffect(() => {
  if (zip.length === 5) {  // Only full ZIP
    fetchReps(zip);
  }
}, [zip]);

  // Vote (single, tier tracked from user)
  const handleVote = async (
    choice: 'yea' | 'nay' | 'approve' | 'disapprove',
    tier: string | null = null,
    earmark: string | null = null,
    comment: string | null = null,
    repName: string | null = null
  ) => {
    if (!user) {
      alert('Create account to vote!');
      setShowAuth(true);
      return;
    }
    // TODO: Replace this with actual logic to determine if user is in district
    const isInDistrict = true; // Placeholder: assume user is in district for now
    const effectiveTier = tier || (voterVerified && isInDistrict ? 'in' : voterVerified ? 'out' : 'local');
    const pollKey = `poll_${effectiveTier}_${bill?.title || 'unknown'}_${choice}` + (earmark ? `_${earmark}` : '') + (comment ? `_${comment}` : '') + (repName ? `_${repName}` : '');
    if (localStorage.getItem(pollKey)) {
      alert('You already voted!');
      return;
    }
    localStorage.setItem(pollKey, 'voted');

    // Update local state based on type of poll
    try {
      if (!earmark && !comment && !repName) {
        if (choice === 'yea' || choice === 'nay') {
          setPollResults(prev => ({ ...prev, [choice]: (prev[choice] || 0) + 1 }));
        }
      } else if (earmark) {
        if (choice !== 'yea' && choice !== 'nay') {
          alert('Invalid vote choice for earmark poll.');
          return;
        }
        setEarmarkPolls(prev => {
          const earmarkEntry = prev[earmark] || {};
          const tierEntry = earmarkEntry[effectiveTier] || { yea: 0, nay: 0 };
          return {
            ...prev,
            [earmark]: {
              ...earmarkEntry,
              [effectiveTier]: {
                ...tierEntry,
                [choice]: (tierEntry[choice as keyof PollResult] || 0) + 1
              }
            }
          };
        });
      } else if (comment) {
        if (choice !== 'yea' && choice !== 'nay') {
          alert('Invalid vote choice for comment poll.');
          return;
        }
        setCommentPolls(prev => {
          const commentEntry = prev[comment] || {};
          const tierEntry = commentEntry[effectiveTier] || { yea: 0, nay: 0 };
          return {
            ...prev,
            [comment]: {
              ...commentEntry,
              [effectiveTier]: {
                ...tierEntry,
                [choice]: (tierEntry[choice as keyof PollResult] || 0) + 1
              }
            }
          };
        });
      } else if (repName) {
        setRepPolls(prev => {
          const repEntry = prev[repName] || {};
          const tierEntry = repEntry[effectiveTier] || { approve: 0, disapprove: 0 };
          // Map 'yea' to 'approve' and 'nay' to 'disapprove'
          let pollKey: 'approve' | 'disapprove';
          if (choice === 'yea' || choice === 'approve') {
            pollKey = 'approve';
          } else if (choice === 'nay' || choice === 'disapprove') {
            pollKey = 'disapprove';
          } else {
            alert('Invalid vote choice for rep poll.');
            return prev;
          }
          const updatedTierEntry = { ...tierEntry, [pollKey]: (tierEntry[pollKey] || 0) + 1 };
          const aggregated = Object.values({ ...repEntry, [effectiveTier]: updatedTierEntry }).reduce(
            (acc, t) => {
              acc.approve = (acc.approve || 0) + (t.approve || 0);
              acc.disapprove = (acc.disapprove || 0) + (t.disapprove || 0);
              return acc;
            },
            { approve: 0, disapprove: 0 }
          );
          const aggTotal = (aggregated.approve || 0) + (aggregated.disapprove || 0);
          setTimeout(() => updateRepScore(repName, aggregated.approve || 0, aggTotal || 1), 0);
          return { ...prev, [repName]: { ...repEntry, [effectiveTier]: updatedTierEntry } };
        });
      }

      // Persist to Firestore
      await addDoc(collection(db, 'polls'), {
        userId: user.uid,
        billTitle: bill?.title || 'unknown',
        tier: effectiveTier,
        choice,
        earmark,
        comment,
        rep: repName,
        timestamp: new Date()
      });
    } catch (err) {
      console.error('Vote save error:', err);
      alert('Failed to record vote.');
    }
  };

  const updateRepScore = (repName: string, approveVotes: number, totalVotes: number) => {
    const newScore = Math.round((approveVotes / totalVotes) * 100) || 50;
    setReps(prev => prev.map(r => r.name === repName ? { ...r, score: newScore } : r));
  };

  const fetchReps = async (zipCode: string) => {
    console.log('fetchReps called with ZIP:', zipCode); // Debug
  setLoading(true);
  try {
    const allReps: Rep[] = [];
    const countyName = 'Chesterfield County'; // From data or mock
    setCounty(countyName);

    // Cicero default (district reps)
    const ciceroApiKey = process.env.REACT_APP_CICERO_API_KEY;
    if (ciceroApiKey) {
      const url = `https://app.cicerodata.com/v3.1/official/?key=${ciceroApiKey}&address=${zipCode}&district_type=NATIONAL_LOWER,STATE_LOWER,STATE_UPPER&format=json`;
const res = await fetch(`${PROXY}${encodeURIComponent(url)}`); // Add PROXY back
if (res.ok) {
  const data = await res.json();
        console.log('Cicero data:', data); // Debug
        data.officials?.forEach((official: any) => {
          allReps.push({
            name: official.name,
            party: official.party,
            photo: official.photo_url || 'https://placehold.co/100x100?text=Rep',
            level: official.district_type,
            contact: official.contact_url || '#',
            phone: official.phone || '',
            score: Math.floor(Math.random() * 101),
            id: official.id || 'unknown',
            xHandle: official.twitter_id || '@RepExample'
          });
        });
        if (allReps.length > 0) {
          console.log('Cicero district reps:', allReps.length);
          setReps(allReps);
          setLoading(false);
          return; // Success, exit
        }
      } else {
  console.warn('Cicero CORS/530 — skipping to Geocodio');
}
    }

    // Geocodio fallback (state view for more reps)
    const geocodioApiKey = process.env.REACT_APP_GEOCODIO_API_KEY;
    if (geocodioApiKey) {
      const fields = 'cd,stateleg';
const url = `https://api.geocod.io/v1.9/geocode?q=${String(zipCode)}&fields=${fields}&api_key=${geocodioApiKey}`;
const res = await fetch(`${PROXY}${encodeURIComponent(url)}`);
if (res.ok) {
  const data = await res.json();
  console.log('Geocodio fallback data:', data); // Debug
  if (data.results && data.results.length > 0) {
          const result = data.results[0];
          if (result.fields && result.fields.congressional_districts && result.fields.congressional_districts.length > 0) {
            result.fields.congressional_districts.forEach((district: any) => {
              if (district.current_legislators && district.current_legislators.length > 0) {
                district.current_legislators.forEach((leg: any) => {
                  allReps.push({
                    name: leg.bio ? `${leg.bio.first_name} ${leg.bio.last_name}` : leg.name || 'Unknown',
                    party: leg.bio ? leg.bio.party : leg.party || 'Unknown',
                    photo: leg.bio && leg.bio.photo_url ? leg.bio.photo_url : 'https://placehold.co/100x100?text=Rep',
                    level: leg.type === 'senator' ? 'federal senate' : 'federal house',
                    contact: leg.contact && leg.contact.url ? leg.contact.url : '#',
                    phone: leg.contact && leg.contact.phone ? leg.contact.phone : '',
                    score: Math.floor(Math.random() * 101),
                    id: leg.candidateId || leg.id || 'unknown',
                    xHandle: leg.bio ? leg.bio.twitter_id : '@RepABSpanberger'
                  });
                });
              }
            });
          }
          if (result.fields && result.fields.state_legislative_districts) {
            const stateFields = result.fields.state_legislative_districts;
            ['senate', 'house'].forEach(chamber => {
              if (stateFields[chamber] && stateFields[chamber].length > 0) {
                stateFields[chamber].forEach((district: any) => {
                  if (district.current_legislators && district.current_legislators.length > 0) {
                    district.current_legislators.forEach((leg: any) => {
                      allReps.push({
                        name: leg.bio ? `${leg.bio.first_name} ${leg.bio.last_name}` : leg.name || 'Unknown',
                        party: leg.bio ? leg.bio.party : leg.party || 'Unknown',
                        photo: leg.bio && leg.bio.photo_url ? leg.bio.photo_url : 'https://placehold.co/100x100?text=Sen',
                        level: `state ${chamber}`,
                        contact: leg.contact && leg.contact.url ? leg.contact.url : '#',
                        phone: leg.contact && leg.contact.phone ? leg.contact.phone : '',
                        score: Math.floor(Math.random() * 101),
                        id: leg.candidateId || leg.id || 'unknown',
                        xHandle: leg.bio ? leg.bio.twitter_id : '@Evan_Low'
                      });
                    });
                  }
                });
              }
            });
          }
          if (allReps.length > 0) {
      console.log('Geocodio state reps:', allReps.length);
      setReps(allReps);
      setLoading(false);
      return; // Success, exit
    }
  }
} else {
  console.warn('Geocodio fetch fail (status:', res.status, ') — using mocks');
}}
if (allReps.length === 0) {
  console.warn('All APIs failed — using mocks');
  // Your mocks push
  setReps([
    { name: 'Abigail Spanberger', party: 'Dem', photo: 'https://placehold.co/100x100?text=Spanberger', level: 'federal house', contact: 'https://spanberger.house.gov', phone: '(202) 225-5176', score: 80, id: '412478', xHandle: '@RepABSpanberger' },
    { name: 'Bob Good', party: 'Rep', photo: 'https://placehold.co/100x100?text=Good', level: 'federal house', contact: 'https://good.house.gov', phone: '(202) 225-4711', score: 75, id: '456789', xHandle: '@RepBobGood' },
    { name: 'Mark Warner', party: 'Dem', photo: 'https://placehold.co/100x100?text=Warner', level: 'federal senate', contact: 'https://www.warner.senate.gov', phone: '(202) 224-2023', score: 78, id: '300098', xHandle: '@MarkWarner' }
  ]);
  setCounty('Chesterfield County');
  setLoading(false);
}
    // Ultimate fallback mocks
    console.warn('All APIs failed — using mocks');
    setReps([
      { name: 'Abigail Spanberger', party: 'Dem', photo: 'https://placehold.co/100x100?text=Spanberger', level: 'federal house', contact: 'https://spanberger.house.gov', phone: '(202) 225-5176', score: 80, id: '412478', xHandle: '@RepABSpanberger' },
      { name: 'Bob Good', party: 'Rep', photo: 'https://placehold.co/100x100?text=Good', level: 'federal house', contact: 'https://good.house.gov', phone: '(202) 225-4711', score: 75, id: '456789', xHandle: '@RepBobGood' },
      { name: 'Mark Warner', party: 'Dem', photo: 'https://placehold.co/100x100?text=Warner', level: 'federal senate', contact: 'https://www.warner.senate.gov', phone: '(202) 224-2023', score: 78, id: '300098', xHandle: '@MarkWarner' }
    ]);
    setCounty('Chesterfield County');
    setLoading(false);
  } catch (err) {
    console.error('Reps fetch error:', err);
    if (err instanceof Error) {
      console.error('Error details:', err.message);
    }
    // Mocks fallback
    setReps([
      { name: 'Abigail Spanberger', party: 'Dem', photo: 'https://placehold.co/100x100?text=Spanberger', level: 'federal house', contact: 'https://spanberger.house.gov', phone: '(202) 225-5176', score: 80, id: '412478', xHandle: '@RepABSpanberger' },
      { name: 'Bob Good', party: 'Rep', photo: 'https://placehold.co/100x100?text=Good', level: 'federal house', contact: 'https://good.house.gov', phone: '(202) 225-4711', score: 75, id: '456789', xHandle: '@RepBobGood' },
      { name: 'Mark Warner', party: 'Dem', photo: 'https://placehold.co/100x100?text=Warner', level: 'federal senate', contact: 'https://www.warner.senate.gov', phone: '(202) 224-2023', score: 78, id: '300098', xHandle: '@MarkWarner' }
    ]);
    setCounty('Chesterfield County');
    setLoading(false);
  }
}; // Closes function
  // Fetch sample bill and useEffect for it
  const fetchSampleBill = async () => {
    let fullText = '';
    let earmarks: string[] = [];
    let actions: any[] = [];
    let latestAction = 'Pending';
    try {
      const apiKey = process.env.REACT_APP_CONGRESS_API_KEY;
      if (!apiKey) throw new Error('Congress API key missing');
      const congress = 118;
      const listRes = await fetch(`${PROXY}${encodeURIComponent(`https://api.congress.gov/v3/bill?api_key=${apiKey}&limit=1&congress=${congress}&format=json`)}`);
      console.log('Bill proxy res status:', listRes.status); // Debug
      if (!listRes.ok) throw new Error('Proxy fail');
      const listData = await listRes.json();
      let billId = listData.bills[0]?.billId || 'hr1-118';
      const detailRes = await fetch(`${PROXY}${encodeURIComponent(`https://api.congress.gov/v3/bill/${billId}?api_key=${apiKey}&format=json`)}`);
      if (!detailRes.ok) throw new Error('Detail API fail');
      const detailData = await detailRes.json();
      const bill = detailData.bill;
      actions = bill.actions || [];
      latestAction = actions[0]?.text || 'Pending';
      // Full text for earmarks
      const textRes = await fetch(`${PROXY}${encodeURIComponent(`https://api.congress.gov/v3/bill/${billId}/text?api_key=${apiKey}&format=json`)}`);
      if (textRes.ok) {
        const textData = await textRes.json();
        fullText = textData.textVersions?.[0]?.text || '';
        const earmarkMatches = fullText.match(/\$[\d,]+(?:\.\d+)?\s*for\s+the\s+(?:use\s+of|benefit\s+of|project\s+in|construction\s+of)\s+([^\.]+?)(?=\.|for\s+\$)/gi) || [];
        earmarks = earmarkMatches.slice(0, 5).map(match => match.trim());
      }
      const inferredPros = actions?.[0]?.classification?.includes('Passed') ? 'Advances key policy' : 'Supports rights/allies';
      const inferredCons = fullText.toLowerCase().includes('review') ? 'Potential bureaucratic costs' : 'Possible tensions/costs';
      setBill({
        title: `${bill.billType || 'H.R.'} ${bill.number} - ${bill.title || 'Recent Bill'}`,
        summary: bill.officialTitle || bill.popularTitle || 'Recent Bill',
        tldr: fullText.substring(0, 150) + '...',
        keyPoints: [
          `Sponsor: ${bill.sponsor?.name || 'Unknown'}`,
          `Status: ${latestAction}`,
          `Pros: ${inferredPros}`,
          `Cons: ${inferredCons}`
        ],
        earmarks
      });
    } catch (err) {
      console.error('Bill fetch error:', err);
      setBill(null);
    }
  };
  


  const fetchRepDetails = async (rep: Rep) => {
    setSelectedRep(rep);
    try {
      let personId = rep.id;
      if (personId === 'unknown') {
        const searchUrl = `https://www.govtrack.us/api/v2/person?search=${encodeURIComponent(rep.name)}&format=json`;
        const encodedSearch = encodeURIComponent(searchUrl);
     const searchRes = await fetch(`https://corsproxy.io/?${encodeURIComponent(searchUrl)}`);
       const responseText = await searchRes.text();
       const searchData = JSON.parse(responseText); 
        
if (responseText.startsWith('<!DOCTYPE')) {
  console.warn('GovTrack HTML — quota hit, fallback ID');
  personId = '412478'; // Fallback
  return; // Exit
}

      }

      // Bio
      const bioUrl = `https://www.govtrack.us/api/v2/person/${personId}?format=json`;
      const encodedBio = encodeURIComponent(bioUrl);
      const bioRes = await fetch(`https://api.allorigins.win/get?url=${encodedBio}`);
      const bioText = await bioRes.json();
      const bioData = JSON.parse(bioText.contents);
      if (bioRes.ok) {
        const bio = bioData.object?.bio || 'Bio unavailable.';
        setRepDetails(prevState => ({ ...prevState, bio }));
      }

      // Voting history
      const votesUrl = `https://www.govtrack.us/api/v2/vote?person=${personId}&order_by=-date&limit=5&format=json`;
      const encodedVotes = encodeURIComponent(votesUrl);
      const votesRes = await fetch(`https://api.allorigins.win/get?url=${encodedVotes}`);
      const votesText = await votesRes.json();
      const votesData = JSON.parse(votesText.contents);
      if (votesRes.ok) {
        const votes = votesData.objects.map((v: any) => `${v.question.title} (Vote: ${v.result}) on ${v.date}`).slice(0, 5) || [];
        setRepDetails(prevState => ({ ...prevState, votes }));
      }

      // Supported bills
      const billsUrl = `https://www.govtrack.us/api/v2/bill?sponsor=${personId}&order_by=-introduced&limit=5&format=json`;
      const encodedBills = encodeURIComponent(billsUrl);
      const billsRes = await fetch(`https://api.allorigins.win/get?url=${encodedBills}`);
      const billsText = await billsRes.json();
      const billsData = JSON.parse(billsText.contents);
      if (billsRes.ok) {
        const bills = billsData.objects.map((b: any) => `${b.number} - ${b.title} (${b.current_status})`).slice(0, 5) || [];
        setRepDetails(prevState => ({ ...prevState, bills }));
      }

      // X comments
      const xBearer = 'AAAAAAAAAAAAAAAAAAAAAMGQ5gEAAAAAa5%2BJbMeiSGNNP6yWAV2Ym2f0N7c%3DKk8IMQH1aHwIKDTQUKaYH7fn5on3uNyNe6VQgBoLKPr82owH5Q'; // Real token
      const xRes = await fetch(`https://api.twitter.com/2/users/by/username/${rep.xHandle.replace('@', '')}/tweets?max_results=5&tweet.fields=created_at&query=${encodeURIComponent(bill?.title || '')}`, {
        headers: { 'Authorization': `Bearer ${xBearer}` }
      });
      if (xRes.ok) {
        const xData = await xRes.json();
        const comments = xData.data?.map((tweet: any) => tweet.text).slice(0, 3) || ['No recent comments.'];
        setRepDetails(prevState => ({ ...prevState, comments }));
      }

      // County fallback
      if (rep.level.includes('county')) {
        setRepDetails(prevState => ({ ...prevState, bio: `Search ${rep.name} on Ballotpedia for full bio/votes.`, votes: ['Local votes via county records.'], bills: ['Local ordinances.'], comments: ['No X comments.'] }));
      }
    } catch (err) {
      console.error('Rep details error:', err);
      setRepDetails({
        bio: 'Robert Wittman is a Republican representing Virginia\'s 1st Congressional District.',
        votes: ['H.R. 123 (Yea) on 2025-11-01', 'S.456 (Nay) on 2025-10-15'],
        bills: ['H.R. 789 - Border Security (Passed)', 'S.101 - VA Funding (Introduced)'],
        comments: ['Strong support for VALID Act @RepRobWittman tweet', 'Yea on earmarks for VA access']
      });
    }
  };

  const closeModal = () => {
    setSelectedRep(null);
    setRepDetails({ bio: '', votes: [], bills: [], comments: [] });
  };

  const NotificationBanner = () => (
    <div className="alert-banner">
      🚨 Mock Alert: Your rep just voted on H.R. 123 — against 68% of district!
    </div>
  );

  const AuthForm = () => (
    showAuth ? (
      <div className="auth-form">
        <h3>{isSignup ? 'Create Account' : 'Login'}</h3>
        <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <button onClick={isSignup ? handleSignup : handleLogin}>{isSignup ? 'Sign Up' : 'Login'}</button>
        <p onClick={() => setIsSignup(!isSignup)} style={{ cursor: 'pointer', textAlign: 'center' }}>
          {isSignup ? 'Already have an account? Login' : 'No account? Sign up'}
        </p>
        <button onClick={handleGoogleLogin}>Sign in with Google</button>
        <button onClick={handleXLogin}>Sign in with X</button>
        <button onClick={() => setShowAuth(false)}>Cancel</button>
      </div>
    ) : null
  );

  const PollBreakdownModal = () => (
    showPollBreakdown ? (
      <div className="modal-overlay">
        <div className="modal">
          <h2>Poll Breakdown for {bill?.title}</h2>
          <p><strong>Total Votes: {pollResults.yea + pollResults.nay}</strong></p>
          <div className="poll-breakdown">
            <h3>Aggregated Poll</h3>
            <p>Yea: {pollResults.yea} ({Math.round((pollResults.yea / (pollResults.yea + pollResults.nay || 1) * 100) || 0)}%) | Nay: {pollResults.nay} ({Math.round((pollResults.nay / (pollResults.yea + pollResults.nay || 1) * 100) || 0)}%)</p>
            {/* Tier breakdown not available in pollResults; remove or update as needed */}
            <button onClick={() => handleVote('yea')}>Vote Yea</button>
            <button onClick={() => handleVote('nay')}>Vote Nay</button>
          </div>
          <button onClick={() => setShowPollBreakdown(false)}>Close</button>
        </div>
      </div>
    ) : null
  );

  const EarmarkBreakdownModal = () => (
    selectedEarmark && showEarmarkBreakdown ? (
      <div className="modal-overlay" key={showEarmarkBreakdown ? 'open' : 'closed'}>
        <div className="modal">
          <h2>Earmark Poll: {selectedEarmark}</h2>
          <p><strong>Total Registered Voters (Est.): {registeredVotersEstimate.toLocaleString()}</strong></p>
          <div className="poll-breakdown">
            <h3>Aggregated Poll (All Tiers)</h3>
            {(() => {
              const poll = earmarkPolls[selectedEarmark] || {};
              const totalYea = Object.values(poll).reduce((sum, tier) => sum + (tier.yea || 0), 0);
              const totalNay = Object.values(poll).reduce((sum, tier) => sum + (tier.nay || 0), 0);
              const totalVotes = totalYea + totalNay;
              const yeaPercent = Math.round((totalYea / (totalVotes || 1)) * 100);
              return (
                <p>
                  Yea: {totalYea} ({yeaPercent}%) | Nay: {totalNay}
                </p>
              );
            })()}
            <p>Tier Breakdown: Verified In-District: {earmarkPolls[selectedEarmark]?.in?.yea || 0} Yea | Out-of-District: {earmarkPolls[selectedEarmark]?.out?.yea || 0} Yea | Local: {earmarkPolls[selectedEarmark]?.local?.yea || 0} Yea</p>
            <button onClick={() => handleVote('yea', null, selectedEarmark)}>Vote Yea</button>
            <button onClick={() => handleVote('nay', null, selectedEarmark)}>Vote Nay</button>
          </div>
          <button onClick={() => {
            setShowEarmarkBreakdown(false);
            setSelectedEarmark(null);
          }}>Close</button>
        </div>
      </div>
    ) : null
  );

  const CommentBreakdownModal = () => (
    selectedComment && showCommentBreakdown ? (
      <div className="modal-overlay" key={showCommentBreakdown ? 'open' : 'closed'}>
        <div className="modal">
          <h2>Support Poll for Comment: {selectedComment}</h2>
          <p><strong>Total Registered Voters (Est.): {registeredVotersEstimate.toLocaleString()}</strong></p>
          <div className="poll-breakdown">
            <h3>Aggregated Poll (All Tiers)</h3>
            {(() => {
              const poll = commentPolls[selectedComment] || {};
              const totalYea = Object.values(poll).reduce((sum, tier) => sum + (tier.yea || 0), 0);
              const totalNay = Object.values(poll).reduce((sum, tier) => sum + (tier.nay || 0), 0);
              const totalVotes = totalYea + totalNay;
              const yeaPercent = Math.round((totalYea / (totalVotes || 1)) * 100);
              return (
                <p>
                  Support: {totalYea} ({yeaPercent}%) | Oppose: {totalNay}
                </p>
              );
            })()}
            <p>Tier Breakdown: Verified In-District: {commentPolls[selectedComment]?.in?.yea || 0} Support | Out-of-District: {commentPolls[selectedComment]?.out?.yea || 0} Support | Local: {commentPolls[selectedComment]?.local?.yea || 0} Support</p>
            <button onClick={() => handleVote('yea', null, null, selectedComment)}>Support</button>
            <button onClick={() => handleVote('nay', null, null, selectedComment)}>Oppose</button>
          </div>
          <button onClick={() => {
            setShowCommentBreakdown(false);
            setSelectedComment(null);
          }}>Close</button>
        </div>
      </div>
    ) : null
  );

  const RepPollBreakdownModal = () => (
    showRepPollBreakdown && selectedRepPoll ? (
      <div className="modal-overlay" key={showRepPollBreakdown ? 'open' : 'closed'}>
        <div className="modal">
          <h2>Approve/Disapprove Poll for {selectedRepPoll}</h2>
          <p><strong>Total Votes: {((repPolls[selectedRepPoll]?.in?.approve || 0) + (repPolls[selectedRepPoll]?.in?.disapprove || 0) + (repPolls[selectedRepPoll]?.out?.approve || 0) + (repPolls[selectedRepPoll]?.out?.disapprove || 0) + (repPolls[selectedRepPoll]?.local?.approve || 0) + (repPolls[selectedRepPoll]?.local?.disapprove || 0))}</strong></p>
          <div className="poll-breakdown">
            <h3>Aggregated Poll (All Tiers)</h3>
            {(() => {
              const poll = repPolls[selectedRepPoll] || {};
              const totalApprove = (poll.in?.approve || 0) + (poll.out?.approve || 0) + (poll.local?.approve || 0);
              const totalDisapprove = (poll.in?.disapprove || 0) + (poll.out?.disapprove || 0) + (poll.local?.disapprove || 0);
              const totalVotes = totalApprove + totalDisapprove;
              const approvePercent = Math.round((totalApprove / (totalVotes || 1)) * 100);
              return (
                <p>
                  Approve: {totalApprove} ({approvePercent}%) | Disapprove: {totalDisapprove}
                </p>
              );
            })()}
            <p>Tier Breakdown: Verified In-District: {repPolls[selectedRepPoll]?.in?.approve || 0} Approve | Out-of-District: {repPolls[selectedRepPoll]?.out?.approve || 0} Approve | Local: {repPolls[selectedRepPoll]?.local?.approve || 0} Approve</p>
            <button onClick={() => handleVote('approve', null, null, null, selectedRepPoll)}>Approve</button>
            <button onClick={() => handleVote('disapprove', null, null, null, selectedRepPoll)}>Disapprove</button>
          </div>
          <button onClick={() => {
            setShowRepPollBreakdown(false);
            setSelectedRepPoll(null);
          }}>Close</button>
        </div>
      </div>
    ) : null
  );

  const RepModal = () => (
    showRepModal && selectedRep ? (
      <div className="modal-overlay">
        <div className="modal">
          <h2>{selectedRep.name}</h2>
          <p><strong>Party:</strong> {selectedRep.party} | <strong>Level:</strong> {selectedRep.level} | <strong>Score:</strong> {selectedRep.score}%</p>
          <button onClick={() => setShowRepModal(false)}>Close</button>
          <div className="rep-bio">
            <h3>Bio <button onClick={() => setExpandedBio(!expandedBio)}>Toggle</button></h3>
            {expandedBio && <p>{repDetails.bio}</p>}
          </div>
          <div className="rep-votes">
            <h3>Voting History <button onClick={() => setExpandedVotes(!expandedVotes)}>Toggle</button></h3>
            {expandedVotes && (
              <ul>
                {repDetails.votes.map((v, i) => <li key={i}>{v}</li>)}
              </ul>
            )}
          </div>
          <div className="rep-bills">
            <h3>Supported Bills <button onClick={() => setExpandedBills(!expandedBills)}>Toggle</button></h3>
            {expandedBills && (
              <ul>
                {repDetails.bills.map((b, i) => <li key={i}>{b}</li>)}
              </ul>
            )}
          </div>
          <div className="rep-comments">
            <h3>Official X Comments <button onClick={() => setExpandedComments(!expandedComments)}>Toggle</button></h3>
            {expandedComments && (
              <ul>
                {repDetails.comments.map((c, i) => (
                  <li key={i}>
                    {c}
                    <CommentPollBar comment={c} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    ) : null
  );

  const PollSlidingBar = () => (
    bill ? (
      <div className="poll-sliding-bar" onClick={() => setShowPollBreakdown(true)}>
        <div className="bar-container">
          <div className="yea-bar" style={{ width: `${Math.round((pollResults.yea / (pollResults.yea + pollResults.nay || 1) * 100))}%` }}>
            Yea ({pollResults.yea})
          </div>
          <div className="nay-bar" style={{ width: `${Math.round((pollResults.nay / (pollResults.yea + pollResults.nay || 1) * 100))}%` }}>
            Nay ({pollResults.nay})
          </div>
        </div>
        <p>Click for breakdown</p>
      </div>
    ) : null
  );

  const EarmarkPollBar: React.FC<{ earmark: string }> = ({ earmark }) => {
    const earmarkResults = earmarkPolls[earmark] || { yea: 0, nay: 0 };
    const yea = Number(earmarkResults.yea) || 0;
    const nay = Number(earmarkResults.nay) || 0;
    const total = yea + nay || 1;
    return (
      <div className="poll-sliding-bar" onClick={() => {
        setSelectedEarmark(earmark);
        setShowEarmarkBreakdown(true);
      }}>
        <div className="bar-container">
          <div className="yea-bar" style={{ width: `${Math.round((yea / total) * 100)}%` }}>
            Yea ({yea})
          </div>
          <div className="nay-bar" style={{ width: `${Math.round((nay / total) * 100)}%` }}>
            Nay ({nay})
          </div>
        </div>
        <p>Click for earmark breakdown</p>
      </div>
    );
  };

  const CommentPollBar: React.FC<{ comment: string }> = ({ comment }) => {
    // commentPolls[comment] is a TieredPollResult, so we need to aggregate across tiers
    const poll = commentPolls[comment] || {};
    const totalYea = Object.values(poll).reduce((sum, tier) => sum + (tier.yea || 0), 0);
    const totalNay = Object.values(poll).reduce((sum, tier) => sum + (tier.nay || 0), 0);
    const totalVotes = totalYea + totalNay || 1;
    return (
      <div className="poll-sliding-bar" onClick={() => {
        setSelectedComment(comment);
        setShowCommentBreakdown(true);
      }}>
        <div className="bar-container">
          <div className="yea-bar" style={{ width: `${Math.round((totalYea / totalVotes) * 100)}%` }}>
            Yea ({totalYea})
          </div>
          <div className="nay-bar" style={{ width: `${Math.round((totalNay / totalVotes) * 100)}%` }}>
            Nay ({totalNay})
          </div>
        </div>
        <p>Click for support breakdown</p>
      </div>
    );
  };

  const RepPollBar: React.FC<{ rep: Rep }> = ({ rep }) => {
    const repResults = repPolls[rep.name] || {};
    const totalApprove = (repResults.in?.approve || 0) + (repResults.out?.approve || 0) + (repResults.local?.approve || 0);
    const totalDisapprove = (repResults.in?.disapprove || 0) + (repResults.out?.disapprove || 0) + (repResults.local?.disapprove || 0);
    const total = totalApprove + totalDisapprove;
    const approvePercent = Math.round((totalApprove / (total || 1)) * 100);
    return (
      <div className="rep-poll-bar" onClick={() => {
        setSelectedRepPoll(rep.name);
        setShowRepPollBreakdown(true);
      }}>
        <div className="bar-container">
          <div className="approve-bar" style={{ width: `${approvePercent}%` }}>
            Approve ({totalApprove})
          </div>
          <div className="disapprove-bar" style={{ width: `${100 - approvePercent}%` }}>
            Disapprove ({totalDisapprove})
          </div>
        </div>
        <p>Click for approve/disapprove breakdown (Feeds Score: {rep.score}%)</p>
      </div>
    );
  };

 return (  // Explicit return — this fixes 'void'
    <div className="App">
      <header>
        <h1>{appName}</h1>
        <p>Your reps. Real-time. Your voice.</p>
        <NotificationBanner />
      </header>
      <main>
        <input
          type="text"
          placeholder="Enter ZIP code"
          value={zip}
          onChange={(e) => setZip(e.target.value)}
          maxLength={5}
        />
        <button onClick={() => fetchReps(zip)} disabled={loading || !zip}>
          {loading ? 'Loading...' : 'Show My Reps'}
        </button>
        {!voterVerified && <button onClick={() => verifyVoter(zip)}>Verify Voter</button>}
        <AuthForm />
        {reps.length > 0 && (
          <div>
            <p className="county-banner">Your County: {county} <a href={`https://www.google.com/search?q=${county}+county+officials`} target="_blank" rel="noopener noreferrer">Search Local Officials</a></p>
            <div className="reps-grid">
             {reps.filter((rep, index, self) => 
  index === self.findIndex(r => r.id === rep.id && r.name === rep.name && r.level === rep.level)
).map((rep, i) => (
  <div key={`${rep.id}-${rep.name}-${rep.level}-${i}`} className="rep-card" onClick={() => {
    fetchRepDetails(rep);
    setShowRepModal(true);
  }}>
    <img src={rep.photo} alt={rep.name} />
    <h4>{rep.name}</h4>
    <p>{rep.party} | {rep.level} | Accountability: {rep.score}%</p>
    <RepPollBar rep={rep} />
    <a href={rep.contact}>Contact</a>
    {rep.phone && <a href={`tel:${rep.phone}`}>📞 Call</a>}
  </div>
))}
            </div>
          </div>
        )}
        {bill && (
          <div className="bill-card">
            <h3>{bill.title} ({bill.summary})</h3>
            <p><strong>TL;DR:</strong> {bill.tldr}</p>
            <ul>
              {bill.keyPoints?.map((point, i) => <li key={i}>{point}</li>)}
            </ul>
            <PollSlidingBar />
            {bill.earmarks && bill.earmarks.length > 0 && (
              <div className="earmarks-section">
                <h4>Earmarks Attached</h4>
                <ul>
                  {bill.earmarks.map((earmark, i) => (
                    <li key={i}>
                      {earmark}
                      <EarmarkPollBar earmark={earmark} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
        <PollBreakdownModal />
        <EarmarkBreakdownModal />
        <CommentBreakdownModal />
        <RepPollBreakdownModal />
                <RepModal />
      </main>
    </div>
  );  // Closes return
}
  
  export default App;
