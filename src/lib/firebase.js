import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAnalytics } from "firebase/analytics";
import { firebaseConfig } from "../config";

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Analytics (optional but included as per user config)
let analytics;
if (typeof window !== 'undefined') {
  analytics = getAnalytics(app);
}

export const db_fs = getFirestore(app);
export const storage = getStorage(app);

export default app;
