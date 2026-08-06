import { 
    db, collection, addDoc, onSnapshot, doc, 
    updateDoc, deleteDoc, query, orderBy, setDoc 
} from "./firebase-config.js";

// GLOBAL APPLICATION STATE
window.questionsPg = [];
window.questionsEssay = [];
window.topics = [];
window.submissions = [];
window.activeStudentTopicObj = null;
window.html5QrCodeScanner = null;
window.activeSessionText = "Sesi Ustadzah Aktif";
window.activeGradingId = null;
window.uploadedImageData = null;
window.currentPgOptions = [{ k: "A", t: "" }, { k: "B", t: "" }, { k: "C", t: "" }];
window.pageLogoUrl = null;

window.accountSettings = {
    username: "ustadzah",
    password: "tajwidok",
    avatarUrl: null
};

window.soundSettings = {
    enabled: true,
    preset: "chime",
    customAudioData: null
};

let initialSubmissionLoad = true;

// UTILITIES
window.roundNum = (num) => Math.round((num + Number.EPSILON) * 100) / 100;
window.generateRandomToken = () => 'TJ' + Math.random().toString(36).substring(2, 7).toUpperCase();

// --- CUSTOM THEMED DIALOG (REPLACE BROWSER ALERT & CONFIRM) ---
window.customAlert = (message, title = "Pemberitahuan") => {
    return new Promise((resolve) => {
        const modal = document.getElementById("customDialogModal");
        const titleEl = document.getElementById("dialogTitle");
        const msgEl = document.getElementById("dialogMessage");
        const btnOk = document.getElementById("dialogBtnOk");
        const btnCancel = document.getElementById("dialogBtnCancel");

        titleEl.innerText = title;
        msgEl.innerText = message;
        btnCancel.classList.add("hidden");
        btnOk.className = "flex-1 bg-pink-500 hover:bg-pink-600 text-white font-bold py-2.5 rounded-xl text-xs transition-all cursor-pointer shadow-xs";
        
        modal.classList.remove("hidden");

        const handleOk = () => {
            modal.classList.add("hidden");
            btnOk.removeEventListener("click", handleOk);
            resolve(true);
        };
        btnOk.onclick = handleOk;
    });
};

window.customConfirm = (message, title = "Konfirmasi") => {
    return new Promise((resolve) => {
        const modal = document.getElementById("customDialogModal");
        const titleEl = document.getElementById("dialogTitle");
        const msgEl = document.getElementById("dialogMessage");
        const btnOk = document.getElementById("dialogBtnOk");
        const btnCancel = document.getElementById("dialogBtnCancel");

        titleEl.innerText = title;
        msgEl.innerText = message;
        btnCancel.classList.remove("hidden");
        btnOk.className = "flex-1 bg-pink-500 hover:bg-pink-600 text-white font-bold py-2.5 rounded-xl text-xs transition-all cursor-pointer shadow-xs";
        btnCancel.className = "flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-xl text-xs transition-all cursor-pointer";

        modal.classList.remove("hidden");

        btnOk.onclick = () => {
            modal.classList.add("hidden");
            resolve(true);
        };
        btnCancel.onclick = () => {
            modal.classList.add("hidden");
            resolve(false);
        };
    });
};

// --- PUSH NOTIFICATION ENGINE ---
window.requestPushNotificationPermission = async () => {
    if (!('Notification' in window)) {
        return window.customAlert("Browser perangkat Anda tidak mendukung Push Notification.", "Informasi");
    }

    if (!('serviceWorker' in navigator)) {
        return window.customAlert("Service Worker tidak didukung di browser ini.", "Informasi");
    }

    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
        window.customAlert("Izin Push Notification berhasil diaktifkan!", "Sukses");
        const registration = await navigator.serviceWorker.ready;
        registration.showNotification("Pojoksoal.me", {
            body: "Push notification aktif! Ustadzah akan menerima pemberitahuan ujian.",
            icon: "./images/icon-192.png"
        });
    } else {
        window.customAlert("Izin notifikasi ditolak oleh pengguna.", "Perhatian");
    }
};

async function triggerPushNotification(studentName, topicName) {
    if ('Notification' in window && Notification.permission === 'granted' && 'serviceWorker' in navigator) {
        try {
            const registration = await navigator.serviceWorker.ready;
            registration.showNotification("Jawaban Evaluasi Baru! 📝", {
                body: `${studentName} telah mengirimkan jawaban untuk tema: ${topicName}`,
                icon: "./images/icon-192.png",
                badge: "./images/icon-192.png",
                vibrate: [200, 100, 200]
            });
        } catch (e) {
            console.warn("Gagal menampilkan push notification:", e);
        }
    }
}

// UPLOAD & RESTORE PAGE LOGO ENGINE
window.triggerPageLogoUpload = () => {
    document.getElementById("pageLogoFileInput").click();
};

window.handlePageLogoUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
        return window.customAlert("Ukuran logo terlalu besar! Maksimal ukuran file 2 MB.");
    }

    const img = new Image();
    const reader = new FileReader();
    reader.onload = (evt) => {
        img.src = evt.target.result;
        img.onload = () => {
            const canvas = document.createElement("canvas");
            const ctx = canvas.getContext("2d");
            const maxDim = 180;
            let width = img.width;
            let height = img.height;

            if (width > height) {
                if (width > maxDim) { height *= maxDim / width; width = maxDim; }
            } else {
                if (height > maxDim) { width *= maxDim / height; height = maxDim; }
            }

            canvas.width = width;
            canvas.height = height;
            ctx.drawImage(img, 0, 0, width, height);

            const compressedBase64 = canvas.toDataURL("image/png", 0.9);
            updatePageLogoUI(compressedBase64);
            savePageLogoToFirestore(compressedBase64);
        };
    };
    reader.readAsDataURL(file);
};

async function savePageLogoToFirestore(logoBase64) {
    try {
        await setDoc(doc(db, "settings", "headerConfig"), { pageLogoUrl: logoBase64 }, { merge: true });
        window.customAlert("Logo Page Berhasil Diperbarui & Tersimpan!");
    } catch (err) {
        window.customAlert("Gagal menyimpan logo page: " + err.message);
    }
}

function updatePageLogoUI(url) {
    const logoImg = document.getElementById("navPageLogoImg");
    const fallback = document.getElementById("navLogoFallback");

    if (url) {
        if (logoImg) { logoImg.src = url; logoImg.classList.remove("hidden"); }
        if (fallback) fallback.classList.add("hidden");
    } else {
        if (logoImg) logoImg.classList.add("hidden");
        if (fallback) fallback.classList.remove("hidden");
    }
}

// NOTIFICATION AUDIO PLAYER ENGINE
window.playNotificationSound = () => {
    if (!window.soundSettings.enabled) return;

    try {
        if (window.soundSettings.preset === 'custom' && window.soundSettings.customAudioData) {
            const audio = new Audio(window.soundSettings.customAudioData);
            audio.play().catch(e => console.warn("Audio playback error:", e));
            return;
        }

        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();

        const playNote = (freq, type, startTime, duration) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(freq, ctx.currentTime + startTime);
            gain.gain.setValueAtTime(0.3, ctx.currentTime + startTime);
            gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + startTime + duration);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(ctx.currentTime + startTime);
            osc.stop(ctx.currentTime + startTime + duration);
        };

        if (window.soundSettings.preset === 'bell') {
            playNote(523.25, 'sine', 0, 1.2);
            playNote(659.25, 'sine', 0.15, 1.5);
        } else if (window.soundSettings.preset === 'marimba') {
            playNote(440, 'triangle', 0, 0.3);
            playNote(554.37, 'triangle', 0.12, 0.3);
            playNote(659.25, 'triangle', 0.24, 0.5);
        } else {
            playNote(587.33, 'sine', 0, 0.4);
            playNote(880, 'sine', 0.15, 0.8);
        }
    } catch (e) {
        console.warn("Sound preview failed:", e);
    }
};

window.previewNotificationSound = () => {
    const selectEl = document.getElementById("selectPresetSound");
    if (selectEl) window.soundSettings.preset = selectEl.value;
    window.playNotificationSound();
};

window.handleCustomAudioUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
        window.soundSettings.customAudioData = evt.target.result;
        window.customAlert("Audio custom berhasil dimuat!");
        window.previewNotificationSound();
    };
    reader.readAsDataURL(file);
};

window.saveNotificationSoundConfig = async () => {
    window.soundSettings.enabled = document.getElementById("chkNotificationSound").checked;
    window.soundSettings.preset = document.getElementById("selectPresetSound").value;

    try {
        await setDoc(doc(db, "settings", "soundConfig"), window.soundSettings);
        window.customAlert("Pengaturan Suara Notifikasi Berhasil Disimpan!");
    } catch (err) {
        window.customAlert("Gagal menyimpan pengaturan suara: " + err.message);
    }
};

// FOTO PROFIL USTADZAH ENGINE
window.triggerProfileUpload = () => {
    document.getElementById("teacherAvatarFileInput").click();
};

window.handleTeacherAvatarUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
        return window.customAlert("Ukuran foto terlalu besar! Maksimal ukuran file 2 MB.");
    }

    const img = new Image();
    const reader = new FileReader();
    reader.onload = (evt) => {
        img.src = evt.target.result;
        img.onload = () => {
            const canvas = document.createElement("canvas");
            const ctx = canvas.getContext("2d");
            const maxDim = 200;
            let width = img.width;
            let height = img.height;

            if (width > height) {
                if (width > maxDim) { height *= maxDim / width; width = maxDim; }
            } else {
                if (height > maxDim) { width *= maxDim / height; height = maxDim; }
            }

            canvas.width = width;
            canvas.height = height;
            ctx.drawImage(img, 0, 0, width, height);

            const compressedBase64 = canvas.toDataURL("image/jpeg", 0.8);
            updateTeacherAvatarUI(compressedBase64);
            saveTeacherAvatarToFirestore(compressedBase64);
        };
    };
    reader.readAsDataURL(file);
};

async function saveTeacherAvatarToFirestore(avatarBase64) {
    window.accountSettings.avatarUrl = avatarBase64;
    try {
        await setDoc(doc(db, "settings", "accountConfig"), window.accountSettings, { merge: true });
        window.customAlert("Foto Profil Ustadzah Berhasil Diperbarui & Tersimpan!");
    } catch (err) {
        window.customAlert("Gagal menyimpan foto profil: " + err.message);
    }
}

function updateTeacherAvatarUI(url) {
    const avatarImg = document.getElementById("profileAvatarImg");
    const emojiFallback = document.getElementById("profileEmojiFallback");
    const settingImg = document.getElementById("settingAvatarImg");
    const settingFallback = document.getElementById("settingEmojiFallback");

    if (url) {
        if (avatarImg) { avatarImg.src = url; avatarImg.classList.remove("hidden"); }
        if (emojiFallback) emojiFallback.classList.add("hidden");
        if (settingImg) { settingImg.src = url; settingImg.classList.remove("hidden"); }
        if (settingFallback) settingFallback.classList.add("hidden");
    } else {
        if (avatarImg) avatarImg.classList.add("hidden");
        if (emojiFallback) emojiFallback.classList.remove("hidden");
        if (settingImg) settingImg.classList.add("hidden");
        if (settingFallback) settingFallback.classList.remove("hidden");
    }
}

// LISTENERS SINKRONISASI DATABASE REALTIME
function initFirebaseListeners() {
    onSnapshot(doc(db, "settings", "accountConfig"), (docSnap) => {
        if (docSnap.exists()) {
            window.accountSettings = docSnap.data();
            const inputUser = document.getElementById("settingUsername");
            const lblUser = document.getElementById("lblTeacherUsername");
            if (inputUser) inputUser.value = window.accountSettings.username || "ustadzah";
            if (lblUser) lblUser.innerText = window.accountSettings.username || "Ustadzah Manager";
            updateTeacherAvatarUI(window.accountSettings.avatarUrl);
        } else {
            setDoc(doc(db, "settings", "accountConfig"), window.accountSettings);
        }
    });

    onSnapshot(doc(db, "settings", "soundConfig"), (docSnap) => {
        if (docSnap.exists()) {
            window.soundSettings = docSnap.data();
            const chk = document.getElementById("chkNotificationSound");
            const sel = document.getElementById("selectPresetSound");
            if (chk) chk.checked = window.soundSettings.enabled;
            if (sel) {
                sel.value = window.soundSettings.preset || "chime";
                document.getElementById("customSoundUploadBox").classList.toggle("hidden", sel.value !== "custom");
            }
        }
    });

    onSnapshot(doc(db, "settings", "headerConfig"), (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            localStorage.setItem("headerConfig_cache", JSON.stringify(data));

            const navTitle = document.getElementById("navBarTitle");
            const navSubBrand = document.getElementById("navSubBrand");
            const mainTitle = document.getElementById("displayMainTitle");
            const subTitle = document.getElementById("headerSubtitleDisplay");
            const quoteDisp = document.getElementById("headerQuoteDisplay");
            const btnLogin = document.getElementById("btnLoginView");
            const examTitle = document.getElementById("lblExamPageTitle");
            const teacherBadge = document.getElementById("lblTeacherModeBadge");

            if (navTitle) navTitle.innerText = data.navTitle || "Daarunnisaa";
            if (navSubBrand) {
                if (data.showSubBrand !== undefined) {
                    navSubBrand.classList.toggle("hidden", !data.showSubBrand);
                } else {
                    navSubBrand.classList.remove("hidden");
                }
            }
            if (mainTitle) mainTitle.innerText = data.mainTitle || "Lembar Soal Digital";
            if (subTitle) subTitle.innerText = data.headerSubtitle || "EVALUASI TAJWID METODE ASY-SYAFI'I";
            if (quoteDisp) quoteDisp.innerText = data.headerQuote || '"Bersungguh-sungguhlah..."';
            if (btnLogin) btnLogin.innerText = data.btnLoginText || "Login";
            if (examTitle) examTitle.innerText = data.examPageText || "LAMAN UJIAN";

            window.activeSessionText = data.activeSessionText || "Sesi Ustadzah Aktif";
            if (teacherBadge) teacherBadge.innerText = data.teacherModeBadge || "Active Mode";

            const loggedBadge = document.getElementById("navActiveSessionBadge");
            if (loggedBadge) loggedBadge.innerText = window.activeSessionText;

            if (data.pageLogoUrl) updatePageLogoUI(data.pageLogoUrl);

            applyThemeStyle(data.themeColor || 'cute_sakura', data.themeFont || 'Plus Jakarta Sans');
        }
    });

    onSnapshot(collection(db, "topics"), (snapshot) => {
        window.topics = [];
        snapshot.forEach(doc => window.topics.push({ id: doc.id, ...doc.data() }));

        if (!window.topics.some(t => t.name === "All data")) {
            addDoc(collection(db, "topics"), { name: "All data", token: window.generateRandomToken(), visible: true });
        }

        updateTopicDropdowns();
        updateDashboardStats();
        
        if (window.activeStudentTopicObj) {
            const currentUpdated = window.topics.find(t => t.id === window.activeStudentTopicObj.id);
            if (!currentUpdated || currentUpdated.token !== window.activeStudentTopicObj.token) {
                window.customAlert("Ujian untuk tema ini telah dihentikan/direset!");
                window.activeStudentTopicObj = null;
                document.getElementById("inputTopicToken").value = "";
                document.getElementById("studentQuestionsWrapper").classList.add("hidden");
                document.getElementById("studentIdentityPanel").classList.add("hidden");
            }
        }
    });

    onSnapshot(collection(db, "questions_pg"), (snapshot) => {
        window.questionsPg = [];
        snapshot.forEach(doc => window.questionsPg.push({ id: doc.id, ...doc.data() }));
        window.renderTeacherManageQuestions();
        updateDashboardStats();
    });

    onSnapshot(collection(db, "questions_essay"), (snapshot) => {
        window.questionsEssay = [];
        snapshot.forEach(doc => window.questionsEssay.push({ id: doc.id, ...doc.data() }));
        window.renderTeacherManageQuestions();
        updateDashboardStats();
    });

    const subQuery = query(collection(db, "submissions"), orderBy("submittedAt", "desc"));
    onSnapshot(subQuery, (snapshot) => {
        const prevCount = window.submissions.length;
        window.submissions = [];
        snapshot.forEach(doc => window.submissions.push({ id: doc.id, ...doc.data() }));

        if (!initialSubmissionLoad && window.submissions.length > prevCount) {
            window.playNotificationSound();
            const latestSub = window.submissions[0];
            if (latestSub) {
                triggerPushNotification(latestSub.studentName, latestSub.topic);
            }
        }
        initialSubmissionLoad = false;

        renderSubmissionList();
        renderLeaderboard();
        updateDashboardStats();
    });
}

function updateDashboardStats() {
    const statTopics = document.getElementById("statTotalTopics");
    const statPg = document.getElementById("statActivePg");
    const statEssay = document.getElementById("statActiveEssay");
    const statSub = document.getElementById("statSubmissions");

    if (statTopics) statTopics.innerText = window.topics.length;
    if (statPg) statPg.innerText = window.questionsPg.filter(q => q.active !== false).length;
    if (statEssay) statEssay.innerText = window.questionsEssay.filter(q => q.active !== false).length;
    if (statSub) statSub.innerText = window.submissions.length;
}

// AKSI TEMA & TOKEN
window.toggleTopicVisibility = async (topicId, topicName, isChecked) => {
    try {
        await updateDoc(doc(db, "topics", topicId), { visible: isChecked });
        const pgToUpdate = window.questionsPg.filter(q => q.topic === topicName);
        for (const q of pgToUpdate) await updateDoc(doc(db, "questions_pg", q.id), { active: isChecked });

        const essayToUpdate = window.questionsEssay.filter(q => q.topic === topicName);
        for (const q of essayToUpdate) await updateDoc(doc(db, "questions_essay", q.id), { active: isChecked });
    } catch (err) {
        window.customAlert("Gagal memperbarui status tema: " + err.message);
    }
};

window.resetTopicToken = async (topicId) => {
    const confirmReset = await window.customConfirm("Generate token baru? Token lama tidak dapat digunakan lagi.");
    if (!confirmReset) return;
    await updateDoc(doc(db, "topics", topicId), { token: window.generateRandomToken() });
};

window.deleteTopic = async (topicId, topicName) => {
    if (topicName === "All data") return window.customAlert("Tema 'All data' adalah tema utama bawaan sistem!");
    const confirmDel = await window.customConfirm(`Hapus TEMA "${topicName}"? Semua soal akan dialihkan ke "All data".`);
    if (!confirmDel) return;
    
    try {
        for (const q of window.questionsPg.filter(q => q.topic === topicName)) {
            await updateDoc(doc(db, "questions_pg", q.id), { topic: "All data" });
        }
        for (const q of window.questionsEssay.filter(q => q.topic === topicName)) {
            await updateDoc(doc(db, "questions_essay", q.id), { topic: "All data" });
        }
        await deleteDoc(doc(db, "topics", topicId));
        window.customAlert(`Tema "${topicName}" berhasil dihapus.`);
    } catch(err) {
        window.customAlert("Gagal menghapus tema: " + err.message);
    }
};

window.addNewTopic = async () => {
    const nameInput = document.getElementById("newTopicInput");
    const name = nameInput.value.trim();
    if (!name) return;
    if (name.toLowerCase() === "all data") return window.customAlert("Nama 'All data' sudah terpakai!");

    await addDoc(collection(db, "topics"), { name, token: window.generateRandomToken(), visible: true });
    nameInput.value = "";
};

window.submitEditTopic = async () => {
    const topicId = document.getElementById("editTopicId").value;
    const newName = document.getElementById("editTopicNameInput").value.trim();
    if (!newName || !topicId) return;
    if (newName.toLowerCase() === "all data") return window.customAlert("Nama 'All data' dilindungi.");

    try {
        const oldTopic = window.topics.find(t => t.id === topicId);
        const oldName = oldTopic ? oldTopic.name : null;

        await updateDoc(doc(db, "topics", topicId), { name: newName });
        if (oldName && oldName !== newName) {
            for (const q of window.questionsPg.filter(q => q.topic === oldName)) {
                await updateDoc(doc(db, "questions_pg", q.id), { topic: newName });
            }
            for (const q of window.questionsEssay.filter(q => q.topic === oldName)) {
                await updateDoc(doc(db, "questions_essay", q.id), { topic: newName });
            }
        }
        closeEditTopicModal();
    } catch(err) {
        window.customAlert("Gagal mengubah nama tema: " + err.message);
    }
};

window.saveHeaderConfig = async () => {
    const configData = {
        navTitle: document.getElementById("cfgNavTitle").value.trim(),
        showSubBrand: document.getElementById("cfgShowSubBrand").checked,
        mainTitle: document.getElementById("cfgMainTitle").value.trim(),
        headerSubtitle: document.getElementById("cfgHeaderSubtitle").value.trim(),
        btnLoginText: document.getElementById("cfgBtnLoginText").value.trim(),
        examPageText: document.getElementById("cfgExamPageText").value.trim(),
        gradingPageText: document.getElementById("cfgGradingPageText").value.trim(),
        activeSessionText: document.getElementById("cfgActiveSessionText").value.trim(),
        teacherModeBadge: document.getElementById("cfgTeacherModeBadge").value.trim(),
        headerQuote: document.getElementById("cfgHeaderQuote").value.trim(),
        themeColor: document.getElementById("cfgThemeColor").value,
        themeFont: document.getElementById("cfgThemeFont").value
    };

    try {
        await setDoc(doc(db, "settings", "headerConfig"), configData, { merge: true });
        localStorage.setItem("headerConfig_cache", JSON.stringify(configData));
        closeHeaderConfigModal();
        window.customAlert("Konfigurasi Tampilan & Tema Berhasil Disimpan!");
    } catch (err) {
        window.customAlert("Gagal menyimpan konfigurasi UI: " + err.message);
    }
};

window.saveQuestionToFirebase = async () => {
    const editId = document.getElementById("qEditId").value;
    const topic = document.getElementById("qTopic").value;
    const type = document.getElementById("qType").value;
    const text = document.getElementById("qText").value.trim();
    const weight = parseFloat(document.getElementById("qWeight").value) || 10;

    let imgData = null;
    const urlInput = document.getElementById("imgUrlInput").value.trim();
    const customWidth = document.getElementById("imgCustomWidth").value;
    const customAlign = document.getElementById("imgCustomAlign").value;

    if (urlInput) {
        imgData = { src: urlInput, width: customWidth, align: customAlign };
    } else if (window.uploadedImageData) {
        imgData = { ...window.uploadedImageData, width: customWidth, align: customAlign };
    }

    const btnSave = document.getElementById("btnSaveQuestion");
    btnSave.disabled = true;
    btnSave.innerText = "Menyimpan ke Firebase...";

    try {
        if (type === 'pg') {
            const key = document.getElementById("qKey").value;
            const dataObj = { topic, text, weight, options: window.currentPgOptions, key, img: imgData, active: true };
            if (editId) await updateDoc(doc(db, "questions_pg", editId), dataObj);
            else await addDoc(collection(db, "questions_pg"), dataObj);
        } else {
            const keyEssay = document.getElementById("qKeyEssay").value.trim();
            const dataObj = { topic, text, weight, key: keyEssay, img: imgData, active: true };
            if (editId) await updateDoc(doc(db, "questions_essay", editId), dataObj);
            else await addDoc(collection(db, "questions_essay"), dataObj);
        }
        closeQuestionModal();
    } catch (err) {
        window.customAlert("Gagal menyimpan soal: " + err.message);
    } finally {
        btnSave.disabled = false;
        btnSave.innerText = "Simpan Soal ke Firebase";
    }
};

window.toggleQuestionActive = async (type, id) => {
    const collectionName = type === 'pg' ? "questions_pg" : "questions_essay";
    const target = (type === 'pg' ? window.questionsPg : window.questionsEssay).find(q => q.id === id);
    if (!target) return;

    const newStatus = target.active === false ? true : false;
    try {
        await updateDoc(doc(db, collectionName, id), { active: newStatus });
    } catch (err) {
        window.customAlert("Gagal memperbarui status soal: " + err.message);
    }
};

window.deleteQuestion = async (type, id) => {
    const confirmDel = await window.customConfirm("Apakah Anda yakin ingin menghapus soal ini dari Firebase?");
    if (!confirmDel) return;
    const collectionName = type === 'pg' ? "questions_pg" : "questions_essay";
    try {
        await deleteDoc(doc(db, collectionName, id));
    } catch (err) {
        window.customAlert("Gagal menghapus soal: " + err.message);
    }
};

window.executeDeleteQuestionsByTopic = async () => {
    const topic = document.getElementById("deleteTopicSelect").value;
    if (!topic) return window.customAlert("Pilih tema soal yang ingin dihapus terlebih dahulu!");
    const confirmDel = await window.customConfirm(`Hapus SEMUA SOAL pada tema "${topic}"?`);
    if (!confirmDel) return;

    try {
        const pgToDelete = window.questionsPg.filter(q => q.topic === topic);
        for (const q of pgToDelete) await deleteDoc(doc(db, "questions_pg", q.id));

        const essayToDelete = window.questionsEssay.filter(q => q.topic === topic);
        for (const q of essayToDelete) await deleteDoc(doc(db, "questions_essay", q.id));

        window.customAlert(`Semua soal pada tema "${topic}" berhasil dihapus.`);
        closeDataManageModal();
    } catch (err) {
        window.customAlert("Gagal menghapus soal per tema: " + err.message);
    }
};

window.executeDeleteAllQuestions = async () => {
    const confirmDel = await window.customConfirm("APABILA DIHAPUS, SELURUH SOAL AKAN HILANG PERMANEN. Lanjutkan?");
    if (!confirmDel) return;
    try {
        for (const q of window.questionsPg) await deleteDoc(doc(db, "questions_pg", q.id));
        for (const q of window.questionsEssay) await deleteDoc(doc(db, "questions_essay", q.id));
        window.customAlert("Semua bank soal di Firebase berhasil dikosongkan.");
        closeDataManageModal();
    } catch (err) {
        window.customAlert("Gagal menghapus semua soal: " + err.message);
    }
};

window.executeImportJson = () => {
    const fileInput = document.getElementById("importJsonFile");
    const file = fileInput.files[0];
    if (!file) return window.customAlert("Pilih file backup .JSON terlebih dahulu!");

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const parsed = JSON.parse(e.target.result);
            const pgItems = parsed.questionsPg || [];
            const essayItems = parsed.questionsEssay || [];

            for (const item of pgItems) {
                const { id, ...dataWithoutId } = item;
                if (dataWithoutId.img && typeof dataWithoutId.img === 'string') {
                    dataWithoutId.img = { src: dataWithoutId.img, width: 'max-w-md', align: 'mx-auto block' };
                }
                await addDoc(collection(db, "questions_pg"), { ...dataWithoutId, active: true });
            }

            for (const item of essayItems) {
                const { id, ...dataWithoutId } = item;
                if (dataWithoutId.img && typeof dataWithoutId.img === 'string') {
                    dataWithoutId.img = { src: dataWithoutId.img, width: 'max-w-md', align: 'mx-auto block' };
                }
                await addDoc(collection(db, "questions_essay"), { ...dataWithoutId, active: true });
            }

            window.customAlert(`Import Berhasil! ${pgItems.length} Soal PG & ${essayItems.length} Soal Esai telah diunggah.`);
            closeDataManageModal();
        } catch (err) {
            window.customAlert("Gagal mengimpor file JSON: " + err.message);
        }
    };
    reader.readAsText(file);
};

window.deleteSubmission = async (event, id, name) => {
    if(event) event.stopPropagation();
    const confirmDel = await window.customConfirm(`Hapus lembar pengerjaan milik "${name}"?`);
    if (!confirmDel) return;
    try {
        await deleteDoc(doc(db, "submissions", id));
    } catch (err) {
        window.customAlert("Gagal menghapus pengerjaan: " + err.message);
    }
};

// KUIS MAHASISWI SUBMISSION
let quizStartTime = Date.now();

window.submitQuizForm = async () => {
    if (!window.activeStudentTopicObj) return window.customAlert("Buka kuis tema soal terlebih dahulu!");

    const studentName = document.getElementById("studentName").value.trim();
    if (!studentName) return window.customAlert("Silakan isi Nama dan NIM terlebih dahulu!");

    const selectedTopic = window.activeStudentTopicObj.name;
    const btnSubmit = document.getElementById("btnSubmitQuiz");

    btnSubmit.disabled = true;
    btnSubmit.innerHTML = "Sedang mengirim... ⏳";

    const activePg = window.questionsPg.filter(q => q.active !== false && (selectedTopic === "All data" || q.topic === selectedTopic));
    const activeEssay = window.questionsEssay.filter(q => q.active !== false && (selectedTopic === "All data" || q.topic === selectedTopic));

    let pgScoreCalculated = 0;
    let correctCount = 0;
    const answersPg = {};
    
    activePg.forEach(q => {
        const selected = document.querySelector(`input[name="pg-${q.id}"]:checked`);
        const ansVal = selected ? selected.value : "";
        answersPg[q.id] = ansVal;
        if (ansVal === q.key) {
            correctCount++;
            pgScoreCalculated += (parseFloat(q.weight) || 10);
        }
    });

    pgScoreCalculated = window.roundNum(pgScoreCalculated);

    const answersEssay = {};
    activeEssay.forEach(q => {
        answersEssay[q.id] = document.getElementById(`essay-${q.id}`)?.value.trim() || "";
    });

    const durationSec = Math.floor((Date.now() - quizStartTime) / 1000);
    const durationMin = Math.floor(durationSec / 60);
    const durationText = durationMin > 0 ? `${durationMin} menit ${durationSec % 60} detik` : `${durationSec} detik`;

    const submissionData = {
        studentName,
        topic: selectedTopic,
        answersPg,
        answersEssay,
        pgCorrectCount: correctCount,
        pgScore: pgScoreCalculated,
        essayScore: 0,
        totalScore: pgScoreCalculated,
        durationText,
        durationSeconds: durationSec,
        submittedAt: new Date(),
        status: activeEssay.length === 0 ? "Selesai" : "Belum Diperiksa",
        essayGrades: {}
    };

    try {
        await addDoc(collection(db, "submissions"), submissionData);
        window.clearStudentDraftAnswer(selectedTopic);

        document.getElementById("modalStudentName").innerText = studentName;
        document.getElementById("modalStudentTopic").innerText = selectedTopic;
        document.getElementById("modalStudentDuration").innerText = durationText;

        window.activeStudentTopicObj = null;
        document.getElementById("studentSuccessModal").classList.remove("hidden");
        document.getElementById("quizForm").reset();
        document.getElementById("studentQuestionsWrapper").classList.add("hidden");
        document.getElementById("studentIdentityPanel").classList.add("hidden");
    } catch (err) {
        window.customAlert("Gagal mengirim jawaban: " + err.message);
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = "Kirim Jawaban Evaluasi";
    }
};

window.saveGradingResults = async () => {
    if (!window.activeGradingId) return;

    const btn = document.getElementById("btnSaveGrading");
    btn.disabled = true;
    btn.innerText = "Menyimpan... ⏳";

    const currentSub = window.submissions.find(s => s.id === window.activeGradingId);
    const activeEssay = window.questionsEssay.filter(q => q.active !== false && (currentSub.topic === "All data" || currentSub.topic === "Semua Tema" || !currentSub.topic || q.topic === currentSub.topic));

    const grades = {};
    let totalEssay = 0;
    activeEssay.forEach(q => {
        const maxW = parseFloat(q.weight) || 10;
        const inputVal = Math.min(maxW, Math.max(0, parseFloat(document.getElementById(`grade-essay-${q.id}`)?.value) || 0));
        grades[q.id] = window.roundNum(inputVal);
        totalEssay += inputVal;
    });

    totalEssay = window.roundNum(totalEssay);
    const totalScoreFinal = window.roundNum((parseFloat(currentSub?.pgScore) || 0) + totalEssay);

    try {
        await updateDoc(doc(db, "submissions", window.activeGradingId), {
            essayGrades: grades,
            essayScore: totalEssay,
            totalScore: totalScoreFinal,
            status: "Selesai"
        });

        document.getElementById("gradingTotalScore").innerText = totalScoreFinal;
        document.getElementById("gradingEssayScore").innerText = totalEssay;
        window.customAlert("Penilaian berhasil disimpan!");
    } catch (err) {
        window.customAlert("Gagal menyimpan nilai: " + err.message);
    } finally {
        btn.disabled = false;
        btn.innerText = "Simpan Hasil Penilaian";
    }
};

window.executeUpdateAccount = async () => {
    const newUsername = document.getElementById("settingUsername").value.trim();
    const newPassword = document.getElementById("settingPassword").value;

    const updateData = { username: newUsername };
    if (newPassword) updateData.password = newPassword;

    try {
        await setDoc(doc(db, "settings", "accountConfig"), updateData, { merge: true });
        window.customAlert("Akun Ustadzah Berhasil Diperbarui!");
    } catch (err) {
        window.customAlert("Gagal memperbarui akun: " + err.message);
    }
};

// LOCAL DRAFT MANAGEMENT
window.saveStudentDraftAnswer = () => {
    if (!window.activeStudentTopicObj) return;
    const topicName = window.activeStudentTopicObj.name;
    const draftKey = `draft_quiz_${topicName}`;

    const draftData = {
        studentName: document.getElementById("studentName")?.value || "",
        answersPg: {},
        answersEssay: {}
    };

    const activePg = window.questionsPg ? window.questionsPg.filter(q => q.active !== false && q.topic === topicName) : [];
    activePg.forEach(q => {
        const selected = document.querySelector(`input[name="pg-${q.id}"]:checked`);
        if (selected) draftData.answersPg[q.id] = selected.value;
    });

    const activeEssay = window.questionsEssay ? window.questionsEssay.filter(q => q.active !== false && q.topic === topicName) : [];
    activeEssay.forEach(q => {
        const el = document.getElementById(`essay-${q.id}`);
        if (el) draftData.answersEssay[q.id] = el.value;
    });

    localStorage.setItem(draftKey, JSON.stringify(draftData));
};

window.restoreStudentDraftAnswer = (topicName) => {
    const draftKey = `draft_quiz_${topicName}`;
    const cached = localStorage.getItem(draftKey);
    if (!cached) return;

    try {
        const draftData = JSON.parse(cached);
        if (draftData.studentName && document.getElementById("studentName")) {
            document.getElementById("studentName").value = draftData.studentName;
        }

        if (draftData.answersPg) {
            Object.keys(draftData.answersPg).forEach(qId => {
                const radio = document.querySelector(`input[name="pg-${qId}"][value="${draftData.answersPg[qId]}"]`);
                if (radio) radio.checked = true;
            });
        }

        if (draftData.answersEssay) {
            Object.keys(draftData.answersEssay).forEach(qId => {
                const el = document.getElementById(`essay-${qId}`);
                if (el) el.value = draftData.answersEssay[qId];
            });
        }
    } catch (e) { console.warn("Restore draft failed:", e); }
};

window.clearStudentDraftAnswer = (topicName) => {
    localStorage.removeItem(`draft_quiz_${topicName}`);
};

// LOGOUT & LOGIN HANDLERS
window.handleLogin = (e) => {
    e.preventDefault();
    const user = document.getElementById("loginUsername").value.trim();
    const pass = document.getElementById("loginPassword").value;

    const validUser = window.accountSettings.username || "ustadzah";
    const validPass = window.accountSettings.password || "tajwidok";

    if (user === validUser && pass === validPass) {
        localStorage.setItem("isTeacherLoggedIn", "true");

        document.getElementById("loginModal").classList.add("hidden");
        document.getElementById("studentView").classList.add("hidden");
        document.getElementById("teacherView").classList.remove("hidden");
        
        const logoOverlay = document.getElementById("logoUploadOverlay");
        if(logoOverlay) {
            logoOverlay.classList.remove("hidden");
            logoOverlay.classList.add("flex");
        }

        const sessionLabel = window.activeSessionText || "Sesi Ustadzah Aktif";
        document.getElementById("navRight").innerHTML = `
            <span id="navActiveSessionBadge" class="text-xs font-semibold text-emerald-700 bg-emerald-100/80 px-3 py-1.5 rounded-xl">
                ${sessionLabel}
            </span>
        `;
    } else {
        const errDiv = document.getElementById("loginError");
        errDiv.classList.remove("hidden");
        setTimeout(() => errDiv.classList.add("hidden"), 3000);
    }
};

window.handleLogout = async () => {
    const confirmOut = await window.customConfirm("Apakah Ustadzah yakin ingin keluar?");
    if (confirmOut) {
        localStorage.removeItem("isTeacherLoggedIn");
        window.location.reload();
    }
};

// TEMA STYLING DYNAMIC
function applyThemeStyle(colorScheme, fontName) {
    document.documentElement.style.setProperty('--primary-font', `'${fontName}', sans-serif`);

    const bodyEl = document.getElementById("appBody");
    const navEl = document.getElementById("appNavbar");
    const headerEl = document.getElementById("appHeader");

    if (colorScheme === 'cute_lavender') {
        bodyEl.className = "bg-gradient-to-br from-purple-100 via-purple-50 to-white text-slate-800 min-h-screen transition-colors duration-300 antialiased";
        if(navEl) navEl.className = "bg-white/80 backdrop-blur-md border-b border-purple-100 shadow-xs px-4 py-3 sticky top-0 z-40 no-print";
        if(headerEl) headerEl.className = "bg-gradient-to-b from-white/90 to-purple-50/50 border-b border-purple-100 relative overflow-hidden";
    } else if (colorScheme === 'rose_quartz') {
        bodyEl.className = "bg-gradient-to-br from-rose-100 via-pink-50 to-white text-slate-800 min-h-screen transition-colors duration-300 antialiased";
        if(navEl) navEl.className = "bg-white/80 backdrop-blur-md border-b border-rose-100 shadow-xs px-4 py-3 sticky top-0 z-40 no-print";
        if(headerEl) headerEl.className = "bg-gradient-to-b from-white/90 to-rose-50/50 border-b border-rose-100 relative overflow-hidden";
    } else if (colorScheme === 'dusty_peach') {
        bodyEl.className = "bg-gradient-to-br from-orange-100 via-amber-50 to-white text-slate-800 min-h-screen transition-colors duration-300 antialiased";
        if(navEl) navEl.className = "bg-white/80 backdrop-blur-md border-b border-orange-100 shadow-xs px-4 py-3 sticky top-0 z-40 no-print";
        if(headerEl) headerEl.className = "bg-gradient-to-b from-white/90 to-orange-50/50 border-b border-orange-100 relative overflow-hidden";
    } else if (colorScheme === 'mint_sage') {
        bodyEl.className = "bg-gradient-to-br from-emerald-100 via-teal-50 to-white text-slate-800 min-h-screen transition-colors duration-300 antialiased";
        if(navEl) navEl.className = "bg-white/80 backdrop-blur-md border-b border-emerald-100 shadow-xs px-4 py-3 sticky top-0 z-40 no-print";
        if(headerEl) headerEl.className = "bg-gradient-to-b from-white/90 to-emerald-50/50 border-b border-emerald-100 relative overflow-hidden";
    } else if (colorScheme === 'dark_mocha') {
        bodyEl.className = "bg-gradient-to-br from-amber-100 via-orange-50 to-white text-slate-800 min-h-screen transition-colors duration-300 antialiased";
        if(navEl) navEl.className = "bg-white/80 backdrop-blur-md border-b border-amber-100 shadow-xs px-4 py-3 sticky top-0 z-40 no-print";
        if(headerEl) headerEl.className = "bg-gradient-to-b from-white/90 to-amber-50/50 border-b border-amber-100 relative overflow-hidden";
    } else {
        bodyEl.className = "bg-gradient-to-br from-pink-100 via-rose-50 to-white text-slate-800 min-h-screen transition-colors duration-300 antialiased";
        if(navEl) navEl.className = "bg-white/80 backdrop-blur-md border-b border-pink-100 shadow-xs px-4 py-3 sticky top-0 z-40 no-print";
        if(headerEl) headerEl.className = "bg-gradient-to-b from-white/90 to-pink-50/50 border-b border-pink-100 relative overflow-hidden";
    }
}

// DROPDOWN UPDATER
function updateTopicDropdowns() {
    const qTopicSelect = document.getElementById("qTopic");
    const teacherFilter = document.getElementById("teacherFilterTopic");
    const printTopicSelect = document.getElementById("printTopicSelect");
    const exportTopicSelect = document.getElementById("exportTopicSelect");
    const deleteTopicSelect = document.getElementById("deleteTopicSelect");
    const selectPrintGradingTopic = document.getElementById("selectPrintGradingTopic");
    const badgeContainer = document.getElementById("topicBadgeContainer");

    const topicOptions = window.topics.map(t => `<option value="${t.name}">${t.name}</option>`).join('');

    if (qTopicSelect) qTopicSelect.innerHTML = topicOptions;
    if (teacherFilter) teacherFilter.innerHTML = `<option value="">-- Pilih Tema Soal Dahulu --</option>` + topicOptions;
    if (printTopicSelect) printTopicSelect.innerHTML = `<option value="all">Semua Tema Soal</option>` + topicOptions;
    if (exportTopicSelect) exportTopicSelect.innerHTML = `<option value="all">Semua Tema Soal</option>` + topicOptions;
    if (deleteTopicSelect) deleteTopicSelect.innerHTML = `<option value="">-- Pilih Tema yang Dihapus --</option>` + topicOptions;
    if (selectPrintGradingTopic) selectPrintGradingTopic.innerHTML = `<option value="all">Semua Tema Soal</option>` + topicOptions;

    if (badgeContainer) {
        badgeContainer.innerHTML = window.topics.map(t => {
            const isSystemAllData = t.name === "All data";
            const isVisible = t.visible !== false;

            return `
            <div class="bg-white p-3.5 rounded-2xl border border-pink-100 flex flex-col justify-between gap-2.5 text-xs shadow-xs">
                <div class="flex justify-between items-center">
                    <div class="flex items-center gap-2">
                        <label class="flex items-center gap-1.5 cursor-pointer font-bold text-xs text-pink-700 bg-pink-50 px-2 py-1 rounded-lg">
                            <input type="checkbox" ${isVisible ? 'checked' : ''} onchange="toggleTopicVisibility('${t.id}', '${t.name.replace(/'/g, "\\'")}', this.checked)" class="accent-pink-500">
                            <span>Tampilkan Soal</span>
                        </label>
                        <span class="font-bold text-slate-800 flex items-center gap-1">${t.name}</span>
                    </div>
                    <div class="flex items-center gap-1.5">
                        ${!isSystemAllData ? `
                            <button type="button" onclick="openEditTopicModal('${t.id}', '${t.name.replace(/'/g, "\\'")}')" class="text-pink-600 hover:text-pink-700 font-bold px-1.5 py-0.5 rounded-md hover:bg-pink-50 cursor-pointer text-xs">Edit</button>
                            <button type="button" onclick="deleteTopic('${t.id}', '${t.name.replace(/'/g, "\\'")}')" class="text-rose-500 hover:text-rose-600 font-bold px-1.5 py-0.5 rounded-md hover:bg-rose-50 cursor-pointer text-xs">✕</button>
                        ` : `<span class="text-[10px] bg-amber-100 text-amber-700 font-bold px-2 py-0.5 rounded-md">System</span>`}
                    </div>
                </div>
                <div class="flex items-center justify-between pt-2 border-t border-pink-100">
                    <div class="flex items-center gap-1 bg-pink-50/50 px-2 py-1 rounded-lg border border-pink-100">
                        <span class="font-mono text-[11px] text-pink-700 font-bold">Token: ${t.token || 'TJ000'}</span>
                        <button type="button" onclick="copyTokenToClipboard('${t.token || 'TJ000'}', this)" class="text-slate-400 hover:text-slate-600 font-bold px-1 cursor-pointer">
                            <svg class="w-3.5 h-3.5 stroke-current inline" fill="none" stroke-width="2" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                        </button>
                    </div>
                    <div class="flex items-center gap-1.5">
                        <button type="button" onclick="openQrDisplayModal('${t.name}', '${t.token || 'TJ000'}')" class="text-[10px] bg-pink-50 hover:bg-pink-100 text-pink-700 border border-pink-200 font-bold px-2.5 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1">QR</button>
                        <button type="button" onclick="resetTopicToken('${t.id}')" class="text-[10px] bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 font-bold px-2.5 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1">Reset</button>
                    </div>
                </div>
            </div>`;
        }).join('');
    }
}

window.verifyAndLoadQuiz = () => {
    const inputToken = document.getElementById("inputTopicToken").value.trim().toUpperCase();
    if (!inputToken) return window.customAlert("Silakan scan QR Code atau ketik kode token ujian!");

    const foundTopic = window.topics.find(t => t.token === inputToken);
    if (!foundTopic) {
        window.customAlert("Kode Token Terenkripsi Salah atau Sudah Kadaluarsa!");
        document.getElementById("studentQuestionsWrapper").classList.add("hidden");
        document.getElementById("studentIdentityPanel").classList.add("hidden");
        window.activeStudentTopicObj = null;
        return;
    }

    window.activeStudentTopicObj = foundTopic;
    window.loadQuizQuestions(foundTopic.name);
    
    document.getElementById("studentIdentityPanel").classList.remove("hidden");
    document.getElementById("studentQuestionsWrapper").classList.remove("hidden");

    window.restoreStudentDraftAnswer(foundTopic.name);
    window.customAlert(`Token Sah! Soal Evaluasi Tema "${foundTopic.name}" Berhasil Dimuat.`);
};

// RENDER KUIS
window.loadQuizQuestions = (selectedTopic) => {
    const displayTitle = document.getElementById("displaySheetTitle");
    displayTitle.innerText = `Tema: ${selectedTopic}`;
    displayTitle.classList.remove("hidden");

    const activePg = window.questionsPg.filter(q => q.active !== false && (selectedTopic === "All data" || q.topic === selectedTopic));
    const activeEssay = window.questionsEssay.filter(q => q.active !== false && (selectedTopic === "All data" || q.topic === selectedTopic));

    const pgContainer = document.getElementById("pgContainer");
    if (activePg.length === 0) {
        pgContainer.innerHTML = `<p class="text-xs text-slate-500 italic bg-white p-4 rounded-xl border border-pink-100">Belum ada soal PG aktif pada tema ini.</p>`;
    } else {
        pgContainer.innerHTML = activePg.map((q, idx) => `
            <div class="bg-white p-5 rounded-2xl border border-pink-100 space-y-3 overflow-hidden shadow-xs">
                <div class="flex justify-between items-center text-xs font-semibold text-slate-500">
                    <span>Soal ${idx + 1} dari ${activePg.length} &bull; <strong class="text-pink-600">${q.topic}</strong></span>
                    <span class="text-pink-600 font-bold bg-pink-50 px-2 py-0.5 rounded-md border border-pink-100">Bobot: ${q.weight || 10} Poin</span>
                </div>
                ${q.img ? `
                    <div class="w-full quiz-img-container overflow-hidden my-3 p-2 bg-pink-50/30 border border-pink-100 rounded-xl text-center">
                        <img src="${typeof q.img === 'string' ? q.img : q.img.src}" alt="Lampiran" class="max-h-64 ${q.img.width || 'max-w-md'} ${q.img.align || 'mx-auto block'} rounded-lg object-contain shadow-xs">
                    </div>
                ` : ''}
                <p class="text-sm font-semibold text-slate-800 leading-relaxed">${q.text}</p>
                <div class="space-y-2 pt-1">
                    ${q.options.map(opt => `
                        <label class="flex items-center gap-3 p-3 rounded-xl border border-pink-100 hover:bg-pink-50/50 cursor-pointer transition-all bg-white">
                            <input type="radio" name="pg-${q.id}" value="${opt.k}" required onchange="saveStudentDraftAnswer()" class="accent-pink-500">
                            <span class="text-xs font-bold text-pink-600 bg-pink-50 px-2.5 py-1 rounded-md border border-pink-100">${opt.k}</span>
                            <span class="text-xs font-medium text-slate-700 ${opt.arabic ? 'arabic ml-auto' : ''}">${opt.t}</span>
                        </label>
                    `).join('')}
                </div>
            </div>
        `).join('');
    }

    const essaySection = document.getElementById("studentEssaySection");
    const essayContainer = document.getElementById("essayContainer");

    if (activeEssay.length === 0) {
        essaySection.classList.add("hidden");
        essayContainer.innerHTML = "";
    } else {
        essaySection.classList.remove("hidden");
        essayContainer.innerHTML = activeEssay.map((q, idx) => `
            <div class="bg-white p-5 rounded-2xl border border-pink-100 space-y-3 overflow-hidden shadow-xs">
                <div class="flex justify-between items-center text-xs font-semibold text-slate-500">
                    <span>Uraian ${idx + 1} dari ${activeEssay.length} &bull; <strong class="text-pink-600">${q.topic}</strong></span>
                    <span class="text-amber-600 font-bold bg-amber-50 px-2 py-0.5 rounded-md border border-amber-100">Maks. Bobot: ${q.weight || 10} Poin</span>
                </div>
                ${q.img ? `
                    <div class="w-full quiz-img-container overflow-hidden my-3 p-2 bg-pink-50/30 border border-pink-100 rounded-xl text-center">
                        <img src="${typeof q.img === 'string' ? q.img : q.img.src}" alt="Lampiran" class="max-h-64 ${q.img.width || 'max-w-md'} ${q.img.align || 'mx-auto block'} rounded-lg object-contain shadow-xs">
                    </div>
                ` : ''}
                <p class="text-sm font-semibold text-slate-800 leading-relaxed">${q.text}</p>
                <textarea id="essay-${q.id}" required rows="4" oninput="saveStudentDraftAnswer()" placeholder="Ketikkan jawaban Anda secara rinci..." class="w-full px-4 py-3 border border-pink-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:border-pink-500 bg-white text-slate-800 placeholder-slate-400"></textarea>
            </div>
        `).join('');
    }
};

window.renderTeacherManageQuestions = () => {
    const { maxPg, maxEssay, totalMax } = getMaxScores();
    document.getElementById("totalActiveMaxScore").innerText = `${totalMax} Poin`;
    document.getElementById("maxPgScore").innerText = maxPg;
    document.getElementById("maxEssayScore").innerText = maxEssay;

    const selectedFilterTopic = document.getElementById("teacherFilterTopic").value;
    const selectedFilterType = document.getElementById("bankTypeFilter").value;
    const searchKeyword = document.getElementById("bankSearchInput").value.toLowerCase().trim();

    const promptBox = document.getElementById("teacherSelectPrompt");
    const managePgSection = document.getElementById("managePgSection");
    const manageEssaySection = document.getElementById("manageEssaySection");

    if (!selectedFilterTopic) {
        promptBox.classList.remove("hidden");
        managePgSection.classList.add("hidden");
        manageEssaySection.classList.add("hidden");
        return;
    } else {
        promptBox.classList.add("hidden");
    }

    const filteredPg = window.questionsPg.filter(q => (selectedFilterTopic === "All data" || q.topic === selectedFilterTopic) && q.text.toLowerCase().includes(searchKeyword));
    const filteredEssay = window.questionsEssay.filter(q => (selectedFilterTopic === "All data" || q.topic === selectedFilterTopic) && q.text.toLowerCase().includes(searchKeyword));

    if (selectedFilterType === 'essay') managePgSection.classList.add("hidden");
    else managePgSection.classList.remove("hidden");

    if (selectedFilterType === 'pg') manageEssaySection.classList.add("hidden");
    else manageEssaySection.classList.remove("hidden");

    const managePgList = document.getElementById("managePgList");
    if (filteredPg.length === 0) {
        managePgList.innerHTML = `<p class="text-xs text-slate-500 italic">Tidak ada soal pilihan ganda.</p>`;
    } else {
        managePgList.innerHTML = filteredPg.map((q, idx) => `
            <div class="p-4 rounded-xl border ${q.active !== false ? 'border-pink-100 bg-pink-50/20' : 'border-pink-100 bg-slate-50 opacity-50'} flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 text-xs">
                <div class="space-y-1 flex-1">
                    <div class="flex flex-wrap items-center gap-2">
                        <span class="font-bold text-pink-600">No. ${idx + 1}</span>
                        <span class="text-[10px] bg-white text-slate-700 font-bold px-2 py-0.5 rounded-md border border-pink-100">Tema: ${q.topic || 'Umum'}</span>
                        <span class="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-md">Kunci: ${q.key}</span>
                        <span class="text-[10px] bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-md">Bobot: ${q.weight || 10}</span>
                    </div>
                    <p class="font-medium text-slate-800 mt-1">${q.text}</p>
                </div>
                <div class="flex items-center gap-3 self-end sm:self-center">
                    <label class="flex items-center gap-1.5 cursor-pointer font-bold text-xs text-emerald-700">
                        <input type="checkbox" ${q.active !== false ? 'checked' : ''} onchange="toggleQuestionActive('pg', '${q.id}')" class="accent-emerald-500"> Aktif
                    </label>
                    <button type="button" onclick="editQuestion('pg', '${q.id}')" class="text-pink-600 hover:underline font-semibold cursor-pointer">Edit</button>
                    <button type="button" onclick="deleteQuestion('pg', '${q.id}')" class="text-rose-500 hover:underline font-semibold cursor-pointer">Hapus</button>
                </div>
            </div>
        `).join('');
    }

    const manageEssayList = document.getElementById("manageEssayList");
    if (filteredEssay.length === 0) {
        manageEssayList.innerHTML = `<p class="text-xs text-slate-500 italic">Tidak ada soal uraian.</p>`;
    } else {
        manageEssayList.innerHTML = filteredEssay.map((q, idx) => `
            <div class="p-4 rounded-xl border ${q.active !== false ? 'border-pink-100 bg-pink-50/20' : 'border-pink-100 bg-slate-50 opacity-50'} flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 text-xs">
                <div class="space-y-1 flex-1">
                    <div class="flex flex-wrap items-center gap-2">
                        <span class="font-bold text-pink-600">Uraian ${idx + 1}</span>
                        <span class="text-[10px] bg-white text-slate-700 font-bold px-2 py-0.5 rounded-md border border-pink-100">Tema: ${q.topic || 'Umum'}</span>
                        <span class="text-[10px] bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-md">Bobot Maks: ${q.weight || 10}</span>
                    </div>
                    <p class="font-medium text-slate-800 mt-1">${q.text}</p>
                </div>
                <div class="flex items-center gap-3 self-end sm:self-center">
                    <label class="flex items-center gap-1.5 cursor-pointer font-bold text-xs text-emerald-700">
                        <input type="checkbox" ${q.active !== false ? 'checked' : ''} onchange="toggleQuestionActive('essay', '${q.id}')" class="accent-emerald-500"> Aktif
                    </label>
                    <button type="button" onclick="editQuestion('essay', '${q.id}')" class="text-pink-600 hover:underline font-semibold cursor-pointer">Edit</button>
                    <button type="button" onclick="deleteQuestion('essay', '${q.id}')" class="text-rose-500 hover:underline font-semibold cursor-pointer">Hapus</button>
                </div>
            </div>
        `).join('');
    }
};

function getMaxScores() {
    const activePg = window.questionsPg.filter(q => q.active !== false);
    const activeEssay = window.questionsEssay.filter(q => q.active !== false);

    const maxPg = activePg.reduce((sum, q) => sum + (parseFloat(q.weight) || 10), 0);
    const maxEssay = activeEssay.reduce((sum, q) => sum + (parseFloat(q.weight) || 10), 0);
    
    return { 
        maxPg: window.roundNum(maxPg), 
        maxEssay: window.roundNum(maxEssay), 
        totalMax: window.roundNum(maxPg + maxEssay) 
    };
}

// LEADERBOARD
function renderLeaderboard() {
    const leaderboardBody = document.getElementById("leaderboardBody");
    if (!leaderboardBody) return;

    if (window.submissions.length === 0) {
        leaderboardBody.innerHTML = `<tr><td colspan="9" class="text-center py-6 text-slate-400">Belum ada data pengerjaan mahasiswi.</td></tr>`;
        return;
    }

    const activeEssay = window.questionsEssay.filter(q => q.active !== false);
    const hasEssay = activeEssay.length > 0;

    document.querySelectorAll(".th-essay-col").forEach(col => {
        if (hasEssay) col.classList.remove("hidden");
        else col.classList.add("hidden");
    });

    const sorted = [...window.submissions].sort((a, b) => {
        if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
        return (a.durationSeconds || 999999) - (b.durationSeconds || 999999);
    });

    leaderboardBody.innerHTML = sorted.map((s, index) => {
        let rankBadge = `<span class="font-bold text-slate-400">${index + 1}</span>`;
        if (index === 0) rankBadge = `<span class="font-bold text-amber-600">1</span>`;
        else if (index === 1) rankBadge = `<span class="font-bold text-slate-500">2</span>`;
        else if (index === 2) rankBadge = `<span class="font-bold text-orange-600">3</span>`;

        return `
            <tr class="${index < 3 ? 'bg-pink-50/50 font-medium' : 'hover:bg-pink-50/20'} transition-all">
                <td class="py-2.5 px-3 text-center">${rankBadge}</td>
                <td class="py-2.5 px-3 font-bold text-slate-800">${s.studentName}</td>
                <td class="py-2.5 px-3 font-semibold text-pink-600">${s.topic || 'Semua Tema'}</td>
                <td class="py-2.5 px-3 text-center text-slate-500">${s.durationText || '-'}</td>
                <td class="py-2.5 px-3 text-center">
                    <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${s.status === 'Selesai' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">
                        ${s.status}
                    </span>
                </td>
                <td class="py-2.5 px-3 text-center font-medium">${s.pgScore}</td>
                ${hasEssay ? `<td class="py-2.5 px-3 text-center font-medium">${s.essayScore}</td>` : ''}
                <td class="py-2.5 px-3 text-right font-extrabold text-pink-600 text-sm">${s.totalScore} Poin</td>
                <td class="py-2.5 px-3 text-center">
                    <button type="button" onclick="printSingleStudentSheetById('${s.id}')" title="Cetak Hasil" class="bg-pink-50 hover:bg-pink-100 text-amber-700 border border-pink-200 font-bold px-2 py-1 rounded-lg transition-all cursor-pointer text-xs flex items-center gap-1 mx-auto">Cetak</button>
                </td>
            </tr>
        `;
    }).join('');
}

function renderSubmissionList() {
    const listContainer = document.getElementById("submissionList");
    if (!listContainer) return;

    const filterText = document.getElementById("searchStudentInput").value.toLowerCase();
    const filtered = window.submissions.filter(s => s.studentName.toLowerCase().includes(filterText));
    document.getElementById("submissionCount").innerText = filtered.length;

    if (filtered.length === 0) {
        listContainer.innerHTML = `<p class="col-span-full text-center text-xs text-slate-400 py-6">Tidak ada jawaban yang ditemukan.</p>`;
        return;
    }

    listContainer.innerHTML = filtered.map(s => `
        <div onclick="selectSubmissionForGrading('${s.id}')" class="bg-white p-4 rounded-xl border ${window.activeGradingId === s.id ? 'border-pink-500 ring-2 ring-pink-100' : 'border-pink-100'} hover:border-pink-300 transition-all cursor-pointer relative group shadow-xs">
            <div class="flex justify-between items-start gap-2">
                <h4 class="text-xs sm:text-sm font-bold text-slate-800 truncate flex-1">${s.studentName}</h4>
                <div class="flex items-center gap-1">
                    <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${s.status === 'Selesai' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">
                        ${s.status}
                    </span>
                    <button type="button" onclick="deleteSubmission(event, '${s.id}', '${s.studentName.replace(/'/g, "\\'")}')" class="text-xs bg-rose-50 hover:bg-rose-100 text-rose-600 p-1 rounded-lg transition-all cursor-pointer">✕</button>
                </div>
            </div>
            <p class="text-[10px] text-pink-600 font-bold mt-0.5">Tema: ${s.topic || 'Semua Tema'}</p>
            <p class="text-[10px] text-slate-400 mt-0.5">Dikirim: ${s.submittedAt?.toDate ? s.submittedAt.toDate().toLocaleTimeString() : ''}</p>
            <div class="mt-3 flex justify-between items-center border-t border-pink-100 pt-2 text-[10px] font-semibold text-slate-500">
                <span>Skor PG: ${s.pgScore}</span>
                <span class="text-pink-600 font-bold">Total: ${s.totalScore} Poin</span>
            </div>
        </div>
    `).join('');
}

window.printGradingByTopic = () => {
    document.getElementById("printByTopicModal").classList.remove("hidden");
};

window.closePrintByTopicModal = () => {
    document.getElementById("printByTopicModal").classList.add("hidden");
};

window.executePrintGradingTopic = () => {
    const selectedTopic = document.getElementById("selectPrintGradingTopic").value;
    let targetSubmissions = window.submissions;

    if (selectedTopic !== 'all') {
        targetSubmissions = targetSubmissions.filter(s => s.topic === selectedTopic);
    }

    if (targetSubmissions.length === 0) {
        return window.customAlert("Belum ada data pengerjaan pada tema ini!");
    }

    let htmlContent = `
    <div style="font-family: Arial, sans-serif; padding: 15px; color: #000;">
        <div style="text-align: center; border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 15px;">
            <h2 style="margin: 0; font-size: 18px; text-transform: uppercase;">REKAPITULASI HASIL EVALUASI TAJWID</h2>
            <p style="margin: 4px 0 0; font-size: 12px;">Tema Soal: <strong>${selectedTopic === 'all' ? 'Semua Tema' : selectedTopic}</strong> &bull; Total Mahasiswi: ${targetSubmissions.length}</p>
        </div>
        <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
            <thead>
                <tr style="background-color: #f2f2f2;">
                    <th style="border: 1px solid #000; padding: 6px; text-align: center; width: 30px;">No</th>
                    <th style="border: 1px solid #000; padding: 6px; text-align: left;">Nama / NIM Mahasiswi</th>
                    <th style="border: 1px solid #000; padding: 6px; text-align: left;">Tema</th>
                    <th style="border: 1px solid #000; padding: 6px; text-align: center;">Durasi</th>
                    <th style="border: 1px solid #000; padding: 6px; text-align: center;">Skor PG</th>
                    <th style="border: 1px solid #000; padding: 6px; text-align: center;">Skor Esai</th>
                    <th style="border: 1px solid #000; padding: 6px; text-align: center;">Total Skor</th>
                    <th style="border: 1px solid #000; padding: 6px; text-align: center;">Status</th>
                </tr>
            </thead>
            <tbody>
                ${targetSubmissions.map((s, idx) => `
                    <tr>
                        <td style="border: 1px solid #000; padding: 5px; text-align: center;">${idx + 1}</td>
                        <td style="border: 1px solid #000; padding: 5px; font-weight: bold;">${s.studentName}</td>
                        <td style="border: 1px solid #000; padding: 5px;">${s.topic || 'Semua Tema'}</td>
                        <td style="border: 1px solid #000; padding: 5px; text-align: center;">${s.durationText || '-'}</td>
                        <td style="border: 1px solid #000; padding: 5px; text-align: center;">${s.pgScore}</td>
                        <td style="border: 1px solid #000; padding: 5px; text-align: center;">${s.essayScore}</td>
                        <td style="border: 1px solid #000; padding: 5px; text-align: center; font-weight: bold;">${s.totalScore}</td>
                        <td style="border: 1px solid #000; padding: 5px; text-align: center;">${s.status}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    </div>`;

    openPrintWindow(htmlContent, `Hasil_Rekap_${selectedTopic}`);
    closePrintByTopicModal();
};

window.printSingleStudentSheetById = (subId) => {
    const sub = window.submissions.find(s => s.id === subId);
    if (sub) window.printSingleStudentSheet(sub);
};

window.printSingleStudentSheet = (subObj = null) => {
    const sub = subObj || window.submissions.find(s => s.id === window.activeGradingId);
    if (!sub) return window.customAlert("Pilih mahasiswi yang ingin dicetak lembar jawabannya!");

    const activePg = window.questionsPg.filter(q => q.active !== false && (sub.topic === "All data" || sub.topic === "Semua Tema" || !sub.topic || q.topic === sub.topic));
    const activeEssay = window.questionsEssay.filter(q => q.active !== false && (sub.topic === "All data" || sub.topic === "Semua Tema" || !sub.topic || q.topic === sub.topic));

    let htmlContent = `
    <div style="font-family: Arial, sans-serif; padding: 15px; color: #000;">
        <div style="text-align: center; border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 15px;">
            <h2 style="margin: 0; font-size: 16px; text-transform: uppercase; font-weight: bold;">LEMBAR HASIL EVALUASI MAHASISWI</h2>
            <p style="margin: 3px 0 0; font-size: 12px;">Pojoksoal.me - Tajwid Evaluator System</p>
        </div>
        <table style="width: 100%; font-size: 12px; margin-bottom: 15px; border-collapse: collapse;">
            <tr>
                <td style="width: 18%; padding: 3px 0;"><strong>NAMA / NIM</strong></td>
                <td style="width: 2%;">:</td>
                <td style="width: 45%; font-weight: bold;">${sub.studentName}</td>
                <td style="width: 15%; padding: 3px 0;"><strong>STATUS</strong></td>
                <td style="width: 2%;">:</td>
                <td style="width: 18%; font-weight: bold;">${sub.status}</td>
            </tr>
            <tr>
                <td style="padding: 3px 0;"><strong>TEMA SOAL</strong></td>
                <td>:</td>
                <td>${sub.topic || 'Semua Tema'}</td>
                <td style="padding: 3px 0;"><strong>DURASI</strong></td>
                <td>:</td>
                <td>${sub.durationText || '-'}</td>
            </tr>
        </table>
    </div>`;

    openPrintWindow(htmlContent, `Lembar_Evaluasi_${sub.studentName.replace(/\s+/g, '_')}`);
};

function openPrintWindow(contentHtml, titleName) {
    const printWindow = window.open('', '', 'width=850,height=650');
    printWindow.document.write(`<html><head><title>${titleName}</title></head><body>${contentHtml}</body></html>`);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 250);
}

window.addEventListener("DOMContentLoaded", () => {
    try {
        if (localStorage.getItem("isTeacherLoggedIn") === "true") {
            document.getElementById("studentView")?.classList.add("hidden");
            document.getElementById("teacherView")?.classList.remove("hidden");
            
            const logoOverlay = document.getElementById("logoUploadOverlay");
            if(logoOverlay) {
                logoOverlay.classList.remove("hidden");
                logoOverlay.classList.add("flex");
            }

            const navRight = document.getElementById("navRight");
            if (navRight) {
                navRight.innerHTML = `
                    <span id="navActiveSessionBadge" class="text-xs font-semibold text-emerald-700 bg-emerald-100/80 px-3 py-1.5 rounded-xl">
                        ${window.activeSessionText || "Sesi Ustadzah Aktif"}
                    </span>
                `;
            }
        }
    } catch(e) { console.warn("Session restore skipped:", e); }

    document.getElementById("searchStudentInput")?.addEventListener("input", renderSubmissionList);
});

window.addEventListener("beforeunload", (e) => {
    if (window.activeStudentTopicObj) {
        const studentNameVal = document.getElementById("studentName")?.value.trim() || "";
        const hasPgAnswer = !!document.querySelector('#pgContainer input[type="radio"]:checked');
        let hasEssayAnswer = false;
        document.querySelectorAll('#essayContainer textarea').forEach(ta => {
            if (ta.value.trim() !== "") hasEssayAnswer = true;
        });

        if (studentNameVal !== "" || hasPgAnswer || hasEssayAnswer) {
            const message = "Apakah Anda yakin ingin meninggalkan lembar soal?";
            e.preventDefault();
            e.returnValue = message;
            return message;
        }
    }
});

// MODAL TOGGLES
window.toggleLoginModal = (show) => {
    const modal = document.getElementById("loginModal");
    if (show) modal.classList.remove("hidden");
    else modal.classList.add("hidden");
};

window.openPrintModal = () => document.getElementById("printModal").classList.remove("hidden");
window.closePrintModal = () => document.getElementById("printModal").classList.add("hidden");

window.openDataManageModal = () => document.getElementById("dataManageModal").classList.remove("hidden");
window.closeDataManageModal = () => document.getElementById("dataManageModal").classList.add("hidden");

window.openHeaderConfigModal = () => {
    document.getElementById("cfgNavTitle").value = document.getElementById("navBarTitle")?.innerText || "Daarunnisaa";
    const subBrandEl = document.getElementById("navSubBrand");
    document.getElementById("cfgShowSubBrand").checked = subBrandEl ? !subBrandEl.classList.contains("hidden") : true;
    document.getElementById("cfgMainTitle").value = document.getElementById("displayMainTitle")?.innerText || "Lembar Soal Digital";
    document.getElementById("cfgHeaderSubtitle").value = document.getElementById("headerSubtitleDisplay")?.innerText || "";
    document.getElementById("cfgHeaderQuote").value = document.getElementById("headerQuoteDisplay")?.innerText || "";
    document.getElementById("cfgBtnLoginText").value = document.getElementById("btnLoginView")?.innerText.trim() || "Login";
    document.getElementById("cfgExamPageText").value = document.getElementById("lblExamPageTitle")?.innerText || "LAMAN UJIAN";
    document.getElementById("cfgActiveSessionText").value = window.activeSessionText || "Sesi Ustadzah Aktif";
    document.getElementById("cfgTeacherModeBadge").value = document.getElementById("lblTeacherModeBadge")?.innerText || "";

    document.getElementById("headerConfigModal").classList.remove("hidden");
};

window.closeHeaderConfigModal = () => document.getElementById("headerConfigModal").classList.add("hidden");

window.openTopicSearchModal = () => {
    document.getElementById("topicSearchInput").value = "";
    renderFilteredTopicsInModal();
    document.getElementById("topicSearchModal").classList.remove("hidden");
};

window.closeTopicSearchModal = () => document.getElementById("topicSearchModal").classList.add("hidden");

window.renderFilteredTopicsInModal = () => {
    const keyword = document.getElementById("topicSearchInput").value.toLowerCase().trim();
    const listContainer = document.getElementById("modalTopicList");
    const filtered = window.topics.filter(t => t.name.toLowerCase().includes(keyword));

    if (filtered.length === 0) {
        listContainer.innerHTML = `<p class="text-xs text-slate-400 py-4 text-center">Tema tidak ditemukan.</p>`;
        return;
    }

    listContainer.innerHTML = filtered.map(t => `
        <div onclick="selectTopicFromModal('${t.name}')" class="p-3 bg-pink-50/30 hover:bg-pink-50 rounded-xl border border-pink-100 flex justify-between items-center cursor-pointer transition-all">
            <span class="text-xs font-bold text-slate-800">${t.name}</span>
            <span class="text-[10px] bg-white px-2 py-0.5 rounded font-mono font-bold text-pink-600 border border-pink-100">Token: ${t.token || 'TJ000'}</span>
        </div>
    `).join('');
};

window.selectTopicFromModal = (topicName) => {
    document.getElementById("teacherFilterTopic").value = topicName;
    window.renderTeacherManageQuestions();
    closeTopicSearchModal();
};

window.openQrDisplayModal = (topicName, token) => {
    document.getElementById("qrModalTopicTitle").innerText = topicName;
    document.getElementById("qrModalTokenDisplay").innerText = `KODE TOKEN: ${token}`;
    const qrCanvas = document.getElementById("qrcodeCanvas");
    qrCanvas.innerHTML = "";
    new QRCode(qrCanvas, { text: token, width: 140, height: 140 });
    document.getElementById("qrDisplayModal").classList.remove("hidden");
};

window.closeQrDisplayModal = () => document.getElementById("qrDisplayModal").classList.add("hidden");

window.openQrScannerModal = () => {
    document.getElementById("qrScannerModal").classList.remove("hidden");
    window.html5QrCodeScanner = new Html5Qrcode("qrReader");
    window.html5QrCodeScanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 200, height: 200 } },
        (decodedText) => {
            document.getElementById("inputTopicToken").value = decodedText;
            closeQrScannerModal();
            window.verifyAndLoadQuiz();
        },
        () => {}
    ).catch(err => console.error("Camera access error:", err));
};

window.closeQrScannerModal = () => {
    if (window.html5QrCodeScanner) {
        window.html5QrCodeScanner.stop().then(() => {
            document.getElementById("qrScannerModal").classList.add("hidden");
        }).catch(() => {
            document.getElementById("qrScannerModal").classList.add("hidden");
        });
    } else {
        document.getElementById("qrScannerModal").classList.add("hidden");
    }
};

window.closeStudentModal = () => {
    document.getElementById("studentSuccessModal").classList.add("hidden");
    window.location.reload();
};

window.switchTeacherTab = (tab) => {
    const btnManage = document.getElementById("tabManageBtn");
    const btnGrading = document.getElementById("tabGradingBtn");
    const btnSetting = document.getElementById("tabSettingBtn");
    
    const secManage = document.getElementById("sectionManageQuestions");
    const secGrading = document.getElementById("sectionGrading");
    const secSetting = document.getElementById("sectionSetting");

    const activeClass = "flex-1 py-2.5 rounded-xl font-bold text-xs transition-all cursor-pointer flex items-center justify-center gap-2 bg-pink-500 text-white shadow-xs";
    const inactiveClass = "flex-1 py-2.5 rounded-xl font-bold text-xs transition-all cursor-pointer flex items-center justify-center gap-2 text-slate-600 hover:text-pink-600";

    btnManage.className = tab === 'manage' ? activeClass : inactiveClass;
    btnGrading.className = tab === 'grading' ? activeClass : inactiveClass;
    btnSetting.className = tab === 'setting' ? activeClass : inactiveClass;

    secManage.classList.toggle("hidden", tab !== 'manage');
    secGrading.classList.toggle("hidden", tab !== 'grading');
    secSetting.classList.toggle("hidden", tab !== 'setting');
};

window.switchGradingTab = (tab) => {
    const btnPg = document.getElementById("tabPgBtn");
    const btnEssay = document.getElementById("tabEssayBtn");
    const contentPg = document.getElementById("tabPgContent");
    const contentEssay = document.getElementById("tabEssayContent");

    btnPg.className = tab === 'pg' ? "px-4 py-2 font-bold text-xs border-b-2 border-pink-500 text-pink-600 cursor-pointer flex items-center gap-2" : "px-4 py-2 font-bold text-xs border-b-2 border-transparent text-slate-400 hover:text-pink-600 cursor-pointer flex items-center gap-2";
    btnEssay.className = tab === 'essay' ? "px-4 py-2 font-bold text-xs border-b-2 border-pink-500 text-pink-600 cursor-pointer flex items-center gap-2" : "px-4 py-2 font-bold text-xs border-b-2 border-transparent text-slate-400 hover:text-pink-600 cursor-pointer flex items-center gap-2";

    contentPg.classList.toggle("hidden", tab !== 'pg');
    contentEssay.classList.toggle("hidden", tab !== 'essay');
};

window.toggleMinimizeGrading = () => {
    const bodyContent = document.getElementById("gradingBodyContent");
    const icon = document.getElementById("minimizeIcon");
    const isHidden = bodyContent.classList.toggle("hidden");
    icon.innerHTML = isHidden ? '<svg class="w-3.5 h-3.5 stroke-current" fill="none" stroke-width="2" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>' : '<svg class="w-3.5 h-3.5 stroke-current" fill="none" stroke-width="2" viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12"/></svg>';
};

window.openQuestionModal = () => {
    document.getElementById("qEditId").value = "";
    document.getElementById("questionForm").reset();
    document.getElementById("questionModalTitle").innerText = "Tambah Soal Baru";
    window.currentPgOptions = [{ k: "A", t: "" }, { k: "B", t: "" }, { k: "C", t: "" }];
    window.uploadedImageData = null;
    document.getElementById("imgPreviewWrapper").classList.add("hidden");
    renderPgOptionsForm();
    toggleQTypeForm();
    document.getElementById("questionModal").classList.remove("hidden");
};

window.closeQuestionModal = () => document.getElementById("questionModal").classList.add("hidden");

window.toggleQTypeForm = () => {
    const type = document.getElementById("qType").value;
    document.getElementById("pgFormOptions").classList.toggle("hidden", type !== 'pg');
    document.getElementById("essayFormOptions").classList.toggle("hidden", type === 'pg');
};

window.switchImageTab = (tab) => {
    const btnUpload = document.getElementById("tabImgUploadBtn");
    const btnUrl = document.getElementById("tabImgUrlBtn");
    const secUpload = document.getElementById("secImgUpload");
    const secUrl = document.getElementById("secImgUrl");

    btnUpload.className = tab === 'upload' ? "pb-1.5 font-bold border-b-2 border-pink-500 text-pink-600" : "pb-1.5 font-bold border-b-2 border-transparent text-slate-400";
    btnUrl.className = tab === 'url' ? "pb-1.5 font-bold border-b-2 border-pink-500 text-pink-600" : "pb-1.5 font-bold border-b-2 border-transparent text-slate-400";

    secUpload.classList.toggle("hidden", tab !== 'upload');
    secUrl.classList.toggle("hidden", tab !== 'url');
};

window.handleImageFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
        const imgPreview = document.getElementById("imgAdjustPreview");
        imgPreview.src = evt.target.result;
        document.getElementById("imgPreviewWrapper").classList.remove("hidden");
        applyImageAdjustments();
    };
    reader.readAsDataURL(file);
};

window.applyImageAdjustments = () => {
    const scale = document.getElementById("rngScale").value;
    const rotate = document.getElementById("rngRotate").value;
    const imgPreview = document.getElementById("imgAdjustPreview");

    document.getElementById("lblScale").innerText = scale;
    document.getElementById("lblRotate").innerText = rotate;

    imgPreview.style.transform = `scale(${scale}) rotate(${rotate}deg)`;

    window.uploadedImageData = {
        src: imgPreview.src,
        width: document.getElementById("imgCustomWidth").value,
        align: document.getElementById("imgCustomAlign").value
    };
};

window.renderPgOptionsForm = () => {
    const container = document.getElementById("pgOptionListContainer");
    container.innerHTML = window.currentPgOptions.map((opt, i) => `
        <div class="flex items-center gap-2">
            <span class="font-bold text-xs text-pink-600 w-4">${opt.k}</span>
            <input type="text" id="optInput-${i}" value="${opt.t}" placeholder="Pilihan ${opt.k}" oninput="window.currentPgOptions[${i}].t = this.value" class="w-full px-3 py-1.5 border border-pink-200 rounded-lg text-xs bg-white text-slate-800">
            ${window.currentPgOptions.length > 2 ? `<button type="button" onclick="removePgOption(${i})" class="text-rose-500 hover:text-rose-600 font-bold px-1 text-xs cursor-pointer">✕</button>` : ''}
        </div>
    `).join('');

    const selectKey = document.getElementById("qKey");
    const currentSelected = selectKey.value;
    selectKey.innerHTML = window.currentPgOptions.map(opt => `<option value="${opt.k}">Opsi ${opt.k}</option>`).join('');
    if (window.currentPgOptions.some(o => o.k === currentSelected)) selectKey.value = currentSelected;
};

window.addPgOption = () => {
    const nextCharCode = 65 + window.currentPgOptions.length;
    if (nextCharCode > 90) return window.customAlert("Batas maksimum opsi!");
    window.currentPgOptions.push({ k: String.fromCharCode(nextCharCode), t: "" });
    renderPgOptionsForm();
};

window.removePgOption = (idx) => {
    window.currentPgOptions.splice(idx, 1);
    window.currentPgOptions.forEach((opt, i) => opt.k = String.fromCharCode(65 + i));
    renderPgOptionsForm();
};

window.openEditTopicModal = (topicId, currentName) => {
    if (currentName === "All data") return window.customAlert("Tema 'All data' dilindungi!");
    document.getElementById("editTopicId").value = topicId;
    document.getElementById("editTopicNameInput").value = currentName;
    document.getElementById("editTopicModal").classList.remove("hidden");
};

window.closeEditTopicModal = () => document.getElementById("editTopicModal").classList.add("hidden");

window.copyTokenToClipboard = (token, btnEl) => {
    navigator.clipboard.writeText(token).then(() => {
        const originalText = btnEl.innerHTML;
        btnEl.innerText = "✓";
        setTimeout(() => { btnEl.innerHTML = originalText; }, 1500);
    }).catch(err => window.customAlert("Gagal menyalin token: " + err));
};

window.editQuestion = (type, id) => {
    const list = type === 'pg' ? window.questionsPg : window.questionsEssay;
    const target = list.find(q => q.id === id);
    if (!target) return;

    document.getElementById("qEditId").value = target.id;
    document.getElementById("qTopic").value = target.topic || (window.topics[0]?.name || '');
    document.getElementById("qType").value = type;
    document.getElementById("qText").value = target.text;
    document.getElementById("qWeight").value = target.weight !== undefined ? target.weight : 10;

    if (target.img) {
        if (typeof target.img === 'string') {
            window.uploadedImageData = { src: target.img, width: "max-w-md", align: "mx-auto block" };
        } else {
            window.uploadedImageData = target.img;
            document.getElementById("imgCustomWidth").value = target.img.width || "max-w-md";
            document.getElementById("imgCustomAlign").value = target.img.align || "mx-auto block";
        }
        document.getElementById("imgAdjustPreview").src = window.uploadedImageData.src;
        document.getElementById("imgPreviewWrapper").classList.remove("hidden");
    } else {
        window.uploadedImageData = null;
        document.getElementById("imgPreviewWrapper").classList.add("hidden");
    }

    if (type === 'pg') {
        window.currentPgOptions = JSON.parse(JSON.stringify(target.options || [{ k: "A", t: "" }, { k: "B", t: "" }, { k: "C", t: "" }]));
        renderPgOptionsForm();
        document.getElementById("qKey").value = target.key || 'A';
    } else {
        document.getElementById("qKeyEssay").value = target.key || '';
    }

    toggleQTypeForm();
    document.getElementById("questionModalTitle").innerText = "Edit Soal";
    document.getElementById("questionModal").classList.remove("hidden");
};

window.selectSubmissionForGrading = (id) => {
    window.activeGradingId = id;
    const sub = window.submissions.find(s => s.id === id);
    if (!sub) return;

    renderSubmissionList();

    document.getElementById("gradingBodyContent").classList.remove("hidden");
    document.getElementById("minimizeIcon").innerHTML = '<svg class="w-3.5 h-3.5 stroke-current" fill="none" stroke-width="2" viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12"/></svg>';

    document.getElementById("gradingArea").classList.remove("hidden");
    document.getElementById("gradingStudentName").innerText = sub.studentName;
    document.getElementById("gradingMeta").innerText = `Tema: ${sub.topic || 'Semua Tema'} | Durasi: ${sub.durationText} | Status: ${sub.status}`;
    document.getElementById("gradingTotalScore").innerText = sub.totalScore;
    document.getElementById("gradingPgScore").innerText = sub.pgScore;
    document.getElementById("gradingEssayScore").innerText = sub.essayScore;
    document.getElementById("pgCorrectCount").innerText = sub.pgCorrectCount;

    const activeEssay = window.questionsEssay.filter(q => q.active !== false && (sub.topic === "All data" || sub.topic === "Semua Tema" || !sub.topic || q.topic === sub.topic));
    const hasEssay = activeEssay.length > 0;

    document.getElementById("scoreBreakdownText").classList.toggle("hidden", !hasEssay);
    document.getElementById("tabEssayBtn").classList.toggle("hidden", !hasEssay);

    const activePg = window.questionsPg.filter(q => q.active !== false && (sub.topic === "All data" || sub.topic === "Semua Tema" || !sub.topic || q.topic === sub.topic));
    document.getElementById("pgGradingContainer").innerHTML = activePg.map(q => {
        const userAns = sub.answersPg[q.id] || "Belum diisi";
        const isCorrect = userAns === q.key;
        const weightVal = parseFloat(q.weight) || 10;
        return `
            <div class="bg-white p-3.5 rounded-xl border ${isCorrect ? 'border-emerald-200' : 'border-rose-200'} text-xs shadow-xs">
                <div class="flex justify-between font-bold mb-1">
                    <span>Tema: ${q.topic || 'Umum'} (Bobot: ${weightVal})</span>
                    <span class="${isCorrect ? 'text-emerald-700' : 'text-rose-600'}">${isCorrect ? `✓ Benar (+${weightVal})` : '✗ Salah (0)'}</span>
                </div>
                <p class="text-slate-800 font-medium">${q.text}</p>
                <p class="mt-2 text-slate-500">Jawaban Mahasiswi: <strong class="text-slate-800">${userAns}</strong> (Kunci PG: ${q.key})</p>
            </div>
        `;
    }).join('');

    const essayGradingContainer = document.getElementById("essayGradingContainer");
    if (hasEssay) {
        essayGradingContainer.innerHTML = activeEssay.map(q => {
            const userAns = sub.answersEssay[q.id] || "(Kosong / Belum Diisi)";
            const currentGrade = sub.essayGrades ? (sub.essayGrades[q.id] || 0) : 0;
            const maxW = parseFloat(q.weight) || 10;
            return `
                <div class="bg-white p-4 rounded-xl border border-pink-100 space-y-3 text-xs shadow-xs">
                    <div class="flex justify-between items-center border-b border-pink-100 pb-2">
                        <span class="font-bold text-pink-600">Tema: ${q.topic || 'Umum'}</span>
                        <div class="flex items-center gap-2">
                            <span class="text-slate-500 font-medium">Beri Nilai (0-${maxW}):</span>
                            <input type="number" id="grade-essay-${q.id}" value="${currentGrade}" min="0" max="${maxW}" step="any" oninput="calculateRealtimeEssayScore()" class="w-16 px-2.5 py-1 border border-pink-200 rounded-lg text-center font-bold text-pink-600 bg-pink-50/20 focus:outline-none focus:border-pink-500">
                        </div>
                    </div>
                    <p class="font-semibold text-slate-800">${q.text}</p>
                    <div class="space-y-1">
                        <span class="text-[10px] font-bold text-slate-500 uppercase">Jawaban Mahasiswi:</span>
                        <div class="p-3 bg-pink-50/20 rounded-xl text-slate-800 whitespace-pre-line border border-pink-100">${userAns}</div>
                    </div>
                    <div class="p-3 bg-emerald-50 border border-emerald-100 rounded-xl space-y-1">
                        <span class="text-[10px] font-bold text-emerald-800 uppercase">Kunci Acuan Penilaian:</span>
                        <p class="text-emerald-900 font-medium whitespace-pre-line">${q.key || 'Belum ada acuan kunci.'}</p>
                    </div>
                </div>
            `;
        }).join('');
    } else {
        essayGradingContainer.innerHTML = "";
    }

    calculateRealtimeEssayScore();
    switchGradingTab('pg');
    document.getElementById("gradingArea").scrollIntoView({ behavior: 'smooth' });
};

window.calculateRealtimeEssayScore = () => {
    let totalEssay = 0;
    const sub = window.submissions.find(s => s.id === window.activeGradingId);
    if (!sub) return;

    const activeEssay = window.questionsEssay.filter(q => q.active !== false && (sub.topic === "All data" || sub.topic === "Semua Tema" || !sub.topic || q.topic === sub.topic));
    
    if (activeEssay.length > 0) {
        activeEssay.forEach(q => {
            const input = document.getElementById(`grade-essay-${q.id}`);
            if (input) {
                const maxW = parseFloat(q.weight) || 10;
                totalEssay += Math.min(maxW, Math.max(0, parseFloat(input.value) || 0));
            }
        });
    }

    totalEssay = window.roundNum(totalEssay);
    document.getElementById("essayCurrentScoreDisplay").innerText = totalEssay;

    const currentPg = parseFloat(sub.pgScore) || 0;
    const grandTotal = window.roundNum(currentPg + totalEssay);
    
    const activePg = window.questionsPg.filter(q => q.active !== false);
    const maxPg = activePg.reduce((sum, q) => sum + (parseFloat(q.weight) || 10), 0);
    const maxEssay = activeEssay.reduce((sum, q) => sum + (parseFloat(q.weight) || 10), 0);
    const totalMax = window.roundNum(maxPg + maxEssay);

    const percentage = totalMax > 0 ? Math.round((grandTotal / totalMax) * 100) : 0;

    let predikat = "D (Kurang)";
    let saran = "Disarankan remedial & pemantauan ulang pada bab Tajwid ini.";
    if (percentage >= 85) {
        predikat = "A (Mumtaz / Sempurna)";
        saran = "Pemahaman Tajwid mahasiswi sangat luar biasa!";
    } else if (percentage >= 70) {
        predikat = "B (Jayyid / Baik)";
        saran = "Pemahaman cukup baik. Lulus evaluasi dengan catatan.";
    } else if (percentage >= 60) {
        predikat = "C (Cukup)";
        saran = "Mencapai batas kelulusan minimal.";
    }

    document.getElementById("recommendationText").innerHTML = `
        Capaian Akhir: <strong>${grandTotal} / ${totalMax} Poin (${percentage}%)</strong> &bull; 
        Predikat: <strong class="text-pink-600">${predikat}</strong>.<br>
        <span class="italic text-slate-500 font-normal">"${saran}"</span>
    `;
};

window.executePrint = () => {
    const topic = document.getElementById("printTopicSelect").value;
    const format = document.getElementById("printFormatSelect").value;

    let pgList = window.questionsPg;
    let essayList = window.questionsEssay;

    if (topic !== 'all') {
        pgList = pgList.filter(q => q.topic === topic);
        essayList = essayList.filter(q => q.topic === topic);
    }

    if (format === 'json') {
        executeExportJson();
        closePrintModal();
        return;
    }

    let printContent = `
        <div style="font-family: Arial, sans-serif; padding: 20px; line-height: 1.6;">
            <h2 style="text-align: center; margin-bottom: 5px;">LEMBAR EVALUASI TAJWID</h2>
            <p style="text-align: center; margin-top: 0; color: #555;">Tema Soal: <strong>${topic === 'all' ? 'Semua Tema' : topic}</strong></p>
            <hr style="border: 1px solid #000; margin-bottom: 20px;">
            <h3>BAGIAN I: PILIHAN GANDA</h3>
            <ol>
                ${pgList.map(q => `
                    <li style="margin-bottom: 15px;">
                        <strong>${q.text}</strong>
                        <div style="margin-left: 20px; margin-top: 5px;">
                            ${q.options ? q.options.map(o => `<div>(${o.k}) ${o.t}</div>`).join('') : ''}
                        </div>
                    </li>
                `).join('')}
            </ol>
        </div>`;

    if (format === 'doc') {
        const blob = new Blob(['\ufeff' + printContent], { type: 'application/msword' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Document_Tajwid_${topic}.doc`;
        document.body.appendChild(a);
        a.click();
        a.remove();
    } else {
        openPrintWindow(printContent, "Cetak_Lembar");
    }

    closePrintModal();
};

window.executeExportJson = () => {
    const topic = document.getElementById("exportTopicSelect").value;
    let pgList = window.questionsPg;
    let essayList = window.questionsEssay;

    if (topic !== 'all') {
        pgList = pgList.filter(q => q.topic === topic);
        essayList = essayList.filter(q => q.topic === topic);
    }

    const exportPayload = {
        version: "2.0",
        exportedAt: new Date().toISOString(),
        topicSelected: topic,
        questionsPg: pgList,
        questionsEssay: essayList
    };

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportPayload, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `Backup_Soal_Tajwid_${topic}_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
};

initFirebaseListeners();
