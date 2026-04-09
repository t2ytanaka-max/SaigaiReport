import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { firebaseConfig } from "../config";

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Services
export const db_fs = getFirestore(app);
export const storage = getStorage(app);

export default app;
