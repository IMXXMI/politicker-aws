/*
 * Copyright © 2025 [Calvin T Jones Jr]. All rights reserved.
 * This source code is protected under U.S. and international copyright laws.
 * Unauthorized reproduction, distribution, or modification is prohibited.
 * For licensing inquiries, contact [caltjr@gmail.com].
 */

import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import type { User } from 'firebase/auth';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider, TwitterAuthProvider, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, addDoc, onSnapshot, query, where } from 'firebase/firestore';
import './App.css';


  
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
  measurementId: "G-27487L2DTT"
};


const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();
const twitterProvider = new TwitterAuthProvider();
const PROXY = 'https://corsproxy.io/?'; // CORS bypass

function App() {
  type Rep = {
    name: string;
    party?: string;
    photo?: string;
    level?: string;
    contact?: string;
    phone?: string;
    score?: number;
    id?: string;
    xHandle?: string;
  };

  const [zip, setZip] = useState('');
  const [reps, setReps] = useState<Rep[]>([]);
  const [county, setCounty] = useState('');
  const [bill, setBill] = useState<{ title?: string; summary?: string; tldr?: string; keyPoints?: string[]; earmarks?: string[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [appName] = useState('Politicker');
  const [selectedRep, setSelectedRep] = useState<Rep | null>(null);
  const [repDetails, setRepDetails] = useState<{ bio: string; votes: string[]; bills: string[]; comments: string[] }>({ bio: '', votes: [], bills: [], comments: [] });
  const [voterVerified, setVoterVerified] = useState(false);
  const [showPollBreakdown, setShowPollBreakdown] = useState(false);
  const [showEarmarkBreakdown, setShowEarmarkBreakdown] = useState(false);
  const [selectedEarmark, setSelectedEarmark] = useState<string | null>(null);
  const [showRepPollBreakdown, setShowRepPollBreakdown] = useState(false);
  const [selectedRepPoll, setSelectedRepPoll] = useState<string | null>(null);
  const [selectedComment, setSelectedComment] = useState<string | null>(null);
  const [showCommentBreakdown, setShowCommentBreakdown] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showAuth, setShowAuth] = useState(false);
  const [isSignup, setIsSignup] = useState(true);
  const [isInDistrict, setIsInDistrict] = useState(false);
  const [showRepModal, setShowRepModal] = useState(false);
  const [expandedBio, setExpandedBio] = useState(false);
  const [expandedVotes, setExpandedVotes] = useState(false);
  const [expandedBills, setExpandedBills] = useState(false);
  const [expandedComments, setExpandedComments] = useState(false);

  // Poll states
  const [pollResults, setPollResults] = useState({ yea: 0, nay: 0, in: { yea: 0, nay: 0 }, out: { yea: 0, nay: 0 }, local: { yea: 0, nay: 0 } });
  const [earmarkPolls, setEarmarkPolls] = useState<Record<string, { yea: number; nay: number; in?: { yea: number; nay: number }; out?: { yea: number; nay: number }; local?: { yea: number; nay: number } }>>({});
  const [commentPolls, setCommentPolls] = useState<Record<string, { yea: number; nay: number; in?: { yea: number; nay: number }; out?: { yea: number; nay: number }; local?: { yea: number; nay: number } }>>({});
  const [repPolls, setRepPolls] = useState<Record<string, { approve: number; disapprove: number; in?: { approve: number; disapprove: number }; out?: { approve: number; disapprove: number }; local?: { approve: number; disapprove: number } }>>({});
  const [registeredVotersEstimate, setRegisteredVotersEstimate] = useState(0);
  const [localPollResults, setLocalPollResults] = useState({ yea: 0, nay: 0 });
  const [outPollResults, setOutPollResults] = useState({ yea: 0, nay: 0 });
  const [inDistrictPollResults, setInDistrictPollResults] = useState({ yea: 0, nay: 0 });

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
        snapshot.docs.forEach(doc => {
          const poll = doc.data();
          if (poll.tier === 'local') setLocalPollResults(poll.results);
          if (poll.tier === 'out') setOutPollResults(poll.results);
          if (poll.tier === 'in') setInDistrictPollResults(poll.results);
          if (poll.earmark) setEarmarkPolls(prev => ({ ...prev, [poll.earmark]: poll.results }));
          if (poll.comment) setCommentPolls(prev => ({ ...prev, [poll.comment]: poll.results }));
          if (poll.rep) setRepPolls(prev => ({ ...prev, [poll.rep]: poll.results }));
        });
        // Aggregate main poll
        setPollResults({
          yea: localPollResults.yea + outPollResults.yea + inDistrictPollResults.yea,
          nay: localPollResults.nay + outPollResults.nay + inDistrictPollResults.nay,
          in: inDistrictPollResults,
          out: outPollResults,
          local: localPollResults
        });
      });
      return unsubscribe;
    }
  };

// Voter verification
const verifyVoter = async (zipCode: string): Promise<boolean> => {
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
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      alert('Signup failed: ' + message);
    }
  };
  const handleLogin = async () => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
      setShowAuth(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      alert('Login failed: ' + message);
    }
  };
  const handleGoogleLogin = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      await verifyVoter(zip); // Await for completion
      await addDoc(collection(db, 'users'), { uid: user.uid, email: user.email, verified: voterVerified, zip, provider: 'google' });
      setShowAuth(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      alert('Google login failed: ' + message);
    }
  };
  const handleXLogin = async () => {
    try {
      const result = await signInWithPopup(auth, twitterProvider);
      const user = result.user;
      await verifyVoter(zip); // Await for completion
      await addDoc(collection(db, 'users'), { uid: user.uid, email: user.email, verified: voterVerified, zip, provider: 'twitter' });
      setShowAuth(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      alert('X login failed: ' + message);
    }
  };
  // Vote (single, tier tracked from user)
 const handleVote = async (
  choice: 'yea' | 'nay' | 'approve' | 'disapprove',
  tier: 'in' | 'out' | 'local' | null = null,
  earmark: string | null = null,
  comment: string | null = null,
  repName: string | null = null
 ): Promise<void> => {
  if (!user) {
    alert('Create account to vote!');
    setShowAuth(true);
    return;
  }
  const effectiveTier = tier || (voterVerified && isInDistrict ? 'in' : voterVerified ? 'out' : 'local');
  const pollKey = `poll_${effectiveTier}_${bill?.title || 'unknown'}_${choice}` + (earmark ? `_${earmark}` : '') + (comment ? `_${comment}` : '') + (repName ? `_${repName}` : '');
  if (localStorage.getItem(pollKey)) {
    alert('You already voted!');
    return;
  }
  localStorage.setItem(pollKey, 'voted');

  // cast for indexed access to avoid implicit any
    try {
      if (!earmark && !comment && !repName) {
        setPollResults(prev => ({ ...prev, [choice]: ((prev as any)[choice] || 0) + 1 }));
      } else if (earmark) {
        setEarmarkPolls(prev => {
          const earmarkEntry = (prev as any)[earmark] || {};
          const tierEntry = earmarkEntry[effectiveTier] || { yea: 0, nay: 0 };
          return { ...prev, [earmark]: { ...earmarkEntry, [effectiveTier]: { ...tierEntry, [choice]: ((tierEntry as any)[choice] || 0) + 1 } } };
        });
      } else if (comment) {
        setCommentPolls(prev => {
          const commentEntry = (prev as any)[comment] || {};
          const tierEntry = commentEntry[effectiveTier] || { yea: 0, nay: 0 };
          return { ...prev, [comment]: { ...commentEntry, [effectiveTier]: { ...tierEntry, [choice]: ((tierEntry as any)[choice] || 0) + 1 } } };
        });
      } else if (repName) {
        setRepPolls(prev => {
          const repEntry = (prev as any)[repName] || {};
          const tierEntry = repEntry[effectiveTier] || { approve: 0, disapprove: 0 };
          const updatedTierEntry = { ...tierEntry, [choice]: ((tierEntry as any)[choice] || 0) + 1 };
          const aggregated = Object.values({ ...repEntry, [effectiveTier]: updatedTierEntry }).reduce((acc: { approve: number; disapprove: number }, t: any) => {
            acc.approve = (acc.approve || 0) + (t.approve || 0);
            acc.disapprove = (acc.disapprove || 0) + (t.disapprove || 0);
            return acc;
          }, { approve: 0, disapprove: 0 });
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
const apiKey = process.env.REACT_APP_GEOCODIO_API_KEY;
if (!apiKey) {
  console.error('Geocodio API key missing from .env');
  throw new Error('API key missing');
}
console.log('API Key partial:', apiKey.substring(0, 10) + '...'); // Debug without full key

const fields = 'cd,stateleg'; // Abbreviated for congressional_districts and state_legislative_districts // Add required fields
const url = `https://api.geocod.io/v1.9/geocode?q=${zipCode}&fields=${fields}&api_key=${apiKey}`;
const res = await fetch(`${PROXY}${encodeURIComponent(url)}`);;
const responseText = await res.text();
if (!res.ok) throw new Error(`Geocodio fail: ${res.status}`);
if (responseText.startsWith('<!DOCTYPE')) throw new Error('Proxy returned HTML');
const data = JSON.parse(responseText);
  
 console.log('Geocodio data:', data); // Debug — matches your test
if (!data.results || data.results.length === 0) throw new Error('No results');
const result = data.results[0];
// ... rest of parsing (already good)

  const allReps = [];
  const countyName = result.address_components?.county || 'Unknown County';
  setCounty(countyName);

  // Federal & State parsing (with null check)
  console.log('Fields available:', Object.keys(result.fields || {})); // Debug
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
    ['senate', 'house'].forEach((chamber: string) => {
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

  if (allReps.length === 0) {
    console.warn('No legislators found — using fallback for ZIP', zipCode); // Debug
    // Fallback mocks for ZIP 23112 (VA reps)
    allReps.push(
      { name: 'Abigail Spanberger', party: 'Dem', photo: 'https://placehold.co/100x100?text=Spanberger', level: 'federal house', contact: 'https://spanberger.house.gov', phone: '(202) 225-5176', score: 80, id: '412478', xHandle: '@RepABSpanberger' },
      { name: 'Bob Good', party: 'Rep', photo: 'https://placehold.co/100x100?text=Good', level: 'federal house', contact: 'https://good.house.gov', phone: '(202) 225-4711', score: 75, id: '456789', xHandle: '@RepBobGood' },
      { name: 'Mark Warner', party: 'Dem', photo: 'https://placehold.co/100x100?text=Warner', level: 'federal senate', contact: 'https://www.warner.senate.gov', phone: '(202) 224-2023', score: 78, id: '300098', xHandle: '@MarkWarner' }
    );
  }

  console.log('Setting reps:', allReps.length, 'reps'); // Debug
  setReps(allReps);
} catch (err) {
  console.error('Geocodio Error:', err);
  // Mock fallback for ZIP 23112 (VA reps)
  setReps([
    { name: 'Abigail Spanberger', party: 'Dem', photo: 'https://placehold.co/100x100?text=Spanberger', level: 'federal house', contact: 'https://spanberger.house.gov', phone: '(202) 225-5176', score: 80, id: '412478', xHandle: '@RepABSpanberger' },
    { name: 'Bob Good', party: 'Rep', photo: 'https://placehold.co/100x100?text=Good', level: 'federal house', contact: 'https://good.house.gov', phone: '(202) 225-4711', score: 75, id: '456789', xHandle: '@RepBobGood' },
    { name: 'Mark Warner', party: 'Dem', photo: 'https://placehold.co/100x100?text=Warner', level: 'federal senate', contact: 'https://www.warner.senate.gov', phone: '(202) 224-2023', score: 78, id: '300098', xHandle: '@MarkWarner' }
  ]);
  setCounty('Chesterfield County');
}
setLoading(false);
};
// Fetch sample bill (with earmarks)
const fetchSampleBill = async () => {
  let fullText = '';
  let earmarks: string[] = [];
  let actions: any[] = [];
  let latestAction = 'Pending';

  try {
   const apiKey = process.env.REACT_APP_CONGRESS_API_KEY;
   const congress = 118; // Current congress

if (!apiKey) throw new Error('Congress API key missing');
const listRes = await fetch(`${PROXY}${encodeURIComponent(`https://api.congress.gov/v3/bill?api_key=$$ {apiKey}&limit=1&congress= $${congress}&format=json`)}`);
    
   const res = await fetch('/api/bill');
console.log('Bill proxy res status:', res.status); // Debug
if (!res.ok) throw new Error('Proxy fail');
const data = await res.json();
const billData = data.bill;
const actions = billData.actions || [];
const latestAction = actions[0]?.text || 'Pending';
const billId = `${billData.congress}-${billData.billType}-${billData.number}`;

    // Full text for earmarks
    const textRes = await fetch(`https://api.congress.gov/v3/bill/${billId}/text?api_key=${apiKey}&format=json`);
    if (textRes.ok) {
      const textData = await textRes.json();
      fullText = textData.textVersions?.[0]?.text || '';
      const earmarkMatches = fullText.match(/\$[\d,]+(?:\.\d+)?\s*for\s+the\s+(?:use\s+of|benefit\s+of|project\s+in|construction\s+of)\s+([^\.]+?)(?=\.|for\s+\$)/gi) || [];
      earmarks = earmarkMatches.slice(0, 5).map(match => match.trim());
    }
   

    const inferredPros = actions?.[0]?.classification?.includes('Passed') ? 'Advances key policy' : 'Supports rights/allies';
    const inferredCons = fullText.toLowerCase().includes('review') ? 'Potential bureaucratic costs' : 'Possible tensions/costs';

    setBill({
      title: `${billData.billType || billData.type || ''} ${billData.number || ''} - ${billData.title || billData.officialTitle || 'Recent Bill'}`,
      summary: billData.officialTitle || billData.popularTitle || billData.title || 'Recent Bill',
      tldr: (fullText.substring(0, 150) || '') + '...',
      keyPoints: [
        `Sponsor: ${billData.sponsor?.name || 'Unknown'}`,
        `Status: ${latestAction}`,
        `Pros: ${inferredPros}`,
        `Cons: ${inferredCons}`
      ],
      earmarks
    });
    return;
  } catch (err) {
  console.error('Bill fetch error:', err); // Debug
  setBill(null); // No mocks — hide bill card
}
};

  useEffect(() => {
    if (reps.length > 0) fetchSampleBill();
  }, [reps]);

  const fetchRepDetails = async (rep: Rep) => {
  setSelectedRep(rep);
  try {
    let personId = rep.id;
    if (personId === 'unknown') {
      const searchUrl = `https://www.govtrack.us/api/v2/person?search=${encodeURIComponent(rep.name)}&format=json`;
      const encodedSearch = encodeURIComponent(searchUrl);
      // Search
const searchRes = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(searchUrl)}`);
const responseText = await searchRes.text(); // Raw text first
if (!searchRes.ok) {
  console.error('Search res not OK:', searchRes.status);
  throw new Error('GovTrack search fail');
}
const text = responseText; // Use raw text
if (text.startsWith('<!DOCTYPE')) {
  throw new Error('GovTrack returned HTML — quota hit or bad key');
}
const searchData = JSON.parse(text);
personId = searchData.objects[0]?.id || '412478';
console.log('GovTrack ID:', personId); // Debug
    }

    // Bio
    const bioUrl = `https://www.govtrack.us/api/v2/person/${personId}?format=json`;
    const encodedBio = encodeURIComponent(bioUrl);
    const bioRes = await fetch(`${PROXY}${encodeURIComponent(bioUrl)}`);
const bioText = await bioRes.text(); // Raw text
if (bioText.startsWith('<!DOCTYPE')) throw new Error('GovTrack quota');
const bioData = JSON.parse(bioText);
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
    if (rep.xHandle) {
      const xRes = await fetch(`https://api.twitter.com/2/users/by/username/${rep.xHandle.replace('@', '')}/tweets?max_results=5&tweet.fields=created_at&query=${encodeURIComponent(bill?.title || '')}`, {
        headers: { 'Authorization': `Bearer ${xBearer}` }
      });
      if (xRes.ok) {
        const xData = await xRes.json();
        const comments = xData.data?.map((tweet: any) => tweet.text).slice(0, 3) || ['No recent comments.'];
        setRepDetails(prevState => ({ ...prevState, comments }));
      }
    }

    // County fallback
    if (rep.level && rep.level.includes('county')) {
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
          <p>Tier Breakdown: Verified In-District: {pollResults.in?.yea || 0} Yea | Out-of-District: {pollResults.out?.yea || 0} Yea | Local: {pollResults.local?.yea || 0} Yea</p>
          <button onClick={() => handleVote('yea')}>Vote Yea</button>
          <button onClick={() => handleVote('nay')}>Vote Nay</button>
        </div>
        <button onClick={() => setShowPollBreakdown(false)}>Close</button>
      </div>
    </div>
  ) : null
);
 const EarmarkBreakdownModal = () => (
  (selectedEarmark && showEarmarkBreakdown) ? (
    <div className="modal-overlay" key={showEarmarkBreakdown ? 'open' : 'closed'}>
      <div className="modal">
        <h2>Earmark Poll: {selectedEarmark}</h2>
        <p><strong>Total Registered Voters (Est.): {registeredVotersEstimate.toLocaleString()}</strong></p>
        <div className="poll-breakdown">
          <h3>Aggregated Poll (All Tiers)</h3>
          <p>Yea: {earmarkPolls[selectedEarmark]?.yea || 0} ({Math.round(((earmarkPolls[selectedEarmark]?.yea || 0) / ((earmarkPolls[selectedEarmark]?.yea || 0) + (earmarkPolls[selectedEarmark]?.nay || 0) || 1) * 100) || 0)}%) | Nay: {earmarkPolls[selectedEarmark]?.nay || 0}</p>
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
          <p>Support: {commentPolls[selectedComment]?.yea || 0} ({Math.round(((commentPolls[selectedComment]?.yea || 0) / ((commentPolls[selectedComment]?.yea || 0) + (commentPolls[selectedComment]?.nay || 0) || 1) * 100) || 0)}%) | Oppose: {commentPolls[selectedComment]?.nay || 0}</p>
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
        <p><strong>Total Votes: {(repPolls[selectedRepPoll]?.approve || 0) + (repPolls[selectedRepPoll]?.disapprove || 0)}</strong></p>
        <div className="poll-breakdown">
          <h3>Aggregated Poll (All Tiers)</h3>
          <p>Approve: {repPolls[selectedRepPoll]?.approve || 0} ({Math.round(((repPolls[selectedRepPoll]?.approve || 0) / (((repPolls[selectedRepPoll]?.approve || 0) + (repPolls[selectedRepPoll]?.disapprove || 0)) || 1) * 100) || 0)}%) | Disapprove: {repPolls[selectedRepPoll]?.disapprove || 0}</p>
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
    bill && (
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
    )
  );

  const EarmarkPollBar = ({ earmark }: { earmark: string }) => {
    const earmarkResults = earmarkPolls[earmark] || { yea: 0, nay: 0 };
    return (
      <div className="poll-sliding-bar" onClick={() => {
        setSelectedEarmark(earmark);
        setShowEarmarkBreakdown(true);
      }}>
        <div className="bar-container">
          <div className="yea-bar" style={{ width: `${Math.round((earmarkResults.yea / (earmarkResults.yea + earmarkResults.nay || 1) * 100))}%` }}>
            Yea ({earmarkResults.yea})
          </div>
          <div className="nay-bar" style={{ width: `${Math.round((earmarkResults.nay / (earmarkResults.yea + earmarkResults.nay || 1) * 100))}%` }}>
            Nay ({earmarkResults.nay})
          </div>
        </div>
        <p>Click for earmark breakdown</p>
      </div>
    );
  };

  const CommentPollBar = ({ comment }: { comment: string }) => {
    const commentResults = commentPolls[comment] || { yea: 0, nay: 0 };
    return (
      <div className="poll-sliding-bar" onClick={() => {
        setSelectedComment(comment);
        setShowCommentBreakdown(true);
      }}>
        <div className="bar-container">
          <div className="yea-bar" style={{ width: `${Math.round((commentResults.yea / (commentResults.yea + commentResults.nay || 1) * 100))}%` }}>
            Yea ({commentResults.yea})
          </div>
          <div className="nay-bar" style={{ width: `${Math.round((commentResults.nay / (commentResults.yea + commentResults.nay || 1) * 100))}%` }}>
            Nay ({commentResults.nay})
          </div>
        </div>
        <p>Click for support breakdown</p>
      </div>
    );
  };

  const RepPollBar = ({ rep }: { rep: Rep }) => {
    const repResults = repPolls[rep.name] || { approve: 0, disapprove: 0 };
    const total = repResults.approve + repResults.disapprove;
    const approvePercent = Math.round((repResults.approve / total || 1) * 100);
    return (
      <div className="rep-poll-bar" onClick={() => {
        setSelectedRepPoll(rep.name);
        setShowRepPollBreakdown(true);
      }}>
        <div className="bar-container">
          <div className="approve-bar" style={{ width: `${approvePercent}%` }}>
            Approve ({repResults.approve})
          </div>
          <div className="disapprove-bar" style={{ width: `${100 - approvePercent}%` }}>
            Disapprove ({repResults.disapprove})
          </div>
        </div>
        <p>Click for approve/disapprove breakdown (Feeds Score: {rep.score}%)</p>
      </div>
    );
  };

return (
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
            {reps.map((rep, i) => (
              <div key={i} className="rep-card" onClick={() => {
                fetchRepDetails(rep);
                setShowRepModal(true); // Opens modal
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
);
}
export default App;