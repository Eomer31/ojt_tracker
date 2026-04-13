// src/firebase.js
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyDrDER7qwBI7NJaeoGMJB6-rznylhe_b6U",
  authDomain: "ojt-tracker-33dbf.firebaseapp.com",
  projectId: "ojt-tracker-33dbf",
  storageBucket: "ojt-tracker-33dbf.firebasestorage.app",
  messagingSenderId: "292474314616",
  appId: "1:292474314616:web:209c0030659e3af163328d",
  measurementId: "G-X8LS1XTQ3K"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore (The Database)
export const db = getFirestore(app);

// 2. Add these two lines at the very bottom:
export const auth = getAuth(app);
export const provider = new GoogleAuthProvider();