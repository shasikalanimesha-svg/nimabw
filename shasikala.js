const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { exec } = require('child_process');

const statusEmojis = ['❤️', '😍', '🤩', '😘', '🥰', '🤭', '😊', '💕', '✨'];
const messageStore = new Map();
const TEMP_MEDIA_DIR = path.join(__dirname, './database/temp');

if (!fs.existsSync(TEMP_MEDIA_DIR)) {
    fs.mkdirSync(TEMP_MEDIA_DIR, { recursive: true });
}

const getRandomEmoji = () => statusEmojis[Math.floor(Math.random() * statusEmojis.length)];

// ═══════════════════════════════════════════════════════════
// 🎵 සිතුවම් DOWNLOADER පද්ධතිය (Embedded)
// ═══════════════════════════════════════════════════════════

class MusicDownloader {
    constructor() {
        this.tempDir = TEMP_MEDIA_DIR;
        this.timeout = 120000;
    }

    async downloadYouTube(input) {
        const methods = [
            {
                name: 'yt-dlp',
                cmd: () => `yt-dlp -x --audio-format mp3 --audio-quality 0 "${input}" -o "${this.tempDir}/%(title)s.%(ext)s"`
            },
            {
                name: 'yt-dlp (android)',
                cmd: () => `yt-dlp -x --audio-format mp3 --extractor-args "youtube:player_client=android" "${input}" -o "${this.tempDir}/%(title)s.%(ext)s"`
            },
            {
                name: 'yt-dlp (web_creator)',
                cmd: () => `yt-dlp -x --audio-format mp3 --extractor-args "youtube:player_client=web_creator" "${input}" -o "${this.tempDir}/%(title)s.%(ext)s"`
            },
            {
                name: 'youtube-dl',
                cmd: () => `youtube-dl -x --audio-format mp3 --audio-quality 0 "${input}" -o "${this.tempDir}/%(title)s.%(ext)s"`
            },
            {
                name: 'ytdl-core',
                cmd: () => this._ytdlCore(input)
            },
            {
                name: 'play-dl',
                cmd: () => this._playDl(input)
            }
        ];

        return this._tryMethods(methods);
    }

    async downloadSpotify(url) {
        const methods = [
            {
                name: 'spotifydl',
                cmd: () => `spotifydl "${url}" --output "${this.tempDir}/%(title)s.%(ext)s"`
            },
            {
                name: 'play-dl (spotify)',
                cmd: () => this._playDl(url)
            },
            {
                name: 'youtube-fallback',
                cmd: async () => {
                    const name = await this._getSpotifyName(url);
                    if (name) {
                        const result = await this.searchAndDownload(name);
                        return result;
                    }
                    throw new Error('ට්‍රැක නාමය ලබා ගැනීම අසාර්ථකයි');
                }
            }
        ];

        return this._tryMethods(methods);
    }

    async downloadSoundCloud(url) {
        const methods = [
            {
                name: 'yt-dlp (soundcloud)',
                cmd: () => `yt-dlp -x --audio-format mp3 "${url}" -o "${this.tempDir}/%(title)s.%(ext)s"`
            },
            {
                name: 'youtube-dl (soundcloud)',
                cmd: () => `youtube-dl -x --audio-format mp3 "${url}" -o "${this.tempDir}/%(title)s.%(ext)s"`
            }
        ];

        return this._tryMethods(methods);
    }

    async searchAndDownload(query) {
        try {
            const YtSearch = require('yt-search');
            const result = await YtSearch(query);
            
            if (result?.videos?.[0]) {
                const url = `https://www.youtube.com/watch?v=${result.videos[0].videoId}`;
                return this.downloadYouTube(url);
            }
            throw new Error('YouTube ප්‍රතිඵල හමු නොවිණි');
        } catch (err) {
            throw err;
        }
    }

    async downloadByUrl(url) {
        if (url.includes('youtube.com') || url.includes('youtu.be')) {
            return this.downloadYouTube(url);
        } else if (url.includes('spotify.com')) {
            return this.downloadSpotify(url);
        } else if (url.includes('soundcloud.com')) {
            return this.downloadSoundCloud(url);
        } else {
            return this.downloadYouTube(url);
        }
    }

    async _ytdlCore(url) {
        return new Promise((resolve, reject) => {
            try {
                const ytdl = require('@distube/ytdl-core');
                const ffmpeg = require('fluent-ffmpeg');
                
                ytdl.getInfo(url, { requestOptions: { headers: { 'User-Agent': 'Mozilla/5.0' } } })
                    .then(info => {
                        const stream = ytdl.downloadFromInfo(info, { quality: 'highestaudio' });
                        const audioPath = path.join(this.tempDir, `${Date.now()}.mp3`);
                        
                        ffmpeg(stream)
                            .audioBitrate(128)
                            .format('mp3')
                            .save(audioPath)
                            .on('end', () => {
                                if (fs.existsSync(audioPath)) resolve(audioPath);
                                else reject(new Error('ගොනුව සිතුවම් නොවිණි'));
                            })
                            .on('error', reject);
                    })
                    .catch(reject);
            } catch (err) {
                reject(err);
            }
        });
    }

    async _playDl(url) {
        return new Promise((resolve, reject) => {
            try {
                const play = require('play-dl');
                play.stream(url)
                    .then(stream => {
                        const audioPath = path.join(this.tempDir, `${Date.now()}.mp3`);
                        const file = fs.createWriteStream(audioPath);
                        
                        stream.pipe(file);
                        file.on('finish', () => {
                            if (fs.existsSync(audioPath)) resolve(audioPath);
                            else reject(new Error('ගොනුව සිතුවම් නොවිණි'));
                        });
                        file.on('error', reject);
                    })
                    .catch(reject);
            } catch (err) {
                reject(err);
            }
        });
    }

    async _getSpotifyName(url) {
        try {
            const response = await axios.get(url, {
                headers: { 'User-Agent': 'Mozilla/5.0' },
                timeout: 5000
            });
            const match = response.data.match(/<meta property="og:title" content="([^"]+)"/);
            return match ? match[1] : null;
        } catch (err) {
            return null;
        }
    }

    async _tryMethods(methods) {
        const attempts = [];
        
        for (const method of methods) {
            try {
                let cmd = typeof method.cmd === 'function' ? await method.cmd() : method.cmd;
                
                // ගොනුවට පෙර දෙන්නට
                if (typeof cmd === 'string' && cmd.startsWith('/')) {
                    if (fs.existsSync(cmd)) {
                        return { success: true, method: method.name, filePath: cmd, fileName: path.basename(cmd) };
                    }
                    attempts.push({ method: method.name, success: false });
                    continue;
                }

                if (typeof cmd === 'string') {
                    await this._exec(cmd);
                }
                
                const files = fs.readdirSync(this.tempDir);
                const audioFile = files.find(f => f.endsWith('.mp3') || f.endsWith('.m4a') || f.endsWith('.wav'));
                
                if (audioFile) {
                    const filePath = path.join(this.tempDir, audioFile);
                    return { success: true, method: method.name, filePath, fileName: audioFile };
                }
                
                attempts.push({ method: method.name, success: false });
            } catch (err) {
                attempts.push({ method: method.name, success: false, error: err.message });
            }
        }

        return { success: false, error: 'සියලුම ක්‍රම අසාර්ථකයි', attempts };
    }

    _exec(cmd) {
        return new Promise((resolve, reject) => {
            exec(cmd, {
                maxBuffer: 1024 * 1024 * 500,
                timeout: this.timeout,
                shell: '/bin/bash'
            }, (err, stdout) => {
                if (err) reject(err);
                else resolve(stdout);
            });
        });
    }

    cleanTemp() {
        try {
            const files = fs.readdirSync(this.tempDir);
            let size = 0;
            for (const file of files) {
                const stat = fs.statSync(path.join(this.tempDir, file));
                size += stat.size;
            }
            if (size > 100 * 1024 * 1024) {
                for (const file of files) {
                    fs.unlinkSync(path.join(this.tempDir, file));
                }
            }
        } catch (err) {
            console.error('පිරිසිදු කිරීමේ දෝෂය:', err);
        }
    }
}

const musicDownloader = new MusicDownloader();

// ═══════════════════════════════════════════════════════════
// පණිවිඩ STORE FUNCTION
// ═══════════════════════════════════════════════════════════

async function storeMessage(message) {
    try {
        if (!message.key?.id) return;

        const messageId = message.key.id;
        let content = '';
        let mediaType = '';
        let mediaPath = '';
        const sender = message.key.participant || message.key.remoteJid;

        if (message.message?.conversation) {
            content = message.message.conversation;
        } else if (message.message?.extendedTextMessage?.text) {
            content = message.message.extendedTextMessage.text;
        }

        messageStore.set(messageId, {
            content,
            mediaType,
            mediaPath,
            sender,
            group: message.key.remoteJid.endsWith('@g.us') ? message.key.remoteJid : null,
            timestamp: new Date().toISOString()
        });
    } catch (err) {
        console.error('පණිවිඩ store දෝෂය:', err);
    }
}

// ═══════════════════════════════════════════════════════════
// ප්‍රධාන MODULE
// ═══════════════════════════════════════════════════════════

module.exports = shasikala = async (nimesha, m, msg, store) => {
    try {
        const botNumber = nimesha.decodeJid(nimesha.user.id);
        const isOwner = [botNumber.split('@')[0], ...global.owner]
            .map(v => v.replace(/[^0-9]/g, '') + '@s.whatsapp.net')
            .includes(m.sender);

        const set = global.db?.set?.[botNumber] || {};
        const botFooter = global.db?.set?.[botNumber]?.botname
            ? `> 🌸 *${global.db.set[botNumber].botname}* [BOT]✨`
            : global.mess?.footer || '> 🌸 *MISS SHASIKALA* [BOT]✨ | 👑 _නිමේශ මධුශන් විසින් සිතුවම්විය_ _';

        // 🎵 .song command
        if (m.command === 'song' && m.text) {
            try {
                const songInput = m.text.trim();
                
                const searchingMsg = `🔍 𝑺𝑶𝑬𝑻𝑼𝑾𝑰𝑵𝑰𝑵...
━━━━━━━━━━━━━━━━━━━━━━
🎵 *සිතුවම්:* ${songInput}
⏳ *ඉතිරි:* සොයමින් පවතී...
━━━━━━━━━━━━━━━━━━━━━━
${botFooter}`;

                let statusMsg = await nimesha.sendMessage(m.chat, { text: searchingMsg }, { quoted: m });

                const downloadingMsg = `⬇️ 𝑩𝑨𝑮𝑨𝑵𝑰𝑴𝑰𝑵...
━━━━━━━━━━━━━━━━━━━━━━
🎵 *සිතුවම්:* ${songInput}
⏳ *ඉතිරි:* බාගනිමින් පවතී...
━━━━━━━━━━━━━━━━━━━━━━
${botFooter}`;

                await nimesha.sendMessage(m.chat, { text: downloadingMsg }, { quoted: statusMsg })
                    .then(msg => statusMsg = msg);

                const downloadResult = await musicDownloader.searchAndDownload(songInput);

                if (!downloadResult.success) {
                    const failMsg = `❌ 𝑫𝑶𝑺𝑨𝒀𝑨
━━━━━━━━━━━━━━━━━━━━━━
*සිතුවම්:* ${songInput}
*දෝෂය:* බා ගැනීම අසාර්ථකයි

උත්සාහ:
${downloadResult.attempts.map((a, i) => `${i + 1}. ${a.method} ${a.success ? '✅' : '❌'}`).join('\n')}
━━━━━━━━━━━━━━━━━━━━━━
${botFooter}`;

                    await nimesha.sendMessage(m.chat, { text: failMsg }, { quoted: statusMsg });
                    return;
                }

                const audioBuffer = fs.readFileSync(downloadResult.filePath);
                
                await nimesha.sendMessage(m.chat, {
                    audio: audioBuffer,
                    mimetype: 'audio/mpeg',
                    ptt: false,
                    fileName: `${songInput.substring(0, 30)}.mp3`
                }, { quoted: m });

                const successMsg = `✅ 𝑺𝑨𝑹𝑻𝑯𝑰𝑲𝑾𝑰
━━━━━━━━━━━━━━━━━━━━━━
🎵 *සිතුවම්:* ${songInput}
🔧 *ක්‍රම:* ${downloadResult.method}
━━━━━━━━━━━━━━━━━━━━━━
${botFooter}`;

                await nimesha.sendMessage(m.chat, { text: successMsg }, { quoted: statusMsg });

                try {
                    fs.unlinkSync(downloadResult.filePath);
                } catch (e) {}

            } catch (songErr) {
                console.error('සිතුවම් දෝෂය:', songErr);
                const errorMsg = `⚠️ දෝෂය: ${songErr.message}\n${botFooter}`;
                await nimesha.sendMessage(m.chat, { text: errorMsg }, { quoted: m });
            }
        }

        // 🎧 .spotify command
        else if (m.command === 'spotify' && m.text) {
            try {
                const spotifyUrl = m.text.trim();

                const searchingMsg = `🔍 𝑺𝑷𝑶𝑻𝑰𝑭𝒀 ලබා ගනිමින්...
━━━━━━━━━━━━━━━━━━━━━━
🎵 *URL:* ${spotifyUrl}
━━━━━━━━━━━━━━━━━━━━━━
${botFooter}`;

                let statusMsg = await nimesha.sendMessage(m.chat, { text: searchingMsg }, { quoted: m });

                const downloadResult = await musicDownloader.downloadSpotify(spotifyUrl);

                if (!downloadResult.success) {
                    const failMsg = `❌ දෝෂය\n${botFooter}`;
                    await nimesha.sendMessage(m.chat, { text: failMsg }, { quoted: statusMsg });
                    return;
                }

                const audioBuffer = fs.readFileSync(downloadResult.filePath);
                
                await nimesha.sendMessage(m.chat, {
                    audio: audioBuffer,
                    mimetype: 'audio/mpeg',
                    ptt: false,
                    fileName: `spotify_song.mp3`
                }, { quoted: m });

                const successMsg = `✅ *Spotify සිතුවම එවනු ලැබිණි*\n${botFooter}`;
                await nimesha.sendMessage(m.chat, { text: successMsg }, { quoted: statusMsg });

                try {
                    fs.unlinkSync(downloadResult.filePath);
                } catch (e) {}

            } catch (err) {
                await nimesha.sendMessage(m.chat, { text: `⚠️ දෝෂය: ${err.message}\n${botFooter}` }, { quoted: m });
            }
        }

        // 🔊 .soundcloud command
        else if (m.command === 'soundcloud' && m.text) {
            try {
                const scUrl = m.text.trim();

                const searchingMsg = `🔍 𝑺𝑶𝑼𝑵𝑫𝑪𝑳𝑶𝑼𝑫 ලබා ගනිමින්...
━━━━━━━━━━━━━━━━━━━━━━
🔊 *URL:* ${scUrl}
━━━━━━━━━━━━━━━━━━━━━━
${botFooter}`;

                let statusMsg = await nimesha.sendMessage(m.chat, { text: searchingMsg }, { quoted: m });

                const downloadResult = await musicDownloader.downloadSoundCloud(scUrl);

                if (!downloadResult.success) {
                    const failMsg = `❌ දෝෂය\n${botFooter}`;
                    await nimesha.sendMessage(m.chat, { text: failMsg }, { quoted: statusMsg });
                    return;
                }

                const audioBuffer = fs.readFileSync(downloadResult.filePath);
                
                await nimesha.sendMessage(m.chat, {
                    audio: audioBuffer,
                    mimetype: 'audio/mpeg',
                    ptt: false,
                    fileName: `soundcloud_track.mp3`
                }, { quoted: m });

                const successMsg = `✅ *SoundCloud සිතුවම එවනු ලැබිණි*\n${botFooter}`;
                await nimesha.sendMessage(m.chat, { text: successMsg }, { quoted: statusMsg });

                try {
                    fs.unlinkSync(downloadResult.filePath);
                } catch (e) {}

            } catch (err) {
                await nimesha.sendMessage(m.chat, { text: `⚠️ දෝෂය: ${err.message}\n${botFooter}` }, { quoted: m });
            }
        }

        // 🎬 .play command
        else if (m.command === 'play' && m.text) {
            try {
                const input = m.text.trim();

                const searchingMsg = `🎵 𝑮𝑨𝑨𝑰𝑵𝑰𝑲 සිතුවම සොයමින්...
━━━━━━━━━━━━━━━━━━━━━━
📝 *ඉල්ලුම්:* ${input}
━━━━━━━━━━━━━━━━━━━━━━
${botFooter}`;

                let statusMsg = await nimesha.sendMessage(m.chat, { text: searchingMsg }, { quoted: m });

                let downloadResult;
                if (input.match(/https?:\/\//)) {
                    downloadResult = await musicDownloader.downloadByUrl(input);
                } else {
                    downloadResult = await musicDownloader.searchAndDownload(input);
                }

                if (!downloadResult.success) {
                    const failMsg = `❌ දෝෂය\n${botFooter}`;
                    await nimesha.sendMessage(m.chat, { text: failMsg }, { quoted: statusMsg });
                    return;
                }

                const audioBuffer = fs.readFileSync(downloadResult.filePath);
                
                await nimesha.sendMessage(m.chat, {
                    audio: audioBuffer,
                    mimetype: 'audio/mpeg',
                    ptt: false,
                    fileName: `${input.substring(0, 30)}.mp3`
                }, { quoted: m });

                const successMsg = `✅ *සිතුවම එවනු ලැබිණි*\n${botFooter}`;
                await nimesha.sendMessage(m.chat, { text: successMsg }, { quoted: statusMsg });

                try {
                    fs.unlinkSync(downloadResult.filePath);
                } catch (e) {}

            } catch (err) {
                await nimesha.sendMessage(m.chat, { text: `⚠️ දෝෂය: ${err.message}\n${botFooter}` }, { quoted: m });
            }
        }

        // 🟢 AUTO STATUS HANDLER
        if (m.messages && Object.values(m.messages).some(msg => msg?.message?.statusMessage)) {
            try {
                const botNumber = nimesha.decodeJid(nimesha.user.id);
                const set = global.db?.set?.[botNumber] || {};

                if (set.autostatus) {
                    for (const message of Object.values(m.messages)) {
                        if (message?.message?.statusMessage) {
                            const statusSender = message.key.participant || message.key.remoteJid;
                            const emoji = getRandomEmoji();

                            try {
                                await nimesha.sendMessage(statusSender, {
                                    react: { text: emoji, key: message.key }
                                }).catch(() => {});

                                console.log(`❤️ AutoStatus - @${statusSender.split('@')[0]} ට ${emoji}`);
                            } catch (e) {
                                console.log('AutoStatus ප්‍රතිකර්ම දෝෂය:', e.message);
                            }
                        }
                    }
                }
            } catch (e) {
                console.log('AutoStatus handler දෝෂය:', e.message);
            }
        }

        if (m.message && m.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
            try {
                await storeMessage(m);
            } catch (e) {
                console.error('පණිවිඩ store දෝෂය:', e);
            }
        }

        if (Math.random() < 0.1) {
            musicDownloader.cleanTemp();
        }

    } catch (e) {
        console.error('ප්‍රධාන දෝෂය:', e);
    }
};
