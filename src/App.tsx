import React, { useState, useEffect } from 'react';
import { auth, db } from './firebase';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signInWithPopup, 
  GoogleAuthProvider, 
  TwitterAuthProvider, 
  onAuthStateChanged, 
  User,
  sendPasswordResetEmail,
  signOut   // ← Added
} from 'firebase/auth';
import { 
  collection, 
  addDoc, 
  onSnapshot, 
  query, 
  where, 
  serverTimestamp, 
  Timestamp,
  deleteDoc,   // ← Add this
  doc         // ← Add this
} from 'firebase/firestore';
import './App.css';

/* eslint-disable @typescript-eslint/no-explicit-any */

// ====================== TYPES ======================
type GeocodioLegislator = {
  id?: string;
  name?: string;
  type?: 'representative' | 'senator';
  bio?: { first_name?: string; last_name?: string; party?: string; photo_url?: string };
  party?: string;
  photo_url?: string;
  contact?: { url?: string; phone?: string };
  social?: { twitter?: string };
  references?: { bioguide_id?: string; openstates_id?: string };
};

type Poll = {
  id?: string;
  question: string;
  scope: 'nationwide' | 'state' | 'county';
  options: string[];
  creatorId: string;
  createdAt: Timestamp;
  isActive: boolean;
  state?: string;
  county?: string;
};
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

type BillItem = {
  title: string;
  latestAction?: string | null;
  congressUrl?: string | null;
};

type RepDetails = {
  bio: string;
  votes: string[];
  bills: BillItem[];
  comments: string[];
  earmarks?: string[];
};

type PollResult = { yea: number; nay: number };
type TieredPollResult = { [tier: string]: PollResult };

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
  'HI': 'https://ballotpedia.org/Hawaii_voter_registration',
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

// ====================== STATE OPEN DATA SOURCES - FULL LOCAL (School Board + Officials + Judges) ======================
const stateOpenDataSources: { [key: string]: {
  portalUrl: string;
  schoolBoardDatasetUrl: string;
  localOfficialsDatasetUrl: string;
  judgesDatasetUrl: string;
  notes: string;
  platform: 'Socrata' | 'ArcGIS' | 'Custom' | 'Limited';
} } = {
  'AL': { portalUrl: 'https://data.alabama.gov', schoolBoardDatasetUrl: 'https://data.alabama.gov/search?q=school%20board', localOfficialsDatasetUrl: 'https://data.alabama.gov/search?q=county%20officials', judgesDatasetUrl: 'https://data.alabama.gov/search?q=judges', notes: 'Limited but usable', platform: 'Socrata' },
  'AK': { portalUrl: 'https://data.alaska.gov', schoolBoardDatasetUrl: 'https://data.alaska.gov/search?q=school%20board', localOfficialsDatasetUrl: 'https://data.alaska.gov/search?q=borough%20officials', judgesDatasetUrl: 'https://data.alaska.gov/search?q=judges', notes: 'Good for borough level', platform: 'Socrata' },
  'AZ': { portalUrl: 'https://data.az.gov', schoolBoardDatasetUrl: 'https://data.az.gov/search?q=school%20board', localOfficialsDatasetUrl: 'https://data.az.gov/search?q=county%20officials', judgesDatasetUrl: 'https://data.az.gov/search?q=judges', notes: 'Strong local data', platform: 'Socrata' },
  'AR': { portalUrl: 'https://data.arkansas.gov', schoolBoardDatasetUrl: 'https://data.arkansas.gov/search?q=school%20board', localOfficialsDatasetUrl: 'https://data.arkansas.gov/search?q=county%20officials', judgesDatasetUrl: 'https://data.arkansas.gov/search?q=judges', notes: 'Moderate coverage', platform: 'Socrata' },
  'CA': { portalUrl: 'https://data.ca.gov', schoolBoardDatasetUrl: 'https://data.ca.gov/search?q=school%20board%20members', localOfficialsDatasetUrl: 'https://data.ca.gov/search?q=county%20officials', judgesDatasetUrl: 'https://data.ca.gov/search?q=judges', notes: 'Excellent coverage', platform: 'Socrata' },
  'CO': { portalUrl: 'https://data.colorado.gov', schoolBoardDatasetUrl: 'https://data.colorado.gov/search?q=school%20board', localOfficialsDatasetUrl: 'https://data.colorado.gov/search?q=county%20officials', judgesDatasetUrl: 'https://data.colorado.gov/search?q=judges', notes: 'Very good', platform: 'Socrata' },
  'CT': { portalUrl: 'https://data.ct.gov', schoolBoardDatasetUrl: 'https://data.ct.gov/search?q=board%20of%20education', localOfficialsDatasetUrl: 'https://data.ct.gov/search?q=municipal%20officials', judgesDatasetUrl: 'https://data.ct.gov/search?q=judges', notes: 'Strong', platform: 'Socrata' },
  'DE': { portalUrl: 'https://data.delaware.gov', schoolBoardDatasetUrl: 'https://data.delaware.gov/search?q=school%20board', localOfficialsDatasetUrl: 'https://data.delaware.gov/search?q=county%20officials', judgesDatasetUrl: 'https://data.delaware.gov/search?q=judges', notes: 'Good coverage', platform: 'Socrata' },
  'FL': { portalUrl: 'https://data.myflorida.com', schoolBoardDatasetUrl: 'https://data.myflorida.com/search?q=school%20board', localOfficialsDatasetUrl: 'https://data.myflorida.com/search?q=county%20officials', judgesDatasetUrl: 'https://data.myflorida.com/search?q=judges', notes: 'Growing portal', platform: 'Custom' },
  'GA': { portalUrl: 'https://data.ga.gov', schoolBoardDatasetUrl: 'https://data.ga.gov/search?q=school%20board', localOfficialsDatasetUrl: 'https://data.ga.gov/search?q=county%20officials', judgesDatasetUrl: 'https://data.ga.gov/search?q=judges', notes: 'Moderate', platform: 'Socrata' },
  'HI': { portalUrl: 'https://data.hawaii.gov', schoolBoardDatasetUrl: 'https://data.hawaii.gov/search?q=board%20of%20education', localOfficialsDatasetUrl: 'https://data.hawaii.gov/search?q=county%20officials', judgesDatasetUrl: 'https://data.hawaii.gov/search?q=judges', notes: 'Limited', platform: 'Socrata' },
  'ID': { portalUrl: 'https://data.idaho.gov', schoolBoardDatasetUrl: 'https://data.idaho.gov/search?q=school%20board', localOfficialsDatasetUrl: 'https://data.idaho.gov/search?q=county%20officials', judgesDatasetUrl: 'https://data.idaho.gov/search?q=judges', notes: 'Limited', platform: 'Socrata' },
  'IL': { portalUrl: 'https://data.illinois.gov', schoolBoardDatasetUrl: 'https://data.illinois.gov/search?q=board%20of%20education', localOfficialsDatasetUrl: 'https://data.illinois.gov/search?q=county%20officials', judgesDatasetUrl: 'https://data.illinois.gov/search?q=judges', notes: 'Strong education + county', platform: 'Socrata' },
  'IN': { portalUrl: 'https://data.in.gov', schoolBoardDatasetUrl: 'https://data.in.gov/search?q=school%20board', localOfficialsDatasetUrl: 'https://data.in.gov/search?q=county%20officials', judgesDatasetUrl: 'https://data.in.gov/search?q=judges', notes: 'Good coverage', platform: 'Socrata' },
  'IA': { portalUrl: 'https://data.iowa.gov', schoolBoardDatasetUrl: 'https://data.iowa.gov/search?q=school%20board', localOfficialsDatasetUrl: 'https://data.iowa.gov/search?q=county%20officials', judgesDatasetUrl: 'https://data.iowa.gov/search?q=judges', notes: 'Very good', platform: 'Socrata' },
  'KS': { portalUrl: 'https://data.ks.gov', schoolBoardDatasetUrl: 'https://data.ks.gov/search?q=school%20board', localOfficialsDatasetUrl: 'https://data.ks.gov/search?q=county%20officials', judgesDatasetUrl: 'https://data.ks.gov/search?q=judges', notes: 'Moderate', platform: 'Socrata' },
  'KY': { portalUrl: 'https://data.ky.gov', schoolBoardDatasetUrl: 'https://data.ky.gov/search?q=board%20of%20education', localOfficialsDatasetUrl: 'https://data.ky.gov/search?q=county%20officials', judgesDatasetUrl: 'https://data.ky.gov/search?q=judges', notes: 'Good coverage', platform: 'Socrata' },
  'LA': { portalUrl: 'https://data.louisiana.gov', schoolBoardDatasetUrl: 'https://data.louisiana.gov/search?q=school%20board', localOfficialsDatasetUrl: 'https://data.louisiana.gov/search?q=parish%20officials', judgesDatasetUrl: 'https://data.louisiana.gov/search?q=judges', notes: 'Moderate', platform: 'Socrata' },
  'ME': { portalUrl: 'https://data.maine.gov', schoolBoardDatasetUrl: 'https://data.maine.gov/search?q=school%20board', localOfficialsDatasetUrl: 'https://data.maine.gov/search?q=municipal%20officials', judgesDatasetUrl: 'https://data.maine.gov/search?q=judges', notes: 'Limited', platform: 'Socrata' },
  'MD': { portalUrl: 'https://data.maryland.gov', schoolBoardDatasetUrl: 'https://data.maryland.gov/search?q=school%20board', localOfficialsDatasetUrl: 'https://data.maryland.gov/search?q=county%20officials', judgesDatasetUrl: 'https://data.maryland.gov/search?q=judges', notes: 'Strong local data', platform: 'Socrata' },
  'MA': { portalUrl: 'https://data.mass.gov', schoolBoardDatasetUrl: 'https://data.mass.gov/search?q=school%20board', localOfficialsDatasetUrl: 'https://data.mass.gov/search?q=municipal%20officials', judgesDatasetUrl: 'https://data.mass.gov/search?q=judges', notes: 'Excellent coverage', platform: 'Socrata' },
  'MI': { portalUrl: 'https://data.michigan.gov', schoolBoardDatasetUrl: 'https://data.michigan.gov/search?q=school%20board', localOfficialsDatasetUrl: 'https://data.michigan.gov/search?q=county%20officials', judgesDatasetUrl: 'https://data.michigan.gov/search?q=judges', notes: 'Good coverage', platform: 'Socrata' },
  'MN': { portalUrl: 'https://data.mn.gov', schoolBoardDatasetUrl: 'https://data.mn.gov/search?q=school%20board', localOfficialsDatasetUrl: 'https://data.mn.gov/search?q=county%20officials', judgesDatasetUrl: 'https://data.mn.gov/search?q=judges', notes: 'Very good', platform: 'Socrata' },
  'MS': { portalUrl: 'https://data.ms.gov', schoolBoardDatasetUrl: 'https://data.ms.gov/search?q=school%20board', localOfficialsDatasetUrl: 'https://data.ms.gov/search?q=county%20officials', judgesDatasetUrl: 'https://data.ms.gov/search?q=judges', notes: 'Limited', platform: 'Socrata' },
  'MO': { portalUrl: 'https://data.mo.gov', schoolBoardDatasetUrl: 'https://data.mo.gov/search?q=school%20board', localOfficialsDatasetUrl: 'https://data.mo.gov/search?q=county%20officials', judgesDatasetUrl: 'https://data.mo.gov/search?q=judges', notes: 'Moderate', platform: 'Socrata' },
  'MT': { portalUrl: 'https://data.mt.gov', schoolBoardDatasetUrl: 'https://data.mt.gov/search?q=school%20board', localOfficialsDatasetUrl: 'https://data.mt.gov/search?q=county%20officials', judgesDatasetUrl: 'https://data.mt.gov/search?q=judges', notes: 'Limited', platform: 'Socrata' },
  'NE': { portalUrl: 'https://data.nebraska.gov', schoolBoardDatasetUrl: 'https://data.nebraska.gov/search?q=school%20board', localOfficialsDatasetUrl: 'https://data.nebraska.gov/search?q=county%20officials', judgesDatasetUrl: 'https://data.nebraska.gov/search?q=judges', notes: 'Moderate', platform: 'Socrata' },
  'NV': { portalUrl: 'https://data.nv.gov', schoolBoardDatasetUrl: 'https://data.nv.gov/search?q=school%20board', localOfficialsDatasetUrl: 'https://data.nv.gov/search?q=county%20officials', judgesDatasetUrl: 'https://data.nv.gov/search?q=judges', notes: 'Good coverage', platform: 'Socrata' },
  'NH': { portalUrl: 'https://data.nh.gov', schoolBoardDatasetUrl: 'https://data.nh.gov/search?q=school%20board', localOfficialsDatasetUrl: 'https://data.nh.gov/search?q=county%20officials', judgesDatasetUrl: 'https://data.nh.gov/search?q=judges', notes: 'Limited', platform: 'Socrata' },
  'NJ': { portalUrl: 'https://data.nj.gov', schoolBoardDatasetUrl: 'https://data.nj.gov/search?q=board%20of%20education', localOfficialsDatasetUrl: 'https://data.nj.gov/search?q=municipal%20officials', judgesDatasetUrl: 'https://data.nj.gov/search?q=judges', notes: 'Strong coverage', platform: 'Socrata' },
  'NM': { portalUrl: 'https://data.nm.gov', schoolBoardDatasetUrl: 'https://data.nm.gov/search?q=school%20board', localOfficialsDatasetUrl: 'https://data.nm.gov/search?q=county%20officials', judgesDatasetUrl: 'https://data.nm.gov/search?q=judges', notes: 'Moderate', platform: 'Socrata' },
  'NY': { portalUrl: 'https://data.ny.gov', schoolBoardDatasetUrl: 'https://data.ny.gov/search?q=school%20board', localOfficialsDatasetUrl: 'https://data.ny.gov/search?q=county%20officials', judgesDatasetUrl: 'https://data.ny.gov/search?q=judges', notes: 'Excellent coverage', platform: 'Socrata' },
  'NC': { portalUrl: 'https://data.nconemap.gov', schoolBoardDatasetUrl: 'https://data.nconemap.gov/search?q=school%20board', localOfficialsDatasetUrl: 'https://data.nconemap.gov/search?q=county%20officials', judgesDatasetUrl: 'https://data.nconemap.gov/search?q=judges', notes: 'Very strong local data', platform: 'ArcGIS' },
  'ND': { portalUrl: 'https://data.nd.gov', schoolBoardDatasetUrl: 'https://data.nd.gov/search?q=school%20board', localOfficialsDatasetUrl: 'https://data.nd.gov/search?q=county%20officials', judgesDatasetUrl: 'https://data.nd.gov/search?q=judges', notes: 'Limited', platform: 'Socrata' },
  'OH': { portalUrl: 'https://data.ohio.gov', schoolBoardDatasetUrl: 'https://data.ohio.gov/search?q=school%20board', localOfficialsDatasetUrl: 'https://data.ohio.gov/search?q=county%20officials', judgesDatasetUrl: 'https://data.ohio.gov/search?q=judges', notes: 'Good coverage', platform: 'Socrata' },
  'OK': { portalUrl: 'https://data.ok.gov', schoolBoardDatasetUrl: 'https://data.ok.gov/search?q=school%20board', localOfficialsDatasetUrl: 'https://data.ok.gov/search?q=county%20officials', judgesDatasetUrl: 'https://data.ok.gov/search?q=judges', notes: 'Moderate', platform: 'Socrata' },
  'OR': { portalUrl: 'https://data.oregon.gov', schoolBoardDatasetUrl: 'https://data.oregon.gov/search?q=school%20board', localOfficialsDatasetUrl: 'https://data.oregon.gov/search?q=county%20officials', judgesDatasetUrl: 'https://data.oregon.gov/search?q=judges', notes: 'Good coverage', platform: 'Socrata' },
  'PA': { portalUrl: 'https://data.pa.gov', schoolBoardDatasetUrl: 'https://data.pa.gov/search?q=school%20board', localOfficialsDatasetUrl: 'https://data.pa.gov/search?q=county%20officials', judgesDatasetUrl: 'https://data.pa.gov/search?q=judges', notes: 'Strong coverage', platform: 'Socrata' },
  'RI': { portalUrl: 'https://data.ri.gov', schoolBoardDatasetUrl: 'https://data.ri.gov/search?q=school%20board', localOfficialsDatasetUrl: 'https://data.ri.gov/search?q=municipal%20officials', judgesDatasetUrl: 'https://data.ri.gov/search?q=judges', notes: 'Good coverage', platform: 'Socrata' },
  'SC': { portalUrl: 'https://data.sc.gov', schoolBoardDatasetUrl: 'https://data.sc.gov/search?q=school%20board', localOfficialsDatasetUrl: 'https://data.sc.gov/search?q=county%20officials', judgesDatasetUrl: 'https://data.sc.gov/search?q=judges', notes: 'Moderate', platform: 'Socrata' },
  'SD': { portalUrl: 'https://data.sd.gov', schoolBoardDatasetUrl: 'https://data.sd.gov/search?q=school%20board', localOfficialsDatasetUrl: 'https://data.sd.gov/search?q=county%20officials', judgesDatasetUrl: 'https://data.sd.gov/search?q=judges', notes: 'Limited', platform: 'Socrata' },
  'TN': { portalUrl: 'https://data.tn.gov', schoolBoardDatasetUrl: 'https://data.tn.gov/search?q=school%20board', localOfficialsDatasetUrl: 'https://data.tn.gov/search?q=county%20officials', judgesDatasetUrl: 'https://data.tn.gov/search?q=judges', notes: 'Good coverage', platform: 'Socrata' },
  'TX': { portalUrl: 'https://data.texas.gov', schoolBoardDatasetUrl: 'https://data.texas.gov/search?q=school%20board', localOfficialsDatasetUrl: 'https://data.texas.gov/search?q=county%20officials', judgesDatasetUrl: 'https://data.texas.gov/search?q=judges', notes: 'Very large and comprehensive', platform: 'Socrata' },
  'UT': { portalUrl: 'https://data.utah.gov', schoolBoardDatasetUrl: 'https://data.utah.gov/search?q=school%20board', localOfficialsDatasetUrl: 'https://data.utah.gov/search?q=county%20officials', judgesDatasetUrl: 'https://data.utah.gov/search?q=judges', notes: 'Good coverage', platform: 'Socrata' },
  'VT': { portalUrl: 'https://data.vermont.gov', schoolBoardDatasetUrl: 'https://data.vermont.gov/search?q=school%20board', localOfficialsDatasetUrl: 'https://data.vermont.gov/search?q=municipal%20officials', judgesDatasetUrl: 'https://data.vermont.gov/search?q=judges', notes: 'Limited', platform: 'Socrata' },
  'VA': { portalUrl: 'https://data.virginia.gov', schoolBoardDatasetUrl: 'https://data.virginia.gov/search?q=school%20board', localOfficialsDatasetUrl: 'https://data.virginia.gov/search?q=county%20officials', judgesDatasetUrl: 'https://data.virginia.gov/search?q=judges', notes: 'Strong coverage for your area', platform: 'Socrata' },
  'WA': { portalUrl: 'https://data.wa.gov', schoolBoardDatasetUrl: 'https://data.wa.gov/search?q=school%20board', localOfficialsDatasetUrl: 'https://data.wa.gov/search?q=county%20officials', judgesDatasetUrl: 'https://data.wa.gov/search?q=judges', notes: 'High quality', platform: 'Socrata' },
  'WV': { portalUrl: 'https://data.wv.gov', schoolBoardDatasetUrl: 'https://data.wv.gov/search?q=school%20board', localOfficialsDatasetUrl: 'https://data.wv.gov/search?q=county%20officials', judgesDatasetUrl: 'https://data.wv.gov/search?q=judges', notes: 'Moderate', platform: 'Socrata' },
  'WI': { portalUrl: 'https://data.wi.gov', schoolBoardDatasetUrl: 'https://data.wi.gov/search?q=school%20board', localOfficialsDatasetUrl: 'https://data.wi.gov/search?q=county%20officials', judgesDatasetUrl: 'https://data.wi.gov/search?q=judges', notes: 'Good coverage', platform: 'Socrata' },
  'WY': { portalUrl: 'https://data.wyo.gov', schoolBoardDatasetUrl: 'https://data.wyo.gov/search?q=school%20board', localOfficialsDatasetUrl: 'https://data.wyo.gov/search?q=county%20officials', judgesDatasetUrl: 'https://data.wyo.gov/search?q=judges', notes: 'Limited', platform: 'Socrata' },
};

// ====================== SUPREME COURT JUSTICES (Hardcoded) ======================
const supremeCourtJustices: Rep[] = [
  {
    name: 'John G. Roberts, Jr.',
    party: 'Chief Justice',
    photo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6a/Official_roberts_cjr.jpg/800px-Official_roberts_cjr.jpg',
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
    photo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3f/Clarence_Thomas_official_photo.jpg/800px-Clarence_Thomas_official_photo.jpg',
    level: 'Supreme Court',
    contact: 'https://www.supremecourt.gov/contact/contactus.aspx',
    phone: '(202) 479-3000',
    score: 78,
    id: 'scotus-thomas',
    xHandle: ''
  },
  {
    name: 'Samuel Alito',
    party: 'Associate Justice',
    photo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9f/Samuel_Alito_official_photo.jpg/800px-Samuel_Alito_official_photo.jpg',
    level: 'Supreme Court',
    contact: 'https://www.supremecourt.gov/contact/contactus.aspx',
    phone: '(202) 479-3000',
    score: 82,
    id: 'scotus-alito',
    xHandle: ''
  },
  {
    name: 'Sonia Sotomayor',
    party: 'Associate Justice',
    photo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8f/Sonia_Sotomayor_official_photo.jpg/800px-Sonia_Sotomayor_official_photo.jpg',
    level: 'Supreme Court',
    contact: 'https://www.supremecourt.gov/contact/contactus.aspx',
    phone: '(202) 479-3000',
    score: 88,
    id: 'scotus-sotomayor',
    xHandle: ''
  },
  {
    name: 'Elena Kagan',
    party: 'Associate Justice',
    photo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8f/Elena_Kagan_official_photo.jpg/800px-Elena_Kagan_official_photo.jpg',
    level: 'Supreme Court',
    contact: 'https://www.supremecourt.gov/contact/contactus.aspx',
    phone: '(202) 479-3000',
    score: 82,
    id: 'scotus-kagan',
    xHandle: ''
  },
  {
    name: 'Neil Gorsuch',
    party: 'Associate Justice',
    photo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8f/Neil_Gorsuch_official_photo.jpg/800px-Neil_Gorsuch_official_photo.jpg',
    level: 'Supreme Court',
    contact: 'https://www.supremecourt.gov/contact/contactus.aspx',
    phone: '(202) 479-3000',
    score: 80,
    id: 'scotus-gorsuch',
    xHandle: ''
  },
  {
    name: 'Brett Kavanaugh',
    party: 'Associate Justice',
    photo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8f/Brett_Kavanaugh_official_photo.jpg/800px-Brett_Kavanaugh_official_photo.jpg',
    level: 'Supreme Court',
    contact: 'https://www.supremecourt.gov/contact/contactus.aspx',
    phone: '(202) 479-3000',
    score: 79,
    id: 'scotus-kavanaugh',
    xHandle: ''
  },
  {
    name: 'Amy Coney Barrett',
    party: 'Associate Justice',
    photo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8f/Amy_Coney_Barrett_official_photo.jpg/800px-Amy_Coney_Barrett_official_photo.jpg',
    level: 'Supreme Court',
    contact: 'https://www.supremecourt.gov/contact/contactus.aspx',
    phone: '(202) 479-3000',
    score: 81,
    id: 'scotus-barrett',
    xHandle: ''
  },
  {
    name: 'Ketanji Brown Jackson',
    party: 'Associate Justice',
    photo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8f/Ketanji_Brown_Jackson_official_photo.jpg/800px-Ketanji_Brown_Jackson_official_photo.jpg',
    level: 'Supreme Court',
    contact: 'https://www.supremecourt.gov/contact/contactus.aspx',
    phone: '(202) 479-3000',
    score: 84,
    id: 'scotus-jackson',
    xHandle: ''
  }
];

// ====================== SUB-COMPONENTS ======================
const AdminModal: React.FC<{ 
  onClose: () => void; 
  user: User | null; 
  setShowAuth: (show: boolean) => void;
}> = ({ onClose, user, setShowAuth }) => {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);
  const [scope, setScope] = useState<'nationwide' | 'state' | 'county'>('nationwide');
  const [selectedState, setSelectedState] = useState('');
  const [selectedCounty, setSelectedCounty] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [polls, setPolls] = useState<any[]>([]); // For delete list

  // Load existing polls for deletion
  useEffect(() => {
    const pollsRef = collection(db, 'polls');
    const unsubscribe = onSnapshot(pollsRef, (snapshot) => {
      const loadedPolls = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setPolls(loadedPolls);
    });
    return () => unsubscribe();
  }, []);

  const addOption = () => setOptions([...options, '']);
  const removeOption = (index: number) => {
    if (options.length > 2) setOptions(options.filter((_, i) => i !== index));
  };
  const updateOption = (index: number, value: string) => {
    const newOptions = [...options];
    newOptions[index] = value;
    setOptions(newOptions);
  };

  const createPoll = async () => {
    if (!question.trim() || options.some(opt => !opt.trim())) {
      alert("Question and options are required");
      return;
    }

    setIsCreating(true);

    try {
      await addDoc(collection(db, 'polls'), {
        question: question.trim(),
        options: options.map(opt => opt.trim()),
        scope,
        state: scope === 'state' ? selectedState : null,
        county: scope === 'county' ? selectedCounty : null,
        tier: 'local',
        creatorId: user!.uid,
        createdAt: serverTimestamp(),
        isActive: true
      });

      alert("✅ Poll created successfully!");
      setQuestion('');
      setOptions(['', '']);
      setSelectedState('');
      setSelectedCounty('');
    } catch (err) {
      alert("Failed to create poll");
    } finally {
      setIsCreating(false);
    }
  };

  const deletePoll = async (pollId: string) => {
    if (!window.confirm("Delete this poll permanently?")) return;
    
    try {
      await deleteDoc(doc(db, 'polls', pollId));
      alert("Poll deleted");
    } catch (err) {
      alert("Failed to delete poll");
    }
  };

  const isAdminUser = user?.email?.toLowerCase() === 'admin@politickerapp.com';

  if (!user || !isAdminUser) {
    return (
      <div className="modal-overlay">
        <div className="modal">
          <button className="modal-close" onClick={onClose}>×</button>
          <h2>Admin Panel</h2>
          <p>Only admin@politickerapp.com can access this.</p>
          <button onClick={() => { onClose(); setShowAuth(true); }}>Sign In</button>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: '620px', maxHeight: '90vh', overflowY: 'auto' }}>
        <button className="modal-close" onClick={onClose}>×</button>
        <h2>Admin Panel</h2>

        {/* Create New Poll */}
        <div style={{ borderBottom: '1px solid #ddd', paddingBottom: '20px', marginBottom: '25px' }}>
          <h3>Create New Poll</h3>

          <input
            type="text"
            placeholder="Poll Question"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            style={{ width: '100%', padding: '12px', marginBottom: '15px' }}
          />

          <label>Options</label>
          {options.map((opt, i) => (
            <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
              <input
                type="text"
                value={opt}
                onChange={(e) => updateOption(i, e.target.value)}
                placeholder={`Option ${i+1}`}
                style={{ flex: 1, padding: '10px' }}
              />
              {options.length > 2 && <button onClick={() => removeOption(i)}>×</button>}
            </div>
          ))}
          <button onClick={addOption} style={{ marginBottom: '15px' }}>+ Add Option</button>

          <label>Scope</label>
          <select 
            value={scope} 
            onChange={(e) => setScope(e.target.value as any)}
            style={{ width: '100%', padding: '12px', margin: '10px 0' }}
          >
            <option value="nationwide">Nationwide</option>
            <option value="state">State Specific</option>
            <option value="county">County / Local</option>
          </select>

          {scope === 'state' && (
            <select 
              value={selectedState} 
              onChange={(e) => setSelectedState(e.target.value)}
              style={{ width: '100%', padding: '12px', marginBottom: '15px' }}
            >
              <option value="">Select State</option>
              {Object.keys(stateVoterLookup).map(st => (
                <option key={st} value={st}>{st}</option>
              ))}
            </select>
          )}

          {scope === 'county' && (
            <input
              type="text"
              placeholder="County Name (e.g. Chesterfield County, VA)"
              value={selectedCounty}
              onChange={(e) => setSelectedCounty(e.target.value)}
              style={{ width: '100%', padding: '12px', marginBottom: '15px' }}
            />
          )}

          <button 
            onClick={createPoll}
            disabled={isCreating}
            style={{ width: '100%', padding: '16px', backgroundColor: '#4CAF50', color: 'white', fontSize: '17px' }}
          >
            {isCreating ? 'Creating...' : 'Create & Activate Poll'}
          </button>
        </div>

        {/* Existing Polls - Delete Section */}
        <div>
          <h3>Existing Polls ({polls.length})</h3>
          {polls.length === 0 ? (
            <p>No polls yet.</p>
          ) : (
            polls.map((poll: any) => (
              <div key={poll.id} style={{ 
                padding: '12px', 
                border: '1px solid #ddd', 
                marginBottom: '10px',
                borderRadius: '6px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <div>
                  <strong>{poll.question}</strong><br />
                  <small>Scope: {poll.scope} {poll.state ? `(${poll.state})` : ''} {poll.county ? `(${poll.county})` : ''}</small>
                </div>
                <button 
                  onClick={() => deletePoll(poll.id)}
                  style={{ background: '#f44336', color: 'white', padding: '6px 12px', border: 'none', borderRadius: '4px' }}
                >
                  Delete
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

/// ====================== SHARE MODAL (with text labels) ======================
const ShareModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const shareUrl = "https://politickerapp.com";
  const shareText = "Politicker — Real-time government accountability. See what your reps are doing right now!";

  const copyToClipboard = () => {
    navigator.clipboard.writeText(shareUrl);
    alert("✅ Link copied to clipboard!");
    onClose();
  };

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: '460px', textAlign: 'center' }}>
        <button className="modal-close" onClick={onClose}>×</button>
        <h2>Share Politicker</h2>
        <p style={{ marginBottom: '25px', color: '#555' }}>
          Help bring transparency to government
        </p>

        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(3, 1fr)', 
          gap: '12px', 
          marginBottom: '30px' 
        }}>
          
          {/* X */}
          <button 
            onClick={() => { window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`, '_blank'); onClose(); }} 
            style={{ padding: '16px 8px', fontSize: '26px', background: '#000', color: '#fff', borderRadius: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
            𝕏
            <span style={{ fontSize: '13px', fontWeight: '600' }}>X</span>
          </button>

          {/* Facebook */}
          <button 
            onClick={() => { window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`, '_blank'); onClose(); }} 
            style={{ padding: '16px 8px', fontSize: '26px', background: '#1877F2', color: '#fff', borderRadius: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
            📘
            <span style={{ fontSize: '13px', fontWeight: '600' }}>Facebook</span>
          </button>

          {/* LinkedIn */}
          <button 
            onClick={() => { window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`, '_blank'); onClose(); }} 
            style={{ padding: '16px 8px', fontSize: '26px', background: '#0A66C2', color: '#fff', borderRadius: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
            🔗
            <span style={{ fontSize: '13px', fontWeight: '600' }}>LinkedIn</span>
          </button>

          {/* WhatsApp */}
          <button 
            onClick={() => { window.open(`https://wa.me/?text=${encodeURIComponent(shareText + ' ' + shareUrl)}`, '_blank'); onClose(); }} 
            style={{ padding: '16px 8px', fontSize: '26px', background: '#25D366', color: '#fff', borderRadius: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
            💬
            <span style={{ fontSize: '13px', fontWeight: '600' }}>WhatsApp</span>
          </button>

          {/* Email */}
          <button 
            onClick={() => { window.location.href = `mailto:?subject=Politicker&body=${encodeURIComponent(shareText + '\n\n' + shareUrl)}`; onClose(); }} 
            style={{ padding: '16px 8px', fontSize: '26px', background: '#EA4335', color: '#fff', borderRadius: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
            ✉️
            <span style={{ fontSize: '13px', fontWeight: '600' }}>Email</span>
          </button>

          {/* Copy Link */}
          <button 
            onClick={copyToClipboard} 
            style={{ padding: '16px 8px', fontSize: '26px', background: '#666', color: '#fff', borderRadius: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
            📋
            <span style={{ fontSize: '13px', fontWeight: '600' }}>Copy</span>
          </button>
        </div>

        <button onClick={onClose} style={{ width: '100%', padding: '14px', background: '#ddd', borderRadius: '8px' }}>
          Close
        </button>
      </div>
    </div>
  );
};

const AuthForm: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignup, setIsSignup] = useState(true);
  const [resetMode, setResetMode] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const googleProvider = new GoogleAuthProvider();
  const twitterProvider = new TwitterAuthProvider();

  const handleSignup = async () => {
    try {
      await createUserWithEmailAndPassword(auth, email, password);
      alert("Account created successfully! You can now sign in.");
      onClose();
    } catch (err: any) {
      alert("Signup failed: " + err.message);
    }
  };

  const handleLogin = async () => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
      alert("Logged in successfully!");
      onClose();
    } catch (err: any) {
      alert("Login failed: " + err.message);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
      alert("Google login successful!");
      onClose();
    } catch (err: any) {
      alert("Google login failed: " + err.message);
    }
  };

  const handleXLogin = async () => {
    try {
      await signInWithPopup(auth, twitterProvider);
      alert("X login successful!");
      onClose();
    } catch (err: any) {
      alert("X login failed: " + err.message);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      alert("Please enter your email address");
      return;
    }

    try {
      await sendPasswordResetEmail(auth, email);
      setResetSent(true);
      alert("Password reset email sent! Check your inbox.");
    } catch (err: any) {
      alert("Error sending reset email: " + err.message);
    }
  };

  return (
    <div className="modal">
      <div className="modal-content">
        <button className="modal-close" onClick={onClose}>×</button>

        {resetMode ? (
          <>
            <h2>Reset Password</h2>
            <p>Enter your email to receive a reset link.</p>
            <input 
              type="email" 
              placeholder="Email" 
              value={email} 
              onChange={(e) => setEmail(e.target.value)} 
            />
            <button onClick={handleForgotPassword}>Send Reset Link</button>
            {resetSent && <p style={{ color: 'green' }}>Reset email sent!</p>}
            <button onClick={() => setResetMode(false)}>Back to Sign In</button>
          </>
        ) : (
          <>
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

            <button onClick={isSignup ? handleSignup : handleLogin}>
              {isSignup ? 'Sign Up' : 'Sign In'}
            </button>

            {!isSignup && (
              <button 
                onClick={() => setResetMode(true)}
                style={{ background: 'none', color: '#2196F3', border: 'none', marginTop: '10px' }}
              >
                Forgot Password?
              </button>
            )}

            <button onClick={handleGoogleLogin}>Continue with Google</button>
            <button onClick={handleXLogin}>Continue with X</button>

            <button onClick={() => setIsSignup(!isSignup)}>
              {isSignup ? 'Already have an account? Sign In' : 'Need an account? Sign Up'}
            </button>
          </>
        )}
      </div>
    </div>
  );
};

const RepPollBar: React.FC<{ 
  rep: Rep; 
  repPolls: any; 
  onBreakdown: () => void;
}> = ({ rep, repPolls, onBreakdown }) => {
  const repResults = repPolls[rep.name] || {};
  const totalApprove = Object.values(repResults).reduce((sum: number, tier: any) => sum + (tier.approve || 0), 0);
  const totalDisapprove = Object.values(repResults).reduce((sum: number, tier: any) => sum + (tier.disapprove || 0), 0);
  const total = totalApprove + totalDisapprove;
  const approvePercent = total > 0 ? Math.round((totalApprove / total) * 100) : 50;

  return (
    <div 
      style={{ margin: '10px 0', fontSize: '14px', cursor: 'pointer' }}
      onClick={onBreakdown}
    >
      <div style={{ display: 'flex', height: '20px', background: '#ddd', borderRadius: '10px', overflow: 'hidden' }}>
        <div style={{ width: `${approvePercent}%`, background: '#4CAF50' }} />
        <div style={{ width: `${100 - approvePercent}%`, background: '#f44336' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
        <span>Approve: {totalApprove}</span>
        <span>Disapprove: {totalDisapprove}</span>
      </div>
      <small style={{ color: '#2196F3' }}>Click for detailed tier breakdown</small>
    </div>
  );
};

const PollBreakdownModal: React.FC<{
  pollOrRep: Poll | Rep | null;   // ← Changed
  repPolls: any;
  onClose: () => void;
}> = ({ pollOrRep, repPolls, onClose }) => {
  if (!pollOrRep) return null;

  const title = 'question' in pollOrRep ? pollOrRep.question : pollOrRep.name;

  // For rep polls we use repPolls, for main polls we can expand later
  const pollResults = repPolls[title] || {}; 

  const tiers = ['verified', 'local', 'in-state', 'out-of-state'];

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: '520px' }}>
        <button className="modal-close" onClick={onClose}>×</button>
        
        <h2>Poll Breakdown</h2>
        <h4 style={{ marginBottom: '20px' }}>{title}</h4>

        <div style={{ marginBottom: '20px' }}>
          {tiers.map(tier => {
            const data = pollResults[tier] || { approve: 0, disapprove: 0 };
            const total = data.approve + data.disapprove;
            const approvePercent = total > 0 ? Math.round((data.approve / total) * 100) : 0;

            return (
              <div key={tier} style={{ marginBottom: '18px', padding: '12px', background: '#f9f9f9', borderRadius: '8px' }}>
                <strong style={{ textTransform: 'capitalize' }}>{tier.replace('-', ' ')}</strong>
                <div style={{ display: 'flex', height: '18px', background: '#e0e0e0', borderRadius: '9px', margin: '8px 0', overflow: 'hidden' }}>
                  <div style={{ width: `${approvePercent}%`, background: '#4CAF50' }} />
                  <div style={{ width: `${100 - approvePercent}%`, background: '#f44336' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                  <span>Approve: {data.approve}</span>
                  <span>Disapprove: {data.disapprove}</span>
                  <span>Total: {total}</span>
                </div>
              </div>
            );
          })}
        </div>

        <button onClick={onClose} style={{ width: '100%', padding: '12px' }}>
          Close Breakdown
        </button>
      </div>
    </div>
  );
};
// ====================== REP MODAL (with Real Voting History) ======================
const RepModal: React.FC<{
  selectedRep: Rep | null;
  repDetails: RepDetails;
  repPolls: any;
  onClose: () => void;
  handleVote: (choice: string, tier?: string | null, earmark?: string | null, comment?: string | null, repName?: string | null, pollId?: string | null) => void;
  setSelectedPoll: (pollOrRep: Poll | Rep | null) => void;
  setShowPollBreakdown: (show: boolean) => void;
}> = ({ selectedRep, repDetails, repPolls, onClose, handleVote, setSelectedPoll, setShowPollBreakdown }) => {
  if (!selectedRep) return null;

  // Real-time approval score
  const repResults = repPolls[selectedRep.name] || {};
  const totalApprove = Object.values(repResults).reduce((sum: number, tier: any) => sum + (tier.approve || 0), 0);
  const totalDisapprove = Object.values(repResults).reduce((sum: number, tier: any) => sum + (tier.disapprove || 0), 0);
  const totalVotes = totalApprove + totalDisapprove;
  const realScore = totalVotes > 0 ? Math.round((totalApprove / totalVotes) * 100) : selectedRep.score;

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: '700px', maxHeight: '90vh', overflowY: 'auto' }}>
        <button className="modal-close" onClick={onClose}>×</button>
        
        <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
          <img 
            src={selectedRep.photo || 'https://placehold.co/120x120?text=Rep'} 
            alt={selectedRep.name}
            style={{ width: '120px', height: '120px', objectFit: 'cover', borderRadius: '12px' }}
          />
          <div style={{ flex: 1 }}>
            <h2>{selectedRep.name}</h2>
            <p style={{ margin: '4px 0' }}>
              <strong>{selectedRep.party}</strong> • {selectedRep.level}
            </p>
            <p style={{ margin: '8px 0', fontSize: '18px', color: '#4CAF50' }}>
              <strong>Approval Score:</strong> {realScore}%
            </p>
            {selectedRep.contact && selectedRep.contact !== '#' && (
              <a href={selectedRep.contact} target="_blank" rel="noopener noreferrer" style={{ color: '#007bff' }}>
                Contact Representative
              </a>
            )}
            {selectedRep.phone && (
              <a href={`tel:${selectedRep.phone}`} style={{ marginLeft: '15px', color: '#007bff' }}>
                📞 Call
              </a>
            )}
            {selectedRep.xHandle && selectedRep.xHandle !== '@Rep' && (
              <p><strong>X:</strong> <a href={`https://x.com/${selectedRep.xHandle.replace('@', '')}`} target="_blank" rel="noopener noreferrer">{selectedRep.xHandle}</a></p>
            )}
          </div>
        </div>

        {/* Bio */}
        <div style={{ marginTop: '25px' }}>
          <h3>Bio</h3>
          <p>{repDetails.bio || 'No biography available yet.'}</p>
        </div>

        {/* Recent Voting History — THIS IS THE NEW SECTION */}
        <div style={{ marginTop: '30px' }}>
          <h3>Recent Voting History</h3>
          {repDetails.votes && repDetails.votes.length > 0 ? (
            <div style={{ maxHeight: '320px', overflowY: 'auto', border: '1px solid #eee', borderRadius: '8px', padding: '10px' }}>
              {repDetails.votes.map((vote: string, index: number) => (
                <div 
                  key={index}
                  style={{
                    padding: '12px 15px',
                    marginBottom: '8px',
                    background: '#f9f9f9',
                    borderRadius: '6px',
                    fontSize: '15px'
                  }}
                >
                  {vote}
                </div>
              ))}
            </div>
          ) : (
            <p style={{ fontStyle: 'italic', color: '#777' }}>No recent voting records loaded yet.</p>
          )}
        </div>

        {/* Sponsored Bills */}
        <div style={{ marginTop: '30px' }}>
          <h3>Recent Sponsored Bills</h3>
          {repDetails.bills && repDetails.bills.length > 0 ? (
            <div style={{ maxHeight: '320px', overflowY: 'auto', border: '1px solid #eee', borderRadius: '8px', padding: '10px' }}>
              {repDetails.bills.map((bill: BillItem, index: number) => {
                const billPollId = `bill_${selectedRep.name}_${index}`;
                return (
                  <div key={index} style={{ padding: '12px 15px', marginBottom: '8px', background: '#f9f9f9', borderRadius: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: bill.latestAction ? '4px' : '8px' }}>
                      <span style={{ fontSize: '14px', fontWeight: 500, flex: 1 }}>{bill.title}</span>
                      {bill.congressUrl && (
                        <a href={bill.congressUrl} target="_blank" rel="noopener noreferrer"
                           style={{ fontSize: '12px', color: '#007bff', whiteSpace: 'nowrap', flexShrink: 0 }}>
                          More Info →
                        </a>
                      )}
                    </div>
                    {bill.latestAction && (
                      <p style={{ margin: '0 0 8px', fontSize: '12px', color: '#666', fontStyle: 'italic' }}>{bill.latestAction}</p>
                    )}
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={() => handleVote('approve', null, null, null, selectedRep.name, billPollId)}
                        style={{ backgroundColor: '#4CAF50', color: 'white', padding: '6px 14px', fontSize: '13px', borderRadius: '4px', border: 'none', cursor: 'pointer' }}
                      >👍 Support</button>
                      <button
                        onClick={() => handleVote('disapprove', null, null, null, selectedRep.name, billPollId)}
                        style={{ backgroundColor: '#f44336', color: 'white', padding: '6px 14px', fontSize: '13px', borderRadius: '4px', border: 'none', cursor: 'pointer' }}
                      >👎 Oppose</button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p style={{ fontStyle: 'italic', color: '#777' }}>No recent bills loaded yet.</p>
          )}
        </div>

        {/* Earmarks */}
        <div style={{ marginTop: '30px' }}>
          <h3>Earmarks &amp; Spending</h3>
          {repDetails.earmarks && repDetails.earmarks.length > 0 ? (
            <div style={{ maxHeight: '320px', overflowY: 'auto', border: '1px solid #eee', borderRadius: '8px', padding: '10px' }}>
              {repDetails.earmarks.map((earmark: string, index: number) => {
                const earmarkPollId = `earmark_${selectedRep.name}_${index}`;
                return (
                  <div key={index} style={{ padding: '12px 15px', marginBottom: '8px', background: '#f9f9f9', borderRadius: '6px' }}>
                    <p style={{ margin: '0 0 8px', fontSize: '14px' }}>{earmark}</p>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={() => handleVote('approve', null, null, null, selectedRep.name, earmarkPollId)}
                        style={{ backgroundColor: '#4CAF50', color: 'white', padding: '6px 14px', fontSize: '13px', borderRadius: '4px', border: 'none', cursor: 'pointer' }}
                      >👍 Support</button>
                      <button
                        onClick={() => handleVote('disapprove', null, null, null, selectedRep.name, earmarkPollId)}
                        style={{ backgroundColor: '#f44336', color: 'white', padding: '6px 14px', fontSize: '13px', borderRadius: '4px', border: 'none', cursor: 'pointer' }}
                      >👎 Oppose</button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p style={{ fontStyle: 'italic', color: '#777' }}>Earmark data coming soon.</p>
          )}
        </div>

        {/* Live Poll Bar */}
        <RepPollBar
          rep={selectedRep}
          repPolls={repPolls}
          onBreakdown={() => {
            setSelectedPoll(selectedRep);
            setShowPollBreakdown(true);
          }}
        />

        {/* Cast Your Vote */}
        <div className="rep-voting" style={{ marginTop: '25px' }}>
          <h3>Cast Your Vote on this Representative</h3>
          <button 
            onClick={() => handleVote('approve', null, null, null, selectedRep.name)}
            style={{ backgroundColor: '#4CAF50', color: 'white', margin: '5px', padding: '12px 20px', fontSize: '16px' }}
          >
            👍 Approve / Support
          </button>
          <button 
            onClick={() => handleVote('disapprove', null, null, null, selectedRep.name)}
            style={{ backgroundColor: '#f44336', color: 'white', margin: '5px', padding: '12px 20px', fontSize: '16px' }}
          >
            👎 Disapprove / Oppose
          </button>
        </div>

        <button 
          onClick={onClose}
          style={{ marginTop: '30px', width: '100%', padding: '14px', fontSize: '17px' }}
        >
          Close
        </button>
      </div>
    </div>
  );
};


// ====================== MAIN APP ======================
function App() {
   // ====================== STATE ======================
     const [showLocalModal, setShowLocalModal] = useState(false);
  const [localOfficials, setLocalOfficials] = useState<any[]>([]);
  const [localReps, setLocalReps] = useState<Rep[]>([]);
  const [localLoading, setLocalLoading] = useState(false);
  const [localSubTab, setLocalSubTab] = useState<'all' | 'county' | 'judges' | 'school' | 'sheriff'>('all');
  const [localStreet, setLocalStreet] = useState('');
  const [localCity, setLocalCity] = useState('');
  const [localStateCode, setLocalStateCode] = useState('');
   const [pollVotes, setPollVotes] = useState<{ [pollId: string]: { [option: string]: number } }>({});
   const [user, setUser] = useState<User | null>(null);
  const [reps, setReps] = useState<Rep[]>([]);
  const [selectedRep, setSelectedRep] = useState<Rep | null>(null);
  const [repDetails, setRepDetails] = useState<RepDetails>({ bio: '', votes: [], bills: [], comments: [] });
  const [showRepModal, setShowRepModal] = useState(false);
  const [zip, setZip] = useState('');
  const [county, setCounty] = useState('');
  const [userState, setUserState] = useState('');
  const [voterVerified, setVoterVerified] = useState(false);
 const [currentPolls, setCurrentPolls] = useState<Poll[]>([]);
  const [customPollVotes, setCustomPollVotes] = useState<{ [key: string]: string }>({});
  const [pollResults, setPollResults] = useState<PollResult>({ yea: 0, nay: 0 });
  const [repPolls, setRepPolls] = useState<any>({});
  const [loading, setLoading] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [pollLoading, setPollLoading] = useState(true);
  const [street, setStreet] = useState('');
  const [city, setCity] = useState('');
  const [stateCode, setStateCode] = useState('');
  const [activeTab, setActiveTab] = useState<'federal' | 'state' | 'local' | 'international' | 'spending' | 'all' | 'supreme'>('federal');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPollBreakdown, setShowPollBreakdown] = useState(false);
  const [selectedPoll, setSelectedPoll] = useState<Poll | Rep | null>(null);
    // Smart filtering for polls based on user location
  const filteredPolls = currentPolls.filter((poll: Poll) => {
    if (poll.scope === 'nationwide') return true;

    if (poll.scope === 'state' && poll.state) {
      return userState && poll.state.toUpperCase() === userState.toUpperCase();
    }

    if (poll.scope === 'county' && poll.county) {
      return county && poll.county.toLowerCase().includes(county.toLowerCase());
    }

    return false;
  });

    // ==================== LOCAL OFFICIALS (TEMPORARILY DISABLED) ====================
  // const [showLocalModal, setShowLocalModal] = useState(false);
  // const [localOfficials, setLocalOfficials] = useState<any[]>([]);

  // const fetchLocalOfficials = async (fullAddress: string) => {
  //   alert("Local officials lookup coming soon in the next update.");
  // };
  // ====================== USE EFFECTS ======================

    // Auth Listener
 
  // ... all your useState hooks ...
    const [showShareModal, setShowShareModal] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
const [showVerifyModal, setShowVerifyModal] = useState(false);
  // ====================== USE EFFECTS ======================
  // Fetch active polls from Firestore
    // Fetch ALL active polls
  useEffect(() => {
    const pollsRef = collection(db, 'polls');
    const q = query(pollsRef, where('isActive', '==', true));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const polls = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Poll[];

      setCurrentPolls(polls);
      setPollLoading(false);
    }, (error) => {
      console.error("Poll fetch error:", error);
      setPollLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Auth Listener  ←←← ADD THIS ONE
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  // Load custom poll votes from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('customPollVotes');
    if (saved) {
      setCustomPollVotes(JSON.parse(saved));
    }
  }, []);

           // Real-time vote listener - FIXED for custom polls
  useEffect(() => {
    const votesRef = collection(db, 'votes');
    const unsubscribe = onSnapshot(votesRef, (snapshot) => {
      const newRepPolls: any = {};
      const newPollVotes: { [pollId: string]: { [option: string]: number } } = {};

      snapshot.docs.forEach(doc => {
        const v = doc.data();
        const pollId = v.pollId || 'main';
        const choice = v.choice;   // ← This must be the exact option text

        // Rep polls (approve / disapprove)
        if (v.pollType === 'rep') {
          const tier = v.tier || 'local';
          if (!newRepPolls[pollId]) newRepPolls[pollId] = {};
          if (!newRepPolls[pollId][tier]) newRepPolls[pollId][tier] = { approve: 0, disapprove: 0 };

          if (choice === 'approve' || choice === 'yea') {
            newRepPolls[pollId][tier].approve += 1;
          } else if (choice === 'disapprove' || choice === 'nay') {
            newRepPolls[pollId][tier].disapprove += 1;
          }
        } 
        // Custom community polls
        else {
          if (!newPollVotes[pollId]) newPollVotes[pollId] = {};
          if (!newPollVotes[pollId][choice]) newPollVotes[pollId][choice] = 0;
          newPollVotes[pollId][choice] += 1;
        }
      });

      setRepPolls(newRepPolls);
      setPollVotes(newPollVotes);
    });

    return () => unsubscribe();
  }, []);
  // ... rest of your code

  // ====================== FUNCTIONS ======================
       const fetchReps = async (zipCode: string) => {
    console.log('fetchReps called with ZIP:', zipCode);
    setLoading(true);
    const allReps: Rep[] = [];

    try {
      const geocodioApiKey = process.env.REACT_APP_GEOCODIO_API_KEY;
      if (!geocodioApiKey) {
        alert('Geocodio API key is missing');
        setLoading(false);
        return;
      }

      const fields = 'cd,stateleg';
      const url = `https://api.geocod.io/v1.7/geocode?q=${zipCode}&fields=${fields}&api_key=${geocodioApiKey}`;
      const res = await fetch(url);
      const data = await res.json();

      if (data.results?.length > 0) {
        const result = data.results[0];
        setCounty(result.address_components?.county || 'Unknown County');
        setUserState(result.address_components?.state || 'VA');

        // Federal
        if (result.fields?.congressional_districts) {
          result.fields.congressional_districts.forEach((district: any) => {
            district.current_legislators?.forEach((leg: GeocodioLegislator) => {
              const bio = leg.bio || {};
              const contact = leg.contact || {};
              const social = leg.social || {};
              const refs = leg.references || {};

              allReps.push({
                name: bio.first_name && bio.last_name ? `${bio.first_name} ${bio.last_name}` : leg.name ?? 'Unknown',
                party: bio.party ?? leg.party ?? 'Unknown',
                photo: bio.photo_url ?? leg.photo_url ?? 'https://placehold.co/100x100?text=Rep',
                level: leg.type === 'senator' ? 'U.S. Senator' : 'U.S. Representative',
                contact: contact.url ?? '#',
                phone: contact.phone ?? '',
                score: Math.floor(Math.random() * 101),
                id: refs.bioguide_id ?? leg.id ?? 'unknown',
                xHandle: social.twitter ? `@${social.twitter}` : '@Rep'
              });
            });
          });
        }

        // State House & Senate
        if (result.fields?.state_legislative_districts) {
          const stateLegislative = result.fields.state_legislative_districts;

          if (stateLegislative.house) {
            stateLegislative.house.forEach((district: any) => {
              district.current_legislators?.forEach((leg: GeocodioLegislator) => {
                const bio = leg.bio || {};
                const contact = leg.contact || {};
                const social = leg.social || {};
                const refs = leg.references || {};

                allReps.push({
                  name: bio.first_name && bio.last_name ? `${bio.first_name} ${bio.last_name}` : leg.name ?? 'Unknown',
                  party: bio.party ?? leg.party ?? 'Unknown',
                  photo: bio.photo_url ?? leg.photo_url ?? 'https://placehold.co/100x100?text=Leg',
                  level: 'State House',
                  contact: contact.url ?? '#',
                  phone: contact.phone ?? '',
                  score: Math.floor(Math.random() * 101),
                  id: refs.openstates_id ?? leg.id ?? 'unknown',
                  xHandle: social.twitter ? `@${social.twitter}` : '@StateRep'
                });
              });
            });
          }

          if (stateLegislative.senate) {
            stateLegislative.senate.forEach((district: any) => {
              district.current_legislators?.forEach((leg: GeocodioLegislator) => {
                const bio = leg.bio || {};
                const contact = leg.contact || {};
                const social = leg.social || {};
                const refs = leg.references || {};

                allReps.push({
                  name: bio.first_name && bio.last_name ? `${bio.first_name} ${bio.last_name}` : leg.name ?? 'Unknown',
                  party: bio.party ?? leg.party ?? 'Unknown',
                  photo: bio.photo_url ?? leg.photo_url ?? 'https://placehold.co/100x100?text=Sen',
                  level: 'State Senate',
                  contact: contact.url ?? '#',
                  phone: contact.phone ?? '',
                  score: Math.floor(Math.random() * 101),
                  id: refs.openstates_id ?? leg.id ?? 'unknown',
                  xHandle: social.twitter ? `@${social.twitter}` : '@StateSen'
                });
              });
            });
          }
        }
      }

            // Hardcoded top federal officials (President, VP, Cabinet - NO Supreme Court here anymore)
      const federalOfficials: Rep[] = [
        { name: 'Donald Trump', party: 'Republican', photo: 'https://upload.wikimedia.org/wikipedia/commons/5/56/Donald_Trump_official_portrait.jpg', level: 'President', contact: 'https://www.whitehouse.gov/contact/', phone: '(202) 456-1111', score: 75, id: 'president', xHandle: '@realDonaldTrump' },
        { name: 'JD Vance', party: 'Republican', photo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5f/JD_Vance_official_portrait.jpg/800px-JD_Vance_official_portrait.jpg', level: 'Vice President', contact: 'https://www.whitehouse.gov/contact/', phone: '(202) 456-1111', score: 72, id: 'vice-president', xHandle: '@JDVance' },
      ];

      allReps.unshift(...federalOfficials);
      allReps.push(...supremeCourtJustices);

         // ====================== DEDUPLICATE REPS (fixes duplicates) ======================
      const seen = new Set();
      const uniqueReps = allReps.filter((rep: Rep) => {
        const key = `${rep.name.toLowerCase().trim()}-${rep.level || ''}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      console.log(`✅ fetchReps complete → ${uniqueReps.length} unique reps (removed ${allReps.length - uniqueReps.length} duplicates)`);

      setReps(uniqueReps);
    } catch (error) {
      console.error('fetchReps error:', error);
      setReps([]); // clear on error
    } finally {
      setLoading(false);
    }
  };
           const fetchRepDetails = async (rep: Rep) => {
    console.log('Fetching details for rep:', rep.name);
    setSelectedRep(rep);
    setShowRepModal(true);

    setRepDetails({
      bio: 'Loading official data from Congress.gov...',
      votes: [],
      bills: [],
      comments: [],
      earmarks: []
    });

    const isTopOfficial = rep.id?.startsWith('president') ||
                         rep.id?.startsWith('vice-president') ||
                         rep.id?.startsWith('scotus-') ||
                         rep.id?.startsWith('cabinet-');
    const isLocal = rep.id?.startsWith('local-');

    if (isLocal) {
      setRepDetails({
        bio: `${rep.name} serves as ${rep.party || rep.level}. Local voting records are not available through the Congress API. Use the contact info above to reach their office directly.`,
        votes: [],
        bills: [],
        comments: [],
        earmarks: []
      });
      return;
    }

    if (isTopOfficial) {
      setRepDetails({
        bio: `${rep.name} is a high-level federal official. Detailed voting records and sponsored bills are not available through standard congressional APIs at this time.`,
        votes: ['Detailed voting history coming soon'],
        bills: [{ title: 'Sponsored legislation coming soon' }],
        comments: [],
        earmarks: ['Earmark tracking coming soon']
      });
      return;
    }

    try {
      const congressKey = process.env.REACT_APP_CONGRESS_API_KEY;
      const proxyBase = process.env.REACT_APP_CONGRESS_PROXY_URL;
      const bioguideId = rep.id;

      let fetchUrl: string;
      if (proxyBase) {
        // Use our own Lambda proxy — no API key exposed in the browser
        fetchUrl = `${proxyBase}?bioguideId=${encodeURIComponent(bioguideId)}`;
      } else {
        // Fallback: public CORS proxy with key in URL
        const apiKeyParam = congressKey ? `&api_key=${congressKey}` : '';
        const target = `https://api.congress.gov/v3/member/${bioguideId}/bills?limit=6&sort=latestActionDate&format=json${apiKeyParam}`;
        fetchUrl = `https://corsproxy.io/?${encodeURIComponent(target)}`;
      }

      const res = await fetch(fetchUrl);

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();

      // Build bio from Congress.gov member details
      const m = data.member;
      let bio = 'No biography available.';
      if (m) {
        const name = m.directOrderName || m.invertedOrderName || rep.name;
        const party = m.partyName || rep.party;
        const state = m.state || '';
        const birth = m.birthYear ? ` Born ${m.birthYear}.` : '';
        const termCount = Array.isArray(m.terms?.item) ? m.terms.item.length : (m.terms ? 1 : 0);
        const termsStr = termCount > 0 ? ` Served ${termCount} term${termCount !== 1 ? 's' : ''} in Congress.` : '';
        bio = `${name} is a ${party} representing ${state}.${birth}${termsStr}`;
      }

      const bills: BillItem[] = (data.bills || []).slice(0, 6).map((b: any) => ({
        title: b.title || b.shortTitle || 'Untitled Bill',
        latestAction: b.latestAction || null,
        congressUrl: b.congressUrl || null,
      }));

      const votes: string[] = (data.cosponsoredBills || []).slice(0, 8).map((b: any) =>
        `Co-sponsored: ${b.title}${b.latestAction ? ` — ${b.latestAction}` : ''}`
      );

      setRepDetails({
        bio,
        votes: votes.length > 0 ? votes : ['Recent voting records coming soon'],
        bills: bills.length > 0 ? bills : [{ title: 'No recent sponsored bills found.' }],
        comments: [],
        earmarks: ['Earmark data integration coming soon — check back later.']
      });

    } catch (err) {
      console.error('Congress.gov fetch failed:', err);
      setRepDetails({
        bio: 'Could not load representative data. Please try again.',
        votes: ['Detailed voting records coming soon'],
        bills: [{ title: 'Sponsored bills coming soon' }],
        comments: [],
        earmarks: ['Earmark tracking coming soon']
      });
    }
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
      if (!apiKey) {
        alert('Google API key is missing');
        return;
      }

      // Step 1: Get current elections
      const electionRes = await fetch(`https://www.googleapis.com/civicinfo/v2/elections?key=${apiKey}`);
      const electionData = await electionRes.json();

      const electionId = electionData.elections?.[0]?.id;
      if (!electionId) {
        alert('No current election found for your area');
        return;
      }

      // Step 2: Get voter info for the address
      const url = `https://www.googleapis.com/civicinfo/v2/voterinfo?key=${apiKey}&address=${encodeURIComponent(normalized)}&electionId=${electionId}`;
      const res = await fetch(url);

      if (!res.ok) {
        const errorData = await res.json();
        console.error('Google Civic error:', errorData);
        alert('Address not recognized. Please try a known address or check your state voter portal.');
        return;
      }

      const data = await res.json();

      if (data.pollingLocations?.length > 0 || 
          data.dropOffLocations?.length > 0 || 
          data.earlyVoteSites?.length > 0) {
        
        setVoterVerified(true);
        alert('✅ Voter registration verified! Polling information is available.');
      } else {
        alert('No polling locations found. Please check your state election website.');
      }

    } catch (err) {
      console.error('Verification error:', err);
      alert('Verification failed. Please try again or use your state voter portal.');
    }
  };

      const handleVote = async (
    choice: string,                    // actual option text for custom polls
    tier: string | null = null,
    earmark: string | null = null,
    comment: string | null = null,
    repName: string | null = null,
    pollId: string | null = null       // ← NEW: make key unique per poll
  ) => {
    if (!user) {
      alert('Please sign in to vote!');
      setShowAuth(true);
      return;
    }

    // Unique key PER POLL
    const actualPollId = pollId || repName || 'main';
    const pollKey = `vote_${user.uid}_${actualPollId}`;

    if (localStorage.getItem(pollKey)) {
      alert('You already voted on this!');
      return;
    }

    localStorage.setItem(pollKey, 'voted');

    let effectiveTier = 'out-of-state';
    if (voterVerified) effectiveTier = 'verified';
    else if (county) effectiveTier = 'local';
    else if (userState) effectiveTier = 'in-state';

    try {
      await addDoc(collection(db, 'votes'), {
        userId: user.uid,
        pollType: repName ? 'rep' : 'main',
        pollId: actualPollId,
        choice: choice,                    // exact option text
        tier: effectiveTier,
        timestamp: serverTimestamp()
      });

      alert('Vote recorded successfully!');
    } catch (err) {
      console.error('Vote error:', err);
      alert('Failed to record vote. Please try again.');
    }
  };

  
     const categorizeLocalOfficial = (title: string, districtType: string): { category: 'county' | 'judges' | 'school' | 'sheriff'; level: string } => {
    const t = (title || '').toUpperCase();
    const d = (districtType || '').toUpperCase();
    if (t.includes('SHERIFF') || d.includes('SHERIFF')) return { category: 'sheriff', level: 'Sheriff' };
    if (t.includes('JUDGE') || t.includes('JUSTICE') || t.includes('MAGISTRATE') || d.includes('JUDICIAL')) return { category: 'judges', level: 'Judge' };
    if (t.includes('SCHOOL') || d.includes('SCHOOL')) return { category: 'school', level: 'School Board' };
    return { category: 'county', level: 'County Official' };
  };

  const fetchLocalOfficials = async (fullAddress: string) => {
    const ciceroKey = process.env.REACT_APP_CICERO_API_KEY;
    if (!ciceroKey) {
      alert('Cicero API key is not configured');
      return;
    }

    setLocalLoading(true);
    try {
      const proxy = 'https://corsproxy.io/?';
      // Filter Cicero results to non-legislative local offices
      const url = `https://app.cicerodata.com/v3.1/official/?address=${encodeURIComponent(fullAddress)}&format=json&key=${ciceroKey}`;
      const res = await fetch(proxy + encodeURIComponent(url));
      if (!res.ok) throw new Error(`Cicero returned ${res.status}`);

      const data = await res.json();
      const officials: any[] =
        data?.response?.results?.candidates?.[0]?.officials ||
        data?.response?.results?.officials ||
        data?.officials ||
        [];

      const mapped: Rep[] = officials.map((o: any) => {
        const office = o.office || {};
        const district = office.district || {};
        const title = office.title || '';
        const districtType = district.district_type || '';
        const { level } = categorizeLocalOfficial(title, districtType);
        const phone = (o.addresses && o.addresses[0] && (o.addresses[0].phone_1 || o.addresses[0].phone_2)) || '';
        const url = (o.urls && o.urls[0]) || '';
        const fullName = [o.first_name, o.middle_initial, o.last_name].filter(Boolean).join(' ').trim();
        return {
          name: fullName || 'Unknown',
          party: o.party || title || 'Local',
          photo: o.photo_origin_url || 'https://placehold.co/100x100?text=Local',
          level,
          contact: url,
          phone,
          score: Math.floor(Math.random() * 101),
          id: 'local-' + (o.id || `${fullName}-${title}`),
          xHandle: ''
        };
      });

      setLocalOfficials(officials);
      setLocalReps(mapped);

      if (mapped.length === 0) {
        alert('No local officials found for this address.');
      } else {
        console.log(`Local officials loaded: ${mapped.length}`);
      }
    } catch (err) {
      console.error('fetchLocalOfficials error:', err);
      alert('Failed to load local officials. Please try again later.');
    } finally {
      setLocalLoading(false);
    }
  };

      const handleSignOut = async () => {
        try {
          await signOut(auth);
          alert("You have been signed out successfully.");
        } catch (err) {
          console.error("Sign out error:", err);
          alert("Failed to sign out. Please try again.");
        }
      };

  // ====================== RETURN ======================
  return (
    <div className="App">
                                  {/* Header with Blue Background */}
      <header className="header" style={{ 
        padding: '12px 15px',
        backgroundColor: '#007BFF',           // ← Blue background restored
        color: 'white',
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        position: 'sticky',
        top: 0,
        zIndex: 100
      }}>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          maxWidth: '1200px',
          margin: '0 auto',
          flexWrap: 'wrap',
          gap: '12px'
        }}>
          <div>
            <h1 style={{ margin: '0', fontSize: '22px', color: 'white' }}>Politicker</h1>
            <p style={{ margin: '2px 0 0', fontSize: '13px', color: '#e3f2fd' }}>
              Beta • Real-time accountability
            </p>
          </div>

          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '12px',
            flexWrap: 'wrap',
            justifyContent: 'flex-end'
          }}>
            {user ? (
              <span style={{ fontSize: '14px', color: 'white' }}>
                Signed in as: <strong>{user.email}</strong>
              </span>
            ) : (
              <button 
                onClick={() => setShowAuth(true)} 
                style={{ 
                  padding: '8px 14px', 
                  fontSize: '14px',
                  whiteSpace: 'nowrap',
                  backgroundColor: 'white',
                  color: '#007BFF',
                  border: 'none',
                  borderRadius: '6px'
                }}
              >
                Sign In
              </button>
            )}

                          <span 
              onClick={() => setShowAdmin(true)}
              style={{
                color: 'white',
                fontSize: '14px',
                cursor: 'pointer',
                textDecoration: 'underline',
                padding: '4px 8px',
              }}
            >
              Admin
            </span>
              <button 
  onClick={() => setShowShareModal(true)}
  style={{ 
    background: '#28a745', 
    color: 'white', 
    padding: '8px 18px', 
    borderRadius: '8px', 
    fontSize: '15px', 
    marginLeft: '10px',
    border: 'none',
    cursor: 'pointer'
  }}
>
  Share
</button>
            <span 
              onClick={() => setShowAbout(true)}
              style={{
                color: 'white',
                fontSize: '14px',
                cursor: 'pointer',
                textDecoration: 'underline',
                padding: '4px 8px',
              }}
            >
              About Us
            </span>

            {/* Follow Us */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px' }}>
              <a href="https://x.com/politicker_app" target="_blank" rel="noopener noreferrer" style={{ color: 'white', textDecoration: 'none' }}>𝕏</a>
              <a href="https://www.tiktok.com/@politickerapp.com" target="_blank" rel="noopener noreferrer" style={{ color: 'white', textDecoration: 'none' }}>TikTok</a>
            </div>

            {/* Donate + Non-Profit */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
              <a
                href="https://421557e3-d3e4-4ebc-8478-bab7bfe3d906.paylinks.godaddy.com/fe11c891-4dfe-4ba4-862a-46a"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  backgroundColor: 'white',
                  color: '#007BFF',
                  padding: '10px 16px',
                  borderRadius: '8px',
                  textDecoration: 'none',
                  fontWeight: '700',
                  fontSize: '15px',
                  whiteSpace: 'nowrap'
                }}
              >
                Donate Now
              </a>
              <span style={{ 
                fontSize: '12px', 
                color: 'white', 
                fontWeight: '600',
                textShadow: '0 1px 2px rgba(0,0,0,0.3)'
              }}>
                501(c)(3) • <a href="https://thedreamcorporation.org" target="_blank" rel="noopener noreferrer" style={{ color: 'white', textDecoration: 'underline' }}>The Dream Corporation</a>
              </span>
            </div>
          </div>
        </div>
      </header>

                         {/* Active Community Polls with Real Percentages + Total Votes */}
      <div className="polls-section" style={{ margin: '25px 0' }}>
        <h3>Active Community Polls</h3>
        
        {pollLoading ? (
          <p className="loading">Loading polls...</p>
        ) : filteredPolls.length > 0 ? (
          filteredPolls.map((poll: Poll) => {
            const pollId = poll.id || 'main';
            const isVoted = !!customPollVotes[pollId];
            const votesForPoll = pollVotes[pollId] || {};

            const totalVotes = Object.values(votesForPoll).reduce((sum, count) => sum + count, 0);

            return (
              <div key={pollId} className="poll-card" style={{ 
                marginBottom: '30px', 
                padding: '20px', 
                border: '1px solid #ddd', 
                borderRadius: '10px',
                backgroundColor: '#fafafa'
              }}>
                <h4>{poll.question}</h4>
                
                <p style={{ 
                  fontSize: '14px', 
                  color: '#555', 
                  marginBottom: '8px',
                  fontWeight: '500'
                }}>
                  Scope: <strong>
                    {poll.scope === 'nationwide' ? '🇺🇸 Nationwide' : 
                     poll.scope === 'state' ? `📍 ${poll.state || 'State'}` : 
                     `🏠 ${poll.county || 'County/Local'}`}
                  </strong>
                </p>

                {/* NEW: Total Votes Display */}
                <p style={{ 
                  fontSize: '14px', 
                  color: '#777', 
                  marginBottom: '15px',
                  fontWeight: '600'
                }}>
                  Total Votes: <strong>{totalVotes}</strong>
                </p>

                <form>
                  {poll.options.map((option: string, index: number) => {
                    const voteCount = votesForPoll[option] || 0;
                    const percent = totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0;
                    const isSelected = customPollVotes[pollId] === option;

                    return (
                      <label 
                        key={index} 
                        style={{ 
                          display: 'block', 
                          padding: '14px', 
                          margin: '10px 0', 
                          background: isSelected ? '#e8f5e9' : '#fff',
                          border: '1px solid #eee',
                          borderRadius: '8px',
                          cursor: isVoted ? 'default' : 'pointer',
                          position: 'relative'
                        }}
                      >
                        <input
                          type="radio"
                          name={`poll-${pollId}`}
                          value={option}
                          checked={isSelected}
                          disabled={isVoted}
                          onChange={() => {
                            if (!user) {
                              alert('Please sign in to vote!');
                              setShowAuth(true);
                              return;
                            }
                            setCustomPollVotes(prev => ({
                              ...prev,
                              [pollId]: option
                            }));
                            handleVote(option, null, null, null, null, pollId);
                          }}
                          style={{ marginRight: '12px' }}
                        />
                        {option}

                        <span style={{ 
                          position: 'absolute', 
                          right: '20px', 
                          color: '#666', 
                          fontSize: '13px',
                          fontWeight: '500'
                        }}>
                          {percent}%
                        </span>

                        {isVoted && isSelected && <span style={{ color: '#4CAF50', marginLeft: '8px' }}>(Your vote)</span>}
                      </label>
                    );
                  })}
                </form>
              </div>
            );
          })
        ) : (
          <p style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
            No active polls match your location right now.<br />
          </p>
        )}
      </div>
                {/* Simplified Voter Verification - Mobile Friendly */}
      <div className="voter-verify" style={{ margin: '30px 0' }}>
        <h3>Verify Voter Registration</h3>
        <p style={{ marginBottom: '15px' }}>
          Prove you&apos;re a real registered voter. This gives your votes more weight.
        </p>
        <button 
          onClick={() => setShowVerifyModal(true)}
          style={{ 
            padding: '14px 24px', 
            fontSize: '16px', 
            backgroundColor: '#007BFF', 
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            width: '100%',
            maxWidth: '320px'
          }}
        >
          Verify My Registration
        </button>
      </div>

                            <main style={{ padding: '20px 15px' }}>
        
        {/* Compact ZIP Input */}
        <div style={{ 
          maxWidth: '420px', 
          margin: '0 auto 25px auto',
          textAlign: 'center'
        }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input
              type="text"
              placeholder="ZIP Code"
              value={zip}
              onChange={(e) => setZip(e.target.value)}
              maxLength={5}
              style={{ 
                flex: 1, 
                padding: '14px', 
                fontSize: '17px', 
                borderRadius: '8px',
                border: '2px solid #007BFF'
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') fetchReps(zip);
              }}
            />
            
            <button 
              onClick={() => fetchReps(zip)}
              disabled={loading || zip.length < 5}
              style={{ 
                padding: '14px 22px', 
                fontSize: '16px',
                backgroundColor: '#007BFF',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                whiteSpace: 'nowrap'
              }}
            >
              {loading ? 'Loading...' : 'Show Reps'}
            </button>
          </div>
        </div>

               {/* Main Tabs - Now includes Supreme Court */}
        <div className="main-tabs">
          <button className={activeTab === 'federal' ? 'active' : ''} onClick={() => setActiveTab('federal')}>
            Federal
          </button>
          <button className={activeTab === 'state' ? 'active' : ''} onClick={() => setActiveTab('state')}>
            State
          </button>
          <button className={activeTab === 'local' ? 'active' : ''} onClick={() => setActiveTab('local')}>
            Local
          </button>
          <button className={activeTab === 'supreme' ? 'active' : ''} onClick={() => setActiveTab('supreme')}>
            Supreme Court
          </button>
          <button className={activeTab === 'international' ? 'active' : ''} onClick={() => setActiveTab('international')}>
            International
          </button>
          <button className={activeTab === 'spending' ? 'active' : ''} onClick={() => setActiveTab('spending')}>
            Spending
          </button>
          <button className={activeTab === 'all' ? 'active' : ''} onClick={() => setActiveTab('all')}>
            All
          </button>
        </div>

        {/* Reps Grid */}
        {reps.length > 0 && (
          <div className="reps-section">
            <p className="county-banner">Your County: {county || 'Unknown'}</p>
            
            <div className="reps-grid">
              {reps
                .filter((rep) => {
                  if (activeTab === 'federal') {
                    // Exclude Supreme Court from Federal tab
                    return ['President', 'Vice President', 'U.S. Senator', 'U.S. Representative'].some(level => 
                      rep.level.includes(level)
                    );
                  }
                  if (activeTab === 'state') {
                    return rep.level.includes('State House') || 
                           rep.level.includes('State Senate') ||
                           rep.level.toLowerCase().includes('state');
                  }
                  if (activeTab === 'supreme') {
                    return rep.level === 'Supreme Court';
                  }
                  if (activeTab === 'all') {
                    return true;
                  }
                  return false;
                })
                .map((rep, i) => {
                  const repResults = repPolls[rep.name] || {};
                  const totalApprove = Object.values(repResults).reduce((sum: number, tier: any) => sum + (tier.approve || 0), 0);
                  const totalDisapprove = Object.values(repResults).reduce((sum: number, tier: any) => sum + (tier.disapprove || 0), 0);
                  const totalVotes = totalApprove + totalDisapprove;
                  const realScore = totalVotes > 0 ? Math.round((totalApprove / totalVotes) * 100) : 50;

                  return (
                    <div
                      key={i}
                      className="rep-card"
                      onClick={() => fetchRepDetails(rep)}
                      style={{ cursor: 'pointer' }}
                    >
                      <img 
                        src={rep.photo || 'https://placehold.co/100x100?text=Rep'} 
                        alt={rep.name} 
                        style={{ 
                          width: '100px', 
                          height: '100px', 
                          objectFit: 'cover', 
                          borderRadius: '8px' 
                        }} 
                      />
                      <h4>{rep.name || 'Unknown'}</h4>
                      <p><strong>Party:</strong> {rep.party || 'N/A'}</p>
                      <p><strong>Level:</strong> {rep.level || 'N/A'}</p>
                      <p><strong>Score:</strong> <span style={{ color: '#4CAF50', fontWeight: 'bold' }}>{realScore}%</span></p>
                      {rep.xHandle && rep.xHandle !== '@Rep' && (
                        <p><strong>X:</strong> {rep.xHandle}</p>
                      )}
                    </div>
                  );
                })}
            </div>

            {/* Local Tab Content - Cicero API lookup by full address */}
            {activeTab === 'local' && (
              <div style={{ marginTop: '30px' }}>
                <h3 style={{ textAlign: 'center' }}>Find Local Officials</h3>
                <p style={{ color: '#666', textAlign: 'center', marginBottom: '15px' }}>
                  Enter a full address to look up County Officials, Judges, School Board, and Sheriff.
                </p>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center', marginBottom: '20px' }}>
                  <input
                    type="text"
                    placeholder="Street address"
                    value={localStreet}
                    onChange={(e) => setLocalStreet(e.target.value)}
                    style={{ padding: '8px', minWidth: '220px', borderRadius: '6px', border: '1px solid #ccc' }}
                  />
                  <input
                    type="text"
                    placeholder="City"
                    value={localCity}
                    onChange={(e) => setLocalCity(e.target.value)}
                    style={{ padding: '8px', minWidth: '140px', borderRadius: '6px', border: '1px solid #ccc' }}
                  />
                  <input
                    type="text"
                    placeholder="State (e.g. VA)"
                    value={localStateCode}
                    onChange={(e) => setLocalStateCode(e.target.value.toUpperCase())}
                    maxLength={2}
                    style={{ padding: '8px', width: '80px', borderRadius: '6px', border: '1px solid #ccc' }}
                  />
                  <button
                    onClick={() => {
                      const addr = `${localStreet}, ${localCity}, ${localStateCode}`.trim();
                      if (!localStreet || !localCity || !localStateCode) {
                        alert('Please fill in street, city, and state.');
                        return;
                      }
                      fetchLocalOfficials(addr);
                    }}
                    disabled={localLoading}
                    style={{ padding: '8px 16px', background: '#1976d2', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
                  >
                    {localLoading ? 'Loading...' : 'Find Local Officials'}
                  </button>
                </div>

                {localReps.length > 0 && (
                  <>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center', marginBottom: '20px' }}>
                      {([
                        { key: 'all', label: 'All' },
                        { key: 'county', label: 'County Officials' },
                        { key: 'judges', label: 'Judges' },
                        { key: 'school', label: 'School Board' },
                        { key: 'sheriff', label: 'Sheriff' },
                      ] as const).map(t => (
                        <button
                          key={t.key}
                          onClick={() => setLocalSubTab(t.key)}
                          style={{
                            padding: '6px 14px',
                            borderRadius: '20px',
                            border: '1px solid #1976d2',
                            background: localSubTab === t.key ? '#1976d2' : '#fff',
                            color: localSubTab === t.key ? '#fff' : '#1976d2',
                            cursor: 'pointer',
                            fontWeight: 600
                          }}
                        >
                          {t.label} {t.key !== 'all' && `(${localReps.filter(r => {
                            if (t.key === 'county') return r.level === 'County Official';
                            if (t.key === 'judges') return r.level === 'Judge';
                            if (t.key === 'school') return r.level === 'School Board';
                            if (t.key === 'sheriff') return r.level === 'Sheriff';
                            return false;
                          }).length})`}
                        </button>
                      ))}
                    </div>

                    <div className="reps-grid">
                      {localReps
                        .filter(rep => {
                          if (localSubTab === 'all') return true;
                          if (localSubTab === 'county') return rep.level === 'County Official';
                          if (localSubTab === 'judges') return rep.level === 'Judge';
                          if (localSubTab === 'school') return rep.level === 'School Board';
                          if (localSubTab === 'sheriff') return rep.level === 'Sheriff';
                          return false;
                        })
                        .map((rep, i) => (
                          <div
                            key={rep.id + '-' + i}
                            className="rep-card"
                            onClick={() => fetchRepDetails(rep)}
                            style={{ cursor: 'pointer' }}
                          >
                            <img
                              src={rep.photo || 'https://placehold.co/100x100?text=Local'}
                              alt={rep.name}
                              style={{ width: '100px', height: '100px', objectFit: 'cover', borderRadius: '8px' }}
                              onError={(e) => { (e.target as HTMLImageElement).src = 'https://placehold.co/100x100?text=Local'; }}
                            />
                            <h4>{rep.name}</h4>
                            <p><strong>Office:</strong> {rep.party}</p>
                            <p><strong>Level:</strong> {rep.level}</p>
                            {rep.phone && <p><strong>Phone:</strong> {rep.phone}</p>}
                          </div>
                        ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}

                {/* Spending Tab */}
        {activeTab === 'spending' && (
          <div className="spending-section">
            <h2>Government Spending Tracker</h2>
            <p>Real-time federal spending bills and earmarks are being integrated.</p>
            <p style={{ color: '#666', fontStyle: 'italic', marginTop: '20px' }}>
              This feature is coming soon in this live beta version.
            </p>
          </div>
        )}

      </main>

           {/* Modals - All now properly centered */}
      {showRepModal && selectedRep && (
        <RepModal
          selectedRep={selectedRep}
          repDetails={repDetails}
          repPolls={repPolls}
          onClose={() => setShowRepModal(false)}
          handleVote={handleVote}
          setSelectedPoll={setSelectedPoll}
          setShowPollBreakdown={setShowPollBreakdown}
        />
      )}

      {showAdmin && (
        <AdminModal 
          onClose={() => setShowAdmin(false)} 
          user={user} 
          setShowAuth={setShowAuth} 
        />
      )}

      {showAuth && (
        <div className="modal-overlay">
          <AuthForm onClose={() => setShowAuth(false)} />
        </div>
      )}

      {showPollBreakdown && selectedPoll && (
        <PollBreakdownModal 
          pollOrRep={selectedPoll}
          repPolls={repPolls} 
          onClose={() => setShowPollBreakdown(false)} 
        />
      )}

      {showVerifyModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: '420px' }}>
            <button 
              className="modal-close" 
              onClick={() => setShowVerifyModal(false)}
            >
              ×
            </button>
            
            <h2>Verify Your Registration</h2>
            <p>Enter your full address (street, city, state, ZIP). We only use this to verify you — nothing is stored.</p>
            
            <input
              type="text"
              placeholder="Full Address (e.g. 123 Main St, Chesterfield, VA 23112)"
              value={street}
              onChange={(e) => setStreet(e.target.value)}
              style={{ width: '100%', padding: '14px', margin: '15px 0', fontSize: '16px' }}
            />
            
            <button 
              onClick={() => {
                verifyVoter(street);
                setShowVerifyModal(false);
              }}
              style={{ 
                width: '100%', 
                padding: '14px', 
                backgroundColor: '#4CAF50', 
                color: 'white', 
                fontSize: '16px',
                border: 'none',
                borderRadius: '8px'
              }}
            >
              Submit & Verify
            </button>
          </div>
        </div>
      )}

      

            {/* About Us Modal - Final Version with Financial Breakdown */}
      {showAbout && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: '680px', maxHeight: '90vh', overflowY: 'auto' }}>
            <button className="modal-close" onClick={() => setShowAbout(false)}>×</button>
            
            <h2>About Politicker</h2>
            
            <p><strong>What we are building:</strong></p>
            <p>
              Politicker is a mobile-first app that makes it easy for anyone to stay up to date with their elected officials.
              Enter your ZIP code to see your representatives, view their actions, and cast real-time approval or disapproval votes.
            </p>
            
            <p><strong>Why we are doing this:</strong></p>
            <p>
              Politicians should be accountable every single day — not just during election season. 
              Right now, most voters feel ignored and disconnected from the decisions that affect their lives.
            </p>
            <p>
              We believe that when citizens can easily see what their reps are doing and have a simple way to make their voice heard, 
              <strong>together we cannot be ignored.</strong>
            </p>

            <p><strong>The power of your engagement:</strong></p>
            <p>
              Your votes and daily use of this beta are incredibly valuable. 
              Every time you check your reps, cast a vote, or share the app, you help test real-time accountability and show what engaged citizenship looks like.
            </p>
            <p>
              Making it convenient and easy to stay informed is our mission. The more people who use it, the stronger our collective voice becomes.
            </p>

            <p><strong>Why we need support (Financial Breakdown):</strong></p>
            <ul style={{ paddingLeft: '20px' }}>
              <li><strong>Real-time congressional &amp; government data APIs</strong> — $15,000–$25,000 per year</li>
              <li><strong>Local government data access (Cicero and similar)</strong> — $20,000+ per year</li>
              <li><strong>Voter registration verification systems</strong> — $10,000–$30,000 per year</li>
              <li><strong>Full mobile app development (iOS + Android)</strong> — $40,000–$60,000</li>
              <li><strong>Servers, hosting, security &amp; maintenance</strong> — $8,000–$12,000 per year</li>
            </ul>
            <p>
              These costs are the reason many features are still limited in this beta. Your support helps us unlock complete, reliable data for every level of government.
            </p>

            <p><strong>How you can help right now:</strong></p>
            <ul style={{ paddingLeft: '20px' }}>
              <li>Use the app regularly and cast votes</li>
              <li>Share Politicker with friends and family</li>
              <li>Give us feedback on what you’d like to see next</li>
              <li>Donate through the button in the header (tax-deductible)</li>
            </ul>

            <p>
              We operate under <strong>The Dream Corporation</strong>, a 501(c)(3) nonprofit. 
              Every donation is tax-deductible, but <strong>your daily engagement and votes are the most powerful support</strong>.
            </p>

            <button 
              onClick={() => setShowAbout(false)}
              style={{ marginTop: '25px', width: '100%', padding: '14px', fontSize: '17px' }}
            >
              Close
            </button>
             

          </div>
        </div>
      )}

      {/* Sign Out Button - At the bottom as requested */}
      {user && (
        <div style={{ 
          textAlign: 'center', 
          padding: '20px 15px', 
          borderTop: '1px solid #eee',
          marginTop: '40px'
        }}>
          <button 
            onClick={handleSignOut}
            style={{ 
              padding: '10px 24px', 
              fontSize: '15px',
              backgroundColor: '#f44336',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer'
            }}
          >
            Sign Out
          </button>
        </div>
      )}
      {showShareModal && <ShareModal onClose={() => setShowShareModal(false)} />}
    </div>
  );
}
      
export default App;
