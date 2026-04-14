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
  doc,        // ← Add this
  getDoc      // ← For memberVotes on-demand fetch
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
  districtNumber?: number;  // Congressional district (House only); set by Geocodio result
  stateCode?: string;       // 2-letter state (e.g. "VA")
  // Optional judge-only metadata (populated for Federal Judge reps)
  judgeInfo?: {
    courtId: string;
    positionType?: string;            // "U.S. District Judge" | "U.S. Circuit Judge"
    dateStart?: string;
    dateConfirmation?: string;
    howSelected?: string;             // e.g. "Appointment by President with Senate Confirmation"
    appointerName?: string;           // "Donald Trump", "Barack Obama", etc.
    appointerId?: string | number;
    personId?: number | string;
  };
  // Optional Governor-only metadata
  governorInfo?: {
    stateName: string;
    stateHomepage: string;
    executiveOrdersUrl?: string;
    budgetUrl?: string;
    tookOffice?: string;
  };
  // Optional SCOTUS-only metadata (hardcoded since MQ scores/confirmation votes are static public record)
  scotusInfo?: {
    appointedBy: string;
    confirmationDate: string;
    confirmationVote: string;   // e.g. "54–45"
    mqScore: number;            // Martin-Quinn ideology score (neg = liberal, pos = conservative)
    mqTerm: string;             // term these scores reflect (e.g. "2022 Term")
  };
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
  cosponsoredBills?: BillItem[];
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

// ====================== STATE GOVERNORS (Hardcoded — keep up to date after elections) ======================
// As of April 2026. Update after each Gubernatorial election.
const STATE_NAMES: { [key: string]: string } = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado',
  CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho',
  IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana',
  ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi',
  MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
  NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma',
  OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee',
  TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia',
  WI: 'Wisconsin', WY: 'Wyoming',
};

const stateGovernors: { [key: string]: Rep } = (() => {
  const list: Array<{ state: string; name: string; party: string; tookOffice?: string }> = [
    { state: 'AL', name: 'Kay Ivey', party: 'Republican' },
    { state: 'AK', name: 'Mike Dunleavy', party: 'Republican' },
    { state: 'AZ', name: 'Katie Hobbs', party: 'Democrat' },
    { state: 'AR', name: 'Sarah Huckabee Sanders', party: 'Republican' },
    { state: 'CA', name: 'Gavin Newsom', party: 'Democrat' },
    { state: 'CO', name: 'Jared Polis', party: 'Democrat' },
    { state: 'CT', name: 'Ned Lamont', party: 'Democrat' },
    { state: 'DE', name: 'Matt Meyer', party: 'Democrat' },
    { state: 'FL', name: 'Ron DeSantis', party: 'Republican' },
    { state: 'GA', name: 'Brian Kemp', party: 'Republican' },
    { state: 'HI', name: 'Josh Green', party: 'Democrat' },
    { state: 'ID', name: 'Brad Little', party: 'Republican' },
    { state: 'IL', name: 'JB Pritzker', party: 'Democrat' },
    { state: 'IN', name: 'Mike Braun', party: 'Republican' },
    { state: 'IA', name: 'Kim Reynolds', party: 'Republican' },
    { state: 'KS', name: 'Laura Kelly', party: 'Democrat' },
    { state: 'KY', name: 'Andy Beshear', party: 'Democrat' },
    { state: 'LA', name: 'Jeff Landry', party: 'Republican' },
    { state: 'ME', name: 'Janet Mills', party: 'Democrat' },
    { state: 'MD', name: 'Wes Moore', party: 'Democrat' },
    { state: 'MA', name: 'Maura Healey', party: 'Democrat' },
    { state: 'MI', name: 'Gretchen Whitmer', party: 'Democrat' },
    { state: 'MN', name: 'Tim Walz', party: 'Democrat' },
    { state: 'MS', name: 'Tate Reeves', party: 'Republican' },
    { state: 'MO', name: 'Mike Kehoe', party: 'Republican' },
    { state: 'MT', name: 'Greg Gianforte', party: 'Republican' },
    { state: 'NE', name: 'Jim Pillen', party: 'Republican' },
    { state: 'NV', name: 'Joe Lombardo', party: 'Republican' },
    { state: 'NH', name: 'Kelly Ayotte', party: 'Republican' },
    { state: 'NJ', name: 'Phil Murphy', party: 'Democrat' },
    { state: 'NM', name: 'Michelle Lujan Grisham', party: 'Democrat' },
    { state: 'NY', name: 'Kathy Hochul', party: 'Democrat' },
    { state: 'NC', name: 'Josh Stein', party: 'Democrat' },
    { state: 'ND', name: 'Kelly Armstrong', party: 'Republican' },
    { state: 'OH', name: 'Mike DeWine', party: 'Republican' },
    { state: 'OK', name: 'Kevin Stitt', party: 'Republican' },
    { state: 'OR', name: 'Tina Kotek', party: 'Democrat' },
    { state: 'PA', name: 'Josh Shapiro', party: 'Democrat' },
    { state: 'RI', name: 'Dan McKee', party: 'Democrat' },
    { state: 'SC', name: 'Henry McMaster', party: 'Republican' },
    { state: 'SD', name: 'Larry Rhoden', party: 'Republican' },
    { state: 'TN', name: 'Bill Lee', party: 'Republican' },
    { state: 'TX', name: 'Greg Abbott', party: 'Republican' },
    { state: 'UT', name: 'Spencer Cox', party: 'Republican' },
    { state: 'VT', name: 'Phil Scott', party: 'Republican' },
    { state: 'VA', name: 'Abigail Spanberger', party: 'Democrat' },
    { state: 'WA', name: 'Bob Ferguson', party: 'Democrat' },
    { state: 'WV', name: 'Patrick Morrisey', party: 'Republican' },
    { state: 'WI', name: 'Tony Evers', party: 'Democrat' },
    { state: 'WY', name: 'Mark Gordon', party: 'Republican' },
  ];
  const map: { [key: string]: Rep } = {};
  for (const g of list) {
    const stateName = STATE_NAMES[g.state] || g.state;
    const homepage = `https://www.${g.state.toLowerCase()}.gov`;
    map[g.state] = {
      name: g.name,
      party: g.party,
      photo: `https://en.wikipedia.org/wiki/Special:FilePath/${encodeURIComponent(g.name)}.jpg?width=400`,
      level: 'Governor',
      contact: homepage,
      phone: '',
      score: 0,
      id: `governor-${g.state.toLowerCase()}`,
      xHandle: '',
      stateCode: g.state,
      governorInfo: {
        stateName,
        stateHomepage: homepage,
        executiveOrdersUrl: `https://www.google.com/search?q=${encodeURIComponent(stateName + ' governor executive orders')}`,
        budgetUrl: `https://www.google.com/search?q=${encodeURIComponent(stateName + ' state budget')}`,
        tookOffice: g.tookOffice,
      },
    };
  }
  return map;
})();

// ====================== SUPREME COURT JUSTICES (Hardcoded) ======================
const supremeCourtJustices: Rep[] = [
  {
    name: 'John G. Roberts, Jr.',
    party: 'Chief Justice',
    photo: 'https://en.wikipedia.org/wiki/Special:FilePath/Official_roberts_CJ.jpg?width=400',
    level: 'Supreme Court',
    contact: 'https://www.supremecourt.gov/contact/contactus.aspx',
    phone: '(202) 479-3000',
    score: 0,
    id: 'scotus-roberts',
    xHandle: '',
    scotusInfo: { appointedBy: 'George W. Bush', confirmationDate: '2005-09-29', confirmationVote: '78–22', mqScore: 0.37, mqTerm: '2022 Term' }
  },
  {
    name: 'Clarence Thomas',
    party: 'Associate Justice',
    photo: 'https://en.wikipedia.org/wiki/Special:FilePath/Clarence_Thomas_official_SCOTUS_portrait.jpg?width=400',
    level: 'Supreme Court',
    contact: 'https://www.supremecourt.gov/contact/contactus.aspx',
    phone: '(202) 479-3000',
    score: 0,
    id: 'scotus-thomas',
    xHandle: '',
    scotusInfo: { appointedBy: 'George H.W. Bush', confirmationDate: '1991-10-15', confirmationVote: '52–48', mqScore: 3.56, mqTerm: '2022 Term' }
  },
  {
    name: 'Samuel Alito',
    party: 'Associate Justice',
    photo: 'https://en.wikipedia.org/wiki/Special:FilePath/Samuel_Alito_official_photo.jpg?width=400',
    level: 'Supreme Court',
    contact: 'https://www.supremecourt.gov/contact/contactus.aspx',
    phone: '(202) 479-3000',
    score: 0,
    id: 'scotus-alito',
    xHandle: '',
    scotusInfo: { appointedBy: 'George W. Bush', confirmationDate: '2006-01-31', confirmationVote: '58–42', mqScore: 2.42, mqTerm: '2022 Term' }
  },
  {
    name: 'Sonia Sotomayor',
    party: 'Associate Justice',
    photo: 'https://en.wikipedia.org/wiki/Special:FilePath/Sonia_Sotomayor_in_SCOTUS_robe_crop.jpg?width=400',
    level: 'Supreme Court',
    contact: 'https://www.supremecourt.gov/contact/contactus.aspx',
    phone: '(202) 479-3000',
    score: 0,
    id: 'scotus-sotomayor',
    xHandle: '',
    scotusInfo: { appointedBy: 'Barack Obama', confirmationDate: '2009-08-06', confirmationVote: '68–31', mqScore: -2.94, mqTerm: '2022 Term' }
  },
  {
    name: 'Elena Kagan',
    party: 'Associate Justice',
    photo: 'https://en.wikipedia.org/wiki/Special:FilePath/Elena_Kagan_Official_SCOTUS_Portrait.jpg?width=400',
    level: 'Supreme Court',
    contact: 'https://www.supremecourt.gov/contact/contactus.aspx',
    phone: '(202) 479-3000',
    score: 0,
    id: 'scotus-kagan',
    xHandle: '',
    scotusInfo: { appointedBy: 'Barack Obama', confirmationDate: '2010-08-05', confirmationVote: '63–37', mqScore: -1.95, mqTerm: '2022 Term' }
  },
  {
    name: 'Neil Gorsuch',
    party: 'Associate Justice',
    photo: 'https://en.wikipedia.org/wiki/Special:FilePath/Associate_Justice_Neil_Gorsuch_Official_Portrait.jpg?width=400',
    level: 'Supreme Court',
    contact: 'https://www.supremecourt.gov/contact/contactus.aspx',
    phone: '(202) 479-3000',
    score: 0,
    id: 'scotus-gorsuch',
    xHandle: '',
    scotusInfo: { appointedBy: 'Donald Trump', confirmationDate: '2017-04-07', confirmationVote: '54–45', mqScore: 1.13, mqTerm: '2022 Term' }
  },
  {
    name: 'Brett Kavanaugh',
    party: 'Associate Justice',
    photo: 'https://en.wikipedia.org/wiki/Special:FilePath/Associate_Justice_Brett_M._Kavanaugh_Official_Portrait.jpg?width=400',
    level: 'Supreme Court',
    contact: 'https://www.supremecourt.gov/contact/contactus.aspx',
    phone: '(202) 479-3000',
    score: 0,
    id: 'scotus-kavanaugh',
    xHandle: '',
    scotusInfo: { appointedBy: 'Donald Trump', confirmationDate: '2018-10-06', confirmationVote: '50–48', mqScore: 0.64, mqTerm: '2022 Term' }
  },
  {
    name: 'Amy Coney Barrett',
    party: 'Associate Justice',
    photo: 'https://en.wikipedia.org/wiki/Special:FilePath/Amy_Coney_Barrett_official_portrait.jpg?width=400',
    level: 'Supreme Court',
    contact: 'https://www.supremecourt.gov/contact/contactus.aspx',
    phone: '(202) 479-3000',
    score: 0,
    id: 'scotus-barrett',
    xHandle: '',
    scotusInfo: { appointedBy: 'Donald Trump', confirmationDate: '2020-10-26', confirmationVote: '52–48', mqScore: 1.71, mqTerm: '2022 Term' }
  },
  {
    name: 'Ketanji Brown Jackson',
    party: 'Associate Justice',
    photo: 'https://en.wikipedia.org/wiki/Special:FilePath/Ketanji_Brown_Jackson_official_portrait.jpg?width=400',
    level: 'Supreme Court',
    contact: 'https://www.supremecourt.gov/contact/contactus.aspx',
    phone: '(202) 479-3000',
    score: 0,
    id: 'scotus-jackson',
    xHandle: '',
    scotusInfo: { appointedBy: 'Joe Biden', confirmationDate: '2022-04-07', confirmationVote: '53–47', mqScore: -2.54, mqTerm: '2022 Term' }
  }
];

// ====================== STATE → FEDERAL COURT IDs (CourtListener) ======================
// Maps each state to its federal district court IDs + the circuit court it belongs to.
// Used to fetch currently-serving federal judges for a user's state.
const STATE_FEDERAL_COURTS: { [key: string]: string[] } = {
  AL: ['almd', 'alnd', 'alsd', 'ca11'],
  AK: ['akd', 'ca9'],
  AZ: ['azd', 'ca9'],
  AR: ['ared', 'arwd', 'ca8'],
  CA: ['cacd', 'caed', 'cand', 'casd', 'ca9'],
  CO: ['cod', 'ca10'],
  CT: ['ctd', 'ca2'],
  DE: ['ded', 'ca3'],
  DC: ['dcd', 'cadc'],
  FL: ['flmd', 'flnd', 'flsd', 'ca11'],
  GA: ['gamd', 'gand', 'gasd', 'ca11'],
  HI: ['hid', 'ca9'],
  ID: ['idd', 'ca9'],
  IL: ['ilcd', 'ilnd', 'ilsd', 'ca7'],
  IN: ['innd', 'insd', 'ca7'],
  IA: ['iand', 'iasd', 'ca8'],
  KS: ['ksd', 'ca10'],
  KY: ['kyed', 'kywd', 'ca6'],
  LA: ['laed', 'lamd', 'lawd', 'ca5'],
  ME: ['med', 'ca1'],
  MD: ['mdd', 'ca4'],
  MA: ['mad', 'ca1'],
  MI: ['mied', 'miwd', 'ca6'],
  MN: ['mnd', 'ca8'],
  MS: ['msnd', 'mssd', 'ca5'],
  MO: ['moed', 'mowd', 'ca8'],
  MT: ['mtd', 'ca9'],
  NE: ['ned', 'ca8'],
  NV: ['nvd', 'ca9'],
  NH: ['nhd', 'ca1'],
  NJ: ['njd', 'ca3'],
  NM: ['nmd', 'ca10'],
  NY: ['nyed', 'nynd', 'nysd', 'nywd', 'ca2'],
  NC: ['nced', 'ncmd', 'ncwd', 'ca4'],
  ND: ['ndd', 'ca8'],
  OH: ['ohnd', 'ohsd', 'ca6'],
  OK: ['oked', 'oknd', 'okwd', 'ca10'],
  OR: ['ord', 'ca9'],
  PA: ['paed', 'pamd', 'pawd', 'ca3'],
  RI: ['rid', 'ca1'],
  SC: ['scd', 'ca4'],
  SD: ['sdd', 'ca8'],
  TN: ['tned', 'tnmd', 'tnwd', 'ca6'],
  TX: ['txed', 'txnd', 'txsd', 'txwd', 'ca5'],
  UT: ['utd', 'ca10'],
  VT: ['vtd', 'ca2'],
  VA: ['vaed', 'vawd', 'ca4'],
  WA: ['waed', 'wawd', 'ca9'],
  WV: ['wvnd', 'wvsd', 'ca4'],
  WI: ['wied', 'wiwd', 'ca7'],
  WY: ['wyd', 'ca10'],
};

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
// ====================== SPENDING TAB (USAspending.gov) ======================
const SpendingTab: React.FC<{ userState: string }> = ({ userState }) => {
  const [agencies, setAgencies] = useState<any[] | null>(null);
  const [stateAwards, setStateAwards] = useState<any[] | null>(null);
  const [stateCategory, setStateCategory] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(true);

  // Current fiscal year — US federal FY starts Oct 1 (so April 2026 = FY2026 which started 2025-10-01)
  const now = new Date();
  const fy = now.getUTCMonth() >= 9 ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
  const fyStart = `${fy - 1}-10-01`;
  const fyEnd = `${fy}-09-30`;
  const timePeriod = [{ start_date: fyStart, end_date: fyEnd }];

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [agencyRes, stateAwardsRes, stateCatRes] = await Promise.all([
          // 1) Top federal agencies by obligated spending (national, current FY)
          fetch('https://api.usaspending.gov/api/v2/search/spending_by_category/awarding_agency/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filters: { time_period: timePeriod }, limit: 10 }),
          }),
          // 2) Top contractors/grantees in user's state
          userState ? fetch('https://api.usaspending.gov/api/v2/search/spending_by_category/recipient_duns/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              filters: {
                time_period: timePeriod,
                place_of_performance_locations: [{ country: 'USA', state: userState }],
              },
              limit: 10,
            }),
          }) : Promise.resolve(null),
          // 3) Top categories of spending in user's state (by award type)
          userState ? fetch('https://api.usaspending.gov/api/v2/search/spending_by_category/naics/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              filters: {
                time_period: timePeriod,
                place_of_performance_locations: [{ country: 'USA', state: userState }],
              },
              limit: 10,
            }),
          }) : Promise.resolve(null),
        ]);

        const agencyData = agencyRes.ok ? await agencyRes.json() : { results: [] };
        const stateAwardsData = stateAwardsRes && stateAwardsRes.ok ? await stateAwardsRes.json() : { results: [] };
        const stateCatData = stateCatRes && stateCatRes.ok ? await stateCatRes.json() : { results: [] };

        if (!cancelled) {
          setAgencies(agencyData.results || []);
          setStateAwards(stateAwardsData.results || []);
          setStateCategory(stateCatData.results || []);
        }
      } catch (e) {
        console.warn('USAspending fetch failed:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userState]);

  const fmt = (n: number) => {
    if (!n && n !== 0) return '—';
    if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
    if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
    if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
    return `$${n}`;
  };

  return (
    <div className="spending-section">
      <h2>Government Spending Tracker</h2>
      <p style={{ color: '#666', fontSize: '13px', marginBottom: '20px' }}>
        Source: USAspending.gov (Fiscal Year {fy}). Free federal spending data.
      </p>

      {loading ? <p>Loading spending data…</p> : (
        <>
          {/* Agencies */}
          <div style={{ marginTop: '20px' }}>
            <h3>Top Federal Agencies by Spending (FY{fy})</h3>
            {agencies && agencies.length > 0 ? (
              <div style={{ border: '1px solid #eee', borderRadius: '8px', padding: '10px' }}>
                {agencies.map((a: any, i: number) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', borderBottom: i < agencies.length - 1 ? '1px solid #eee' : 'none' }}>
                    <span style={{ flex: 1 }}>{a.name}</span>
                    <strong style={{ color: '#1976d2' }}>{fmt(a.amount)}</strong>
                  </div>
                ))}
              </div>
            ) : <p style={{ color: '#777' }}>No data.</p>}
          </div>

          {/* State-specific */}
          {userState && (
            <>
              <div style={{ marginTop: '30px' }}>
                <h3>Top Contractors &amp; Grantees in {userState} (FY{fy})</h3>
                {stateAwards && stateAwards.length > 0 ? (
                  <div style={{ border: '1px solid #eee', borderRadius: '8px', padding: '10px' }}>
                    {stateAwards.map((r: any, i: number) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', borderBottom: i < stateAwards.length - 1 ? '1px solid #eee' : 'none' }}>
                        <span style={{ flex: 1 }}>{r.name}</span>
                        <strong style={{ color: '#388e3c' }}>{fmt(r.amount)}</strong>
                      </div>
                    ))}
                  </div>
                ) : <p style={{ color: '#777' }}>No data for {userState}.</p>}
              </div>

              <div style={{ marginTop: '30px' }}>
                <h3>Top Spending Categories in {userState} (FY{fy})</h3>
                {stateCategory && stateCategory.length > 0 ? (
                  <div style={{ border: '1px solid #eee', borderRadius: '8px', padding: '10px' }}>
                    {stateCategory.map((c: any, i: number) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', borderBottom: i < stateCategory.length - 1 ? '1px solid #eee' : 'none' }}>
                        <span style={{ flex: 1 }}>{c.name}</span>
                        <strong style={{ color: '#6b21a8' }}>{fmt(c.amount)}</strong>
                      </div>
                    ))}
                  </div>
                ) : <p style={{ color: '#777' }}>No data for {userState}.</p>}
              </div>
            </>
          )}

          {!userState && (
            <p style={{ marginTop: '20px', color: '#999', fontStyle: 'italic' }}>
              Enter a ZIP code and click &quot;Show Reps&quot; to see spending breakdowns for your state.
            </p>
          )}
        </>
      )}
    </div>
  );
};

// ====================== DISTRICT / STATE SPENDING (USAspending, on-demand) ======================
const DistrictSpending: React.FC<{ stateCode: string; districtNumber?: number; chamber: 'house' | 'senate' }> = ({ stateCode, districtNumber, chamber }) => {
  const [recipients, setRecipients] = useState<any[] | null>(null);
  const [categories, setCategories] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(true);

  const now = new Date();
  const fy = now.getUTCMonth() >= 9 ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
  const timePeriod = [{ start_date: `${fy - 1}-10-01`, end_date: `${fy}-09-30` }];

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Senators: statewide. Representatives: specific congressional district.
        const location: any = { country: 'USA', state: stateCode };
        if (chamber === 'house' && typeof districtNumber === 'number') {
          // USAspending uses district_current (post-2022 redistricting) as the filter key.
          location.district_current = String(districtNumber).padStart(2, '0');
        }
        const filters = { time_period: timePeriod, place_of_performance_locations: [location] };

        const [rRes, cRes] = await Promise.all([
          fetch('https://api.usaspending.gov/api/v2/search/spending_by_category/recipient_duns/', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filters, limit: 10 }),
          }),
          fetch('https://api.usaspending.gov/api/v2/search/spending_by_category/naics/', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filters, limit: 10 }),
          }),
        ]);

        const rData = rRes.ok ? await rRes.json() : { results: [] };
        const cData = cRes.ok ? await cRes.json() : { results: [] };
        if (!cancelled) {
          setRecipients(rData.results || []);
          setCategories(cData.results || []);
        }
      } catch (e) {
        console.warn('DistrictSpending fetch failed:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [stateCode, districtNumber, chamber]);

  const fmt = (n: number) => {
    if (!n && n !== 0) return '—';
    if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
    if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
    if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
    return `$${n}`;
  };

  const scope = chamber === 'senate' || typeof districtNumber !== 'number'
    ? `State of ${stateCode}`
    : `${stateCode}-${String(districtNumber).padStart(2, '0')}`;

  return (
    <div style={{ marginTop: '25px' }}>
      <h3>Federal Spending in {scope}</h3>
      <p style={{ fontSize: '12px', color: '#666', fontStyle: 'italic', margin: '0 0 12px' }}>
        Source: USAspending.gov — FY{fy}. {chamber === 'senate' ? 'Senators represent the whole state.' : 'Representatives cover a single Congressional district.'}
      </p>
      {loading ? <p>Loading…</p> : (
        <>
          <h4 style={{ margin: '0 0 8px' }}>Top Contractors / Grantees</h4>
          {recipients && recipients.length > 0 ? (
            <div style={{ border: '1px solid #eee', borderRadius: '8px', padding: '10px', marginBottom: '15px' }}>
              {recipients.map((r: any, i: number) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', borderBottom: i < recipients.length - 1 ? '1px solid #eee' : 'none' }}>
                  <span style={{ flex: 1 }}>{r.name}</span>
                  <strong style={{ color: '#388e3c' }}>{fmt(r.amount)}</strong>
                </div>
              ))}
            </div>
          ) : <p style={{ color: '#777' }}>No recipient data for {scope}.</p>}

          <h4 style={{ margin: '0 0 8px' }}>Top Spending Categories</h4>
          {categories && categories.length > 0 ? (
            <div style={{ border: '1px solid #eee', borderRadius: '8px', padding: '10px' }}>
              {categories.map((c: any, i: number) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', borderBottom: i < categories.length - 1 ? '1px solid #eee' : 'none' }}>
                  <span style={{ flex: 1 }}>{c.name}</span>
                  <strong style={{ color: '#6b21a8' }}>{fmt(c.amount)}</strong>
                </div>
              ))}
            </div>
          ) : <p style={{ color: '#777' }}>No category data.</p>}
        </>
      )}
    </div>
  );
};

// ====================== TOP DONORS (FEC OpenFEC API, on-demand via button) ======================
const TopDonors: React.FC<{ repName: string; chamber: 'house' | 'senate'; stateCode?: string }> = ({ repName, chamber, stateCode }) => {
  const [employers, setEmployers] = useState<any[] | null>(null);
  const [totals, setTotals] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const loadDonors = async () => {
    const key = process.env.REACT_APP_FEC_API_KEY;
    if (!key) { setError('FEC API key not configured (set REACT_APP_FEC_API_KEY in .env — get free key at api.data.gov)'); return; }
    if (!stateCode) { setError('Missing state code.'); return; }
    setLoading(true); setError(null);
    try {
      const office = chamber === 'senate' ? 'S' : 'H';
      const lastName = repName.split(' ').slice(-1)[0];

      // Step 1: find the FEC candidate_id
      const searchUrl = `https://api.open.fec.gov/v1/candidates/search/?q=${encodeURIComponent(lastName)}&state=${stateCode}&office=${office}&cycle=2024&api_key=${encodeURIComponent(key)}&per_page=5`;
      const searchRes = await fetch(searchUrl);
      if (!searchRes.ok) throw new Error(`FEC search ${searchRes.status}`);
      const searchData = await searchRes.json();
      const candidates = searchData.results || [];
      // Prefer a match on full name
      const candidate = candidates.find((c: any) => c.name?.toLowerCase().includes(repName.toLowerCase())) || candidates[0];
      if (!candidate) throw new Error(`No FEC candidate found for ${repName} (${stateCode}, ${chamber})`);
      const candId: string = candidate.candidate_id;

      // Step 2: get principal committee
      const committeesUrl = `https://api.open.fec.gov/v1/candidate/${candId}/committees/?designation=P&cycle=2024&api_key=${encodeURIComponent(key)}`;
      const cmtRes = await fetch(committeesUrl);
      if (!cmtRes.ok) throw new Error(`FEC committees ${cmtRes.status}`);
      const cmtData = await cmtRes.json();
      const committee = (cmtData.results || [])[0];
      if (!committee) throw new Error(`No principal committee for ${repName}`);
      const committeeId: string = committee.committee_id;

      // Step 3: top employers (biggest "contributors" roll-up FEC provides) + committee totals
      const [empRes, totRes] = await Promise.all([
        fetch(`https://api.open.fec.gov/v1/schedules/schedule_a/by_employer/?committee_id=${committeeId}&cycle=2024&sort=-total&per_page=15&api_key=${encodeURIComponent(key)}`),
        fetch(`https://api.open.fec.gov/v1/committee/${committeeId}/totals/?cycle=2024&api_key=${encodeURIComponent(key)}`),
      ]);
      const empData = empRes.ok ? await empRes.json() : { results: [] };
      const totData = totRes.ok ? await totRes.json() : { results: [] };

      setEmployers(empData.results || []);
      setTotals((totData.results || [])[0] || null);
      setLoaded(true);
    } catch (e) {
      setError((e as any)?.message || 'Failed to load donors');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ marginTop: '25px' }}>
      <h3>Campaign Donors</h3>
      {!loaded && (
        <button
          onClick={loadDonors}
          disabled={loading}
          style={{ padding: '8px 16px', background: '#d97706', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
        >
          {loading ? 'Loading…' : `View Top Donors for ${repName} →`}
        </button>
      )}
      {error && <p style={{ color: '#c00', fontSize: '13px', marginTop: '10px' }}>{error}</p>}
      {loaded && (
        <div style={{ marginTop: '10px' }}>
          <p style={{ fontSize: '12px', color: '#666', fontStyle: 'italic', margin: '0 0 12px' }}>
            Source: FEC.gov (2023-2024 cycle). Principal campaign committee.
          </p>
          {totals && (
            <div style={{ background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: '8px', padding: '12px', marginBottom: '15px' }}>
              <p style={{ margin: '0 0 4px', fontSize: '13px' }}><strong>Total receipts:</strong> ${Number(totals.receipts || 0).toLocaleString()}</p>
              <p style={{ margin: '0 0 4px', fontSize: '13px' }}><strong>Individual contributions:</strong> ${Number(totals.individual_contributions || 0).toLocaleString()}</p>
              <p style={{ margin: 0, fontSize: '13px' }}><strong>PAC / committee contributions:</strong> ${Number(totals.other_political_committee_contributions || 0).toLocaleString()}</p>
            </div>
          )}
          <h4 style={{ margin: '0 0 8px' }}>Top Donor Employers</h4>
          {employers && employers.length > 0 ? (
            <div style={{ border: '1px solid #eee', borderRadius: '8px', padding: '10px' }}>
              {employers.map((e: any, i: number) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', borderBottom: i < employers.length - 1 ? '1px solid #eee' : 'none' }}>
                  <span style={{ flex: 1 }}>{e.employer || '(Not disclosed)'}</span>
                  <strong style={{ color: '#d97706' }}>${Number(e.total || 0).toLocaleString()}</strong>
                </div>
              ))}
            </div>
          ) : <p style={{ color: '#777' }}>No employer-aggregated data.</p>}
          <p style={{ marginTop: '10px', fontSize: '11px', color: '#999', fontStyle: 'italic' }}>
            Employer totals aggregate individual contributions by reported employer name — a proxy for company-level giving.
          </p>
        </div>
      )}
    </div>
  );
};

// ====================== EXECUTIVE ORDERS (lazy-loaded from Federal Register) ======================
const ExecutiveOrders: React.FC<{ presidentSlug: string; presidentName: string }> = ({ presidentSlug, presidentName }) => {
  const [orders, setOrders] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const url = `https://www.federalregister.gov/api/v1/documents?conditions[presidential_document_type]=executive_order&conditions[president]=${presidentSlug}&per_page=10&order=newest`;
        const r = await fetch(url);
        if (!r.ok) { if (!cancelled) setOrders([]); return; }
        const data = await r.json();
        if (!cancelled) setOrders(data.results || []);
      } catch {
        if (!cancelled) setOrders([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [presidentSlug]);

  return (
    <div style={{ marginTop: '25px' }}>
      <h3>Recent Executive Orders</h3>
      {loading ? (
        <p style={{ fontStyle: 'italic', color: '#777' }}>Loading executive orders...</p>
      ) : orders && orders.length > 0 ? (
        <div style={{ maxHeight: '420px', overflowY: 'auto', border: '1px solid #eee', borderRadius: '8px', padding: '10px' }}>
          <p style={{ margin: '0 0 10px', fontSize: '12px', color: '#666', fontStyle: 'italic' }}>
            Latest {orders.length} executive orders signed by {presidentName}. Source: Federal Register.
          </p>
          {orders.map((o: any, i: number) => (
            <div key={i} style={{ padding: '12px 15px', marginBottom: '8px', background: '#f9f9f9', borderRadius: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '4px' }}>
                <span style={{ fontSize: '14px', fontWeight: 500, flex: 1 }}>
                  {o.executive_order_number && <strong>EO {o.executive_order_number}: </strong>}
                  {o.title || 'Untitled'}
                </span>
                <span style={{ fontSize: '11px', color: '#666', whiteSpace: 'nowrap' }}>{o.signing_date || o.publication_date}</span>
              </div>
              {o.abstract && (
                <p style={{ margin: '0 0 6px', fontSize: '13px', color: '#444' }}>{o.abstract}</p>
              )}
              {o.html_url && (
                <a href={o.html_url} target="_blank" rel="noopener noreferrer"
                   style={{ fontSize: '12px', color: '#007bff' }}>
                  Read full order →
                </a>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p style={{ fontStyle: 'italic', color: '#777' }}>No executive orders found.</p>
      )}
    </div>
  );
};

// ====================== JUDGE OPINIONS (lazy-loaded) ======================
const JudgeOpinions: React.FC<{ personId: number | string }> = ({ personId }) => {
  const [opinions, setOpinions] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // CourtListener v4 — opinions authored by this person, newest first
        const url = `https://www.courtlistener.com/api/rest/v4/opinions/?author=${personId}&order_by=-date_filed&page_size=5`;
        const r = await fetch(url);
        if (!r.ok) { if (!cancelled) setOpinions([]); return; }
        const data = await r.json();
        if (!cancelled) setOpinions(data.results || []);
      } catch {
        if (!cancelled) setOpinions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [personId]);

  return (
    <div style={{ marginTop: '25px' }}>
      <h3>Recent Opinions Authored</h3>
      {loading ? (
        <p style={{ fontStyle: 'italic', color: '#777' }}>Loading opinions...</p>
      ) : opinions && opinions.length > 0 ? (
        <div style={{ border: '1px solid #eee', borderRadius: '8px', padding: '10px' }}>
          {opinions.map((op: any, i: number) => (
            <div key={i} style={{ padding: '10px', borderBottom: i < opinions.length - 1 ? '1px solid #eee' : 'none' }}>
              <p style={{ margin: '0 0 4px', fontSize: '14px', fontWeight: 500 }}>
                {op.case_name || op.type || 'Opinion'}
              </p>
              <p style={{ margin: 0, fontSize: '12px', color: '#666' }}>
                {op.date_filed && `Filed: ${op.date_filed}`}
                {op.cluster && typeof op.cluster === 'string' && (
                  <>
                    {' · '}
                    <a href={`https://www.courtlistener.com${op.absolute_url || ''}`} target="_blank" rel="noopener noreferrer" style={{ color: '#6b21a8' }}>
                      Read →
                    </a>
                  </>
                )}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p style={{ fontStyle: 'italic', color: '#777' }}>No authored opinions found in CourtListener.</p>
      )}
    </div>
  );
};

// ====================== REP MODAL (with Real Voting History) ======================
const RepModal: React.FC<{
  selectedRep: Rep | null;
  repDetails: RepDetails;
  repPolls: any;
  upcomingVotes?: Array<{ chamber: string; billId: string; title: string; source?: string }>;
  memberVotes?: Array<{ rollnumber: number; date: string; chamber: string; bill: string; title?: string; description: string; position: string; congress: number }>;
  userState?: string;
  onClose: () => void;
  handleVote: (choice: string, tier?: string | null, earmark?: string | null, comment?: string | null, repName?: string | null, pollId?: string | null) => void;
  setSelectedPoll: (pollOrRep: Poll | Rep | null) => void;
  setShowPollBreakdown: (show: boolean) => void;
}> = ({ selectedRep, repDetails, repPolls, upcomingVotes = [], memberVotes = [], userState = '', onClose, handleVote, setSelectedPoll, setShowPollBreakdown }) => {
  if (!selectedRep) return null;

  // Judges + other local officials skip the Congress-style sections (voting history, sponsored bills, earmarks)
  const isJudge = selectedRep.id?.startsWith('local-judge-') || selectedRep.level === 'Federal Judge';
  const isLocalOfficial = selectedRep.id?.startsWith('local-');
  const isScotus = selectedRep.id?.startsWith('scotus-') || selectedRep.level === 'Supreme Court';
  const isPresident = selectedRep.id === 'president';
  const isVicePresident = selectedRep.id === 'vice-president';
  const isGovernor = selectedRep.level === 'Governor' || selectedRep.id?.startsWith('governor-');
  const isExecutive = isPresident || isVicePresident;

  // Real-time approval score
  const repResults = repPolls[selectedRep.name] || {};
  const totalApprove = Object.values(repResults).reduce((sum: number, tier: any) => sum + (tier.approve || 0), 0);
  const totalDisapprove = Object.values(repResults).reduce((sum: number, tier: any) => sum + (tier.disapprove || 0), 0);
  const totalVotes = totalApprove + totalDisapprove;
  const realScore = totalVotes > 0 ? Math.round((totalApprove / totalVotes) * 100) : null;

  // Per-bill vote counts + percentages
  const billStats = (pollId: string) => {
    const entry = repResults[pollId] || {};
    const approve = entry.approve || 0;
    const oppose = entry.disapprove || 0;
    const total = approve + oppose;
    const approvePct = total > 0 ? Math.round((approve / total) * 100) : null;
    const opposePct = total > 0 ? 100 - (approvePct || 0) : null;
    return { approve, oppose, total, approvePct, opposePct };
  };

  const renderBillCard = (bill: BillItem, pollId: string) => {
    const s = billStats(pollId);
    return (
      <div style={{ padding: '12px 15px', marginBottom: '8px', background: '#f9f9f9', borderRadius: '6px' }}>
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
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={() => handleVote('approve', null, null, null, selectedRep.name, pollId)}
            style={{ backgroundColor: '#4CAF50', color: 'white', padding: '6px 14px', fontSize: '13px', borderRadius: '4px', border: 'none', cursor: 'pointer' }}
          >👍 Support {s.approvePct !== null && `(${s.approvePct}%)`}</button>
          <button
            onClick={() => handleVote('disapprove', null, null, null, selectedRep.name, pollId)}
            style={{ backgroundColor: '#f44336', color: 'white', padding: '6px 14px', fontSize: '13px', borderRadius: '4px', border: 'none', cursor: 'pointer' }}
          >👎 Oppose {s.opposePct !== null && `(${s.opposePct}%)`}</button>
          <span style={{ fontSize: '12px', color: '#666' }}>
            {s.total > 0 ? `${s.total} constituent ${s.total === 1 ? 'vote' : 'votes'}` : 'No votes yet'}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: '700px', maxHeight: '90vh', overflowY: 'auto', position: 'relative' }}>
        <button
          className="modal-close"
          onClick={onClose}
          style={{
            position: 'sticky',
            top: '8px',
            marginLeft: 'auto',
            display: 'block',
            float: 'right',
            zIndex: 10,
            background: 'rgba(255,255,255,0.95)',
            border: '1px solid #ccc',
            borderRadius: '50%',
            width: '34px',
            height: '34px',
            fontSize: '22px',
            lineHeight: '1',
            cursor: 'pointer',
            boxShadow: '0 2px 6px rgba(0,0,0,0.15)'
          }}
        >×</button>

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
              <strong>Approval Score:</strong> {realScore !== null ? `${realScore}% (${totalVotes} votes)` : 'No votes yet'}
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

        {/* Judge-specific section */}
        {isJudge && (
          <div style={{ marginTop: '30px' }}>
            <h3>Court &amp; Appointment</h3>
            <div style={{ background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: '8px', padding: '15px' }}>
              <p style={{ margin: '0 0 6px' }}>
                <strong>Position:</strong> {selectedRep.judgeInfo?.positionType || selectedRep.party.replace(/\s*\([^)]*\)\s*/, '').trim()}
              </p>
              {selectedRep.judgeInfo?.courtId && (
                <p style={{ margin: '0 0 6px' }}>
                  <strong>Court:</strong> <code>{selectedRep.judgeInfo.courtId}</code>
                  {selectedRep.judgeInfo.courtId.startsWith('ca') ? ' (U.S. Court of Appeals)' : ' (U.S. District Court)'}
                </p>
              )}
              {selectedRep.judgeInfo?.appointerName && (
                <p style={{ margin: '0 0 6px' }}>
                  <strong>Appointing President:</strong> {selectedRep.judgeInfo.appointerName}
                </p>
              )}
              {selectedRep.judgeInfo?.dateStart && (
                <p style={{ margin: '0 0 6px' }}>
                  <strong>Took office:</strong> {selectedRep.judgeInfo.dateStart}
                </p>
              )}
              {selectedRep.judgeInfo?.dateConfirmation && (
                <p style={{ margin: '0 0 6px' }}>
                  <strong>Confirmed:</strong> {selectedRep.judgeInfo.dateConfirmation}
                </p>
              )}
              {selectedRep.judgeInfo?.howSelected && (
                <p style={{ margin: '0 0 6px', fontSize: '13px', color: '#555' }}>
                  <strong>Selection:</strong> {selectedRep.judgeInfo.howSelected}
                </p>
              )}
              <p style={{ margin: '10px 0 0', fontSize: '12px', color: '#999', fontStyle: 'italic' }}>
                Judicial philosophy scores (Martin–Quinn) are published by mqscores.lsa.umich.edu — not yet integrated.
              </p>
              {selectedRep.contact && (
                <p style={{ margin: '10px 0 0' }}>
                  <a href={selectedRep.contact} target="_blank" rel="noopener noreferrer" style={{ color: '#6b21a8', fontWeight: 600 }}>
                    Full profile on CourtListener (opinions, rulings, career) →
                  </a>
                </p>
              )}
            </div>
          </div>
        )}

        {/* Judge notable opinions — lazy-loaded from CourtListener */}
        {isJudge && selectedRep.judgeInfo?.personId && (
          <JudgeOpinions personId={selectedRep.judgeInfo.personId} />
        )}

        {/* SCOTUS-specific: appointment, confirmation, Martin-Quinn ideology */}
        {isScotus && selectedRep.scotusInfo && (() => {
          const s = selectedRep.scotusInfo;
          // Map mqScore (-4..+4 typical range) to a 0..100% position on a slider
          const clamped = Math.max(-4, Math.min(4, s.mqScore));
          const pct = ((clamped + 4) / 8) * 100;
          const ideology =
            s.mqScore <= -2 ? 'Strongly Liberal' :
            s.mqScore < -0.5 ? 'Liberal' :
            s.mqScore <= 0.5 ? 'Moderate' :
            s.mqScore < 2 ? 'Conservative' :
            'Strongly Conservative';
          const ideoColor = s.mqScore < -0.5 ? '#1e88e5' : s.mqScore > 0.5 ? '#d32f2f' : '#757575';

          return (
            <>
              <div style={{ marginTop: '30px' }}>
                <h3>Appointment &amp; Confirmation</h3>
                <div style={{ background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: '8px', padding: '15px' }}>
                  <p style={{ margin: '0 0 6px' }}><strong>Appointed by:</strong> {s.appointedBy}</p>
                  <p style={{ margin: '0 0 6px' }}><strong>Confirmed:</strong> {s.confirmationDate}</p>
                  <p style={{ margin: '0 0 6px' }}><strong>Confirmation vote:</strong> {s.confirmationVote}</p>
                </div>
              </div>

              <div style={{ marginTop: '25px' }}>
                <h3>Judicial Ideology (Martin–Quinn)</h3>
                <div style={{ background: '#f9f9f9', border: '1px solid #eee', borderRadius: '8px', padding: '15px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '10px' }}>
                    <span style={{ fontSize: '14px' }}><strong>MQ Score:</strong> {s.mqScore.toFixed(2)} <span style={{ color: '#666', fontSize: '12px' }}>({s.mqTerm})</span></span>
                    <span style={{ color: ideoColor, fontWeight: 600 }}>{ideology}</span>
                  </div>
                  {/* Slider */}
                  <div style={{ position: 'relative', height: '12px', borderRadius: '6px', background: 'linear-gradient(to right, #1e88e5, #eee 50%, #d32f2f)' }}>
                    <div style={{
                      position: 'absolute', left: `${pct}%`, top: '-4px',
                      width: '4px', height: '20px', background: '#000', borderRadius: '2px',
                      transform: 'translateX(-50%)'
                    }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#666', marginTop: '4px' }}>
                    <span>← Liberal</span>
                    <span>Moderate</span>
                    <span>Conservative →</span>
                  </div>
                  <p style={{ margin: '12px 0 0', fontSize: '11px', color: '#999', fontStyle: 'italic' }}>
                    Source: Martin–Quinn scores (mqscores.lsa.umich.edu). Negative = liberal, positive = conservative. Updated annually.
                  </p>
                </div>
              </div>
            </>
          );
        })()}

        {/* Executive officials: show executive orders + key admin info */}
        {isExecutive && (
          <div style={{ marginTop: '30px' }}>
            <h3>Office of the {isPresident ? 'President' : 'Vice President'}</h3>
            <div style={{ background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: '8px', padding: '15px' }}>
              <p style={{ margin: '0 0 6px' }}><strong>Role:</strong> {selectedRep.level}</p>
              {isPresident && (
                <p style={{ margin: '0 0 6px', fontSize: '13px', color: '#555' }}>
                  Signs executive orders, proclamations, and memoranda. Voting history isn&apos;t applicable — Presidents don&apos;t cast Congressional votes.
                </p>
              )}
              {isVicePresident && (
                <p style={{ margin: '0 0 6px', fontSize: '13px', color: '#555' }}>
                  Casts tie-breaking votes in the Senate. Doesn&apos;t sponsor legislation directly.
                </p>
              )}
            </div>
          </div>
        )}
        {isPresident && (
          <ExecutiveOrders presidentSlug="donald-trump" presidentName={selectedRep.name} />
        )}

        {/* Governor panel */}
        {isGovernor && selectedRep.governorInfo && (
          <div style={{ marginTop: '30px' }}>
            <h3>Governor&apos;s Office</h3>
            <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '8px', padding: '15px' }}>
              <p style={{ margin: '0 0 6px' }}><strong>Office:</strong> Governor of {selectedRep.governorInfo.stateName}</p>
              <p style={{ margin: '0 0 6px' }}><strong>Party:</strong> {selectedRep.party}</p>
              {selectedRep.governorInfo.tookOffice && (
                <p style={{ margin: '0 0 6px' }}><strong>Took office:</strong> {selectedRep.governorInfo.tookOffice}</p>
              )}
              <p style={{ margin: '10px 0 0', fontSize: '13px', color: '#555' }}>
                Governors sign state legislation into law, issue executive orders, manage the state budget, and serve as commander-in-chief of the state&apos;s National Guard. They don&apos;t cast Congressional votes.
              </p>
              <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <a href={selectedRep.governorInfo.stateHomepage} target="_blank" rel="noopener noreferrer" style={{ color: '#059669', fontWeight: 600 }}>
                  {selectedRep.governorInfo.stateName} state government homepage →
                </a>
                {selectedRep.governorInfo.executiveOrdersUrl && (
                  <a href={selectedRep.governorInfo.executiveOrdersUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#059669' }}>
                    Find recent executive orders →
                  </a>
                )}
                {selectedRep.governorInfo.budgetUrl && (
                  <a href={selectedRep.governorInfo.budgetUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#059669' }}>
                    State budget →
                  </a>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Sections hidden for judges, local officials, SCOTUS, executive officials, and Governors */}
        {!isJudge && !isLocalOfficial && !isScotus && !isExecutive && !isGovernor && (<>

        {/* Recent Voting History — real roll-call votes from voteview.com (updated daily), compared to constituent polls */}
        <div style={{ marginTop: '30px' }}>
          <h3>Recent Voting History</h3>
          {(() => {
            const lastName = selectedRep.name.split(' ').slice(-1)[0];
            if (memberVotes.length === 0) {
              return (
                <div style={{ border: '1px solid #eee', borderRadius: '8px', padding: '15px', background: '#f9f9f9' }}>
                  <p style={{ margin: 0, fontSize: '14px', color: '#555' }}>
                    No roll-call voting history available yet for this member. Real voting records are populated daily from voteview.com.
                  </p>
                  {selectedRep.id?.startsWith('ocd-person/') && (
                    <p style={{ margin: '10px 0 0', fontSize: '13px' }}>
                      <a href={`https://openstates.org/person/${selectedRep.id.replace('ocd-person/', '')}/`} target="_blank" rel="noopener noreferrer" style={{ color: '#007bff' }}>
                        View full voting record on OpenStates →
                      </a>
                    </p>
                  )}
                </div>
              );
            }
            return (
              <div style={{ maxHeight: '420px', overflowY: 'auto', border: '1px solid #eee', borderRadius: '8px', padding: '10px' }}>
                <p style={{ margin: '0 0 10px', fontSize: '12px', color: '#666', fontStyle: 'italic' }}>
                  Most recent {memberVotes.length} roll-call votes. Source: voteview.com.
                </p>
                {memberVotes.map((v, idx) => {
                  // Try to match this vote to a constituent poll via the bill identifier
                  const billKey = (v.bill || '').replace(/\s+/g, '').toUpperCase();
                  // Find any constituent poll keyed under this rep for the same bill
                  let s = { approve: 0, oppose: 0, total: 0, approvePct: null as number | null, opposePct: null as number | null };
                  for (const [pid, entry] of Object.entries(repResults) as any) {
                    if (!billKey) break;
                    if (pid.toUpperCase().includes(billKey)) {
                      const a = entry.approve || 0;
                      const o = entry.disapprove || 0;
                      const t = a + o;
                      s = { approve: a, oppose: o, total: t, approvePct: t > 0 ? Math.round(a / t * 100) : null, opposePct: t > 0 ? 100 - Math.round(a / t * 100) : null };
                      break;
                    }
                  }

                  // Verdict: compare rep's actual position to majority constituent preference
                  let verdict: JSX.Element | null = null;
                  if (s.total > 0 && s.approvePct !== null) {
                    const constitMajority: 'support' | 'oppose' = s.approvePct >= 50 ? 'support' : 'oppose';
                    const repVotedYea = v.position === 'Yea';
                    const repVotedNay = v.position === 'Nay';
                    if (repVotedYea && constitMajority === 'support') {
                      verdict = <span style={{ color: '#4CAF50', fontWeight: 600 }}>✅ {lastName} voted WITH {s.approvePct}% of constituents</span>;
                    } else if (repVotedNay && constitMajority === 'oppose') {
                      verdict = <span style={{ color: '#4CAF50', fontWeight: 600 }}>✅ {lastName} voted WITH {s.opposePct}% of constituents</span>;
                    } else if (repVotedYea && constitMajority === 'oppose') {
                      verdict = <span style={{ color: '#f44336', fontWeight: 600 }}>⚠️ {lastName} voted AGAINST {s.opposePct}% of constituents</span>;
                    } else if (repVotedNay && constitMajority === 'support') {
                      verdict = <span style={{ color: '#f44336', fontWeight: 600 }}>⚠️ {lastName} voted AGAINST {s.approvePct}% of constituents</span>;
                    }
                  }

                  const positionColor = v.position === 'Yea' ? '#4CAF50' : v.position === 'Nay' ? '#f44336' : '#999';

                  return (
                    <div key={idx} style={{ padding: '12px 15px', marginBottom: '8px', background: '#f9f9f9', borderRadius: '6px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '4px' }}>
                        <div style={{ flex: 1 }}>
                          <span style={{ fontSize: '14px', fontWeight: 500, display: 'block' }}>
                            {v.bill && <strong>{v.bill}</strong>}
                            {v.title && <span style={{ color: '#222' }}> — {v.title}</span>}
                          </span>
                          <span style={{ fontSize: '12px', color: '#666' }}>
                            {v.description || 'Roll call vote'}
                          </span>
                        </div>
                        <span style={{ fontSize: '11px', color: '#666', whiteSpace: 'nowrap' }}>{v.date}</span>
                      </div>
                      <p style={{ margin: '0 0 4px', fontSize: '13px' }}>
                        Vote: <strong style={{ color: positionColor }}>{v.position}</strong>
                        {' '}<span style={{ color: '#666', fontSize: '11px' }}>(Roll #{v.rollnumber}, {v.chamber})</span>
                      </p>
                      {verdict && <p style={{ margin: 0, fontSize: '13px' }}>{verdict}</p>}
                      {s.total === 0 && (
                        <p style={{ margin: 0, fontSize: '12px', color: '#999', fontStyle: 'italic' }}>No constituent votes recorded for this bill yet</p>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>

        {/* Framing note shared across all bill-vote sections */}
        <div style={{ marginTop: '30px', padding: '12px 15px', background: '#e8f4fd', border: '1px solid #bee5eb', borderRadius: '8px' }}>
          <p style={{ margin: 0, fontSize: '14px', color: '#0c5460' }}>
            <strong>Let {selectedRep.name} know how you&apos;d like them to vote on your behalf.</strong> Support or oppose any bill below — percentages show how other constituents have weighed in.
          </p>
        </div>

        {/* Upcoming Votes — prefer real scheduled floor votes for this rep's chamber (from daily scraper); fall back to active bills proxy */}
        <div style={{ marginTop: '25px' }}>
          <h3>Upcoming Votes</h3>
          {(() => {
            // Map rep level → chamber for filtering scheduled votes
            const chamber = selectedRep.level?.includes('Senator') ? 'senate'
              : selectedRep.level?.includes('Representative') || selectedRep.level?.includes('House') ? 'house'
              : null;
            const scheduled = chamber
              ? upcomingVotes.filter((v: any) => v.chamber === chamber)
              : [];

            if (scheduled.length > 0) {
              return (
                <div style={{ maxHeight: '380px', overflowY: 'auto', border: '1px solid #eee', borderRadius: '8px', padding: '10px' }}>
                  <p style={{ margin: '0 0 10px', fontSize: '12px', color: '#0c5460' }}>
                    📅 Scheduled for floor consideration this week
                  </p>
                  {scheduled.map((v: any, index: number) => {
                    const bill: BillItem = {
                      title: `${v.billId ? `${v.billId}: ` : ''}${v.title || 'Untitled'}`,
                      latestAction: v.source ? `Source: ${v.source}` : null,
                      congressUrl: null,
                    };
                    return (
                      <div key={v.id || index}>{renderBillCard(bill, `scheduled_${chamber}_${v.billId || index}`)}</div>
                    );
                  })}
                </div>
              );
            }

            // Fallback: sort the rep's own bills by latest action date
            const merged: { bill: BillItem; pollId: string }[] = [];
            (repDetails.bills || []).forEach((b, i) => {
              if (b.title && !b.title.toLowerCase().includes('no recent')) {
                merged.push({ bill: b, pollId: `bill_${selectedRep.name}_${i}` });
              }
            });
            (repDetails.cosponsoredBills || []).forEach((b, i) => {
              merged.push({ bill: b, pollId: `cosponsor_${selectedRep.name}_${i}` });
            });
            merged.sort((a, b) => {
              const da = a.bill.latestAction?.match(/\d{4}-\d{2}-\d{2}/)?.[0] || '';
              const db = b.bill.latestAction?.match(/\d{4}-\d{2}-\d{2}/)?.[0] || '';
              return db.localeCompare(da);
            });
            const upcoming = merged.slice(0, 5);
            return upcoming.length > 0 ? (
              <div style={{ maxHeight: '380px', overflowY: 'auto', border: '1px solid #eee', borderRadius: '8px', padding: '10px' }}>
                <p style={{ margin: '0 0 10px', fontSize: '12px', color: '#999', fontStyle: 'italic' }}>
                  No scheduled floor votes available — showing bills with recent legislative action.
                </p>
                {upcoming.map((item, index) => (
                  <div key={index}>{renderBillCard(item.bill, item.pollId)}</div>
                ))}
              </div>
            ) : (
              <p style={{ fontStyle: 'italic', color: '#777' }}>No upcoming votes or recent bill activity found.</p>
            );
          })()}
        </div>

        {/* Bills this rep has a stake in — sponsored + co-sponsored combined with a role badge */}
        <div style={{ marginTop: '30px' }}>
          <h3>Sponsored &amp; Co-sponsored Bills</h3>
          {(() => {
            type BillWithRole = { bill: BillItem; pollId: string; role: 'Primary Sponsor' | 'Co-sponsor' };
            const all: BillWithRole[] = [];
            (repDetails.bills || []).forEach((b, i) => {
              if (b.title && !b.title.toLowerCase().includes('no recent')) {
                all.push({ bill: b, pollId: `bill_${selectedRep.name}_${i}`, role: 'Primary Sponsor' });
              }
            });
            (repDetails.cosponsoredBills || []).forEach((b, i) => {
              all.push({ bill: b, pollId: `cosponsor_${selectedRep.name}_${i}`, role: 'Co-sponsor' });
            });
            if (all.length === 0) {
              return <p style={{ fontStyle: 'italic', color: '#777' }}>No recent bills loaded yet.</p>;
            }
            return (
              <div style={{ maxHeight: '500px', overflowY: 'auto', border: '1px solid #eee', borderRadius: '8px', padding: '10px' }}>
                {all.map((item, index) => (
                  <div key={index} style={{ position: 'relative' }}>
                    <span style={{
                      position: 'absolute', top: '14px', right: '14px', zIndex: 1,
                      fontSize: '11px', fontWeight: 600, padding: '3px 8px',
                      borderRadius: '10px',
                      background: item.role === 'Primary Sponsor' ? '#1976d2' : '#757575',
                      color: '#fff'
                    }}>
                      {item.role}
                    </span>
                    {renderBillCard(item.bill, item.pollId)}
                  </div>
                ))}
              </div>
            );
          })()}
        </div>

        {/* Top Donors (FEC) — only for federal Congressional reps */}
        {(selectedRep.level === 'U.S. Senator' || selectedRep.level === 'U.S. Representative') && (selectedRep.stateCode || userState) && (
          <TopDonors
            repName={selectedRep.name}
            chamber={selectedRep.level === 'U.S. Senator' ? 'senate' : 'house'}
            stateCode={selectedRep.stateCode || userState}
          />
        )}

        {/* Federal spending — Senators: statewide; Representatives: district-scoped */}
        {(selectedRep.level === 'U.S. Senator' || selectedRep.level === 'U.S. Representative') && (selectedRep.stateCode || userState) && (
          <DistrictSpending
            stateCode={selectedRep.stateCode || userState}
            districtNumber={selectedRep.districtNumber}
            chamber={selectedRep.level === 'U.S. Senator' ? 'senate' : 'house'}
          />
        )}

        {/* Earmarks (separated) */}
        <div style={{ marginTop: '30px' }}>
          <h3>Earmarks</h3>
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
        </>)}

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
          <h3>Overall Approval Rating</h3>
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
  const [upcomingVotes, setUpcomingVotes] = useState<Array<{chamber: string; billId: string; title: string; source?: string}>>([]);
  const [memberVotes, setMemberVotes] = useState<Array<{rollnumber: number; date: string; chamber: string; bill: string; title?: string; description: string; position: string; congress: number}>>([]);
  const [localReps, setLocalReps] = useState<Rep[]>([]);
  const [localLoading, setLocalLoading] = useState(false);
  const [localSubTab, setLocalSubTab] = useState<'all' | 'county' | 'judges' | 'school' | 'sheriff'>('all');
  const [localStreet, setLocalStreet] = useState('');
  const [localCity, setLocalCity] = useState('');
  const [localStateCode, setLocalStateCode] = useState('');
   const [pollVotes, setPollVotes] = useState<{ [pollId: string]: { [option: string]: number } }>({});
   const [user, setUser] = useState<User | null>(null);
  const [reps, setReps] = useState<Rep[]>([]);
  const [officialSearch, setOfficialSearch] = useState('');
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

  // Live upcoming floor-vote schedule (populated daily by the floorScheduleScraper Lambda)
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'upcomingVotes'), (snap) => {
      const items: any[] = [];
      snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
      setUpcomingVotes(items);
    }, (err) => {
      console.warn('upcomingVotes subscription error:', err.message);
    });
    return () => unsub();
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
            // Geocodio may use district_number, congress_number (no), or parse from "name" like "Congressional District 7"
            let distNum: number | undefined;
            const rawNum = district.district_number ?? district.code;
            if (typeof rawNum === 'number') distNum = rawNum;
            else if (typeof rawNum === 'string' && rawNum.trim()) distNum = parseInt(rawNum, 10);
            if (distNum == null || Number.isNaN(distNum)) {
              const m = (district.name || '').match(/\d+/);
              if (m) distNum = parseInt(m[0], 10);
            }
            const stateCode = district.state_abbreviation || result.address_components?.state || '';
            console.log(`Congressional district parsed: name="${district.name}" distNum=${distNum} stateCode=${stateCode}`);
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
                score: 0,
                id: refs.bioguide_id ?? leg.id ?? 'unknown',
                xHandle: social.twitter ? `@${social.twitter}` : '@Rep',
                districtNumber: leg.type === 'senator' ? undefined : distNum,
                stateCode,
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
                  score: 0,
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
                  score: 0,
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
        { name: 'Donald Trump', party: 'Republican', photo: 'https://upload.wikimedia.org/wikipedia/commons/5/56/Donald_Trump_official_portrait.jpg', level: 'President', contact: 'https://www.whitehouse.gov/contact/', phone: '(202) 456-1111', score: 0, id: 'president', xHandle: '@realDonaldTrump' },
        { name: 'JD Vance', party: 'Republican', photo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5f/JD_Vance_official_portrait.jpg/800px-JD_Vance_official_portrait.jpg', level: 'Vice President', contact: 'https://www.whitehouse.gov/contact/', phone: '(202) 456-1111', score: 0, id: 'vice-president', xHandle: '@JDVance' },
      ];

      allReps.unshift(...federalOfficials);
      allReps.push(...supremeCourtJustices);

      // Inject the Governor for the user's state (statewide executive — not covered by Geocodio)
      const stateAbbr = (data?.results?.[0]?.address_components?.state) || userState;
      if (stateAbbr && stateGovernors[stateAbbr]) {
        allReps.push(stateGovernors[stateAbbr]);
      }

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
    setMemberVotes([]); // reset before re-fetching

    // If Congressional (bioguide id looks like X000000), pull cached voteview data from Firestore
    const looksLikeBioguide = rep.id && /^[A-Z]\d{6}$/.test(rep.id);
    if (looksLikeBioguide) {
      try {
        const snap = await getDoc(doc(db, 'memberVotes', rep.id));
        if (snap.exists()) {
          const data = snap.data();
          if (Array.isArray(data?.recent)) setMemberVotes(data.recent);
        }
      } catch (e) {
        console.warn('memberVotes fetch failed:', (e as any)?.message);
      }
    }

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
    const isFederalJudge = rep.id?.startsWith('local-judge-');

    if (isFederalJudge) {
      // Fetch full judge profile from CourtListener
      const personId = rep.id.replace('local-judge-', '');
      try {
        const r = await fetch(`https://www.courtlistener.com/api/rest/v4/people/${personId}/?omit=opinion_clusters`);
        const person = r.ok ? await r.json() : null;
        const parts: string[] = [];
        if (person) {
          if (person.date_dob) parts.push(`Born: ${person.date_dob}`);
          if (person.dob_city || person.dob_state) {
            parts.push(`Birthplace: ${[person.dob_city, person.dob_state].filter(Boolean).join(', ')}`);
          }
          if (person.gender) parts.push(`Gender: ${person.gender}`);
          if (person.religion) parts.push(`Religion: ${person.religion}`);
          if (person.political_affiliations && person.political_affiliations.length > 0) {
            const aff = person.political_affiliations.map((a: any) => a.political_party).filter(Boolean).join(', ');
            if (aff) parts.push(`Political affiliation: ${aff}`);
          }
          if (person.educations && person.educations.length > 0) {
            const edu = person.educations.slice(0, 3).map((e: any) => {
              const school = e.school?.name || 'Unknown school';
              const degree = e.degree_level ? `${e.degree_level.toUpperCase()}` : '';
              const year = e.degree_year ? ` (${e.degree_year})` : '';
              return `${degree} ${school}${year}`.trim();
            }).join('; ');
            if (edu) parts.push(`Education: ${edu}`);
          }
        }
        const bioText = `${rep.name} — ${rep.party}.\n\n${parts.join('\n') || 'No additional biographical data available from CourtListener.'}`;
        setRepDetails({
          bio: bioText,
          votes: [],
          bills: [],
          comments: [],
          earmarks: []
        });
      } catch (err) {
        console.warn('CourtListener person fetch failed:', err);
        setRepDetails({
          bio: `${rep.name} — ${rep.party}. Full profile available on CourtListener (link above).`,
          votes: [], bills: [], comments: [], earmarks: []
        });
      }
      return;
    }

    // State legislators → OpenStates
    const isStateLegislator = typeof rep.id === 'string' && rep.id.startsWith('ocd-person/');
    if (isStateLegislator) {
      const openstatesKey = process.env.REACT_APP_OPENSTATES_API_KEY;
      if (!openstatesKey) {
        setRepDetails({
          bio: `${rep.name} — ${rep.level}. OpenStates API key not configured.`,
          votes: [], bills: [], cosponsoredBills: [], comments: [], earmarks: []
        });
        return;
      }
      try {
        const personId = rep.id; // full "ocd-person/xxx" — slash must stay raw in the path
        // Auth via query param (apikey=) avoids CORS preflight that an X-API-Key header would trigger.
        const apikeyParam = `apikey=${encodeURIComponent(openstatesKey)}`;

        // Step 1: fetch the person via the list endpoint (v3 has no /people/{id} direct route)
        const personRes = await fetch(
          `https://v3.openstates.org/people?id=${personId}&include=offices&include=other_names&${apikeyParam}`
        );
        const personList = personRes.ok ? await personRes.json() : null;
        const personData = personList?.results?.[0] || null;
        if (!personRes.ok) {
          console.warn('OpenStates people lookup failed', personRes.status, await personRes.text().catch(() => ''));
        }

        // Step 2: bills endpoint needs a jurisdiction — pull it from the person record
        const jurisdictionId: string | undefined = personData?.jurisdiction?.id;
        let sponsoredData: any = null;
        if (jurisdictionId) {
          const billsUrl =
            `https://v3.openstates.org/bills` +
            `?jurisdiction=${encodeURIComponent(jurisdictionId)}` +
            `&sponsor=${personId}` +
            `&sort=updated_desc&per_page=15` +
            `&${apikeyParam}`;
          const sponsoredRes = await fetch(billsUrl);
          if (sponsoredRes.ok) sponsoredData = await sponsoredRes.json();
          else console.warn('OpenStates bills returned', sponsoredRes.status, await sponsoredRes.text().catch(() => ''));
        } else {
          console.warn('OpenStates: person has no jurisdiction, skipping bills fetch');
        }

        const bioParts: string[] = [];
        if (personData) {
          const role = personData.current_role || {};
          if (role.title) bioParts.push(`${role.title}${role.district ? `, District ${role.district}` : ''}`);
          if (personData.party) bioParts.push(`Party: ${personData.party}`);
          if (personData.jurisdiction?.name) bioParts.push(`State: ${personData.jurisdiction.name}`);
          if (personData.email) bioParts.push(`Email: ${personData.email}`);
          if (personData.birth_date) bioParts.push(`Born: ${personData.birth_date}`);
          if (personData.given_name || personData.family_name) {
            // already in name — skip
          }
        }
        const bio = `${rep.name} — ${rep.level}.\n\n${bioParts.join('\n') || 'No additional bio available.'}`;

        // OpenStates bills include sponsors array with classification ('primary' or 'cosponsor')
        const allBills = (sponsoredData?.results || []) as any[];
        const primary: BillItem[] = [];
        const cosponsored: BillItem[] = [];
        for (const b of allBills) {
          const mine = (b.sponsorships || []).find((s: any) => s.person?.id === personId);
          const item: BillItem = {
            title: b.title || b.identifier || 'Untitled Bill',
            latestAction: b.latest_action_description
              ? `${b.latest_action_date || ''}: ${b.latest_action_description}`.trim().replace(/^:\s*/, '')
              : null,
            congressUrl: b.openstates_url || null,
          };
          if (mine?.classification === 'primary') primary.push(item);
          else cosponsored.push(item);
        }

        setRepDetails({
          bio,
          votes: [],
          bills: primary.length > 0 ? primary.slice(0, 10) : [{ title: 'No recent sponsored bills found.' }],
          cosponsoredBills: cosponsored.slice(0, 10),
          comments: [],
          earmarks: []
        });

        // Step 3: votes are nested inside bills in OpenStates v3 — fetch recent bills with votes included
        if (jurisdictionId) {
          try {
            const billsWithVotesUrl =
              `https://v3.openstates.org/bills` +
              `?jurisdiction=${encodeURIComponent(jurisdictionId)}` +
              `&include=votes&sort=updated_desc&per_page=20` +
              `&${apikeyParam}`;
            const bvRes = await fetch(billsWithVotesUrl);
            if (bvRes.ok) {
              const bvData = await bvRes.json();
              const bills: any[] = bvData.results || [];
              const myVotes = [] as Array<{ rollnumber: number; date: string; chamber: string; bill: string; title?: string; description: string; position: string; congress: number }>;
              for (const bill of bills) {
                for (const ve of (bill.votes || [])) {
                  const voterEntry = (ve.votes || []).find((v: any) => v.voter?.id === personId || v.voter_name === rep.name);
                  if (!voterEntry) continue;
                  const opt = (voterEntry.option || '').toLowerCase();
                  const position = opt === 'yes' ? 'Yea' : opt === 'no' ? 'Nay' : opt === 'absent' ? 'Not Voting' : 'Other';
                  myVotes.push({
                    rollnumber: 0,
                    date: ve.start_date || '',
                    chamber: ve.organization?.classification || (rep.level || '').toLowerCase(),
                    bill: bill.identifier || '',
                    title: bill.title || '',
                    description: (ve.motion_text || 'Floor vote').slice(0, 300),
                    position,
                    congress: 0,
                  });
                  if (myVotes.length >= 20) break;
                }
                if (myVotes.length >= 20) break;
              }
              setMemberVotes(myVotes);
              console.log(`OpenStates votes for ${rep.name}: ${myVotes.length} (from ${bills.length} bills)`);
            } else {
              console.warn('OpenStates bills+votes returned', bvRes.status);
            }
          } catch (e) {
            console.warn('OpenStates votes fetch failed:', (e as any)?.message);
          }
        }
      } catch (err) {
        console.error('OpenStates fetch failed:', err);
        setRepDetails({
          bio: `${rep.name} — ${rep.level}. Could not load OpenStates data.`,
          votes: [], bills: [], cosponsoredBills: [], comments: [], earmarks: []
        });
      }
      return;
    }

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

      const cosponsoredBills: BillItem[] = (data.cosponsoredBills || []).slice(0, 8).map((b: any) => ({
        title: b.title || b.shortTitle || 'Untitled Bill',
        latestAction: b.latestAction || null,
        congressUrl: b.congressUrl || null,
      }));

      setRepDetails({
        bio,
        votes: [],
        bills: bills.length > 0 ? bills : [{ title: 'No recent sponsored bills found.' }],
        cosponsoredBills,
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

  const fetchFederalJudges = async (stateCode: string): Promise<Rep[]> => {
    const courts = STATE_FEDERAL_COURTS[stateCode.toUpperCase()];
    if (!courts || courts.length === 0) return [];

    // CourtListener v4 filter: court__id accepts one value; for multiple we run one call per court.
    const reps: Rep[] = [];
    const seenPeople = new Set<string>();
    const appointerNameCache = new Map<string, string>(); // appointer URL → resolved name

    await Promise.all(courts.map(async (courtId) => {
      try {
        const url = `https://www.courtlistener.com/api/rest/v4/positions/?court__id=${courtId}&page_size=100`;
        const res = await fetch(url);
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          console.warn(`CourtListener ${courtId} returned ${res.status}:`, body.slice(0, 200));
          return;
        }
        const data = await res.json();
        const raw = (data.results || []) as any[];
        const positions = raw.filter((p: any) => !p.date_termination);
        console.log(`CourtListener ${courtId}: ${raw.length} total, ${positions.length} active`);
        if (positions.length > 0) {
          console.log(`  sample position[0].person:`, positions[0].person, 'typeof:', typeof positions[0].person);
          console.log(`  sample position keys:`, Object.keys(positions[0]));
        }

        for (const pos of positions) {
          // person can be a URL string, a numeric id, or already a nested object
          let person: any = null;
          let personKey: string;
          if (typeof pos.person === 'string') {
            personKey = pos.person;
            if (seenPeople.has(personKey)) continue;
            seenPeople.add(personKey);
            try {
              const fetchUrl = pos.person.startsWith('http') ? pos.person : `https://www.courtlistener.com/api/rest/v4/people/${pos.person}/`;
              const r = await fetch(fetchUrl);
              if (!r.ok) { console.warn('person fetch failed', fetchUrl, r.status); continue; }
              person = await r.json();
            } catch (e) { console.warn('person fetch exception', e); continue; }
          } else if (typeof pos.person === 'number') {
            personKey = String(pos.person);
            if (seenPeople.has(personKey)) continue;
            seenPeople.add(personKey);
            try {
              const r = await fetch(`https://www.courtlistener.com/api/rest/v4/people/${pos.person}/`);
              if (!r.ok) continue;
              person = await r.json();
            } catch { continue; }
          } else if (pos.person && typeof pos.person === 'object') {
            person = pos.person;
            personKey = String(person.id || person.resource_uri || Math.random());
            if (seenPeople.has(personKey)) continue;
            seenPeople.add(personKey);
          } else {
            continue;
          }

          if (!person) continue;
          {
            const fullName = [person.name_first, person.name_middle, person.name_last].filter(Boolean).join(' ').trim();
            if (!fullName) continue;
            const isCircuit = courtId.startsWith('ca');
            const positionType = isCircuit ? 'U.S. Circuit Judge' : 'U.S. District Judge';

            // Resolve appointer name once per unique appointer URL
            let appointerName: string | undefined;
            if (typeof pos.appointer === 'string' && pos.appointer) {
              if (appointerNameCache.has(pos.appointer)) {
                appointerName = appointerNameCache.get(pos.appointer);
              } else {
                try {
                  const ar = await fetch(pos.appointer);
                  if (ar.ok) {
                    const a = await ar.json();
                    const n = [a.name_first, a.name_middle, a.name_last].filter(Boolean).join(' ').trim();
                    if (n) {
                      appointerName = n;
                      appointerNameCache.set(pos.appointer, n);
                    }
                  }
                } catch { /* ignore */ }
              }
            }

            reps.push({
              name: fullName,
              party: `${positionType} (${courtId})`,
              photo: 'https://placehold.co/100x100?text=Judge',
              level: 'Federal Judge',
              contact: person.absolute_url ? `https://www.courtlistener.com${person.absolute_url}` : '',
              phone: '',
              score: 0,
              id: 'local-judge-' + person.id,
              xHandle: '',
              judgeInfo: {
                courtId,
                positionType,
                dateStart: pos.date_start || undefined,
                dateConfirmation: pos.date_confirmation || undefined,
                howSelected: pos.how_selected || undefined,
                appointerName,
                appointerId: pos.appointer || undefined,
                personId: person.id,
              },
            });
          }
        }
      } catch (err) {
        console.warn(`fetchFederalJudges court ${courtId} error:`, err);
      }
    }));

    return reps;
  };

  const fetchWikidataFallback = async (addressLabel: string): Promise<Rep[]> => {
    // Best-effort free fallback using Wikidata entity search.
    // Coverage is spotty — works best for sheriffs/judges in larger jurisdictions.
    const queries = [
      `Sheriff ${addressLabel}`,
      `Judge ${addressLabel}`,
      `School Board ${addressLabel}`,
    ];
    const reps: Rep[] = [];
    for (const q of queries) {
      try {
        const r = await fetch(
          `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(q)}&language=en&format=json&origin=*&limit=3`
        );
        const d = await r.json();
        for (const hit of d.search || []) {
          if (!hit.label) continue;
          const lower = hit.label.toLowerCase() + ' ' + (hit.description || '').toLowerCase();
          let level = 'County Official';
          if (/sheriff/.test(lower)) level = 'Sheriff';
          else if (/judge|justice|magistrate|court/.test(lower)) level = 'Judge';
          else if (/school|education/.test(lower)) level = 'School Board';
          reps.push({
            name: hit.label,
            party: hit.description || level,
            photo: 'https://placehold.co/100x100?text=Wikidata',
            level,
            contact: hit.concepturi || '',
            phone: '',
            score: 0,
            id: 'local-wd-' + hit.id,
            xHandle: ''
          });
        }
      } catch (e) {
        console.warn('Wikidata fallback query failed:', q, e);
      }
    }
    return reps;
  };

  const fetchLocalOfficials = async (fullAddress: string) => {
    setLocalLoading(true);
    try {
      // 1) Try the apiProxy Lambda first (preferred — hides key, no CORS issues)
      const proxyBase = process.env.REACT_APP_CONGRESS_PROXY_URL;
      let data: any = null;

      if (proxyBase) {
        try {
          const r = await fetch(`${proxyBase}/?service=cicero&address=${encodeURIComponent(fullAddress)}`);
          if (r.ok) data = await r.json();
          else console.warn('apiProxy cicero returned', r.status);
        } catch (e) {
          console.warn('apiProxy cicero fetch failed', e);
        }
      }

      // 2) Fallback to public CORS proxies (dev mode / before Amplify redeploy)
      // Disabled automatically when key ends with 'DISABLED' so a dead key stops spamming network errors.
      if (!data) {
        const ciceroKey = process.env.REACT_APP_CICERO_API_KEY;
        if (ciceroKey && !ciceroKey.endsWith('DISABLED')) {
          const ciceroUrl = `https://app.cicerodata.com/v3.1/official/?address=${encodeURIComponent(fullAddress)}&format=json&key=${ciceroKey}`;
          const proxies = [
            `https://api.allorigins.win/raw?url=${encodeURIComponent(ciceroUrl)}`,
            `https://corsproxy.io/?${encodeURIComponent(ciceroUrl)}`,
          ];
          for (const p of proxies) {
            try {
              const r = await fetch(p);
              if (r.ok) { data = await r.json(); break; }
            } catch (e) { /* try next */ }
          }
        }
      }
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
          score: 0,
          id: 'local-' + (o.id || `${fullName}-${title}`),
          xHandle: ''
        };
      });

      setLocalOfficials(officials);

      // 3) Always add free federal judges from CourtListener for this state
      const federalJudges = await fetchFederalJudges(localStateCode);
      console.log(`CourtListener federal judges: ${federalJudges.length}`);

      // 4) If Cicero returned nothing, also try Wikidata for sheriffs/school board
      let wdReps: Rep[] = [];
      if (mapped.length === 0) {
        console.log('Cicero returned no officials — trying Wikidata fallback');
        const addressLabel = `${localCity} ${localStateCode}`.trim() || fullAddress;
        wdReps = await fetchWikidataFallback(addressLabel);
        console.log(`Wikidata fallback: ${wdReps.length}`);
      }

      const combined = [...mapped, ...federalJudges, ...wdReps];
      if (combined.length === 0) {
        setLocalReps([]);
        alert('No local officials found for this address.');
      } else {
        setLocalReps(combined);
        console.log(`Local officials total: ${combined.length}`);
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
        padding: '6px 12px',
        backgroundColor: '#007BFF',
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
            <h1 style={{ margin: '0', fontSize: '14px', color: 'white', fontWeight: 600 }}>Politicker</h1>
            <p style={{ margin: '1px 0 0', fontSize: '10px', color: '#e3f2fd' }}>
              Beta • Real-time accountability
            </p>
          </div>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            flexWrap: 'wrap',
            justifyContent: 'flex-end'
          }}>
            {user ? (
              <span style={{ fontSize: '10px', color: 'white' }}>
                <strong>{user.email}</strong>
              </span>
            ) : (
              <button
                onClick={() => setShowAuth(true)}
                style={{
                  padding: '4px 8px',
                  fontSize: '10px',
                  whiteSpace: 'nowrap',
                  backgroundColor: 'white',
                  color: '#007BFF',
                  border: 'none',
                  borderRadius: '4px'
                }}
              >
                Sign In
              </button>
            )}

            <span
              onClick={() => setShowAdmin(true)}
              style={{
                color: 'white',
                fontSize: '10px',
                cursor: 'pointer',
                textDecoration: 'underline',
                padding: '2px 4px',
              }}
            >
              Admin
            </span>
            <button
              onClick={() => setShowShareModal(true)}
              style={{
                background: '#28a745',
                color: 'white',
                padding: '4px 10px',
                borderRadius: '4px',
                fontSize: '10px',
                marginLeft: '4px',
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
                fontSize: '10px',
                cursor: 'pointer',
                textDecoration: 'underline',
                padding: '2px 4px',
              }}
            >
              About
            </span>

            {/* Follow Us */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px' }}>
              <a href="https://x.com/politicker_app" target="_blank" rel="noopener noreferrer" style={{ color: 'white', textDecoration: 'none' }}>𝕏</a>
              <a href="https://www.tiktok.com/@politickerapp.com" target="_blank" rel="noopener noreferrer" style={{ color: 'white', textDecoration: 'none' }}>TikTok</a>
            </div>

            {/* Donate + Non-Profit */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '1px' }}>
              <a
                href="https://421557e3-d3e4-4ebc-8478-bab7bfe3d906.paylinks.godaddy.com/fe11c891-4dfe-4ba4-862a-46a"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  backgroundColor: 'white',
                  color: '#007BFF',
                  padding: '4px 10px',
                  borderRadius: '4px',
                  textDecoration: 'none',
                  fontWeight: '700',
                  fontSize: '11px',
                  whiteSpace: 'nowrap'
                }}
              >
                Support
              </a>
              <span style={{
                fontSize: '9px',
                color: 'white',
                fontWeight: '600',
                textShadow: '0 1px 2px rgba(0,0,0,0.3)'
              }}>
                501(c)(3) • <a href="https://thedreamcorporation.org" target="_blank" rel="noopener noreferrer" style={{ color: 'white', textDecoration: 'underline' }}>Dream Corp</a>
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
                marginBottom: '18px',
                padding: '12px 14px',
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
                          padding: '8px 12px',
                          margin: '6px 0',
                          background: isSelected ? '#e8f5e9' : '#fff',
                          border: '1px solid #eee',
                          borderRadius: '6px',
                          cursor: isVoted ? 'default' : 'pointer',
                          position: 'relative',
                          fontSize: '14px'
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
        <p style={{ marginBottom: '8px' }}>
          Prove you&apos;re a real registered voter. This gives your votes more weight.
        </p>
        <p style={{ marginBottom: '15px', fontSize: '12px', color: '#b45309', fontStyle: 'italic' }}>
          ⚠️ Unofficial: this is self-attestation only. We&apos;re not yet integrated with an official voter-registration verification service.
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
          Verify My Registration (unofficial)
        </button>
      </div>

                            <main style={{ padding: '20px 15px' }}>
        
        {/* Search Officials — works against currently loaded reps; auto-seeds national officials so it's useful even before a ZIP lookup */}
        <div style={{ maxWidth: '420px', margin: '0 auto 12px auto' }}>
          <input
            type="text"
            placeholder="🔍 Search officials by name (e.g. Roberts, Spanberger, Wittman)"
            value={officialSearch}
            onChange={(e) => {
              const v = e.target.value;
              setOfficialSearch(v);
              // Lazy-seed reps with hardcoded national officials so search works pre-ZIP
              if (v && reps.length === 0) {
                const seed: Rep[] = [
                  { name: 'Donald Trump', party: 'Republican', photo: 'https://upload.wikimedia.org/wikipedia/commons/5/56/Donald_Trump_official_portrait.jpg', level: 'President', contact: 'https://www.whitehouse.gov/contact/', phone: '(202) 456-1111', score: 0, id: 'president', xHandle: '@realDonaldTrump' },
                  { name: 'JD Vance', party: 'Republican', photo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5f/JD_Vance_official_portrait.jpg/800px-JD_Vance_official_portrait.jpg', level: 'Vice President', contact: 'https://www.whitehouse.gov/contact/', phone: '(202) 456-1111', score: 0, id: 'vice-president', xHandle: '@JDVance' },
                  ...supremeCourtJustices,
                  ...Object.values(stateGovernors),
                ];
                setReps(seed);
              }
            }}
            style={{
              width: '100%',
              padding: '8px 12px',
              fontSize: '14px',
              borderRadius: '6px',
              border: '1px solid #ccc',
              boxSizing: 'border-box'
            }}
          />
        </div>

        {/* Compact ZIP Input — shrunk ~25% */}
        <div style={{
          maxWidth: '420px',
          margin: '0 auto 25px auto',
          textAlign: 'center'
        }}>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <input
              type="text"
              placeholder="ZIP Code"
              value={zip}
              onChange={(e) => setZip(e.target.value)}
              maxLength={5}
              style={{
                flex: 1,
                padding: '10px',
                fontSize: '13px',
                borderRadius: '6px',
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
                padding: '10px 16px',
                fontSize: '12px',
                backgroundColor: '#007BFF',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                whiteSpace: 'nowrap'
              }}
            >
              {loading ? 'Loading…' : 'Show Reps'}
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
                  // Search overrides tab filtering — when active, match across ALL reps by name
                  if (officialSearch.trim()) {
                    return rep.name.toLowerCase().includes(officialSearch.trim().toLowerCase());
                  }
                  if (activeTab === 'federal') {
                    // Exclude Supreme Court from Federal tab
                    return ['President', 'Vice President', 'U.S. Senator', 'U.S. Representative'].some(level => 
                      rep.level.includes(level)
                    );
                  }
                  if (activeTab === 'state') {
                    return rep.level.includes('State House') ||
                           rep.level.includes('State Senate') ||
                           rep.level === 'Governor' ||
                           rep.level === 'Lt. Governor' ||
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
                  const realScore = totalVotes > 0 ? Math.round((totalApprove / totalVotes) * 100) : null;
                  const isGov = rep.level === 'Governor';

                  return (
                    <div
                      key={i}
                      className="rep-card"
                      onClick={() => fetchRepDetails(rep)}
                      style={{
                        cursor: 'pointer',
                        borderTop: isGov ? '4px solid #059669' : undefined,
                        background: isGov ? 'linear-gradient(180deg, #ecfdf5 0%, #fff 40%)' : undefined,
                      }}
                    >
                      <img
                        src={rep.photo || 'https://placehold.co/100x100?text=Rep'}
                        alt={rep.name}
                        onError={(e) => { (e.target as HTMLImageElement).src = 'https://placehold.co/100x100?text=' + encodeURIComponent(rep.name.split(' ').slice(-1)[0] || 'Rep'); }}
                        style={{
                          width: '100px',
                          height: '100px',
                          objectFit: 'cover',
                          borderRadius: '8px'
                        }}
                      />
                      <h4>{rep.name || 'Unknown'}</h4>
                      {isGov ? (
                        <>
                          <p style={{ color: '#059669', fontWeight: 600, margin: '4px 0' }}>
                            Governor of {rep.governorInfo?.stateName || rep.stateCode}
                          </p>
                          <p><strong>Party:</strong> {rep.party}</p>
                          {rep.governorInfo?.tookOffice && (
                            <p style={{ fontSize: '0.85em', color: '#555', margin: '2px 0' }}>
                              Took office: {rep.governorInfo.tookOffice}
                            </p>
                          )}
                          <p><strong>Approval:</strong> <span style={{ color: realScore !== null ? '#4CAF50' : '#999', fontWeight: 'bold' }}>{realScore !== null ? `${realScore}% (${totalVotes})` : 'No votes yet'}</span></p>
                        </>
                      ) : (
                        <>
                          <p><strong>Party:</strong> {rep.party || 'N/A'}</p>
                          <p><strong>Level:</strong> {rep.level || 'N/A'}</p>
                          <p><strong>Score:</strong> <span style={{ color: realScore !== null ? '#4CAF50' : '#999', fontWeight: 'bold' }}>{realScore !== null ? `${realScore}% (${totalVotes})` : 'No votes yet'}</span></p>
                          {rep.xHandle && rep.xHandle !== '@Rep' && (
                            <p><strong>X:</strong> {rep.xHandle}</p>
                          )}
                        </>
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
                            if (t.key === 'judges') return r.level === 'Judge' || r.level === 'Federal Judge';
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
                          if (localSubTab === 'judges') return rep.level === 'Judge' || rep.level === 'Federal Judge';
                          if (localSubTab === 'school') return rep.level === 'School Board';
                          if (localSubTab === 'sheriff') return rep.level === 'Sheriff';
                          return false;
                        })
                        .map((rep, i) => {
                          const isJudge = rep.level === 'Federal Judge' || rep.level === 'Judge';
                          // Parse court id out of party field "U.S. District Judge (vaed)"
                          const courtMatch = isJudge ? rep.party.match(/\(([^)]+)\)/) : null;
                          const courtId = courtMatch ? courtMatch[1] : '';
                          const judgeTitle = isJudge ? rep.party.replace(/\s*\([^)]*\)\s*/, '').trim() : '';

                          return (
                            <div
                              key={rep.id + '-' + i}
                              className="rep-card"
                              onClick={() => fetchRepDetails(rep)}
                              style={{
                                cursor: 'pointer',
                                borderTop: isJudge ? '4px solid #6b21a8' : undefined,
                                background: isJudge ? 'linear-gradient(180deg, #faf5ff 0%, #fff 40%)' : undefined,
                              }}
                            >
                              {isJudge ? (
                                <>
                                  <div style={{
                                    width: '100px', height: '100px', borderRadius: '8px',
                                    background: '#6b21a8', color: '#fff',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: '48px', margin: '0 auto'
                                  }}>⚖️</div>
                                  <h4 style={{ marginTop: '8px', marginBottom: '2px' }}>Hon. {rep.name}</h4>
                                  <p style={{ color: '#6b21a8', fontWeight: 600, margin: '2px 0', fontSize: '0.9em' }}>
                                    {judgeTitle}
                                  </p>
                                  {courtId && (
                                    <p style={{ fontSize: '0.8em', color: '#555', margin: '2px 0' }}>
                                      <code>{courtId}</code>
                                    </p>
                                  )}
                                  {rep.judgeInfo?.appointerName && (
                                    <p style={{ fontSize: '0.8em', color: '#333', margin: '4px 0 2px' }}>
                                      Appointed by <strong>{rep.judgeInfo.appointerName}</strong>
                                      {rep.judgeInfo.dateStart && ` (${rep.judgeInfo.dateStart.slice(0, 4)})`}
                                    </p>
                                  )}
                                  {!rep.judgeInfo?.appointerName && rep.judgeInfo?.dateStart && (
                                    <p style={{ fontSize: '0.8em', color: '#555', margin: '4px 0 2px' }}>
                                      Serving since {rep.judgeInfo.dateStart.slice(0, 4)}
                                    </p>
                                  )}
                                  {rep.contact && (
                                    <a
                                      href={rep.contact}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={(e) => e.stopPropagation()}
                                      style={{ fontSize: '0.8em', color: '#6b21a8' }}
                                    >
                                      Profile →
                                    </a>
                                  )}
                                </>
                              ) : (
                                <>
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
                                </>
                              )}
                            </div>
                          );
                        })}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}

                {/* Spending Tab */}
        {activeTab === 'spending' && (
          <SpendingTab userState={userState} />
        )}

      </main>

           {/* Modals - All now properly centered */}
      {showRepModal && selectedRep && (
        <RepModal
          selectedRep={selectedRep}
          repDetails={repDetails}
          repPolls={repPolls}
          upcomingVotes={upcomingVotes}
          memberVotes={memberVotes}
          userState={userState}
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
