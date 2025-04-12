const { default: makeWASocket, useMultiFileAuthState, MessageType, MessageOptions, DisconnectReason } = require('@whiskeysockets/baileys');
const express = require('express');
const Boom = require('@hapi/boom');
const qrcode = require('qrcode');
const fs = require('fs');

// Setup express for QR display on the web
const app = express();
const port = 3000;
let sock;

// Authentication folder to save login sessions
const authFolder = './auth_info';

// JSON file to store registered users
const dbPath = './users.json';

// Helper function to load or initialize the user database
function loadUserDB() {
    if (!fs.existsSync(dbPath)) {
        fs.writeFileSync(dbPath, JSON.stringify([])); // Initialize with an empty array
    }
    return JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
}

// Helper function to save the updated user database
function saveUserDB(users) {
    fs.writeFileSync(dbPath, JSON.stringify(users, null, 2));
}
// Check if a user is registered
function isUserRegistered(phoneNumber, msg) {
    if (phoneNumber.endsWith('@g.us')) {
        console.log(`Received a message from group (G ID): ${phoneNumber}`);
        phoneNumber = msg.key.participant;
        console.log(`Received a message from group (CHAT ID): ${phoneNumber}`);
    }
    const users = loadUserDB();
    return users.some(user => user.phone === phoneNumber);
}

// Register a new user
function registerUser(phoneNumber, name, msg) {
    if (phoneNumber.endsWith('@g.us')) {
        phoneNumber = msg.key.participant;
    }
    const users = loadUserDB();
    users.push({ phone: phoneNumber, name: name });
    saveUserDB(users);
    console.log(`User registered: ${name} (${phoneNumber})`);
}

// Fetch the user's name by phone number
function getUserName(phoneNumber, msg) {
    if (phoneNumber.endsWith('@g.us')) {
        phoneNumber = msg.key.participant;
        console.log(`Get a message from group: ${phoneNumber}`);
    }
    const users = loadUserDB();
    const user = users.find(user => user.phone === phoneNumber);
    return user ? user.name : null; // Return the name if found, otherwise return null
}

async function startSocket() {
    // Manage WhatsApp login state
    const { state, saveCreds } = await useMultiFileAuthState('./auth_info'); // Use your desired auth folder

    // Create WhatsApp connection
    sock = makeWASocket({
        auth: state,
        printQRInTerminal: true, // Print QR in terminal
    });

    // Handle connection updates
    sock.ev.on('connection.update', async (update) => {
        const { connection, qr, lastDisconnect } = update;

        // Display QR code in terminal and on the web
        if (qr) {
            // Use QRCode.toString for terminal output
            console.log('Scan the QR code in the terminal or from the web.');
            const terminalQR = await qrcode.toString(qr, { type: 'terminal' });
            console.log(terminalQR);

            // Render QR code on the web
            const qrCodeDataURL = await qrcode.toDataURL(qr);
            app.get('/', (req, res) => {
                res.send(`<img src="${qrCodeDataURL}" alt="QR Code for WhatsApp login" />`);
            });
        }

        // Handle connection closure and retry if not logged out
        if (connection === 'close') {
            const error = lastDisconnect?.error;
            if (Boom.isBoom(error)) {
                // Retry if disconnected but not logged out
                if (error.output.statusCode !== DisconnectReason.loggedOut) {
                    console.log('Reconnecting...');
                    startSocket(); // Attempt to reconnect
                } else {
                    console.log('Logged out from WhatsApp');
                }
            }
        }

        // Confirm successful connection
        if (connection === 'open') {
            console.log('Connected to WhatsApp');
        }
    });

    // Save the session credentials
    sock.ev.on('creds.update', saveCreds);

    // Listen for new messages
    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];

        // Ensure the message is not from the bot itself and is not a system message
        if (!msg.message || msg.key.fromMe) return;

        let senderNumber = msg.key.remoteJid;  // This is either a group or an individual

        // Extract the message text, supporting both conversation and extendedTextMessage
        const messageText = msg.message.conversation || msg.message.extendedTextMessage?.text || "";

        // Check if the message is empty (some messages might be media, so ignore them)
        if (!messageText) return;

        // Check if the user is registered
        if (!isUserRegistered(senderNumber, msg)) {
            // If the message starts with ".daftar", register the user
            if (messageText.startsWith('.daftar ')) {
                const name = messageText.slice(8).trim(); // Extract everything after ".daftar " and remove any extra spaces
                if (name) {
                    registerUser(senderNumber, name, msg);
                    const buttonMessage = {
                        text: `
Thank you for registering, *${name}*! ✨✨✨
\n\n▬▭▬▭▬▭▬▭▬▭▬▭▬
To access the menu, type \`.menu\``,
                    }
                    await sock.sendMessage(senderNumber, buttonMessage, { quoted: msg });
                } else {
                    await sock.sendMessage(senderNumber, { text: "Please provide your name like this: `.daftar <your name>`" }, { quoted: msg });
                }
            } else if (messageText.startsWith('.')) {
                // If user is not registered and sends any other message, prompt them to register
                await sock.sendMessage(senderNumber, { text: "You need to register first by typing: `.daftar <your name>`" }, { quoted: msg });
            }
        } else {
            // If user is already registered, proceed with other commands
            if (messageText === '.bajra') {
                const response = { text: "Hello I'm Bajra!" };
                await sock.sendMessage(senderNumber, response, { quoted: msg });
            } 
            if (messageText === '.admin') {
                const userName = getUserName(senderNumber, msg)
                const response = { text: `
┌─ Halo *${userName}!* Terima kasih telah menggunakan Bajra! ✨✨✨
┆
├─ ❖ *Kontak Admin*: 
┆     https://wa.link/3jsq3u
├─ ❖ *Tentang Admin*: 
┆     https://s.id/aboutMra
┣─────────────┈ 
┆ • Jangan Chat Yang Aneh Aneh
┆ • Jangan Telpon/Call Admin 
┆ • Chat Langsung ke intinya aja
┆ • Klo Ada Uang Minimal Bagi
└────────────┈ ⳹` };
                await sock.sendMessage(senderNumber, response, { quoted: msg });
            } 
            if (messageText === '.exomedia') {
                const response = { text: `
❏━━『 *EXOMEDIA* 』━━
┣•○⊱ ExoMedia™ berisi seluruh dokumentasi foto dan video termasuk Drama Arena dan Panggung Gembira
┆
┣•○⊱ Link 1: 
┆    https://genexo.id/exomedia
┣•○⊱ Link 2:
┆    https://s.id/exomedia
┗━═┅═━━━๑
    ©BAJRA ✨` };
                await sock.sendMessage(senderNumber, response, { quoted: msg });
            }
            //-----------------------------IG Start----------------------------------
            if (messageText === '.ig') {
                const response = { text: `
❏━━『 *INSTAGRAM EXTRAORDINARY* 』━━
┣•○⊱ Instagram Resmi Extraordinary Generation
┆
┣•○⊱ Link:
┆    https://instagram.com/extraordinary.generation
┆
┣•○⊱ \`.ig pondok\` 
┆    Instagram Extraordinary pondok lainnya
┣•○⊱ \`.ig konsul\` 
┆    Instagram Extraordinary Konsulat
┣•○⊱ \`.ig ln\` 
┆    Instagram Extraordinary Luar Negeri
┣•○⊱ \`.ig verde\` 
┆    Instagram Verde Extraordinary
┣•○⊱ \`.ig lain\` 
┆    Instagram Extraordinary lainnya
┗━═┅═━━━๑
    ©BAJRA ✨` };
                await sock.sendMessage(senderNumber, response, { quoted: msg });
            }
            if (messageText === '.ig pondok') {
                const response = { text: `
❏━━『 *INSTAGRAM EXTRAORDINARY* 』━━
┣•○⊱ Instagram Extraordinary Generation Pondok
┆
┣•○⊱ Gontor Pusat:
┆    https://instagram.com/extraordinary.generation
┣•○⊱ Gontor 2:
┆    https://instagram.com/extraordinary.generation2
┣•○⊱ Gontor 3:
┆    https://instagram.com/extraordinary.generation3
┣•○⊱ Gontor 4:
┆    https://instagram.com/extraordinary.generation4
┣•○⊱ Gontor 5:
┆    https://instagram.com/extraordinary.generation5
┆    https://instagram.com/extraordinary.g5
┣•○⊱ Gontor 6:
┆    https://instagram.com/extraordinary.generation6
┆    https://instagram.com/extrateacher_kendari
┣•○⊱ Gontor 7:
┆    https://instagram.com/extraordinary.generation7
┣•○⊱ Gontor 9:
┆    https://instagram.com/extraordinary.generation9
┣•○⊱ Gontor Putri 2:
┆    https://instagram.com/extraordinary.gp2
┣•○⊱ Gontor Putri 3:
┆    https://instagram.com/extraordinaryputri3
┣•○⊱ Gontor Putri 4:
┆    https://instagram.com/extraordinary696_gp4
┣•○⊱ Gontor Putri 5:
┆    https://instagram.com/extraordinary.kendarigp5_96
┣•○⊱ Gontor Putri 7:
┆    https://instagram.com/exop.7
┗━═┅═━━━๑
    ©BAJRA ✨` };
                await sock.sendMessage(senderNumber, response, { quoted: msg });
            }
            if (messageText === '.ig konsul') {
                const response = { text: `
❏━━『 *INSTAGRAM EXTRAORDINARY* 』━━
┣•○⊱ Instagram Extraordinary Generation Konsulat
┆
┣•○⊱ Yogyakarta:
┆    https://instagram.com/extra_yk
┣•○⊱ Priangan:
┆    https://instagram.com/seuri.96
┣•○⊱ Madiun:
┆    https://instagram.com/extraordinary.madiun
┣•○⊱ Aceh:
┆    https://instagram.com/extraordinary.atjeh
┣•○⊱ Riau:
┆    https://instagram.com/extraordinary.riau
┣•○⊱ Jambi:
┆    https://instagram.com/extraordinary.jambi
┣•○⊱ Cianjur:
┆    https://instagram.com/extraordinary.cianjur
┣•○⊱ Pati:
┆    https://instagram.com/extraordinary.pati
┣•○⊱ Semarang:
┆    https://instagram.com/extraordinary.semarang
┣•○⊱ Minang:
┆    https://instagram.com/extraordinary.minang
┣•○⊱ Dewata:
┆    https://instagram.com/extraordinary_dewata
┣•○⊱ Ponorogo:
┆    https://instagram.com/extraordinary_ponorogo
┣•○⊱ Banyumas:
┆    https://instagram.com/extra.banyumas
┣•○⊱ Patriot:
┆    https://instagram.com/extra.patriot
┣•○⊱ Kepulauan Riau:
┆    https://instagram.com/extra.kepri.id
┣•○⊱ Boster:
┆    https://instagram.com/extra.boster
┣•○⊱ Jakarta:
┆    https://instagram.com/extra.via
┣•○⊱ Chilo:
┆    https://instagram.com/extra.chilobest
┣•○⊱ Kediri:
┆    https://instagram.com/extra_kediri
┣•○⊱ Malang:
┆    https://instagram.com/extra_malang
┣•○⊱ Surabaya:
┆    https://instagram.com/extrasoerabaja
┣•○⊱ Kendari:
┆    https://instagram.com/extrakendari
┣•○⊱ Bogor:
┆    https://instagram.com/extrazorg_
┣•○⊱ Lampung:
┆    https://instagram.com/lampung_extraordinary
┣•○⊱ Cimk:
┆    https://instagram.com/cimk.exo
┣•○⊱ Kalimantan Selatan:
┆    https://instagram.com/exo_kalsel
┣•○⊱ Banten:
┆    https://instagram.com/urbandinary
┣•○⊱ Nyonk:
┆    https://instagram.com/nyonkexo_96
┣•○⊱ Sumsel:
┆    https://instagram.com/extrasumsel
┣•○⊱ Rafflesia:
┆    https://instagram.com/extra.rafflesia
┣•○⊱ Blate:
┆    https://instagram.com/extrablate_ordinary
┣•○⊱ Medan:
┆    https://instagram.com/horasdinary
┣•○⊱ Djoker:
┆    https://instagram.com/extraordinarydjoker96
┣•○⊱ Sulselbar:
┆    https://instagram.com/exo.sulselbar
┣•○⊱ ofc:
┆    https://instagram.com/expos.ofc
┣•○⊱ Kartonyono:
┆    https://instagram.com/extraordinary.kartonyono
┣•○⊱ Lombok:
┆    https://instagram.com/extraordinary_lombok
┣•○⊱ EA:
┆    https://instagram.com/extrarea_
┣•○⊱ Lembata:
┆    https://instagram.com/exolembata
┣•○⊱ Gresik:
┆    https://instagram.com/_gr.exo
┣•○⊱ Maladewa:
┆    https://instagram.com/maladewa_22
┣•○⊱ Sukabumi:
┆    https://instagram.com/extra.mochi
┗━═┅═━━━๑
    ©BAJRA ✨` };
                await sock.sendMessage(senderNumber, response, { quoted: msg });
            }
            if (messageText === '.ig ln') {
                const response = { text: `
❏━━『 *INSTAGRAM EXTRAORDINARY* 』━━
┣•○⊱ Instagram Extraordinary Generation Luar Negeri
┆
┣•○⊱ Extraordinary Mendunia:
┆    https://instagram.com/extraordinary.mendunia
┣•○⊱ Jordan:
┆    https://instagram.com/extrajordan.fams
┣•○⊱ Mesir:
┆    https://instagram.com/extra.masisir
┣•○⊱ Turki:
┆    https://instagram.com/extraordinary.turk
┣•○⊱ Pakistan:
┆    https://instagram.com/extra.pakistan
┣•○⊱ Uni Emirat Arab:
┆    https://instagram.com/extra.uae
┣•○⊱ Syehaam:
┆    https://instagram.com/syehaam.corp
┗━═┅═━━━๑
    ©BAJRA ✨` };
                await sock.sendMessage(senderNumber, response, { quoted: msg });
            }
            if (messageText === '.ig verde') {
                const response = { text: `
❏━━『 *INSTAGRAM EXTRAORDINARY* 』━━
┣•○⊱ Instagram Extraordinary Generation Verde
┆
┣•○⊱ Verde FC:
┆    https://instagram.com/verde__fc
┣•○⊱ VerdeLads:
┆    https://instagram.com/verdelads.official
┗━═┅═━━━๑
    ©BAJRA ✨` };
                await sock.sendMessage(senderNumber, response, { quoted: msg });
            }
            if (messageText === '.ig lain') {
                const response = { text: `
❏━━『 *INSTAGRAM EXTRAORDINARY* 』━━
┣•○⊱ Instagram Extraordinary Generation Lainnya
┆
┣•○⊱ OnAir:
┆    https://instagram.com/extra_onair
┣•○⊱ UIN SuKa:
┆    https://instagram.com/exo.uinsuka
┣•○⊱ UNNES:
┆    https://instagram.com/botolxo.nice
┣•○⊱ Art:
┆    https://instagram.com/art_insolite
┣•○⊱ Extraine:
┆    https://instagram.com/extraine.official
┣•○⊱ Tabassam Berbagi:
┆    https://instagram.com/tabassam96_
┗━═┅═━━━๑
    ©BAJRA ✨` };
                await sock.sendMessage(senderNumber, response, { quoted: msg });
            }
            //--------------------------IG END-------------------------------------- 
            if (messageText === '.yt') {
                const response = { text: `
❏━━『 *YOUTUBE PLAYLIST* 』━━
┣•○⊱ YouTube Playlist Extraordinary Generation
┆
┣•○⊱ Link:
┆    https://s.id/ExoYt
┗━═┅═━━━๑
    ©BAJRA ✨` };
                await sock.sendMessage(senderNumber, response, { quoted: msg });
            }
            if (messageText === '.spotify') {
                const response = { text: `
❏━━『 *SPOTIFY PLAYLIST* 』━━
┣•○⊱ Spotify Playlist Extraordinary Generation
┆
┣•○⊱ Link:
┆    https://s.id/ExoSpotify
┗━═┅═━━━๑
    ©BAJRA ✨` };
                await sock.sendMessage(senderNumber, response, { quoted: msg });
            }
            if (messageText === '.esvi') {
                const response = { text: `
❏━━『 *_EXTRASTORYVISUAL_* 』━━
┣•○⊱ Laman Resmi _ExtraStoryVisual_
┆
┣•○⊱ WhatsApp:
┆    https://s.id/esviWA
┣•○⊱ Telegram:
┆    https://t.me/exomedia696
┣•○⊱ Pinterest:
┆    https://id.pinterest.com/extraordinarygen
┗━═┅═━━━๑
    ©BAJRA ✨` };
                await sock.sendMessage(senderNumber, response, { quoted: msg });
            }
            if (messageText === '.desain') {
                const response = { text: `
❏━━『 *BAHAN DESAIN* 』━━
┣•○⊱ Bahan Desain Extraordinary
┆
┣•○⊱ Desain Exo:
┆    https://s.id/ExoDesain
┣•○⊱ Font Kiano:
┆    https://s.id/ExoKiano
┣•○⊱ Bendera Gontor:
┆    https://s.id/BenderaGontor
┣•○⊱ Second Phase:
┆    https://s.id/ExoSecondPhase
┣•○⊱ Third Phase:
┆    https://s.id/ExoThirdPhase
┗━═┅═━━━๑
    ©BAJRA ✨` };
                await sock.sendMessage(senderNumber, response, { quoted: msg });
            }
            if (messageText === '.bukukmi') {
                const response = { text: `
❏━━『 *BUKU KMI* 』━━
┣•○⊱ Kumpulan Buku-Buku KMI
┆
┣•○⊱ Link:
┆    https://s.id/BukuKMI
┗━═┅═━━━๑
    ©BAJRA ✨` };
                await sock.sendMessage(senderNumber, response, { quoted: msg });
            }
            if (messageText === '.teksmc') {
                const response = { text: `
❏━━『 *TEKS MC* 』━━
┣•○⊱ Kumpulan Teks Master of Ceremony
┆
┣•○⊱ Link:
┆    https://s.id/teksMC
┗━═┅═━━━๑
    ©BAJRA ✨` };
                await sock.sendMessage(senderNumber, response, { quoted: msg });
            }
            if (messageText === '.pki') {
                const response = { text: `
❏━━『 *FILM G30S/PKI* 』━━
┣•○⊱ Nonton Film G30S/PKI
┆
┣•○⊱ Link:
┆    https://s.id/g30sPKI
┗━═┅═━━━๑
    ©BAJRA ✨` };
                await sock.sendMessage(senderNumber, response, { quoted: msg });
            }
            if (messageText === '.lagulkbb') {
                const response = { text: `
❏━━『 *LAGU LKBB* 』━━
┣•○⊱ Lagu Ojrot untuk LKBB
┆
┣•○⊱ Link:
┆    https://s.id/LaguLKBB
┗━═┅═━━━๑
    ©BAJRA ✨` };
                await sock.sendMessage(senderNumber, response, { quoted: msg });
            }
            if (messageText === '.pengabdian') {
                const response = { text: `
❏━━『 *LAPORAN PENGABDIAN* 』━━
┣•○⊱ File Contoh Laporan Pengabdian
┆
┣•○⊱ Link:
┆    https://s.id/ExoPengabdian
┗━═┅═━━━๑
    ©BAJRA ✨` };
                await sock.sendMessage(senderNumber, response, { quoted: msg });
            }
            if (messageText === '.menu') {
                const response = { text: `
❏━━『 *LIST MENU BAJRA* 』━━
┣•○⊱ \`.bajra\` 
┆    Say hello
┣•○⊱ \`.exomedia\`  
┆    Seluruh Dokumentasi Foto dan Video
┣•○⊱ \`.ig\` 
┆    Instagram resmi Extraordinary
┣•○⊱ \`.yt\`  
┆    Playlist YouTube Extraordinary
┣•○⊱ \`.spotify\` 
┆    Playlist Spotify Extraordinary
┣•○⊱ \`.esvi\` 
┆    Link menuju _ExtraStoryVisual_
┣•○⊱ \`.desain\` 
┆    Kumpulan bahan desain Extraordinary
┣•○⊱ \`.bukukmi\` 
┆    Kumpulan buku kurikulum KMI
┣•○⊱ \`.teksmc\` 
┆    Kumpulan Teks MC
┣•○⊱ \`.pki\` 
┆    Nonton film G30S/PKI
┣•○⊱ \`.lagulkbb\` 
┆    Lagu Ojrot untuk LKBB
┣•○⊱ \`.pengabdian\` 
┆    File Laporan Pengabdian
┣•○⊱ \`.menu\` 
┆    Menampilkan menu
┣•○⊱ \`.daftar\` 
┆    Pendaftaran
┣•○⊱ \`.admin\` 
┆    Kontak admin
┗━═┅═━━━๑
    ©BAJRA ✨

*NOTE :*
•○⊱ _*Jangan Spam Chat!*_
•○⊱ _*Bikin ginian butuh Waktu, Ilmu, dan Duit!*_` };
                await sock.sendMessage(senderNumber, response, { quoted: msg });
            }
            if (messageText.includes('.daftar')) {
                const userName = getUserName(senderNumber, msg)
                if (userName) {
                    const response = { text: `
Hello *${userName}*! You have been registered ✨✨✨
\n\n▬▭▬▭▬▭▬▭▬▭▬▭▬
To access the menu, type \`.menu\`` };
                    await sock.sendMessage(senderNumber, response, { quoted: msg });
                }
                else {
                    const response = { text: "You need to register first by typing: `.daftar <your name>`" };
                    await sock.sendMessage(senderNumber, response, { quoted: msg });
                }
            }
        }
    });
}

startSocket();

// Start the express server
app.listen(port, () => {
console.log(`Server running at http://localhost:${port}`);
});