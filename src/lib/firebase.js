import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { firebaseConfig } from "../config";

console.log("firebase.js: Initializing Firebase SDK...");
let app;
try {
  app = initializeApp(firebaseConfig);
  console.log("firebase.js: Firebase App initialized.");
} catch (error) {
  console.error("firebase.js: Firebase Initialization Error:", error);
}

// Lazy initialization pattern or direct safe export
export const db_fs = app ? getFirestore(app) : null;
export const storage = app ? getStorage(app) : null;

if (!db_fs) console.warn("firebase.js: Firestore could not be initialized (app is missing)");

export default app;
