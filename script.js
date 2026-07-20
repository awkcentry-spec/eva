// ==========================================
// IMPORT SDK FIREBASE MODULAR (v10)
// ==========================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, doc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// ==========================================
// KONFIGURASI PROYEK FIREBASE (evavo-dc806)
// ==========================================
const firebaseConfig = {
    apiKey: "API_KEY_ANDA", // Ganti dengan API Key Anda dari konsol Firebase
    authDomain: "evavo-dc806.firebaseapp.com",
    projectId: "evavo-dc806",
    storageBucket: "evavo-dc806.firebasestorage.app",
    messagingSenderId: "96634564743",
    appId: "APP_ID_ANDA" // Ganti dengan App ID Anda dari konsol Firebase
};

// Inisialisasi Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// ==========================================
// STATE & VARIABEL GLOBAL
// ==========================================
let startTime = Date.now();
let isPengajarMode = false;
let unsubscribeSubmissions = null; // Menyimpan fungsi pembatalan listener real-time

// Kunci jawaban resmi untuk Pilihan Ganda (1-20)
const correctAnswers = {
    q1: 'B', q2: 'C', q3: 'A', q4: 'B', q5: 'C',
    q6: 'C', q7: 'B', q8: 'B', q9: 'B', q10: 'A',
    q11: 'A', q12: 'B', q13: 'C', q14: 'A', q15: 'A',
    q16: 'C', q17: 'B', q18: 'A', q19: 'A', q20: 'C'
};

// ==========================================
// AUTHENTICATION OBSERVER (SINKRONISASI LOGIN)
// ==========================================
onAuthStateChanged(auth, (user) => {
    if (user) {
        // Jika Pengajar login
        document.getElementById('pengajarLoginCard').classList.add('hidden');
        document.getElementById('pengajarDashboard').classList.remove('hidden');
        loadPengajarData();
    } else {
        // Jika Pengajar logout atau belum login
        document.getElementById('pengajarLoginCard').classList.remove('hidden');
        document.getElementById('pengajarDashboard').classList.add('hidden');
        
        // Matikan pendengar real-time Firestore untuk menghemat kuota jika logout
        if (unsubscribeSubmissions) {
            unsubscribeSubmissions();
            unsubscribeSubmissions = null;
        }
    }
});

// ==========================================
// PANEL MAHASISWI (KUIS & SUBMIT JAWABAN)
// ==========================================
async function calculateScore(e) {
    e.preventDefault();
    
    // Hitung Durasi Waktu Pengerjaan (Detik)
    const endTime = Date.now();
    const durationInSeconds = Math.round((endTime - startTime) / 1000);

    let scorePg = 0;
    const totalQuestions = Object.keys(correctAnswers).length;
    const studentAnswers = {};

    // Hitung jawaban benar & rekam jawaban siswa
    for (let key in correctAnswers) {
        const selected = document.querySelector(`input[name="${key}"]:checked`);
        const answeredValue = selected ? selected.value : '-';
        studentAnswers[key] = answeredValue;

        if (selected && selected.value === correctAnswers[key]) {
            scorePg++;
        }
    }

    const finalScorePg = Math.round((scorePg / totalQuestions) * 100);
    const studentName = document.getElementById('studentName').value;

    // Kumpulan Data Jawaban Esai/Uraian
    const essayAnswers = [
        document.getElementById('essay1').value,
        document.getElementById('essay2').value,
        document.getElementById('essay3').value,
        document.getElementById('essay4').value,
        document.getElementById('essay5').value
    ];

    // Objek Mahasiswi baru (ID dokumen akan otomatis dibuat oleh Firestore)
    const submissionData = {
        name: studentName,
        scorePg: finalScorePg,
        pgAnswers: studentAnswers,
        essayAnswers: essayAnswers,
        essayScore: null, // Default null sampai diperiksa oleh pengajar
        duration: durationInSeconds,
        timestamp: new Date().toISOString()
    };

    try {
        // Simpan langsung ke koleksi Cloud Firestore
        await addDoc(collection(db, "tajwidSubmissions"), submissionData);
        
        // Tampilkan popup hasil jika berhasil disimpan ke Cloud
        document.getElementById('scoreDisplay').innerText = finalScorePg;
        document.getElementById('resultModal').classList.remove('hidden');
    } catch (error) {
        alert("Gagal mengirim lembar jawaban: " + error.message);
    }
}

function closeModal() {
    document.getElementById('resultModal').classList.add('hidden');
    document.getElementById('quizForm').reset();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    startTime = Date.now();
}

// ==========================================
// SISTEM DASHBOARD PENGAJAR
// ==========================================
function togglePengajarPanel() {
    isPengajarMode = !isPengajarMode;
    const btn = document.getElementById('btnSwitchMode');
    const mPanel = document.getElementById('mahasiswiPanel');
    const dPanel = document.getElementById('pengajarPanel');

    if(isPengajarMode) {
        btn.innerText = "📝 Kembali ke Halaman Ujian Mahasiswi";
        mPanel.classList.add('hidden');
        dPanel.classList.remove('hidden');
    } else {
        btn.innerText = "🔐 Area Pengajar Penilai";
        mPanel.classList.remove('hidden');
        dPanel.classList.add('hidden');
    }
}

async function loginPengajar() {
    const username = document.getElementById('pengajarUser').value;
    const pass = document.getElementById('pengajarPass').value;

    // Konversi username sederhana menjadi format email jika diperlukan oleh Firebase Auth
    const email = username.includes('@') ? username : `${username}@tajwid.com`;

    try {
        await signInWithEmailAndPassword(auth, email, pass);
    } catch (error) {
        alert('Username atau Password Pengajar Salah! ' + error.message);
    }
}

async function logoutPengajar() {
    try {
        await signOut(auth);
    } catch (error) {
        alert('Gagal keluar dashboard: ' + error.message);
    }
}

function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s}s`;
}

// ==========================================
// MENGAMBIL & MENYINKRONKAN DATA FIRESTORE (REAL-TIME)
// ==========================================
function loadPengajarData() {
    const submissionsCollection = collection(db, "tajwidSubmissions");

    // Gunakan onSnapshot untuk memantau data secara real-time
    unsubscribeSubmissions = onSnapshot(submissionsCollection, (snapshot) => {
        const submissions = [];
        snapshot.forEach((doc) => {
            // Kita petakan doc.id dari Firestore sebagai ID data
            submissions.push({ id: doc.id, ...doc.data() });
        });

        // Urutkan nilai tertinggi & waktu pengerjaan tercepat
        const sortedSubmissions = [...submissions].sort((a, b) => {
            const totalA = a.scorePg + (a.essayScore || 0);
            const totalB = b.scorePg + (b.essayScore || 0);
            if (totalB !== totalA) return totalB - totalA; 
            return a.duration - b.duration;
        });

        // Render tabel Leaderboard
        const leaderboardBody = document.getElementById('leaderboardBody');
        leaderboardBody.innerHTML = '';

        if(sortedSubmissions.length === 0) {
            leaderboardBody.innerHTML = `<tr><td colspan="7" class="p-4 text-center text-gray-400 italic">Belum ada mahasiswi yang mengirimkan jawaban.</td></tr>`;
        }

        sortedSubmissions.forEach((sub, index) => {
            const totalNilai = sub.scorePg + (sub.essayScore || 0);
            const isEsaiChecked = sub.essayScore !== null;
            
            leaderboardBody.innerHTML += `
                <tr class="border-b border-gray-100 hover:bg-pink-50/10 transition-colors">
                    <td class="p-3 font-bold text-gray-500">#${index + 1}</td>
                    <td class="p-3 font-medium text-gray-800">${sub.name}</td>
                    <td class="p-3 text-center text-gray-600">${sub.scorePg} / 100</td>
                    <td class="p-3 text-center ${isEsaiChecked ? 'text-green-600 font-medium' : 'text-amber-500 italic'}">
                        ${isEsaiChecked ? sub.essayScore + ' / 100' : 'Belum Diperiksa'}
                    </td>
                    <td class="p-3 text-center font-bold text-pink-600">${totalNilai}</td>
                    <td class="p-3 text-center text-gray-500 font-mono">${formatTime(sub.duration)}</td>
                    <td class="p-3 text-center">
                        <button onclick="deleteSubmission('${sub.id}')" class="bg-red-50 hover:bg-red-100 text-red-500 p-1 rounded-lg text-[10px] font-semibold cursor-pointer transition-all border border-red-200">
                            🗑️ Hapus
                        </button>
                    </td>
                </tr>
            `;
        });

        filterLeaderboard();

        // Render Panel Evaluasi Esai
        const essayGradingList = document.getElementById('essayGradingList');
        essayGradingList.innerHTML = '';

        if(submissions.length === 0) {
            essayGradingList.innerHTML = `<p class="text-xs text-gray-400 italic text-center py-4">Tidak ada lembar jawaban mahasiswi.</p>`;
        }

        const questionsText = [
            "1. Sebutkan shifat huruf غ !",
            "2. Sebutkan contoh mad shilah kubro, mad iwadh, dan mad lazim kalimi mukhaffaf!",
            "3. Jelaskan pengertian waqaf!",
            "4. Tuliskan contoh idgham mutamatsilan dan idgham mutajanisan!",
            "5. Jelaskan hukum pada kata berikut ini: الْأَحْقَاف : ٤"
        ];

        submissions.forEach((sub) => {
            let pgReviewBlocks = '';
            for (let key in correctAnswers) {
                const studentAns = (sub.pgAnswers && sub.pgAnswers[key]) ? sub.pgAnswers[key] : '-';
                const keyNumber = key.replace('q', '');
                const isCorrect = studentAns === correctAnswers[key];
                
                pgReviewBlocks += `
                    <div class="flex flex-col items-center justify-center p-2 rounded-xl border ${isCorrect ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'} text-xs font-medium">
                        <span class="text-[10px] text-gray-400 font-semibold block mb-0.5">No.${keyNumber}</span>
                        <div class="flex items-center gap-1">
                            <span class="font-bold">${studentAns}</span>
                            ${!isCorrect ? `<span class="text-[10px] text-gray-400 font-normal">(Kunci: ${correctAnswers[key]})</span>` : '✓'}
                        </div>
                    </div>
                `;
            }

            let essayBlocks = '';
            sub.essayAnswers.forEach((ans, i) => {
                essayBlocks += `
                    <div class="p-3 bg-gray-50/70 rounded-xl space-y-1">
                        <p class="text-xs font-semibold text-gray-600">${questionsText[i]}</p>
                        <p class="text-xs text-gray-800 bg-white p-2.5 rounded-lg border border-gray-100 italic">"${ans || '(Kosong)'}"</p>
                    </div>
                `;
            });

            essayGradingList.innerHTML += `
                <div class="grading-card border border-gray-200 p-5 rounded-2xl bg-white space-y-5 shadow-xs transition-all">
                    <div class="flex flex-wrap justify-between items-center border-b border-gray-100 pb-3 gap-2">
                        <div>
                            <h4 class="student-name-header text-sm font-bold text-gray-800">${sub.name}</h4>
                            <p class="text-[10px] text-gray-400 font-mono">Waktu Pengiriman: ${formatTime(sub.duration)}</p>
                        </div>
                        <div class="flex items-center gap-2">
                            <label class="text-xs font-medium text-gray-500">Nilai Uraian (0-100):</label>
                            <input type="number" id="input_${sub.id}" value="${sub.essayScore !== null ? sub.essayScore : ''}" min="0" max="100" placeholder="Skor" class="w-16 px-2 py-1 border border-gray-300 rounded-lg text-xs text-center focus:outline-none focus:border-pink-400">
                            <button onclick="saveEssayScore('${sub.id}')" class="bg-pink-500 hover:bg-pink-600 text-white text-xs px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer shadow-xs">
                                Simpan
                            </button>
                            <button onclick="deleteSubmission('${sub.id}')" class="bg-red-50 hover:bg-red-100 text-red-500 text-xs px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer shadow-xs border border-red-200">
                                Hapus
                            </button>
                        </div>
                    </div>
                    
                    <div class="space-y-2">
                        <h5 class="text-[11px] font-bold text-pink-500 uppercase tracking-wider">🎯 Review Jawaban Pilihan Ganda (Skor: ${sub.scorePg}/100)</h5>
                        <div class="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-10 gap-1.5">
                            ${pgReviewBlocks}
                        </div>
                    </div>

                    <div class="space-y-3">
                        <h5 class="text-[11px] font-bold text-pink-500 uppercase tracking-wider">📝 Jawaban Soal Uraian / Esai</h5>
                        <div class="space-y-2.5">
                            ${essayBlocks}
                        </div>
                    </div>
                </div>
            `;
        });

        filterGradingList();
    });
}

// ==========================================
// MANAJEMEN DATA (UPDATE & DELETE DI FIRESTORE)
// ==========================================
async function saveEssayScore(submissionId) {
    const scoreInput = document.getElementById(`input_${submissionId}`).value;
    if(scoreInput === '') {
        alert('Silakan masukkan nilai angka terlebih dahulu!');
        return;
    }

    const parsedScore = parseInt(scoreInput);
    if(parsedScore < 0 || parsedScore > 100) {
        alert('Nilai uraian berkisar antara skala 0 hingga 100!');
        return;
    }

    try {
        const docRef = doc(db, "tajwidSubmissions", submissionId);
        // Memperbarui hanya field essayScore di Firestore
        await updateDoc(docRef, { essayScore: parsedScore });
        alert(`Berhasil memberikan nilai uraian!`);
    } catch (error) {
        alert("Gagal menyimpan nilai esai: " + error.message);
    }
}

async function deleteSubmission(submissionId) {
    if (confirm("Apakah Anda yakin ingin menghapus data jawaban mahasiswa ini secara permanen dari server?")) {
        try {
            const docRef = doc(db, "tajwidSubmissions", submissionId);
            // Menghapus dokumen dari Firestore secara permanen
            await deleteDoc(docRef);
            alert("Data berhasil terhapus dari server!");
        } catch (error) {
            alert("Gagal menghapus data: " + error.message);
        }
    }
}

// ==========================================
// FITUR FILTER & PENCARIAN (LOKAL DOM)
// ==========================================
function filterLeaderboard() {
    const keyword = document.getElementById('searchLeaderboard').value.toLowerCase();
    const rows = document.querySelectorAll('#leaderboardBody tr');
    
    rows.forEach(row => {
        const nameCell = row.cells[1];
        if (nameCell) {
            const nameText = nameCell.textContent.toLowerCase();
            if (nameText.includes(keyword)) {
                row.style.display = "";
            } else {
                row.style.display = "none";
            }
        }
    });
}

function filterGradingList() {
    const keyword = document.getElementById('searchGrading').value.toLowerCase();
    const cards = document.querySelectorAll('#essayGradingList .grading-card');
    
    cards.forEach(card => {
        const nameHeading = card.querySelector('.student-name-header');
        if (nameHeading) {
            const nameText = nameHeading.textContent.toLowerCase();
            if (nameText.includes(keyword)) {
                card.style.display = "";
            } else {
                card.style.display = "none";
            }
        }
    });
}

// ==========================================
// BRIDGE KE CAKUPAN GLOBAL WINDOW
// Agar event HTML (onclick/onsubmit) tetap mengenali fungsi modul ini
// ==========================================
window.calculateScore = calculateScore;
window.closeModal = closeModal;
window.togglePengajarPanel = togglePengajarPanel;
window.loginPengajar = loginPengajar;
window.logoutPengajar = logoutPengajar;
window.saveEssayScore = saveEssayScore;
window.deleteSubmission = deleteSubmission;
window.filterLeaderboard = filterLeaderboard;
window.filterGradingList = filterGradingList;
