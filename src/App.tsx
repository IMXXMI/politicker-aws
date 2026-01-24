import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider, TwitterAuthProvider, onAuthStateChanged, User, signOut } from 'firebase/auth';
import { getFirestore, collection, addDoc, onSnapshot, query, where, serverTimestamp } from 'firebase/firestore';
import './App.css';





  
  // All types top-level (outside App)
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

type Bill = {
  title: string;
  summary?: string;
  tldr?: string;
  keyPoints?: string[];
  earmarks?: string[];
};

type Poll = {
  id?: string; // optional because we add it manually
  question: string;
  scope: 'district' | 'state' | 'nationwide';
  tier: 'local' | 'out' | 'in';
  options: string[];
  creatorId: string;
  createdAt: any; // or import Timestamp from firebase/firestore
  isActive: boolean;
};

type RepDetails = { bio: string; votes: string[]; bills: string[]; comments: string[] };

type PollResult = { yea: number; nay: number };
type TieredPollResult = {
  [tier: string]: PollResult;
};


  function App() {  // Line 9 — opening brace
  // Your state/useEffect here
  // Auth listener
  const [reps, setReps] = useState<Rep[]>([]);
  const [county, setCounty] = useState('');
  const [zip, setZip] = useState('');
  const [bill, setBill] = useState<Bill | null>(null);
  const [loading, setLoading] = useState(false);
  const [appName] = useState('Politicker');
  const [selectedRep, setSelectedRep] = useState<Rep | null>(null);
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
  const [showAdmin, setShowAdmin] = useState(false);
  const [currentPoll, setCurrentPoll] = useState<Poll | null>(null);
  const [userVote, setUserVote] = useState<string | null>(null); // User's choice for this poll
  const [pollLoading, setPollLoading] = useState(true);
  const [expandedBillSummary, setExpandedBillSummary] = useState(false);
  const [expandedSupportedBills, setExpandedSupportedBills] = useState(false);
  const [street, setStreet] = useState('');
const [city, setCity] = useState('');
const [stateCode, setStateCode] = useState('');
const [userState, setUserState] = useState('');
const [customPollVotes, setCustomPollVotes] = useState<{ [pollId: string]: string }>({}); // pollId -> chosen option
const [activeTab, setActiveTab] = useState<'federal' | 'state' | 'international' | 'spending' | 'all'>('federal');
const lambdaProxy = 'https://u7ytsxbjnna4spqngwzo2wxbx40rziyc.lambda-url.us-east-2.on.aws';
const stateVoterLookup: { [key: string]: string } = {
  'AL': 'https://myinfo.alabamavotes.gov/VoterView/RegistrantSearch.do',
  'AK': 'https://myvoterinformation.alaska.gov/',
  'AZ': 'https://voter.azsos.gov/VoterView/RegistrantSearch.do',
  'AR': 'https://www.voterview.ar.gov/VoterView/RegistrantSearch.do',
  'CA': 'https://voterstatus.sos.ca.gov/',
  'CO': 'https://www.sos.state.co.us/voter/pages/pub/home.xhtml',
  'CT': 'https://portaldir.ct.gov/sots/LookUp.aspx',
  'DE': 'https://ivote.de.gov/VoterView',
  'FL': 'https://registration.elections.myflorida.com/CheckVoterStatus',
  'GA': 'https://mvp.sos.ga.gov/MVP/mvp.do',
  'HI': 'https://ballotpedia.org/Hawaii_voter_registration', // No direct lookup
  'ID': 'https://elections.idaho.gov/voter-registration',
  'IL': 'https://ova.elections.il.gov/RegistrationLookup.aspx',
  'IN': 'https://indianavoters.in.gov/',
  'IA': 'https://sos.iowa.gov/elections/voterreg/reglookup.aspx',
  'KS': 'https://myvoteinfo.voteks.org/VoterView/RegistrantSearch.do',
  'KY': 'https://vrsws.sos.ky.gov/VIC/',
  'LA': 'https://voterportal.sos.la.gov/Voter',
  'ME': 'https://www.maine.gov/sos/cec/elec/voter-info/index.html',
  'MD': 'https://voterservices.elections.maryland.gov/VoterSearch',
  'MA': 'https://www.sec.state.ma.us/VoterRegistrationSearch/MyVoterRegistrationSearch.aspx',
  'MI': 'https://mvic.sos.state.mi.us/Voter/Index',
  'MN': 'https://mnvotes.sos.state.mn.us/VoterStatus.aspx',
  'MS': 'https://www.sos.ms.gov/Vote/Pages/default.aspx',
  'MO': 'https://s1.sos.mo.gov/elections/voterlookup/',
  'MT': 'https://voter.mt.gov/',
  'NE': 'https://www.votercheck.necvr.ne.gov/VoterView',
  'NV': 'https://www.nvsos.gov/votersearch/',
  'NH': 'https://app.sos.nh.gov/Public/VoterInformationLookup.aspx',
  'NJ': 'https://voter.svrs.nj.gov/registration-check',
  'NM': 'https://voterview.state.nm.us/VoterView',
  'NY': 'https://voterlookup.elections.ny.gov/',
  'NC': 'https://vt.ncsbe.gov/RegLkup/',
  'ND': 'https://vip.sos.nd.gov/WhereToVote.aspx',
  'OH': 'https://voterlookup.ohiosos.gov/voterlookup.aspx',
  'OK': 'https://okvoterportal.okelections.us/',
  'OR': 'https://secure.sos.state.or.us/orestar/vr/showVoterSearch.do',
  'PA': 'https://www.pavoterservices.pa.gov/pages/voterregistrationstatus.aspx',
  'RI': 'https://vote.sos.ri.gov/',
  'SC': 'https://info.scvotes.sc.gov/eng/voterinquiry/VoterInformationRequest.aspx',
  'SD': 'https://vip.sdsos.gov/VoterSearch.aspx',
  'TN': 'https://tnmap.tn.gov/voterlookup/',
  'TX': 'https://teamrv-mvp.sos.texas.gov/MVP/mvp.do',
  'UT': 'https://vote.utah.gov/',
  'VT': 'https://mvp.vermont.gov/',
  'VA': 'https://vote.elections.virginia.gov/VoterInformation',
  'WA': 'https://voter.votewa.gov/WhereToVote.aspx',
  'WV': 'https://services.sos.wv.gov/Elections/Voter/AmIRegisteredToVote',
  'WI': 'https://myvote.wi.gov/en-us/My-Voter-Info',
  'WY': 'https://sos.wyo.gov/Elections/RegisteringToVote.aspx'
};

useEffect(() => {
  const saved = localStorage.getItem('customPollVotes');
  if (saved) {
    setCustomPollVotes(JSON.parse(saved));
  }
}, []);

// Load all votes real-time (aggregate counts)
useEffect(() => {
  if (!user) {
    setPollResults({ yea: 0, nay: 0 });
    setEarmarkPolls({});
    setCommentPolls({});
    setRepPolls({});
    return;
  }

  const votesRef = collection(db, 'votes');

  const unsubscribe = onSnapshot(votesRef, (snapshot) => {
    const pollResultsTemp: PollResult = { yea: 0, nay: 0 };
    const earmarkTemp: { [key: string]: TieredPollResult } = {};
    const commentTemp: { [key: string]: TieredPollResult } = {};
    const repTemp: { [key: string]: { [tier: string]: { approve: number; disapprove: number } } } = {};

    snapshot.docs.forEach(doc => {
      const v = doc.data() as {
        pollType: 'main' | 'earmark' | 'comment' | 'rep';
        pollId: string;
        choice: 'yea' | 'nay' | 'approve' | 'disapprove';
        tier: 'local' | 'out' | 'in';
      };

      if (v.pollType === 'main') {
        if (v.choice === 'yea') pollResultsTemp.yea++;
        if (v.choice === 'nay') pollResultsTemp.nay++;
      } else if (v.pollType === 'earmark') {
        if (!earmarkTemp[v.pollId]) earmarkTemp[v.pollId] = { local: { yea: 0, nay: 0 }, out: { yea: 0, nay: 0 }, in: { yea: 0, nay: 0 } };
        earmarkTemp[v.pollId][v.tier][v.choice as 'yea' | 'nay']++;
      } else if (v.pollType === 'comment') {
        if (!commentTemp[v.pollId]) commentTemp[v.pollId] = { local: { yea: 0, nay: 0 }, out: { yea: 0, nay: 0 }, in: { yea: 0, nay: 0 } };
        commentTemp[v.pollId][v.tier][v.choice as 'yea' | 'nay']++;
      } else if (v.pollType === 'rep') {
        if (!repTemp[v.pollId]) repTemp[v.pollId] = { local: { approve: 0, disapprove: 0 }, out: { approve: 0, disapprove: 0 }, in: { approve: 0, disapprove: 0 } };
        repTemp[v.pollId][v.tier][v.choice as 'approve' | 'disapprove']++;
      }
    });

    setPollResults(pollResultsTemp);
    setEarmarkPolls(earmarkTemp);
    setCommentPolls(commentTemp);
    setRepPolls(repTemp);
  });

  return () => unsubscribe();
}, [user]);

  // Poll states
  
  const [pollResults, setPollResults] = useState<PollResult>({ yea: 0, nay: 0 });
  const [earmarkPolls, setEarmarkPolls] = useState<{ [earmark: string]: TieredPollResult }>({});
  const [commentPolls, setCommentPolls] = useState<{ [comment: string]: TieredPollResult }>({});
  const [repPolls, setRepPolls] = useState<{ [repName: string]: { [tier: string]: { approve: number; disapprove: number } } }>({});
  const [registeredVotersEstimate, setRegisteredVotersEstimate] = useState(0);

// Fetch active polls (nationwide > state > district, first match)
useEffect(() => {
  if (!user || !zip) return; // Wait for user and ZIP

  const pollsRef = collection(db, 'polls');
  const q = query(pollsRef, where('isActive', '==', true));

  const unsubscribe = onSnapshot(q, (snapshot) => {
    const polls = snapshot.docs.map(doc => ({
  id: doc.id,
  ...doc.data() as Omit<Poll, 'id'>
}));
    if (polls.length === 0) {
      setCurrentPoll(null);
      setPollLoading(false);
      return;
    }

    // Find best poll: nationwide, then state, then district
    const nationwide = polls.find(p => p.scope === 'nationwide');
    if (nationwide) {
      setCurrentPoll(nationwide);
      setPollLoading(false);
      return;
    }

    // Add state/district matching logic later (need state from Geocodio)
    setCurrentPoll(polls[0] || null); // Fallback to first active
    setPollLoading(false);
  });

  return () => unsubscribe();
}, [user, zip]);

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


const getElectionId = async () => {
  const apiKey = process.env.REACT_APP_GOOGLE_API_KEY;
  const res = await fetch(`https://www.googleapis.com/civicinfo/v2/elections?key=${apiKey}`);
  const data = await res.json();
  console.log('Available elections:', data.elections);
  return data.elections[0]?.id || null; // Use the first (current) election
};

  const verifyVoter = async (fullAddress: string) => {
  if (!fullAddress.trim()) {
    alert('Please enter your full address');
    return;
    let normalized = fullAddress.trim()
  .replace(/\s+/g, ' ')
  .replace(/ rd$/i, ' Road')
  .replace(/ st$/i, ' Street')
  .replace(/ ave$/i, ' Avenue');
  }

  try {
    const apiKey = process.env.REACT_APP_GOOGLE_API_KEY;
    if (!apiKey) throw new Error('Google API key missing');

    // Get current electionId (cache it or run once)
    const electionRes = await fetch(`https://www.googleapis.com/civicinfo/v2/elections?key=${apiKey}`);
    const electionData = await electionRes.json();
    const electionId = electionData.elections?.[0]?.id;

    if (!electionId) {
      alert('No current election found');
      return;
    }

    const url = `https://www.googleapis.com/civicinfo/v2/voterinfo?key=${apiKey}&address=${encodeURIComponent(fullAddress)}&electionId=${electionId}`;
    const res = await fetch(url);
    if (!res.ok) {
      const errorData = await res.json();
      console.error('Google Civic error:', errorData);
      alert('Address not recognized or no voter info — try a known address');
      return;
    }

    const data = await res.json();

    if (data.pollingLocations?.length > 0 || data.dropOffLocations?.length > 0 || data.earlyVoteSites?.length > 0) {
      setVoterVerified(true);
      alert('Voter registration verified! Polling info available.');
    } else {
      alert('No polling info found — check your state election website.');
    }
  } catch (err) {
    console.error('Verification error:', err);
    alert('Verification failed — try again.');
  }
};
  // Signup/Login
 const handleSignup = async () => {
  try {
    if (!auth || !db) throw new Error('Firebase not initialized');
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
      if (!auth || !db) throw new Error('Firebase not initialized');
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
      if (!auth || !db) throw new Error('Firebase not initialized');
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
      if (!auth || !db) throw new Error('Firebase not initialized');
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
    return; // ← STOP EVERYTHING — no local update, no localStorage
  }

  // ... rest of function (localStorage, state updates, Firestore save)
  // Stable unique key for localStorage (prevents duplicate votes)
  const pollKey = `vote_${user.uid}_${repName || earmark || comment || 'main_bill'}`;
  if (localStorage.getItem(pollKey)) {
    alert('You already voted!');
    return;
  }
  localStorage.setItem(pollKey, 'voted');

  // Determine tier
  const isInDistrict = true; // Replace with real logic later
  const effectiveTier = tier || (voterVerified && isInDistrict ? 'in' : voterVerified ? 'out' : 'local');

  try {
    // Update local state (immediate UI feedback)
    if (!earmark && !comment && !repName) {
      if (choice === 'yea' || choice === 'nay') {
        setPollResults(prev => ({ ...prev, [choice]: (prev[choice] || 0) + 1 }));
      }
    } else if (earmark) {
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
        let pollKey: 'approve' | 'disapprove';
        if (choice === 'yea' || choice === 'approve') pollKey = 'approve';
        else if (choice === 'nay' || choice === 'disapprove') pollKey = 'disapprove';
        else {
          alert('Invalid vote choice for rep poll.');
          return prev;
        }
        const updatedTierEntry = { ...tierEntry, [pollKey]: (tierEntry[pollKey] || 0) + 1 };
        const aggregated = Object.values({ ...repEntry, [effectiveTier]: updatedTierEntry }).reduce(
          (acc, t) => {
            acc.approve += t.approve || 0;
            acc.disapprove += t.disapprove || 0;
            return acc;
          },
          { approve: 0, disapprove: 0 }
        );
        const aggTotal = aggregated.approve + aggregated.disapprove;
        setTimeout(() => updateRepScore(repName, aggregated.approve, aggTotal || 1), 0);
        return { ...prev, [repName]: { ...repEntry, [effectiveTier]: updatedTierEntry } };
      });
    }

    // Save vote to 'votes' collection (not polls)
    await addDoc(collection(db, 'votes'), {
      userId: user.uid,
      pollType: repName ? 'rep' : earmark ? 'earmark' : comment ? 'comment' : 'main',
      pollId: repName || earmark || comment || bill?.title || 'main',
      choice,
      tier: effectiveTier,
      timestamp: serverTimestamp()
    });
  } catch (err) {
    console.error('Vote save error:', err);
    alert('Failed to record vote.');
  }
};
 const handlePollVote = async (option: string) => {
  if (!user) {
    alert('Please sign in to vote!');
    setShowAuth(true);
    return;
  }
  if (!currentPoll) {
    alert('No poll loaded');
    return;
  }

  // Check if already voted on this custom poll
  if (customPollVotes[currentPoll.id || '']) {
    alert('You already voted on this poll');
    return;
  }

  try {
    await addDoc(collection(db, 'votes'), {
      pollId: currentPoll.id,
      userId: user.uid,
      option,
      createdAt: serverTimestamp()
    });

    // Save locally
    const newVotes = { ...customPollVotes, [currentPoll.id || '']: option };
    setCustomPollVotes(newVotes);
    localStorage.setItem('customPollVotes', JSON.stringify(newVotes));

    setUserVote(option);
    alert('Vote recorded!');
  } catch (err) {
    alert('Vote failed');
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

const ciceroApiKey = process.env.REACT_APP_CICERO_API_KEY;


 
const ciceroUrl = `https://app.cicerodata.com/v3.1/official/?key=${process.env.REACT_APP_CICERO_API_KEY}&address=${zipCode}&district_type=NATIONAL_LOWER,STATE_LOWER,STATE_UPPER&format=json`;
const ciceroEndpoint = 'https://u7ytsxbjnna4spqngwzo2wxbx40rziyc.lambda-url.us-east-2.on.aws/cicero';
const ciceroRes = await fetch(`${lambdaProxy}/cicero?zip=${zipCode}`);
if (ciceroRes.ok) {
  const data = await ciceroRes.json();
  console.log('Cicero Lambda data:', data);
  if (data.officials && data.officials.length > 0) {
    data.officials.forEach((official: any) => {
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
      return;
    }
  }
}
const federalOfficials = [
  // Supreme Court
 {
    name: 'Donald Trump',
    party: 'Republican',
    photo: 'https://theunitedstates.io/images/congress/450x550/T000000.jpg',
    level: 'President',
    contact: 'https://www.whitehouse.gov/contact/',
    phone: '(202) 456-1111',
    score: 75, // or real score later
    id: 'president',
    xHandle: '@realDonaldTrump'
  },
  {
    name: 'JD Vance',
    party: 'Republican',
    photo: 'https://theunitedstates.io/images/congress/450x550/V000137.jpg',
    level: 'Vice President',
    contact: 'https://www.whitehouse.gov/contact/',
    phone: '(202) 456-1111',
    score: 72,
    id: 'vice-president',
    xHandle: '@JDVance'
  },
{
    name: 'John G. Roberts, Jr.',
    party: 'Chief Justice',
    photo: 'https://www.supremecourt.gov/about/biographies/current/Roberts.jpg',
    level: 'Supreme Court',
    contact: 'https://www.supremecourt.gov/contact/contactus.aspx',
    phone: '(202) 479-3000',
    score: 85,
    id: 'scotus-roberts',
    xHandle: ''
  },
  {
    name: 'Clarence Thomas',
    party: 'Associate Justice',
    photo: 'https://www.supremecourt.gov/about/biographies/current/Thomas.jpg',
    level: 'Supreme Court',
    contact: 'https://www.supremecourt.gov/contact/contactus.aspx',
    phone: '(202) 479-3000',
    score: 78,
    id: 'scotus-thomas',
    xHandle: ''
  },
  {
    name: 'Samuel A. Alito, Jr.',
    party: 'Associate Justice',
    photo: 'https://www.supremecourt.gov/about/biographies/current/Alito.jpg',
    level: 'Supreme Court',
    contact: 'https://www.supremecourt.gov/contact/contactus.aspx',
    phone: '(202) 479-3000',
    score: 80,
    id: 'scotus-alito',
    xHandle: ''
  },
  // Add more justices as needed (Sotomayor, Kagan, Gorsuch, Kavanaugh, Barrett, Jackson)

  // Example key cabinet (optional)
  {
    name: 'Antony Blinken',
    party: 'Secretary of State',
    photo: 'https://www.state.gov/wp-content/uploads/2019/05/Blinken-Antony-Official-Portrait-2400x3000-1.jpg',
    level: 'Cabinet',
    contact: 'https://www.state.gov/contact/',
    phone: '(202) 647-4000',
    score: 75,
    id: 'cabinet-blinken',
    xHandle: '@SecBlinken'
  },
  {
    name: 'Janet Yellen',
    party: 'Secretary of the Treasury',
    photo: 'https://home.treasury.gov/system/files/266/Yellen-Official-Portrait.jpg',
    level: 'Cabinet',
    contact: 'https://home.treasury.gov/footer/contact-us',
    phone: '(202) 622-2000',
    score: 82,
    id: 'cabinet-yellen',
    xHandle: '@SecYellen'
  }
];
allReps.unshift(...federalOfficials);
  // Geocodio fallback (state view for more reps)
 const geocodioApiKey = process.env.REACT_APP_GEOCODIO_API_KEY;
 
if (geocodioApiKey) {
  const fields = 'cd,stateleg';
  const url = `https://api.geocod.io/v1.9/geocode?q=${zipCode}&fields=${fields}&api_key=${geocodioApiKey}`;
  const res = await fetch(url); // Direct — Geocodio allows CORS
  if (res.ok) {
    const data = await res.json();
    console.log('Geocodio fallback data:', data);
    if (data.results && data.results.length > 0) {
      const result = data.results[0];
         // After parsing Geocodio result
const stateAbbrev = result.address_components.state || 'VA'; // Fallback VA
setUserState(stateAbbrev); // Add state to state: const [userState, setUserState] = useState('');


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
    }
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
      const listRes = await fetch(`https://api.congress.gov/v3/bill?api_key=${apiKey}&limit=1&congress=${congress}&format=json`);
      console.log('Bill proxy res status:', listRes.status); // Debug
      if (!listRes.ok) throw new Error('Proxy fail');
      const listData = await listRes.json();
      let billId = listData.bills[0]?.billId || 'hr1-118';
      const detailRes = await fetch(`https://api.congress.gov/v3/bill/${billId}?api_key=${apiKey}&format=json`);
      if (!detailRes.ok) throw new Error('Detail API fail');
      const detailData = await detailRes.json();
      const bill = detailData.bill;
      actions = bill.actions || [];
      latestAction = actions[0]?.text || 'Pending';
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
};  // Closes function
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
      const listRes = await fetch(`https://api.congress.gov/v3/bill?api_key=${apiKey}&limit=1&congress=${congress}&format=json`);
      if (!listRes.ok) throw new Error('Proxy fail');
      const listData = await listRes.json();
      let billId = listData.bills[0]?.billId || 'hr1-118';
     const detailRes = await fetch(`https://api.congress.gov/v3/bill/${billId}?api_key=${apiKey}&format=json`);
      if (!detailRes.ok) throw new Error('Detail API fail');
      const detailData = await detailRes.json();
      const bill = detailData.bill;
      actions = bill.actions || [];
      latestAction = actions[0]?.text || 'Pending';
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
  
// Fetch bio from Ballotpedia (independent of GovTrack)

const fetchBioFromBallotpedia = async (repName: string): Promise<string> => {
  try {
    // 1. Define searchUrlBp first
    const searchUrlBp = `https://ballotpedia.org/api.php?action=query&list=search&srsearch=${encodeURIComponent(repName)}&format=json`;

    // 2. Define lambdaProxy (or use full URL)
    const lambdaProxy = 'https://u7ytsxbjnna4spqngwzo2wxbx40rziyc.lambda-url.us-east-2.on.aws';

    // 3. Now use them
    const searchResBp = await fetch(`${lambdaProxy}/ballotpedia?url=${encodeURIComponent(searchUrlBp)}`);
    const searchTextBp = await searchResBp.text();
    const searchDataBp = JSON.parse(searchTextBp);

    if (searchDataBp.query?.search?.length > 0) {
      const pageTitle = searchDataBp.query.search[0].title;
      const pageUrl = `https://ballotpedia.org/${encodeURIComponent(pageTitle)}`;

      const pageResBp = await fetch(`${lambdaProxy}/ballotpedia?url=${encodeURIComponent(pageUrl)}`);
      const pageHtml = await pageResBp.text();

      const bioMatch = pageHtml.match(/<p>([\s\S]*?)<\/p>/i);
      if (bioMatch) {
        const bioText = bioMatch[1]
          .replace(/<[^>]*>/g, '')
          .replace(/\[\d+\]/g, '')
          .trim();
        return bioText || 'Bio not available';
      }
    }
  } catch (e) {
    console.warn('Ballotpedia fetch failed for', repName, e);
  }
  return 'Bio not available';
};


  const fetchRepDetails = async (rep: Rep) => {
  setSelectedRep(rep);
  setRepDetails({ bio: 'Loading...', votes: [], bills: [], comments: [] });

  try {
    

   
// GovTrack proxy (define outside if block)
const govtrackProxy = 'https://u7ytsxbjnna4spqngwzo2wxbx40rziyc.lambda-url.us-east-2.on.aws/govtrack';

let personId = rep.id;
const ballotpediaBio = await fetchBioFromBallotpedia(rep.name);

// GovTrack search fallback if ID unknown
if (personId === 'unknown') {
  const searchUrl = `https://www.govtrack.us/api/v2/person?search=${encodeURIComponent(rep.name)}&format=json`;
  const searchRes = await fetch(`${lambdaProxy}/govtrack?url=${encodeURIComponent(searchUrl)}`);
  const searchText = await searchRes.text();

  try {
    const searchData = JSON.parse(searchText);
    if (searchData.objects && searchData.objects.length > 0) {
      personId = searchData.objects[0].id;
    } else {
      personId = '412478'; // Fallback
    }
  } catch (e) {
    console.warn('Failed to parse GovTrack search');
    personId = '412478';
  }
}

// GovTrack data (votes, bills) — now uses defined govtrackProxy
const endpoints = [
  `person/${personId}`,
  `vote?person=${personId}&order_by=-date&limit=5`,
  `bill?sponsor=${personId}&order_by=-introduced&limit=5`
];

const [bioRes, votesRes, billsRes] = await Promise.all(
  endpoints.map(ep => 
    fetch(`${govtrackProxy}?url=${encodeURIComponent(`https://www.govtrack.us/api/v2/${ep}?format=json`)}`)
  )
);

const [bioText, votesText, billsText] = await Promise.all([bioRes, votesRes, billsRes].map(r => r.text()));
const bioData = JSON.parse(bioText);
const votesData = JSON.parse(votesText);
const billsData = JSON.parse(billsText);



    // X comments
    let comments = [];
    try {
      const xBearer = 'AAAAAAAAAAAAAAAAAAAAAMGQ5gEAAAAAa5%2BJbMeiSGNNP6yWAV2Ym2f0N7c%3DKk8IMQH1aHwIKDTQUKaYH7fn5on3uNyNe6VQgBoLKPr82owH5Q';
      const xRes = await fetch(`https://api.twitter.com/2/users/by/username/${rep.xHandle.replace('@', '')}/tweets?max_results=5`, {
        headers: { 'Authorization': `Bearer ${xBearer}` }
      });
      if (xRes.ok) {
        const xData = await xRes.json();
        comments = xData.data?.map((tweet: any) => tweet.text).slice(0, 3) || ['No recent comments.'];
      }
    } catch (e) {
      console.warn('X comments fetch failed', e);
      comments = ['No recent comments.'];
    }

    // County fallback
    if (rep.level.includes('county')) {
      setRepDetails({
  bio: ballotpediaBio !== 'Bio not available' ? ballotpediaBio : (bioData.object?.bio || 'Bio not available'),
  votes: votesData.objects?.map((v: any) => `${v.question.title} (Vote: ${v.result}) on ${v.date}`) || [],
  bills: billsData.objects?.map((b: any) => `${b.number} - ${b.title} (${b.current_status})`) || [],
  comments: repDetails.comments
});
      return;
    }

    // Final update
    setRepDetails({
      bio: ballotpediaBio !== 'Bio not available' ? ballotpediaBio : (bioData.object?.bio || 'Bio not available'),
      votes: votesData.objects?.map((v: any) => `${v.question.title} (Vote: ${v.result}) on ${v.date}`) || [],
      bills: billsData.objects?.map((b: any) => `${b.number} - ${b.title} (${b.current_status})`) || [],
      comments
    });

  } catch (err) {
    console.error('Rep details error:', err);
    setRepDetails({
      bio: 'Error loading details',
      votes: [],
      bills: [],
      comments: []
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
    <div className="modal-overlay">
      <div className="modal">
        <h2>{isSignup ? 'Sign Up' : 'Sign In'}</h2>
        <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <button onClick={isSignup ? handleSignup : handleLogin}>
          {isSignup ? 'Sign Up' : 'Sign In'}
        </button>
        <button onClick={handleGoogleLogin}>Sign in with Google</button>
        <button onClick={handleXLogin}>Sign in with X</button>
        <p onClick={() => setIsSignup(!isSignup)} style={{cursor: 'pointer'}}>
          {isSignup ? 'Already have an account? Sign In' : 'Need an account? Sign Up'}
        </p>
        <button onClick={() => setShowAuth(false)}>Close</button>
      </div>
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
    <div className="modal-overlay">
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
  <h3>Supported Bills <button onClick={() => setExpandedSupportedBills(!expandedSupportedBills)}>Toggle</button></h3>
  {expandedSupportedBills && (
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
    <div className="rep-poll-bar">
      <div className="bar-container">
        <div className="approve-bar" style={{ width: `${approvePercent}%` }}>
          Approve ({totalApprove})
        </div>
        <div className="disapprove-bar" style={{ width: `${100 - approvePercent}%` }}>
          Disapprove ({totalDisapprove})
        </div>
      </div>
      <p 
        style={{ cursor: 'pointer', color: 'blue', textDecoration: 'underline', margin: '8px 0 0 0' }}
        onClick={(e) => {
          e.stopPropagation(); // ← Critical: stops rep card click
          setSelectedRepPoll(rep.name);
          setShowRepPollBreakdown(true);
        }}
      >
        Click for approve/disapprove breakdown (Feeds Score: {rep.score}%)
      </p>
    </div>
  );
};
const AdminModal = ({ onClose }: { onClose: () => void }) => {
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollScope, setPollScope] = useState('district');
  const [pollTier, setPollTier] = useState('local');
  const [pollOptions, setPollOptions] = useState(['Option 1', 'Option 2']);
  const [newOption, setNewOption] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(false);

  const addOption = () => {
    if (newOption.trim()) {
      setPollOptions([...pollOptions, newOption.trim()]);
      setNewOption('');
    }
  };

  const removeOption = (index: number) => {
    setPollOptions(pollOptions.filter((_, i) => i !== index));
  };

  const handleAdminLogin = async () => {
  setLoading(true);
  try {
    const testEmail = 'admin@politickerapp.com'; // Hardcoded — exact match from Firebase user
    console.log('Trying hardcoded login with:', testEmail); // Debug

    const userCredential = await signInWithEmailAndPassword(auth, testEmail, adminPassword);
    const user = userCredential.user;
    console.log('Login success:', user.email);

    if (user.email === 'admin@politickerapp.com') {
      console.log('Admin verified — showing poll form');
      setIsAdmin(true);
    } else {
      alert('Wrong email (hardcoded mismatch)');
    }
  } catch (err) {
    console.error('Login error:', err);
    alert('Login failed: ' + (err as Error).message);
  }
  setLoading(false);
};
  const handlePollCreate = async () => {
    if (!pollQuestion || pollOptions.length < 2) {
      alert('Question and at least 2 options required');
      return;
    }
    try {
   await addDoc(collection(db, 'polls'), {
  question: pollQuestion,
  scope: pollScope,
  tier: pollTier,
  options: pollOptions,
  creatorId: user!.uid,  // ← This is safe — user is logged in
  createdAt: serverTimestamp(),
  isActive: true
});
      alert('Poll created!');
      setPollQuestion('');
      setPollScope('district');
      setPollTier('local');
      setPollOptions(['Option 1', 'Option 2']);
    } catch (err) {
      alert('Failed to create poll: ' + (err as Error).message);
    }
  };

  // Single return — shows login OR poll form based on isAdmin
  return (
  <div className="modal-overlay">
    <div className="modal">
      {!isAdmin ? (
        <>
          <h2>Admin Login</h2>
          <input type="email" placeholder="Admin Email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} />
          <input type="password" placeholder="Password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} />
          <button onClick={handleAdminLogin} disabled={loading}>
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </>
      ) : (
        <>
          <h2>Create Poll</h2>
          <input type="text" placeholder="Question" value={pollQuestion} onChange={(e) => setPollQuestion(e.target.value)} />
          <select value={pollScope} onChange={(e) => setPollScope(e.target.value)}>
            <option value="district">District</option>
            <option value="state">State</option>
            <option value="nationwide">Nationwide</option>
          </select>
          <select value={pollTier} onChange={(e) => setPollTier(e.target.value)}>
            <option value="local">Local</option>
            <option value="out">Out-of-District</option>
            <option value="in">In-District</option>
          </select>
          <h4>Multiple Choice Options</h4>
          {pollOptions.map((option, index) => (
            <div key={index}>
              <input type="text" value={option} onChange={(e) => {
                const newOptions = [...pollOptions];
                newOptions[index] = e.target.value;
                setPollOptions(newOptions);
              }} />
              <button type="button" onClick={() => removeOption(index)}>Remove</button>
            </div>
          ))}
          <input type="text" placeholder="New Option" value={newOption} onChange={(e) => setNewOption(e.target.value)} />
          <button type="button" onClick={addOption}>Add Option</button>
          <button onClick={handlePollCreate} disabled={loading}>Create Poll</button>
        </>
      )}
      <button onClick={onClose}>Close</button>
    </div>
  </div>
);
};



 return (
  <div className="App">
    <header className="header">
  <div className="header-main">
    <h1>{appName}</h1>
    <p>Your reps. Real-time. Your voice.</p>
  </div>
  <div className="header-buttons">
    {user ? (
      <p>Signed in as: {user.email}</p>
    ) : (
      <button onClick={() => setShowAuth(true)}>Sign In / Sign Up</button>
    )}
    <button onClick={() => setShowAdmin(true)}>Admin</button>
  </div>
  <NotificationBanner />
</header>

       {/* Current Poll at Top */}
    {pollLoading ? (
      <p className="loading">Loading poll...</p>
    ) : currentPoll ? (
      <div className="poll-card">
        <h3> {currentPoll.question}</h3>
        <form>
          {currentPoll.options.map((option: string, index: number) => {
            const isVoted = !!customPollVotes[currentPoll.id || ''];
            const isSelected = customPollVotes[currentPoll.id || ''] === option;
            return (
              <label key={index} className="poll-option">
                <input
                  type="radio"
                  name="pollVote"
                  value={option}
                  checked={isSelected}
                  disabled={isVoted}
                  onChange={() => handlePollVote(option)}
                />
                {option}
                {isVoted && isSelected && ' (Your vote)'}
              </label>
            );
          })}
        </form>
        {customPollVotes[currentPoll.id || ''] && (
          <p style={{color: 'green', fontWeight: 'bold'}}>
            You already voted: {customPollVotes[currentPoll.id || '']}
          </p>
        )}
      </div>
    ) : (  // ← This closes the currentPoll ? ( ... )
      <p>No active poll</p>
    )}  

    {/* Voter Verification */}
    <div className="voter-verify">
      <h3> Verify Voter </h3>
      <p>Enter your address (privacy protected — no name needed).</p>
      <div className="address-grid">
        <input type="text" placeholder="Street Address" value={street} onChange={(e) => setStreet(e.target.value)} />
        <input type="text" placeholder="City" value={city} onChange={(e) => setCity(e.target.value)} />
        <input type="text" placeholder="State (e.g., VA)" value={stateCode} onChange={(e) => setStateCode(e.target.value.toUpperCase())} maxLength={2} />
        <input type="text" placeholder="ZIP Code" value={zip} onChange={(e) => setZip(e.target.value)} maxLength={5} />
      </div>
      <button onClick={() => verifyVoter(`${street}, ${city}, ${stateCode} ${zip}`)}>
        Verify Registration
      </button>
      {voterVerified && <p className="verified">Verified! Higher poll priority unlocked.</p>}
      {userState && stateVoterLookup[userState] && (
        <p className="state-link">
          Official check: <a href={stateVoterLookup[userState]} target="_blank" rel="noopener">Open {userState} Voter Portal</a>
        </p>
      )}
    </div>

    <main>
      <button onClick={() => fetchReps(zip)} disabled={loading || !zip}>
        {loading ? 'Loading Reps...' : 'Show My Reps'}
      </button>
<div className="main-tabs">
  <button className={activeTab === 'federal' ? 'active' : ''} onClick={() => setActiveTab('federal')}>
    Federal Government
  </button>
  <button className={activeTab === 'state' ? 'active' : ''} onClick={() => setActiveTab('state')}>
    State Government
  </button>
  <button className={activeTab === 'international' ? 'active' : ''} onClick={() => setActiveTab('international')}>
    International Representatives
  </button>
  <button className={activeTab === 'spending' ? 'active' : ''} onClick={() => setActiveTab('spending')}>
    Government Spending
  </button>
  <button className={activeTab === 'all' ? 'active' : ''} onClick={() => setActiveTab('all')}>
    All
  </button>
</div>
   {reps.length > 0 && (activeTab === 'federal' || activeTab === 'state' || activeTab === 'all') && (
  <div className="reps-section">
    <p className="county-banner">Your County: {county}</p>

    {/* Tabs */}
    <div className="reps-tabs">
      <button 
        className={activeTab === 'federal' ? 'active' : ''} 
        onClick={() => setActiveTab('federal')}
      >
        Federal
      </button>
      <button 
        className={activeTab === 'state' ? 'active' : ''} 
        onClick={() => setActiveTab('state')}
      >
        State
      </button>
      <button 
        className={activeTab === 'all' ? 'active' : ''} 
        onClick={() => setActiveTab('all')}
      >
        All
      </button>
    </div>

    {/* Filtered Reps Grid */}
    <div className="reps-grid">
      {reps
        .filter((rep) => {
          if (activeTab === 'federal') {
            return rep.level.includes('federal') || rep.level === 'President' || rep.level === 'Vice President' || rep.level === 'Supreme Court' || rep.level === 'Cabinet';
          }
          if (activeTab === 'state') {
            return rep.level.includes('state');
          }
          return true; // all
        })
        .map((rep, i) => (
          <div 
            key={i} 
            className="rep-card" 
            onClick={() => fetchRepDetails(rep)}
          >
            <img src={rep.photo} alt={rep.name} />
            <h4>{rep.name}</h4>
            <p>{rep.party} | {rep.level}</p>
            <p>Accountability: {rep.score}%</p>
            <RepPollBar rep={rep} />
            <a href={rep.contact}>Contact</a>
            {rep.phone && <a href={`tel:${rep.phone}`}>📞 Call</a>}
          </div>
        ))}
    </div>
  </div>
)}

{activeTab === 'international' && (
  <div className="international-section">
    <h2>International Representatives</h2>
    <p>U.S. Ambassadors and key diplomatic posts</p>
    <div className="reps-grid">
      {/* Example ambassadors */}
      {[
        { name: 'Linda Thomas-Greenfield', title: 'U.N. Ambassador', country: 'United Nations', photo: 'https://upload.wikimedia.org/wikipedia/commons/5/5f/Linda_Thomas-Greenfield_official_photo.jpg' },
        { name: 'Rahm Emanuel', title: 'Ambassador to Japan', country: 'Japan', photo: 'https://jp.usembassy.gov/wp-content/uploads/sites/131/2022/01/Rahm-Emanuel-Official-Portrait-1024x683.jpg' },
        // Add more
      ].map((amb, i) => (
        <div key={i} className="rep-card">
          <img src={amb.photo} alt={amb.name} />
          <h4>{amb.name}</h4>
          <p>{amb.title}</p>
          <p>{amb.country}</p>
        </div>
      ))}
    </div>
  </div>
)}

{activeTab === 'spending' && (
  <div className="spending-section">
    <h2>Government Spending Tracker</h2>
    <p>Live view of proposed federal spending bills and earmarks</p>
    <div className="spending-list">
      <div className="spending-item">
        <h3>H.R. 1234 - Infrastructure Investment Act</h3>
        <p>Proposed: $1.2 trillion</p>
        <p>Status: Passed House</p>
        <p>Earmarks: 142 projects ($45B)</p>
      </div>
      {/* Add more */}
    </div>
  </div>
)}



      {/* Modals */}
      <RepModal />
      <RepPollBreakdownModal />
      {showAdmin && <AdminModal onClose={() => setShowAdmin(false)} />}
      <AuthForm />
    </main>
   </div>
); // ← Closes return (
} // ← Closes App function

export default App;