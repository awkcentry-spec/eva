import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { 
    getFirestore, 
    initializeFirestore,
    persistentLocalCache,
    persistentMultipleTabManager,
    collection, 
    addDoc, 
    onSnapshot, 
    doc, 
    updateDoc, 
    deleteDoc, 
    query, 
    orderBy, 
    setDoc 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// FIREBASE CONFIGURATION
const firebaseConfig = {
    apiKey: "AIzaSyAlQb7PwuhugjwcYkOXGMHGc1Sa0x8oAFw",
    authDomain: "pretest-tajwid.firebaseapp.com",
    projectId: "pretest-tajwid",
    storageBucket: "pretest-tajwid.appspot.com",
    messagingSenderId: "986444579022",
    appId: "1:986444579022:web:4982f7eba95bbcd445109f"
};

const app = initializeApp(firebaseConfig);

// Mengaktifkan Offline Persistence Firestore untuk PWA
export const db = initializeFirestore(app, {
    localCache: persistentLocalCache({tabManager: persistentMultipleTabManager()})
});

export {
    collection, addDoc, onSnapshot, doc,
    updateDoc, deleteDoc, query, orderBy, setDoc
};
