import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider, TwitterAuthProvider, onAuthStateChanged, User, signOut } from 'firebase/auth';
import { getFirestore, collection, addDoc, onSnapshot, query, where, serverTimestamp } from 'firebase/firestore';
import './App.css';
import { Timestamp } from 'firebase/firestore';  // Add this import at the top with other Firebase imports

// AdminModal component
const AdminModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  return (
    <div className="modal">
      <div className="modal-content">
        <button className="modal-close" onClick={onClose}>×</button>
        <h2>Admin Panel</h2>
        <p>Admin controls go here</p>
      </div>
    </div>
  );
};

// AuthForm component
const AuthForm: React.FC<{ onClose?: () => void }> = ({ onClose }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignup, setIsSignup] = useState(true);

  return (
    <div className="modal">
      <div className="modal-content">
        <button className="modal-close" onClick={onClose}>×</button>
        <h2>{isSignup ? 'Sign Up' : 'Sign In'}</h2>
        <input 
          type="email" 
          placeholder="Email" 
          value={email} 
          onChange={(e) => setEmail(e.target.value)} 
        />
        <input 
          type="password" 
          placeholder="Password" 
          value={password} 
          onChange={(e) => setPassword(e.target.value)} 
        />
        <button onClick={() => setIsSignup(!isSignup)}>
          {isSignup ? 'Already have an account? Sign In' : 'Need an account? Sign Up'}
        </button>
      </div>
    </div>
  );
};

type Poll = {
  id?: string;
  question: string;
  scope: 'district' | 'state' | 'nationwide';
  tier: 'local' | 'out' | 'in';
  options: string[];
  creatorId: string;
  createdAt: Timestamp;  // ← Use Timestamp instead of any
  isActive: boolean;
};

  
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


type RepDetails = { bio: string; votes: string[]; bills: string[]; comments: string[] };

type PollResult = { yea: number; nay: number };
type TieredPollResult = {
  [tier: string]: PollResult;
};


  function App() {  // Line 9 — opening brace
  // Your state/useEffect here
  // Auth listener
   // Poll states
  
  const [pollResults, setPollResults] = useState<PollResult>({ yea: 0, nay: 0 });
  const [earmarkPolls, setEarmarkPolls] = useState<{ [earmark: string]: TieredPollResult }>({});
  const [commentPolls, setCommentPolls] = useState<{ [comment: string]: TieredPollResult }>({});
  const [repPolls, setRepPolls] = useState<{ [repName: string]: { [tier: string]: { approve: number; disapprove: number } } }>({});
  const [registeredVotersEstimate, setRegisteredVotersEstimate] = useState(0);
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

  // Mock reps for now (shows President/VP + some federal reps)
  const mockReps: Rep[] = [
    {
      name: 'Donald Trump',
      party: 'Republican',
      photo: 'https://theunitedstates.io/images/congress/450x550/T000000.jpg',
      level: 'President',
      contact: 'https://www.whitehouse.gov/contact/',
      phone: '(202) 456-1111',
      score: 75,
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
      name: 'Abigail Spanberger',
      party: 'Dem',
      photo: 'https://placehold.co/100x100?text=Spanberger',
      level: 'federal house',
      contact: 'https://spanberger.house.gov',
      phone: '(202) 225-5176',
      score: 80,
      id: '412478',
      xHandle: '@RepABSpanberger'
    }
  ];

  setReps(mockReps);
  setCounty('Chesterfield County'); // fallback until Geocodio is back
  setLoading(false);
};

const fetchRepDetails = (rep: Rep) => {
    setSelectedRep(rep);
    setShowRepModal(true);
    // TODO: Fetch detailed bio, votes, bills, comments from API or Firestore
    setRepDetails({ bio: '', votes: [], bills: [], comments: [] });
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
    {/* Header */}
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
    </header>

    {/* Current Poll at Top */}
    {pollLoading ? (
      <p className="loading">Loading poll...</p>
    ) : currentPoll ? (
      <div className="poll-card">
        <h3>{currentPoll.question}</h3>
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
    ) : (
      <p>No active poll</p>
    )}

    {/* Voter Verification */}
    <div className="voter-verify">
      <h3>Verify Voter</h3>
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
          Official check: <a href={stateVoterLookup[userState]} target="_blank" rel="noopener noreferrer">Open {userState} Voter Portal</a>
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

          <div className="reps-grid">
            {reps
              .filter((rep) => {
                if (activeTab === 'federal') {
                  return rep.level.includes('federal') || rep.level === 'President' || rep.level === 'Vice President' || rep.level === 'Supreme Court' || rep.level === 'Cabinet';
                }
                if (activeTab === 'state') {
                  return rep.level.includes('state');
                }
                return true;
              })
              .map((rep, i) => (
                <div key={i} className="rep-card" onClick={() => fetchRepDetails(rep)}>
                  <img src={rep.photo} alt={rep.name} />
                  <h4>{rep.name}</h4>
                  <p>{rep.party} | {rep.level}</p>
                  <p>Accountability: {rep.score}%</p>
                  <div className="rep-poll-bar">
                    <div style={{ width: `${rep.score}%`, backgroundColor: '#4CAF50', height: '8px' }}></div>
                  </div>
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
            {[
              { name: 'Linda Thomas-Greenfield', title: 'U.N. Ambassador', country: 'United Nations', photo: 'https://upload.wikimedia.org/wikipedia/commons/5/5f/Linda_Thomas-Greenfield_official_photo.jpg' },
              { name: 'Rahm Emanuel', title: 'Ambassador to Japan', country: 'Japan', photo: 'https://jp.usembassy.gov/wp-content/uploads/sites/131/2022/01/Rahm-Emanuel-Official-Portrait-1024x683.jpg' },
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
          </div>
        </div>
      )}

      {/* Modals */}
      {showRepModal && selectedRep && (
        <div className="modal">
          <div className="modal-content">
            <button className="modal-close" onClick={() => setShowRepModal(false)}>×</button>
            <h2>{selectedRep.name}</h2>
            <p>{selectedRep.party} | {selectedRep.level}</p>
            <p>Score: {selectedRep.score}%</p>
            <a href={selectedRep.contact}>Contact</a>
            {selectedRep.phone && <a href={`tel:${selectedRep.phone}`}>Call</a>}
          </div>
        </div>
      )}
      {showRepPollBreakdown && selectedRepPoll && (
        <div className="modal">
          <div className="modal-content">
            <button className="modal-close" onClick={() => setShowRepPollBreakdown(false)}>×</button>
            <h2>Poll Breakdown: {selectedRepPoll}</h2>
          </div>
        </div>
      )}
      {showAdmin && <AdminModal onClose={() => setShowAdmin(false)} />}
      {showAuth && <AuthForm onClose={() => setShowAuth(false)} />}
    </main>
  </div>
  );
}

export default App;


  