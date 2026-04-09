import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { firebaseConfig } from "../config";

console.log("Initializing Firebase with config:", firebaseConfig.projectId);

let app;
try {
  app = initializeApp(firebaseConfig);
  console.log("Firebase initialized successfully.");
} catch (error) {
  console.error("Firebase initialization failed:", error);
}

export const db_fs = getFirestore(app);
export const storage = getStorage(app);

export default app;
