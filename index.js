// ============================================================
// FZ BOT - PART 1/4
// FOUNDATION / CONFIG / DATABASE / HELPERS
// ============================================================

"use strict";


// ============================================================
// IMPORT
// ============================================================

const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    downloadContentFromMessage
} = require("@whiskeysockets/baileys");

const pino = require("pino");
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const QRCode = require("qrcode");


// ============================================================
// CONFIG
// ============================================================

const BOT_NAME = "Fz Bot";
const OWNER_NAME = "FZZ";
const PREFIX = "!";
const OWNER_NUMBER = "6282312782727";


// ============================================================
// PATH
// ============================================================

const BASE_DIR = __dirname;
const AUTH_DIR = path.join(BASE_DIR, "auth_info");
const DATA_DIR = path.join(BASE_DIR, "data");
const CASES_DIR = path.join(BASE_DIR, "cases");
const RANK_FILE = path.join(DATA_DIR, "ranks.json");
const OWNER_FILE = path.join(DATA_DIR, "owners.json");
const CONFIG_FILE = path.join(DATA_DIR, "config.json");


// ============================================================
// CREATE FOLDER
// ============================================================

function ensureDir(directory) {
    if (!fs.existsSync(directory)) {
        fs.mkdirSync(directory, { recursive: true });
    }
}

ensureDir(DATA_DIR);
ensureDir(CASES_DIR);
ensureDir(AUTH_DIR);


// ============================================================
// DATABASE HELPER
// ============================================================

function readJSON(file, fallback) {
    try {
        if (!fs.existsSync(file)) {
            fs.writeFileSync(file, JSON.stringify(fallback, null, 2), "utf8");
            return fallback;
        }

        const raw = fs.readFileSync(file, "utf8");

        if (!raw.trim()) {
            return fallback;
        }

        return JSON.parse(raw);
    } catch (error) {
        console.log(`⚠️ Database error ${path.basename(file)}:`, error.message);
        return fallback;
    }
}

function saveJSON(file, data) {
    try {
        fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
        return true;
    } catch (error) {
        console.log(`❌ Gagal menyimpan ${path.basename(file)}:`, error.message);
        return false;
    }
}


// ============================================================
// LOAD DATABASE
// ============================================================

let ranks = readJSON(RANK_FILE, {});
let owners = readJSON(OWNER_FILE, [OWNER_NUMBER]);
let config = readJSON(CONFIG_FILE, { mode: "public" });


// ============================================================
// DATABASE VALIDATION
// ============================================================

if (!ranks || typeof ranks !== "object" || Array.isArray(ranks)) {
    ranks = {};
}

if (!Array.isArray(owners)) {
    owners = [OWNER_NUMBER];
}

// Owner utama HARUS selalu ada.
if (!owners.includes(OWNER_NUMBER)) {
    owners.unshift(OWNER_NUMBER);
}

// Mode hanya boleh public/private.
if (config.mode !== "public" && config.mode !== "private") {
    config.mode = "public";
}

// Owner utama selalu OWNER.
ranks[OWNER_NUMBER] = "OWNER";

// Simpan hasil normalisasi.
saveJSON(RANK_FILE, ranks);
saveJSON(OWNER_FILE, owners);
saveJSON(CONFIG_FILE, config);


// ============================================================
// RUNTIME
// ============================================================

const startedAt = Date.now();


// ============================================================
// BASIC HELPER
// ============================================================

function sleep(ms) {
    return new Promise(resolve => {
        setTimeout(resolve, ms);
    });
}

function cleanNumber(jid) {
    return String(jid || "")
        .split("@")[0]
        .split(":")[0]
        .replace(/\D/g, "");
}

function getUserNumber(jid) {
    return cleanNumber(jid);
}

function isGroup(jid) {
    return (
        typeof jid === "string" &&
        jid.endsWith("@g.us")
    );
}


// ============================================================
// RUNTIME FORMAT
// ============================================================

function getRuntime() {
    let seconds = Math.floor((Date.now() - startedAt) / 1000);

    const days = Math.floor(seconds / 86400);
    seconds %= 86400;

    const hours = Math.floor(seconds / 3600);
    seconds %= 3600;

    const minutes = Math.floor(seconds / 60);
    seconds %= 60;

    return (
        `${days}h ` +
        `${hours}j ` +
        `${minutes}m ` +
        `${seconds}d`
    );
}


// ============================================================
// RANK SYSTEM
// ============================================================

function getRank(jid) {
    const number = cleanNumber(jid);

    if (number === OWNER_NUMBER) {
        return "OWNER";
    }

    if (owners.includes(number)) {
        return "OWNER";
    }

    return (ranks[number] || "USER");
}

function isOwner(jid) {
    const number = cleanNumber(jid);

    return (
        number === OWNER_NUMBER ||
        owners.includes(number) ||
        getRank(jid) === "OWNER"
    );
}

function isAdminRank(jid) {
    const rank = String(getRank(jid)).toUpperCase();

    return (
        rank === "OWNER" ||
        rank === "ADMIN"
    );
}


// ============================================================
// PRIVATE / PUBLIC ACCESS
// ============================================================

function canUseBot(jid) {
    if (config.mode === "public") {
        return true;
    }

    return isOwner(jid);
}


// ============================================================
// HEADER
// ============================================================

function getHeader(jid) {
    const rank = getRank(jid);
    const status = "Online";

    return (
`╭━━━〔 Fz Bot 〕━━━╮
┃
┃ 🤖 Fz Bot
┃ 👑 Rank : ${rank}
┃ ⚡ Status : ${status}
┃
╰━━━━━━━━━━━━━━━━╯`
    );
}


// ============================================================
// RANDOM HELPER
// ============================================================

function randomInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);

    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomPercent() {
    return randomInt(0, 100);
}

function randomItem(array) {
    if (!Array.isArray(array) || array.length === 0) {
        return null;
    }

    return array[randomInt(0, array.length - 1)];
}


// ============================================================
// MESSAGE UNWRAPPER
// ============================================================

function unwrapMessage(message) {
    if (!message) {
        return {};
    }

    if (message.ephemeralMessage) {
        return unwrapMessage(message.ephemeralMessage.message);
    }

    if (message.viewOnceMessage) {
        return unwrapMessage(message.viewOnceMessage.message);
    }

    if (message.viewOnceMessageV2) {
        return unwrapMessage(message.viewOnceMessageV2.message);
    }

    if (message.viewOnceMessageV2Extension) {
        return unwrapMessage(message.viewOnceMessageV2Extension.message);
    }

    return message;
}


// ============================================================
// GET MESSAGE TEXT
// ============================================================

function getText(message) {
    const msg = unwrapMessage(message);

    if (typeof msg.conversation === "string") {
        return msg.conversation;
    }

    if (typeof msg.extendedTextMessage?.text === "string") {
        return msg.extendedTextMessage.text;
    }

    if (typeof msg.imageMessage?.caption === "string") {
        return msg.imageMessage.caption;
    }

    if (typeof msg.videoMessage?.caption === "string") {
        return msg.videoMessage.caption;
    }

    if (typeof msg.documentMessage?.caption === "string") {
        return msg.documentMessage.caption;
    }

    return "";
}


// ============================================================
// GET SENDER
// ============================================================

function getSenderJid(message, fallback) {
    return (
        message?.key?.participant ||
        message?.participant ||
        fallback
    );
}


// ============================================================
// QUOTED MESSAGE
// ============================================================

function getQuotedMessage(message) {
    const msg = unwrapMessage(message);

    return (
        msg?.extendedTextMessage?.contextInfo?.quotedMessage ||
        msg?.imageMessage?.contextInfo?.quotedMessage ||
        msg?.videoMessage?.contextInfo?.quotedMessage ||
        null
    );
}


// ============================================================
// TARGET USER
// ============================================================

function getTargetJid(message, mentioned) {
    if (Array.isArray(mentioned) && mentioned.length) {
        return mentioned[0];
    }

    const msg = unwrapMessage(message);

    const quoted =
        msg?.extendedTextMessage?.contextInfo?.participant ||
        msg?.imageMessage?.contextInfo?.participant ||
        msg?.videoMessage?.contextInfo?.participant;

    if (quoted) {
        return quoted;
    }

    return null;
}


// ============================================================
// DOWNLOAD MEDIA
// ============================================================

async function downloadMedia(mediaMessage, type) {
    const stream = await downloadContentFromMessage(mediaMessage, type);

    const chunks = [];

    for await (const chunk of stream) {
        chunks.push(chunk);
    }

    return Buffer.concat(chunks);
}


// ============================================================
// GROUP DATA
// ============================================================

async function getGroupData(sock, jid) {
    const metadata = await sock.groupMetadata(jid);

    const admins = metadata.participants.filter(
        participant =>
            participant.admin === "admin" ||
            participant.admin === "superadmin"
    );

    return {
        metadata,
        admins,
        participants: metadata.participants
    };
}


// ============================================================
// BOT ADMIN CHECK
// ============================================================

async function botIsAdmin(sock, jid) {
    if (!isGroup(jid)) {
        return false;
    }

    try {
        const metadata = await sock.groupMetadata(jid);

        const botIds = [sock.user?.id, sock.user?.jid]
            .filter(Boolean)
            .map(cleanNumber);

        const bot = metadata.participants.find(
            participant => botIds.includes(cleanNumber(participant.id))
        );

        return (
            bot?.admin === "admin" ||
            bot?.admin === "superadmin"
        );
    } catch (error) {
        console.log("botIsAdmin error:", error.message);
        return false;
    }
}


// ============================================================
// USER ADMIN CHECK
// ============================================================

async function userIsAdmin(sock, jid, userJid) {
    if (!isGroup(jid)) {
        return false;
    }

    try {
        const metadata = await sock.groupMetadata(jid);

        const user = metadata.participants.find(
            participant => cleanNumber(participant.id) === cleanNumber(userJid)
        );

        return (
            user?.admin === "admin" ||
            user?.admin === "superadmin"
        );
    } catch (error) {
        console.log("userIsAdmin error:", error.message);
        return false;
    }
}


// ============================================================
// GROUP ACTION
// ============================================================

async function groupAction(sock, jid, action, users) {
    if (!isGroup(jid)) {
        return false;
    }

    const admin = await botIsAdmin(sock, jid);

    if (!admin) {
        await sock.sendMessage(jid, { text: "❌ Bot harus menjadi admin terlebih dahulu." });
        return false;
    }

    try {
        await sock.groupParticipantsUpdate(jid, users, action);
        return true;
    } catch (error) {
        console.log("Group action error:", error.message);

        await sock.sendMessage(jid, { text: `❌ Gagal: ${error.message}` });

        return false;
    }
}


// ============================================================
// STICKER → IMAGE
// ============================================================

async function stickerToImage(sock, jid, message) {
    const quoted = getQuotedMessage(message);
    const source = unwrapMessage(message);

    const sticker = quoted?.stickerMessage || source?.stickerMessage;

    if (!sticker) {
        await sock.sendMessage(jid, { text: "❌ Reply sticker dengan !toimg" });
        return;
    }

    try {
        const input = await downloadMedia(sticker, "sticker");

        const output = await sharp(input).png().toBuffer();

        await sock.sendMessage(jid, {
            image: output,
            caption: "🖼️ Sticker → gambar"
        });
    } catch (error) {
        console.log("Toimg error:", error.message);

        await sock.sendMessage(jid, { text: "❌ Gagal mengubah sticker." });
    }
}


// ============================================================
// CASE LOADER
// ============================================================

function loadCases() {
    const cases = {};

    if (!fs.existsSync(CASES_DIR)) {
        return cases;
    }

    const files = fs.readdirSync(CASES_DIR);

    for (const file of files) {
        if (!file.endsWith(".js")) {
            continue;
        }

        const fullPath = path.join(CASES_DIR, file);

        try {
            delete require.cache[require.resolve(fullPath)];

            const mod = require(fullPath);

            if (
                mod &&
                typeof mod.command === "string" &&
                typeof mod.execute === "function"
            ) {
                cases[mod.command.toLowerCase()] = mod;
            }
        } catch (error) {
            console.log(`❌ Case error ${file}:`, error.message);
        }
    }

    return cases;
}


// ============================================================
// SAFE CASE NAME
// ============================================================

function safeCaseName(name) {
    return String(name || "")
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, "")
        .slice(0, 40);
}


// ============================================================
// MAKE CASE SOURCE
// ============================================================

function makeCaseSource(command, code) {
    return `module.exports = {
    command: ${JSON.stringify(command)},

    async execute({
        sock,
        jid,
        args,
        msg,
        senderJid,
        senderNumber
    }) {

        ${code}

    }
};
`;
}


// ============================================================
// ADD CASE
// ============================================================

function addCase(command, code) {
    const name = safeCaseName(command);

    if (!name) {
        throw new Error("Nama command tidak valid.");
    }

    if (!String(code || "").trim()) {
        throw new Error("Code kosong.");
    }

    const file = path.join(CASES_DIR, `${name}.js`);

    const source = makeCaseSource(name, code);

    fs.writeFileSync(file, source, "utf8");

    return file;
}


// ============================================================
// QR GENERATOR
// ============================================================

async function makeQR(sock, jid, text) {
    if (!text) {
        await sock.sendMessage(jid, { text: "Contoh: !qr https://example.com" });
        return;
    }

    try {
        const buffer = await QRCode.toBuffer(text, {
            width: 600,
            margin: 2
        });

        await sock.sendMessage(jid, {
            image: buffer,
            caption: "📱 QR Code"
        });
    } catch (error) {
        console.log("QR error:", error.message);

        await sock.sendMessage(jid, { text: "❌ Gagal membuat QR." });
    }
}


// ============================================================
// RANDOM DATA
// ============================================================

const FACTS = [
    "🐙 Gurita memiliki tiga jantung.",
    "🍌 Pisang secara botani termasuk buah beri.",
    "🌍 Bumi tidak benar-benar bulat sempurna.",
    "🦈 Hiu sudah ada sebelum dinosaurus.",
    "🐝 Lebah dapat mengenali pola.",
    "🌙 Bulan perlahan menjauh dari Bumi.",
    "🧠 Otak manusia menggunakan banyak energi tubuh.",
    "🌊 Sebagian besar permukaan Bumi tertutup air.",
    "🦋 Kupu-kupu merasakan rasa menggunakan kakinya.",
    "🐘 Gajah dapat berkomunikasi menggunakan suara frekuensi rendah.",
    "🌌 Cahaya Matahari membutuhkan sekitar delapan menit untuk sampai ke Bumi.",
    "🪐 Saturnus memiliki sistem cincin yang sangat luas.",
    "🐬 Lumba-lumba menggunakan suara untuk berkomunikasi.",
    "🌱 Tumbuhan juga melakukan respirasi.",
    "☀️ Matahari adalah bintang.",
    "🧊 Es mengembang ketika membeku.",
    "🐧 Tidak semua penguin hidup di tempat bersalju.",
    "🦒 Jerapah memiliki tujuh tulang leher seperti manusia.",
    "🐢 Beberapa kura-kura dapat hidup sangat lama.",
    "🌋 Gunung berapi dapat membentuk pulau baru."
];

const QUOTES = [
    "✨ Jangan takut memulai dari kecil.",
    "🔥 Konsisten lebih penting daripada sempurna.",
    "🌱 Sedikit kemajuan tetaplah kemajuan.",
    "💡 Kesalahan adalah bagian dari belajar.",
    "🚀 Fokus pada proses, bukan hanya hasil.",
    "⭐ Kamu tidak harus hebat untuk memulai.",
    "🎯 Tujuan besar dimulai dari langkah kecil.",
    "🌤️ Hari buruk tidak berarti hidup buruk.",
    "💪 Tetap jalan walaupun pelan.",
    "📚 Belajar hari ini membantu masa depan.",
    "🧠 Jangan berhenti penasaran.",
    "🏆 Jangan bandingkan prosesmu dengan orang lain.",
    "🌻 Berikan waktu untuk dirimu berkembang.",
    "⚡ Mulai dulu, sempurna belakangan.",
    "🎨 Buat sesuatu yang bisa kamu banggakan.",
    "🛠️ Skill tumbuh karena latihan.",
    "🌈 Setelah kesulitan, biasanya ada pelajaran.",
    "🔑 Disiplin membuka banyak kesempatan.",
    "💭 Ide bagus perlu tindakan.",
    "🚶 Satu langkah tetap lebih baik daripada diam."
];

const TRUTH = [
    "Apa hal yang paling kamu takutkan?",
    "Siapa orang yang paling sering kamu ajak ngobrol?",
    "Apa kebiasaan unikmu?",
    "Apa makanan favoritmu?",
    "Apa hal yang ingin kamu pelajari?",
    "Apa game yang paling sering kamu mainkan?",
    "Apa impianmu?",
    "Apa hal yang membuatmu cepat tertawa?",
    "Apa pelajaran favoritmu?",
    "Apa hal yang ingin kamu perbaiki dari dirimu?"
];

const DARE = [
    "Kirim emoji terakhir yang kamu gunakan.",
    "Kirim stiker random.",
    "Tulis 'aku keren' tiga kali.",
    "Kirim satu fakta random tentang dirimu.",
    "Gunakan emoji 😂 selama satu menit.",
    "Kirim salam ke grup.",
    "Tulis kalimat tanpa menggunakan huruf A.",
    "Kirim GIF random."
];


// ============================================================
// MENU HEADER
// ============================================================

function menuText(senderJid) {
    return `${getHeader(senderJid)}

╭━━━〔 MENU 〕━━━╮
┃
┃ 👤 UMUM
┃ • !menu
┃ • !ping
┃ • !info
┃ • !runtime
┃ • !owner
┃ • !rank
┃ • !cekowner
┃ • !botadmin
┃
┃ 🎮 FUN
┃ • !fact
┃ • !quote
┃ • !truth
┃ • !dare
┃ • !random
┃ • !cekjodoh nama1|nama2
┃ • !howgay nama
┃
┃ 🖼️ MEDIA
┃ • !sticker
┃ • !s
┃ • !toimg
┃ • !brat teks
┃ • !qr teks
┃
┃ 👥 GROUP
┃ • !tag
┃ • !groupstatus
┃ • !tagall
┃ • !hidetag
┃ • !groupinfo
┃
┃ 🛡️ ADMIN
┃ • !kick @user
┃ • !add 628xxx
┃ • !promote @user
┃ • !demote @user
┃ • !setname nama
┃ • !setdesc teks
┃ • !open
┃ • !close
┃
┃ 👑 OWNER
┃ • !public
┃ • !private
┃ • !addowner 628xxx
┃ • !giverank 628xxx | VIP
┃ • !addcase
┃ • !reload
┃
╰━━━━━━━━━━━━━━━━╯`;
}


// ============================================================
// PART 1 SELESAI
// ============================================================
// ============================================================
// FZ BOT - PART 2/4
// CONNECTION / AUTH / MESSAGE HANDLER
// ============================================================


// ============================================================
// GLOBAL SOCKET
// ============================================================

let sock = null;


// ============================================================
// CONNECTION STATE
// ============================================================

let isConnected = false;


// ============================================================
// CASE CACHE
// ============================================================

let loadedCases = {};


// ============================================================
// RELOAD CASES
// ============================================================

function reloadCases() {
    try {
        loadedCases = loadCases();

        console.log(`📦 Cases loaded: ${Object.keys(loadedCases).length}`);

        return loadedCases;
    } catch (error) {
        console.log("❌ Gagal load cases:", error.message);

        loadedCases = {};

        return loadedCases;
    }
}

// Load saat startup.
reloadCases();


// ============================================================
// COMMAND PARSER
// ============================================================

function parseCommand(text) {
    if (typeof text !== "string") {
        return { isCommand: false, command: "", args: "", argsArray: [] };
    }

    const trimmed = text.trim();

    if (!trimmed.startsWith(PREFIX)) {
        return { isCommand: false, command: "", args: "", argsArray: [] };
    }

    const withoutPrefix = trimmed.slice(PREFIX.length).trim();

    if (!withoutPrefix) {
        return { isCommand: false, command: "", args: "", argsArray: [] };
    }

    const parts = withoutPrefix.split(/\s+/);

    const command = (parts.shift() || "").toLowerCase();

    const args = parts.join(" ").trim();

    const argsArray = args ? args.split(/\s+/) : [];

    return { isCommand: true, command, args, argsArray };
}


// ============================================================
// SEND TEXT
// ============================================================

async function sendText(jid, text, options = {}) {
    if (!sock || !jid) {
        return false;
    }

    try {
        await sock.sendMessage(jid, { text, ...options });
        return true;
    } catch (error) {
        console.log("❌ sendText:", error.message);
        return false;
    }
}


// ============================================================
// REPLY
// ============================================================

async function reply(jid, text, quoted) {
    if (!sock) {
        return false;
    }

    try {
        await sock.sendMessage(
            jid,
            { text },
            quoted ? { quoted } : undefined
        );
        return true;
    } catch (error) {
        console.log("❌ Reply error:", error.message);
        return false;
    }
}


// ============================================================
// GET MESSAGE KEY
// ============================================================

function getMessageKey(message) {
    return (message?.key || {});
}


// ============================================================
// GET CHAT JID
// ============================================================

function getChatJid(message) {
    return (message?.key?.remoteJid || "");
}


// ============================================================
// GET MESSAGE ID
// ============================================================

function getMessageId(message) {
    return (message?.key?.id || "");
}


// ============================================================
// IGNORE STATUS
// ============================================================

function isStatusMessage(jid) {
    return (jid === "status@broadcast");
}


// ============================================================
// IGNORE PROTOCOL MESSAGES
// ============================================================

function isUsableMessage(message) {
    if (!message) {
        return false;
    }

    if (message?.key?.fromMe) {
        return false;
    }

    if (message?.message?.protocolMessage) {
        return false;
    }

    return true;
}


// ============================================================
// GROUP SENDER
// ============================================================

function getMessageSender(message, jid) {
    if (isGroup(jid)) {
        return getSenderJid(message, jid);
    }

    return jid;
}


// ============================================================
// CASE EXECUTOR
// ============================================================

async function executeCase(caseData, context) {
    if (!caseData || typeof caseData.execute !== "function") {
        return false;
    }

    try {
        await caseData.execute(context);
        return true;
    } catch (error) {
        console.log("❌ Case execute error:", error.message);

        await reply(context.jid, "❌ Terjadi error pada custom case.", context.message);

        return true;
    }
}


// ============================================================
// CUSTOM CASE HANDLER
// ============================================================

async function handleCustomCase(context) {
    const command = context.command;

    if (!command) {
        return false;
    }

    const caseData = loadedCases[command];

    if (!caseData) {
        return false;
    }

    return await executeCase(caseData, context);
}


// ============================================================
// CONNECTION ERROR HANDLER
// ============================================================

function connectionClosed(lastDisconnect) {
    const statusCode = lastDisconnect?.error?.output?.statusCode;

    return statusCode;
}


// ============================================================
// START BOT
// ============================================================

async function startBot() {
    console.log("");
    console.log("==========================================");
    console.log("          FZ BOT STARTING");
    console.log("==========================================");


    // ========================================================
    // AUTH STATE
    // ========================================================

    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);


    // ========================================================
    // CREATE SOCKET
    // ========================================================

    sock = makeWASocket({
        auth: state,
        logger: pino({ level: "silent" }),
        browser: ["Fz Bot", "Chrome", "1.0.0"],
        markOnlineOnConnect: true,
        syncFullHistory: false
    });

    if (!state.creds.registered) {
        try {
            const phoneNumber = OWNER_NUMBER.replace(/\D/g, "");

            const code = await sock.requestPairingCode(phoneNumber);

            console.log("");
            console.log("==========================================");
            console.log("🔐 WHATSAPP PAIRING CODE");
            console.log(`📱 Nomor: ${phoneNumber}`);
            console.log(`🔑 CODE: ${code}`);
            console.log("==========================================");
        } catch (error) {
            console.log("❌ Pairing code error:", error.message);
        }
    }

    // ========================================================
    // SAVE AUTH
    // ========================================================

    sock.ev.on("creds.update", saveCreds);


    // ========================================================
    // CONNECTION UPDATE
    // ========================================================

    sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log("📱 QR tersedia. Scan melalui WhatsApp.");
        }

        if (connection === "connecting") {
            console.log("🔄 Menghubungkan ke WhatsApp...");
        }

        if (connection === "open") {
            isConnected = true;

            console.log("");
            console.log("==========================================");
            console.log("        ✅ FZ BOT CONNECTED");
            console.log("==========================================");

            console.log(`🤖 Bot: ${BOT_NAME}`);
            console.log(`👑 Owner: ${OWNER_NUMBER}`);
            console.log(`🔐 Mode: ${config.mode}`);
            console.log(`📦 Cases: ${Object.keys(loadedCases).length}`);

            console.log("==========================================");
            console.log("");
        }

        if (connection === "close") {
            isConnected = false;

            const statusCode = connectionClosed(lastDisconnect);

            console.log("❌ Connection closed.");
            console.log("Status:", statusCode || "unknown");

            // ============================================
            // LOGOUT PERMANEN
            // ============================================

            if (statusCode === DisconnectReason.loggedOut) {
                console.log("⚠️ Session logout. Auth perlu dibuat ulang.");
                return;
            }

            // ============================================
            // RECONNECT
            // ============================================

            console.log("🔄 Mencoba reconnect...");

            await sleep(3000);

            try {
                await startBot();
            } catch (error) {
                console.log("❌ Reconnect gagal:", error.message);
            }
        }
    });


    // ========================================================
    // MESSAGE HANDLER
    // ========================================================

    sock.ev.on("messages.upsert", async (event) => {
        try {
            const messages = event?.messages || [];

            for (const message of messages) {
                // ========================================
                // VALIDASI
                // ========================================

                if (!isUsableMessage(message)) {
                    continue;
                }

                const jid = getChatJid(message);

                if (!jid || isStatusMessage(jid)) {
                    continue;
                }

                const msg = unwrapMessage(message.message || {});

                const text = getText(msg);

                const senderJid = getMessageSender(message, jid);

                const senderNumber = getUserNumber(senderJid);

                // ========================================
                // PARSE COMMAND
                // ========================================

                const parsed = parseCommand(text);

                // ========================================
                // NON COMMAND
                // ========================================

                if (!parsed.isCommand) {
                    continue;
                }

                const command = parsed.command;
                const args = parsed.args;
                const argsArray = parsed.argsArray;

                // ========================================
                // CONTEXT
                // ========================================

                const context = {
                    sock,
                    jid,
                    message,
                    msg,
                    text,
                    command,
                    args,
                    argsArray,
                    senderJid,
                    senderNumber,
                    isGroup: isGroup(jid),
                    isOwner: isOwner(senderJid),
                    rank: getRank(senderJid)
                };

                // ========================================
                // PRIVATE MODE
                // ========================================

                if (!canUseBot(senderJid)) {
                    await reply(
                        jid,
                        "🔒 Bot sedang private.\n\nHanya owner yang dapat menggunakan bot.",
                        message
                    );

                    continue;
                }

                // ========================================
                // CUSTOM CASE
                // ========================================

                if (await handleCustomCase(context)) {
                    continue;
                }

                // ========================================
                // PART 3 COMMANDS
                // ========================================

                if (typeof handleBuiltInCommand === "function") {
                    const handled = await handleBuiltInCommand(context);

                    if (handled) {
                        continue;
                    }
                }
            }
        } catch (error) {
            console.log("❌ Message handler error:", error?.stack || error?.message || error);
        }
    });

    return sock;
}


// ============================================================
// PART 2 SELESAI
// ============================================================
// ============================================================
// FZ BOT - PART 3/4
// BUILT-IN COMMANDS
// ============================================================

async function handleBuiltInCommand(context) {

    const {
        sock,
        jid,
        message,
        msg,
        command,
        args,
        argsArray,
        senderJid,
        senderNumber,
        isGroup,
        isOwner
    } = context;


    // ========================================================
    // !menu
    // ========================================================

    if (command === "menu" || command === "help") {
        await reply(jid, menuText(senderJid), message);
        return true;
    }


    // ========================================================
    // !ping
    // ========================================================

    if (command === "ping") {
        const start = Date.now();

        await sock.sendMessage(jid, { text: "🏓 Pong!" });

        console.log(`Ping: ${Date.now() - start}ms`);

        return true;
    }


    // ========================================================
    // !info
    // ========================================================

    if (command === "info") {
        await reply(
            jid,
`╭━━━〔 Fz Bot 〕━━━╮
┃
┃ 🤖 Bot : ${BOT_NAME}
┃ 👑 Owner : ${OWNER_NUMBER}
┃ 🔐 Mode : ${config.mode}
┃ ⚡ Status : ${isConnected ? "Online" : "Offline"}
┃ 📦 Cases : ${Object.keys(loadedCases).length}
┃ ⏱️ Runtime : ${getRuntime()}
┃
╰━━━━━━━━━━━━━━━━╯`,
            message
        );

        return true;
    }


    // ========================================================
    // !runtime
    // ========================================================

    if (command === "runtime" || command === "uptime") {
        await reply(jid, `⏱️ Runtime Bot\n\n${getRuntime()}`, message);
        return true;
    }


    // ========================================================
    // !owner
    // ========================================================

    if (command === "owner") {
        await reply(
            jid,
`👑 OWNER

Nama : ${OWNER_NAME}
Nomor : ${OWNER_NUMBER}`,
            message
        );

        return true;
    }


    // ========================================================
    // !rank
    // ========================================================

    if (command === "rank") {
        await reply(
            jid,
`👤 Rank kamu:

📱 ${senderNumber}
🏷️ ${getRank(senderJid)}`,
            message
        );

        return true;
    }


    // ========================================================
    // !cekowner
    // ========================================================

    if (command === "cekowner") {
        await reply(
            jid,
            isOwner ? "👑 Kamu terdaftar sebagai OWNER." : "❌ Kamu bukan owner.",
            message
        );

        return true;
    }


    // ========================================================
    // OWNER CHECK
    // ========================================================

    if (command === "ownertest") {
        await reply(
            jid,
            isOwner ? "✅ OWNER TERDETEKSI" : "❌ Bukan owner.",
            message
        );

        return true;
    }


    // ========================================================
    // !public
    // ========================================================

    if (command === "public") {
        if (!isOwner) {
            await reply(jid, "❌ Command ini hanya untuk OWNER.", message);
            return true;
        }

        config.mode = "public";

        saveJSON(CONFIG_FILE, config);

        await reply(jid, "🌍 Bot sekarang PUBLIC.", message);

        return true;
    }


    // ========================================================
    // !private
    // ========================================================

    if (command === "private") {
        if (!isOwner) {
            await reply(jid, "❌ Command ini hanya untuk OWNER.", message);
            return true;
        }

        config.mode = "private";

        saveJSON(CONFIG_FILE, config);

        await reply(jid, "🔒 Bot sekarang PRIVATE.\n\nHanya owner yang dapat menggunakan bot.", message);

        return true;
    }


    // ========================================================
    // !addowner
    // ========================================================

    if (command === "addowner") {
        if (!isOwner) {
            await reply(jid, "❌ Hanya OWNER.", message);
            return true;
        }

        let number = args.replace(/\D/g, "");

        if (number.startsWith("0")) {
            number = "62" + number.slice(1);
        }

        if (!number) {
            await reply(jid, "❌ Contoh: !addowner 628123456789", message);
            return true;
        }

        if (owners.includes(number)) {
            await reply(jid, "⚠️ Nomor tersebut sudah menjadi owner.", message);
            return true;
        }

        owners.push(number);

        ranks[number] = "OWNER";

        saveJSON(OWNER_FILE, owners);
        saveJSON(RANK_FILE, ranks);

        await reply(jid, `✅ ${number} sekarang OWNER.`, message);

        return true;
    }


    // ========================================================
    // !giverank
    // FORMAT:
    // !giverank 628xxx | VIP
    // ========================================================

    if (command === "giverank") {
        if (!isOwner) {
            await reply(jid, "❌ Hanya OWNER yang dapat memberi rank.", message);
            return true;
        }

        const split = args.split("|");

        let number = (split[0] || "").replace(/\D/g, "");

        const rank = (split[1] || "").trim().toUpperCase();

        if (number.startsWith("0")) {
            number = "62" + number.slice(1);
        }

        if (!number || !rank) {
            await reply(jid, "❌ Format:\n!giverank 628xxx | VIP", message);
            return true;
        }

        ranks[number] = rank;

        saveJSON(RANK_FILE, ranks);

        await reply(
            jid,
            `✅ Rank berhasil diberikan.

📱 ${number}
🏷️ ${rank}`,
            message
        );

        return true;
    }


    // ========================================================
    // !delowner
    // ========================================================

    if (command === "delowner") {
        if (!isOwner) {
            await reply(jid, "❌ Hanya OWNER.", message);
            return true;
        }

        const number = args.replace(/\D/g, "");

        if (!number) {
            await reply(jid, "❌ Contoh: !delowner 628xxx", message);
            return true;
        }

        if (number === OWNER_NUMBER) {
            await reply(jid, "❌ Owner utama tidak dapat dihapus.", message);
            return true;
        }

        owners = owners.filter(numberItem => numberItem !== number);

        if (ranks[number] === "OWNER") {
            delete ranks[number];
        }

        saveJSON(OWNER_FILE, owners);
        saveJSON(RANK_FILE, ranks);

        await reply(jid, `✅ ${number} dihapus dari owner.`, message);

        return true;
    }


    // ========================================================
    // !fact
    // ========================================================

    if (command === "fact") {
        await reply(jid, randomItem(FACTS), message);
        return true;
    }


    // ========================================================
    // !quote
    // ========================================================

    if (command === "quote") {
        await reply(jid, randomItem(QUOTES), message);
        return true;
    }


    // ========================================================
    // !truth
    // ========================================================

    if (command === "truth") {
        await reply(jid, `🎯 TRUTH\n\n${randomItem(TRUTH)}`, message);
        return true;
    }


    // ========================================================
    // !dare
    // ========================================================

    if (command === "dare") {
        await reply(jid, `🔥 DARE\n\n${randomItem(DARE)}`, message);
        return true;
    }


    // ========================================================
    // !random
    // ========================================================

    if (command === "random") {
        await reply(jid, `🎲 RANDOM\n\nHasil: ${randomPercent()}%`, message);
        return true;
    }


    // ========================================================
    // !cekjodoh
    // ========================================================

    if (command === "cekjodoh") {
        const names = args.split("|");

        const name1 = (names[0] || "").trim();
        const name2 = (names[1] || "").trim();

        if (!name1 || !name2) {
            await reply(jid, "❌ Contoh:\n!cekjodoh Faraz|Alya", message);
            return true;
        }

        const percent = randomPercent();

        await reply(
            jid,
`💘 CEK JODOH

👤 ${name1}
❤️ ${name2}

💞 Kecocokan: ${percent}%

🎲 Hasil random`,
            message
        );

        return true;
    }


    // ========================================================
    // !howgay
    // ========================================================

    if (command === "howgay") {
        const name = args || senderNumber;

        await reply(
            jid,
`🌈 RANDOM METER

👤 ${name}

🎲 Hasil: ${randomPercent()}%`,
            message
        );

        return true;
    }


    // ========================================================
    // !rate
    // ========================================================

    if (command === "rate") {
        if (!args) {
            await reply(jid, "❌ Contoh: !rate keren", message);
            return true;
        }

        await reply(
            jid,
`📊 RATE

📝 ${args}

⭐ Nilai: ${randomPercent()}/100`,
            message
        );

        return true;
    }


    // ========================================================
    // !iq
    // ========================================================

    if (command === "iq") {
        const name = args || senderNumber;

        await reply(
            jid,
`🧠 IQ RNG

👤 ${name}

🎲 IQ: ${randomInt(50, 150)}`,
            message
        );

        return true;
    }


    // ========================================================
    // !luck
    // ========================================================

    if (command === "luck") {
        const percent = randomPercent();

        let result = "😐 Biasa saja.";

        if (percent >= 80) {
            result = "🍀 Sangat beruntung!";
        } else if (percent >= 50) {
            result = "✨ Lumayan hoki.";
        } else if (percent < 25) {
            result = "💀 Kurang hoki.";
        }

        await reply(
            jid,
`🍀 LUCK METER

🎲 ${percent}%

${result}`,
            message
        );

        return true;
    }


    // ========================================================
    // !coin
    // ========================================================

    if (command === "coin") {
        const result = Math.random() < 0.5 ? "HEAD" : "TAIL";

        await reply(jid, `🪙 COIN FLIP\n\n${result}`, message);

        return true;
    }


    // ========================================================
    // !dice
    // ========================================================

    if (command === "dice") {
        await reply(jid, `🎲 DICE\n\nHasil: ${randomInt(1, 6)}`, message);
        return true;
    }


    // ========================================================
    // !8ball
    // ========================================================

    if (command === "8ball") {
        const answers = [
            "🎱 Ya.",
            "🎱 Tidak.",
            "🎱 Mungkin.",
            "🎱 Kemungkinan besar.",
            "🎱 Coba lagi nanti.",
            "🎱 Sepertinya iya.",
            "🎱 Sepertinya tidak."
        ];

        await reply(jid, `🎱 MAGIC 8 BALL\n\n${randomItem(answers)}`, message);

        return true;
    }


    // ========================================================
    // !say
    // ========================================================

    if (command === "say") {
        if (!args) {
            await reply(jid, "❌ Contoh: !say halo", message);
            return true;
        }

        await reply(jid, args, message);

        return true;
    }


    // ========================================================
    // !emoji
    // ========================================================

    if (command === "emoji") {
        const emojis = [
            "😀", "😂", "🔥", "😎", "🤯", "🚀", "💀", "✨",
            "🎯", "🗿", "😭", "🤣", "🥶", "😈", "🤡", "👀", "💯"
        ];

        await reply(jid, randomItem(emojis), message);

        return true;
    }


    // ========================================================
    // !qr
    // ========================================================

    if (command === "qr") {
        await makeQR(sock, jid, args);
        return true;
    }


    // ========================================================
    // !toimg
    // ========================================================

    if (command === "toimg") {
        const quoted = getQuotedMessage(message);

        const sticker = quoted?.stickerMessage;

        if (!sticker) {
            await reply(jid, "❌ Reply sticker dengan !toimg", message);
            return true;
        }

        try {
            const input = await downloadMedia(sticker, "sticker");

            const output = await sharp(input).png().toBuffer();

            await sock.sendMessage(jid, {
                image: output,
                caption: "🖼️ Sticker → gambar"
            });
        } catch (error) {
            console.log("toimg:", error.message);

            await reply(jid, "❌ Gagal mengubah sticker.", message);
        }

        return true;
    }


    // ========================================================
    // !sticker / !s
    // ========================================================

    if (command === "sticker" || command === "s") {
        await reply(jid, "🖼️ Kirim gambar/video dengan caption !sticker untuk membuat sticker.", message);
        return true;
    }


    // ========================================================
    // !reload
    // ========================================================

    if (command === "reload") {
        if (!isOwner) {
            await reply(jid, "❌ Hanya OWNER.", message);
            return true;
        }

        reloadCases();

        await reply(jid, `✅ Cases berhasil direload.\n\n📦 Total: ${Object.keys(loadedCases).length}`, message);

        return true;
    }


    // ========================================================
    // !addcase
    // FORMAT:
    //
    // !addcase hi | await sock.sendMessage(jid,{text:"hello"})
    //
    // ========================================================

    if (command === "addcase") {
        if (!isOwner) {
            await reply(jid, "❌ Hanya OWNER.", message);
            return true;
        }

        const separator = args.indexOf("|");

        if (separator === -1) {
            await reply(
                jid,
`❌ Format salah.

Contoh:

!addcase hi | await sock.sendMessage(jid,{text:"hello"})`,
                message
            );

            return true;
        }

        const caseName = args.slice(0, separator).trim().toLowerCase();

        const code = args.slice(separator + 1).trim();

        if (!caseName) {
            await reply(jid, "❌ Nama command kosong.", message);
            return true;
        }

        if (!/^[a-z0-9_-]+$/i.test(caseName)) {
            await reply(jid, "❌ Nama command hanya boleh huruf, angka, _ dan -.", message);
            return true;
        }

        if (!code) {
            await reply(jid, "❌ Code JavaScript kosong.", message);
            return true;
        }

        try {
            const file = addCase(caseName, code);

            reloadCases();

            await reply(
                jid,
`✅ CASE BERHASIL DITAMBAHKAN

📌 Command: !${caseName}
📁 File: cases/${caseName}.js

📦 Total cases:
${Object.keys(loadedCases).length}`,
                message
            );
        } catch (error) {
            await reply(jid, `❌ Gagal membuat case:\n${error.message}`, message);
        }

        return true;
    }


    // ========================================================
    // !delcase
    // ========================================================

    if (command === "delcase") {
        if (!isOwner) {
            await reply(jid, "❌ Hanya OWNER.", message);
            return true;
        }

        const caseName = safeCaseName(args);

        if (!caseName) {
            await reply(jid, "❌ Contoh: !delcase hi", message);
            return true;
        }

        const file = path.join(CASES_DIR, `${caseName}.js`);

        if (!fs.existsSync(file)) {
            await reply(jid, "❌ Case tidak ditemukan.", message);
            return true;
        }

        try {
            fs.unlinkSync(file);

            reloadCases();

            await reply(jid, `✅ Case !${caseName} berhasil dihapus.`, message);
        } catch (error) {
            await reply(jid, `❌ Gagal menghapus case:\n${error.message}`, message);
        }

        return true;
    }


    // ========================================================
    // GROUP COMMANDS
    // ========================================================

    if (command === "groupinfo") {
        if (!isGroup) {
            await reply(jid, "❌ Command ini hanya untuk grup.", message);
            return true;
        }

        try {
            const data = await getGroupData(sock, jid);

            const admins = data.admins.length;

            await reply(
                jid,
`👥 GROUP INFO

📌 Nama:
${data.metadata.subject}

👤 Member:
${data.participants.length}

👑 Admin:
${admins}`,
                message
            );
        } catch (error) {
            await reply(jid, "❌ Gagal mengambil info grup.", message);
        }

        return true;
    }


    // ========================================================
    // !groupstatus
    // ========================================================

    if (command === "groupstatus") {
        if (!isGroup) {
            await reply(jid, "❌ Hanya untuk grup.", message);
            return true;
        }

        const botAdmin = await botIsAdmin(sock, jid);

        const userAdmin = await userIsAdmin(sock, jid, senderJid);

        await reply(
            jid,
`👥 GROUP STATUS

🤖 Bot admin:
${botAdmin ? "✅ Ya" : "❌ Tidak"}

👤 Kamu admin:
${userAdmin ? "✅ Ya" : "❌ Tidak"}`,
            message
        );

        return true;
    }


    // ========================================================
    // ADMIN PERMISSION HELPER
    // ========================================================

    const adminCommands = [
        "kick", "add", "promote", "demote", "tagall", "hidetag",
        "open", "close", "setname", "setdesc"
    ];

    if (adminCommands.includes(command)) {
        if (!isGroup) {
            await reply(jid, "❌ Command ini hanya untuk grup.", message);
            return true;
        }

        const userAdmin = await userIsAdmin(sock, jid, senderJid);

        if (!userAdmin && !isOwner) {
            await reply(jid, "❌ Kamu harus menjadi admin grup.", message);
            return true;
        }

        const botAdmin = await botIsAdmin(sock, jid);

        if (!botAdmin) {
            await reply(jid, "❌ Bot belum menjadi admin grup.", message);
            return true;
        }
    }


    // ========================================================
    // !kick
    // ========================================================

    if (command === "kick") {
        const target = getTargetJid(
            message,
            msg?.extendedTextMessage?.contextInfo?.mentionedJid
        );

        if (!target) {
            await reply(jid, "❌ Tag atau reply orang yang ingin dikeluarkan.", message);
            return true;
        }

        await groupAction(sock, jid, "remove", [target]);

        return true;
    }


    // ========================================================
    // !add
    // ========================================================

    if (command === "add") {
        let number = args.replace(/\D/g, "");

        if (number.startsWith("0")) {
            number = "62" + number.slice(1);
        }

        if (!number) {
            await reply(jid, "❌ Contoh: !add 628123456789", message);
            return true;
        }

        await groupAction(sock, jid, "add", [`${number}@s.whatsapp.net`]);

        return true;
    }


    // ========================================================
    // !promote
    // ========================================================

    if (command === "promote") {
        const target = getTargetJid(
            message,
            msg?.extendedTextMessage?.contextInfo?.mentionedJid
        );

        if (!target) {
            await reply(jid, "❌ Tag atau reply orangnya.", message);
            return true;
        }

        await groupAction(sock, jid, "promote", [target]);

        return true;
    }


    // ========================================================
    // !demote
    // ========================================================

    if (command === "demote") {
        const target = getTargetJid(
            message,
            msg?.extendedTextMessage?.contextInfo?.mentionedJid
        );

        if (!target) {
            await reply(jid, "❌ Tag atau reply orangnya.", message);
            return true;
        }

        await groupAction(sock, jid, "demote", [target]);

        return true;
    }


    // ========================================================
    // !tagall
    // ========================================================

    if (command === "tagall") {
        const metadata = await sock.groupMetadata(jid);

        const participants = metadata.participants;

        let text = "📢 TAG ALL\n\n";

        const mentions = [];

        for (const participant of participants) {
            const number = cleanNumber(participant.id);

            text += `@${number}\n`;

            mentions.push(participant.id);
        }

        await sock.sendMessage(jid, { text, mentions });

        return true;
    }


    // ========================================================
    // !hidetag
    // ========================================================

    if (command === "hidetag") {
        const metadata = await sock.groupMetadata(jid);

        const mentions = metadata.participants.map(participant => participant.id);

        await sock.sendMessage(jid, {
            text: args || "📢",
            mentions
        });

        return true;
    }


    // ========================================================
    // !open
    // ========================================================

    if (command === "open") {
        try {
            await sock.groupSettingUpdate(jid, "not_announcement");

            await reply(jid, "🔓 Grup dibuka.", message);
        } catch (error) {
            await reply(jid, "❌ Gagal membuka grup.", message);
        }

        return true;
    }


    // ========================================================
    // !close
    // ========================================================

    if (command === "close") {
        try {
            await sock.groupSettingUpdate(jid, "announcement");

            await reply(jid, "🔒 Grup ditutup.", message);
        } catch (error) {
            await reply(jid, "❌ Gagal menutup grup.", message);
        }

        return true;
    }


    // ========================================================
    // !setname
    // ========================================================

    if (command === "setname") {
        if (!args) {
            await reply(jid, "❌ Contoh: !setname Nama Grup Baru", message);
            return true;
        }

        try {
            await sock.groupUpdateSubject(jid, args);

            await reply(jid, "✅ Nama grup berhasil diubah.", message);
        } catch (error) {
            await reply(jid, "❌ Gagal mengubah nama grup.", message);
        }

        return true;
    }


    // ========================================================
    // !setdesc
    // ========================================================

    if (command === "setdesc") {
        if (!args) {
            await reply(jid, "❌ Contoh: !setdesc Deskripsi grup", message);
            return true;
        }

        try {
            await sock.groupUpdateDescription(jid, args);

            await reply(jid, "✅ Deskripsi grup berhasil diubah.", message);
        } catch (error) {
            await reply(jid, "❌ Gagal mengubah deskripsi.", message);
        }

        return true;
    }


    // ========================================================
    // UNKNOWN COMMAND
    // ========================================================

    return false;
}


// ============================================================
// PART 3 SELESAI
// ============================================================
// ============================================================
// FZ BOT - PART 4/4
// STARTUP / FINAL CONFIG / MENU / HELPERS
// ============================================================


// ============================================================
// STARTUP
// ============================================================

(async () => {
    try {
        console.log("");
        console.log("==========================================");
        console.log("             FZ BOT");
        console.log("==========================================");
        console.log("🚀 Starting bot...");
        console.log(`📁 Auth: ${AUTH_DIR}`);
        console.log(`📁 Cases: ${CASES_DIR}`);
        console.log(`👑 Owner: ${OWNER_NUMBER}`);
        console.log(`🔐 Mode: ${config.mode}`);
        console.log("==========================================");

        // Pastikan folder tersedia
        fs.mkdirSync(AUTH_DIR, { recursive: true });
        fs.mkdirSync(CASES_DIR, { recursive: true });

        // Load cases
        reloadCases();

        // Start WhatsApp
        await startBot();
    } catch (error) {
        console.log("");
        console.log("==========================================");
        console.log("❌ FZ BOT GAGAL START");
        console.log("==========================================");
        console.log(error?.stack || error?.message || error);
        console.log("==========================================");
    }
})();


// ============================================================
// GRACEFUL SHUTDOWN
// ============================================================

process.on("SIGINT", async () => {
    console.log("\n🛑 Bot dihentikan...");

    isConnected = false;

    try {
        if (sock) {
            sock.end(undefined);
        }
    } catch (error) {
        console.log("Shutdown error:", error.message);
    }

    process.exit(0);
});

process.on("SIGTERM", async () => {
    console.log("\n🛑 Bot dihentikan...");

    isConnected = false;

    try {
        if (sock) {
            sock.end(undefined);
        }
    } catch (error) {
        console.log("Shutdown error:", error.message);
    }

    process.exit(0);
});


// ============================================================
// UNHANDLED ERROR
// ============================================================

process.on("uncaughtException", error => {
    console.log("❌ Uncaught Exception:", error?.stack || error?.message || error);
});

process.on("unhandledRejection", error => {
    console.log("❌ Unhandled Rejection:", error?.stack || error?.message || error);
});


// ============================================================
// END
// ============================================================
//
// FZ BOT COMPLETE
//
// PART 1 = CONFIG / HELPERS
// PART 2 = CONNECTION / MESSAGE HANDLER
// PART 3 = COMMANDS
// PART 4 = STARTUP
//
// ============================================================