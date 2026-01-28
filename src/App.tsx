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

const updateRepScore = (repName: string, approveVotes: number, totalVotes: number) => {
    const newScore = Math.round((approveVotes / totalVotes) * 100) || 50;
    setReps(prev => prev.map(r => r.name === repName ? { ...r, score: newScore } : r));
  };

const fetchReps = async (zipCode: string) => {
    console.log('fetchReps called with ZIP:', zipCode);
    setLoading(true);
    // TODO: Implement fetchReps logic
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
  }

  let normalized = fullAddress.trim()
    .replace(/\s+/g, ' ')
    .replace(/ rd$/i, ' Road')
    .replace(/ st$/i, ' Street')
    .replace(/ ave$/i, ' Avenue');

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

  return (
    <div className="App">
      {/* Your JSX here */}
    </div>
  );
}

export default App;


  