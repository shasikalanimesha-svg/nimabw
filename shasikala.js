const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { exec, execSync } = require('child_process');

const statusEmojis = ['❤️', '😍', '🤩', '😘', '🥰', '🤭', '😊', '💕', '✨'];
const messageStore = new Map();
const TEMP_MEDIA_DIR = path.join(__dirname, './database/temp');

if (!fs.existsSync(TEMP_MEDIA_DIR)) {
    fs.mkdirSync(TEMP_MEDIA_DIR, { recursive: true });
}

const getRandomEmoji = () => statusEmojis[Math.floor(Math.random() * statusEmojis.length)];

class MusicDownloader {
    constructor() {
        this.tempDir = TEMP_MEDIA_DIR;
        this.timeout = 120000;
    }

    async downloadMp3(input) {
        const methods = [
            // yt-dlp Methods (1-8)
            {
                name: 'yt-dlp (default)',
                cmd: () => `yt-dlp -x --audio-format mp3 --audio-quality 0 "${input}" -o "${this.tempDir}/%(title)s.%(ext)s" 2>/dev/null`
            },
            {
                name: 'yt-dlp (android)',
                cmd: () => `yt-dlp -x --audio-format mp3 --extractor-args "youtube:player_client=android" "${input}" -o "${this.tempDir}/%(title)s.%(ext)s" 2>/dev/null`
            },
            {
                name: 'yt-dlp (web)',
                cmd: () => `yt-dlp -x --audio-format mp3 --extractor-args "youtube:player_client=web" "${input}" -o "${this.tempDir}/%(title)s.%(ext)s" 2>/dev/null`
            },
            {
                name: 'yt-dlp (web_creator)',
                cmd: () => `yt-dlp -x --audio-format mp3 --extractor-args "youtube:player_client=web_creator" "${input}" -o "${this.tempDir}/%(title)s.%(ext)s" 2>/dev/null`
            },
            {
                name: 'yt-dlp (mweb)',
                cmd: () => `yt-dlp -x --audio-format mp3 --extractor-args "youtube:player_client=mweb" "${input}" -o "${this.tempDir}/%(title)s.%(ext)s" 2>/dev/null`
            },
            {
                name: 'yt-dlp (tv)',
                cmd: () => `yt-dlp -x --audio-format mp3 --extractor-args "youtube:player_client=tv" "${input}" -o "${this.tempDir}/%(title)s.%(ext)s" 2>/dev/null`
            },
            {
                name: 'yt-dlp (ios)',
                cmd: () => `yt-dlp -x --audio-format mp3 --extractor-args "youtube:player_client=ios" "${input}" -o "${this.tempDir}/%(title)s.%(ext)s" 2>/dev/null`
            },
            {
                name: 'yt-dlp (vr)',
                cmd: () => `yt-dlp -x --audio-format mp3 --extractor-args "youtube:player_client=vr" "${input}" -o "${this.tempDir}/%(title)s.%(ext)s" 2>/dev/null`
            },

            // youtube-dl Methods (9-14)
            {
                name: 'youtube-dl',
                cmd: () => `youtube-dl -x --audio-format mp3 --audio-quality 0 "${input}" -o "${this.tempDir}/%(title)s.%(ext)s" 2>/dev/null`
            },
            {
                name: 'youtube-dl (legacy)',
                cmd: () => `youtube-dl -x --audio-format mp3 "${input}" -o "${this.tempDir}/%(title)s.%(ext)s" 2>/dev/null`
            },
            {
                name: 'youtube-dl-nocookie',
                cmd: () => `youtube-dl --no-cookie -x --audio-format mp3 "${input}" -o "${this.tempDir}/%(title)s.%(ext)s" 2>/dev/null`
            },
            {
                name: 'yt-dlp (best)',
                cmd: () => `yt-dlp -f bestaudio -x --audio-format mp3 "${input}" -o "${this.tempDir}/%(title)s.%(ext)s" 2>/dev/null`
            },
            {
                name: 'yt-dlp (m4a->mp3)',
                cmd: () => `yt-dlp -x --audio-format mp3 --audio-quality 192 "${input}" -o "${this.tempDir}/%(title)s.%(ext)s" 2>/dev/null`
            },
            {
                name: 'yt-dlp (opus->mp3)',
                cmd: () => `yt-dlp -x --audio-format mp3 "${input}" -o "${this.tempDir}/%(title)s.%(ext)s" 2>/dev/null && ffmpeg -i "${this.tempDir}/"*.opus -q:a 0 -map a "${this.tempDir}/%(title)s.mp3" 2>/dev/null`
            },

            // ytdl-core Methods (15-18)
            {
                name: 'ytdl-core',
                cmd: () => this._ytdlCore(input)
            },
            {
                name: 'ytdl-core (low-quality)',
                cmd: () => this._ytdlCoreLQ(input)
            },
            {
                name: 'ytdl-core (high-quality)',
                cmd: () => this._ytdlCoreHQ(input)
            },
            {
                name: 'ytdl-core (opus)',
                cmd: () => this._ytdlCoreOpus(input)
            },

            // play-dl Methods (19-22)
            {
                name: 'play-dl',
                cmd: () => this._playDl(input)
            },
            {
                name: 'play-dl (youtube)',
                cmd: () => this._playDlYouTube(input)
            },
            {
                name: 'play-dl (soundcloud)',
                cmd: () => this._playDlSoundCloud(input)
            },
            {
                name: 'play-dl (spotify)',
                cmd: () => this._playDlSpotify(input)
            },

            // ffmpeg Methods (23-26)
            {
                name: 'ffmpeg (direct)',
                cmd: () => `ffmpeg -i "${input}" -q:a 0 -map a "${this.tempDir}/audio_${Date.now()}.mp3" 2>/dev/null`
            },
            {
                name: 'ffmpeg (libmp3lame)',
                cmd: () => `ffmpeg -i "${input}" -codec:a libmp3lame -b:a 192k "${this.tempDir}/audio_${Date.now()}.mp3" 2>/dev/null`
            },
            {
                name: 'ffmpeg (aac->mp3)',
                cmd: () => `ffmpeg -i "${input}" -acodec libmp3lame -ab 192k "${this.tempDir}/audio_${Date.now()}.mp3" 2>/dev/null`
            },
            {
                name: 'ffmpeg (batch)',
                cmd: () => `ffmpeg -i "${input}" -f mp3 -ab 192000 -ar 44100 -ac 2 "${this.tempDir}/audio_${Date.now()}.mp3" 2>/dev/null`
            },

            // curl/wget Methods (27-30)
            {
                name: 'curl (direct)',
                cmd: () => `curl -L "${input}" | ffmpeg -i pipe: -q:a 0 -map a "${this.tempDir}/audio_${Date.now()}.mp3" 2>/dev/null`
            },
            {
                name: 'wget (direct)',
                cmd: () => `wget -q -O - "${input}" | ffmpeg -i pipe: -q:a 0 -map a "${this.tempDir}/audio_${Date.now()}.mp3" 2>/dev/null`
            },
            {
                name: 'aria2c (direct)',
                cmd: () => `aria2c -d "${this.tempDir}" -o "audio_${Date.now()}.mp3" "${input}" 2>/dev/null`
            },
            {
                name: 'sox (audio convert)',
                cmd: () => `sox "${input}" -c 2 -r 44100 "${this.tempDir}/audio_${Date.now()}.mp3" 2>/dev/null`
            }
        ];

        return this._tryMethods(methods);
    }

    async _ytdlCore(url) {
        return new Promise((resolve, reject) => {
            try {
                const ytdl = require('@distube/ytdl-core');
                const ffmpeg = require('fluent-ffmpeg');
                
                ytdl.getInfo(url, { requestOptions: { headers: { 'User-Agent': 'Mozilla/5.0' } } })
                    .then(info => {
                        const stream = ytdl.downloadFromInfo(info, { quality: 'highestaudio' });
                        const audioPath = path.join(this.tempDir, `audio_${Date.now()}.mp3`);
                        
                        ffmpeg(stream)
                            .audioBitrate(128)
                            .format('mp3')
                            .save(audioPath)
                            .on('end', () => {
                                if (fs.existsSync(audioPath)) resolve(audioPath);
                                else reject(new Error('File not created'));
                            })
                            .on('error', reject);
                    })
                    .catch(reject);
            } catch (err) {
                reject(err);
            }
        });
    }

    async _ytdlCoreLQ(url) {
        return new Promise((resolve, reject) => {
            try {
                const ytdl = require('@distube/ytdl-core');
                const ffmpeg = require('fluent-ffmpeg');
                
                ytdl.getInfo(url, { requestOptions: { headers: { 'User-Agent': 'Mozilla/5.0' } } })
                    .then(info => {
                        const stream = ytdl.downloadFromInfo(info, { quality: 'lowestaudio' });
                        const audioPath = path.join(this.tempDir, `audio_${Date.now()}.mp3`);
                        
                        ffmpeg(stream)
                            .audioBitrate(64)
                            .format('mp3')
                            .save(audioPath)
                            .on('end', () => {
                                if (fs.existsSync(audioPath)) resolve(audioPath);
                                else reject(new Error('File not created'));
                            })
                            .on('error', reject);
                    })
                    .catch(reject);
            } catch (err) {
                reject(err);
            }
        });
    }

    async _ytdlCoreHQ(url) {
        return new Promise((resolve, reject) => {
            try {
                const ytdl = require('@distube/ytdl-core');
                const ffmpeg = require('fluent-ffmpeg');
                
                ytdl.getInfo(url, { requestOptions: { headers: { 'User-Agent': 'Mozilla/5.0' } } })
                    .then(info => {
                        const stream = ytdl.downloadFromInfo(info, { quality: 'highestaudio' });
                        const audioPath = path.join(this.tempDir, `audio_${Date.now()}.mp3`);
                        
                        ffmpeg(stream)
                            .audioBitrate(320)
                            .format('mp3')
                            .save(audioPath)
                            .on('end', () => {
                                if (fs.existsSync(audioPath)) resolve(audioPath);
                                else reject(new Error('File not created'));
                            })
                            .on('error', reject);
                    })
                    .catch(reject);
            } catch (err) {
                reject(err);
            }
        });
    }

    async _ytdlCoreOpus(url) {
        return new Promise((resolve, reject) => {
            try {
                const ytdl = require('@distube/ytdl-core');
                const ffmpeg = require('fluent-ffmpeg');
                
                ytdl.getInfo(url, { requestOptions: { headers: { 'User-Agent': 'Mozilla/5.0' } } })
                    .then(info => {
                        const stream = ytdl.downloadFromInfo(info, { quality: 'highestaudio' });
                        const audioPath = path.join(this.tempDir, `audio_${Date.now()}.mp3`);
                        
                        ffmpeg(stream)
                            .audioCodec('libmp3lame')
                            .format('mp3')
                            .save(audioPath)
                            .on('end', () => {
                                if (fs.existsSync(audioPath)) resolve(audioPath);
                                else reject(new Error('File not created'));
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
                        const audioPath = path.join(this.tempDir, `audio_${Date.now()}.mp3`);
                        const file = fs.createWriteStream(audioPath);
                        
                        stream.pipe(file);
                        file.on('finish', () => {
                            if (fs.existsSync(audioPath)) resolve(audioPath);
                            else reject(new Error('File not created'));
                        });
                        file.on('error', reject);
                    })
                    .catch(reject);
            } catch (err) {
                reject(err);
            }
        });
    }

    async _playDlYouTube(url) {
        return new Promise((resolve, reject) => {
            try {
                const play = require('play-dl');
                play.stream(url, { discordPlayerCompatibility: true })
                    .then(stream => {
                        const audioPath = path.join(this.tempDir, `audio_${Date.now()}.mp3`);
                        const file = fs.createWriteStream(audioPath);
                        
                        stream.pipe(file);
                        file.on('finish', () => {
                            if (fs.existsSync(audioPath)) resolve(audioPath);
                            else reject(new Error('File not created'));
                        });
                        file.on('error', reject);
                    })
                    .catch(reject);
            } catch (err) {
                reject(err);
            }
        });
    }

    async _playDlSoundCloud(url) {
        return new Promise((resolve, reject) => {
            try {
                const play = require('play-dl');
                play.soundcloud(url)
                    .then(async data => {
                        const stream = await data.stream();
                        const audioPath = path.join(this.tempDir, `audio_${Date.now()}.mp3`);
                        const file = fs.createWriteStream(audioPath);
                        
                        stream.pipe(file);
                        file.on('finish', () => {
                            if (fs.existsSync(audioPath)) resolve(audioPath);
                            else reject(new Error('File not created'));
                        });
                        file.on('error', reject);
                    })
                    .catch(reject);
            } catch (err) {
                reject(err);
            }
        });
    }

    async _playDlSpotify(url) {
        return new Promise((resolve, reject) => {
            try {
                const play = require('play-dl');
                play.spotify(url)
                    .then(async data => {
                        const stream = await data.stream();
                        const audioPath = path.join(this.tempDir, `audio_${Date.now()}.mp3`);
                        const file = fs.createWriteStream(audioPath);
                        
                        stream.pipe(file);
                        file.on('finish', () => {
                            if (fs.existsSync(audioPath)) resolve(audioPath);
                            else reject(new Error('File not created'));
                        });
                        file.on('error', reject);
                    })
                    .catch(reject);
            } catch (err) {
                reject(err);
            }
        });
    }

    async searchAndDownload(query) {
        try {
            const YtSearch = require('yt-search');
            const result = await YtSearch(query);
            
            if (result && result.videos && result.videos.length > 0) {
                const url = `https://www.youtube.com/watch?v=${result.videos[0].videoId}`;
                return this.downloadMp3(url);
            }
            throw new Error('YouTube ප්‍රතිඵල හමු නොවිණි');
        } catch (err) {
            throw err;
        }
    }

    async downloadByUrl(url) {
        return this.downloadMp3(url);
    }

    async _tryMethods(methods) {
        const attempts = [];
        
        for (const method of methods) {
            try {
                let cmd = typeof method.cmd === 'function' ? await method.cmd() : method.cmd;
                
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

async function storeMessage(message) {
    try {
        if (!message.key?.id) return;

        const messageId = message.key.id;
        let content = '';
        const sender = message.key.participant || message.key.remoteJid;

        if (message.message?.conversation) {
            content = message.message.conversation;
        } else if (message.message?.extendedTextMessage?.text) {
            content = message.message.extendedTextMessage.text;
        }

        messageStore.set(messageId, {
            content,
            sender,
            group: message.key.remoteJid.endsWith('@g.us') ? message.key.remoteJid : null,
            timestamp: new Date().toISOString()
        });
    } catch (err) {
        console.error('පණිවිඩ store දෝෂය:', err);
    }
}

module.exports = shasikala = async (nimesha, m, msg, store) => {
    try {
        const botNumber = nimesha.decodeJid(nimesha.user.id);
        const set = global.db?.set?.[botNumber] || {};
        const botFooter = global.db?.set?.[botNumber]?.botname
            ? `> 🌸 *${global.db.set[botNumber].botname}* [BOT]✨`
            : global.mess?.footer || '> 🌸 *MISS SHASIKALA* [BOT]✨ | 👑 _නිමේශ මධුශන් විසින් සිතුවම්විය_ _';

        // mp3/song/play commands
        const commands = ['mp3', 'song', 'play'];
        
        for (const cmd of commands) {
            if (m.command === cmd && m.text) {
                try {
                    const input = m.text.trim();
                    
                    const searchingMsg = `🔍 𝑺𝑶𝑬𝑻𝑼𝑾𝑰𝑵𝑰𝑵...
━━━━━━━━━━━━━━━━━━━━━━
🎵 *ඉල්ලුම්:* ${input}
⏳ *ඉතිරි:* සොයමින් පවතී...
━━━━━━━━━━━━━━━━━━━━━━
${botFooter}`;

                    let statusMsg = await nimesha.sendMessage(m.chat, { text: searchingMsg }, { quoted: m });

                    const downloadingMsg = `⬇️ 𝑩𝑨𝑮𝑨𝑵𝑰𝑴𝑰𝑵...
━━━━━━━━━━━━━━━━━━━━━━
🎵 *ඉල්ලුම්:* ${input}
⏳ *ඉතිරි:* බාගනිමින් පවතී...
━━━━━━━━━━━━━━━━━━━━━━
${botFooter}`;

                    await nimesha.sendMessage(m.chat, { text: downloadingMsg }, { quoted: m, edit: statusMsg.key });

                    let downloadResult;
                    if (input.match(/https?:\/\//)) {
                        downloadResult = await musicDownloader.downloadByUrl(input);
                    } else {
                        downloadResult = await musicDownloader.searchAndDownload(input);
                    }

                    if (!downloadResult.success) {
                        const failMsg = `❌ 𝑫𝑶𝑺𝑨𝒀𝑨
━━━━━━━━━━━━━━━━━━━━━━
*ඉල්ලුම්:* ${input}
*දෝෂය:* ${downloadResult.error || 'බා ගැනීම අසාර්ථකයි'}
━━━━━━━━━━━━━━━━━━━━━━
${botFooter}`;

                        await nimesha.sendMessage(m.chat, { text: failMsg }, { quoted: m, edit: statusMsg.key });
                        return;
                    }

                    const audioBuffer = fs.readFileSync(downloadResult.filePath);
                    
                    const uploadingMsg = `⬆️ 𝑼𝑷𝑳𝑶𝑨𝑫𝑰𝑵𝑮...
━━━━━━━━━━━━━━━━━━━━━━
🎵 *ඉල්ලුම්:* ${input}
⏳ *ඉතිරි:* ලබාදෙමින් පවතී...
━━━━━━━━━━━━━━━━━━━━━━
${botFooter}`;

                    await nimesha.sendMessage(m.chat, { text: uploadingMsg }, { quoted: m, edit: statusMsg.key });

                    // Upload as voice/audio
                    await nimesha.sendMessage(m.chat, {
                        audio: audioBuffer,
                        mimetype: 'audio/mpeg',
                        ptt: false,
                        fileName: `${input.substring(0, 30)}.mp3`
                    }, { quoted: m });

                    const successMsg = `✅ 𝑺𝑨𝑹𝑻𝑯𝑰𝑲𝑾𝑰
━━━━━━━━━━━━━━━━━━━━━━
🎵 *ඉල්ලුම්:* ${input}
🔧 *ක්‍රම:* ${downloadResult.method}
━━━━━━━━━━━━━━━━━━━━━━
${botFooter}`;

                    await nimesha.sendMessage(m.chat, { text: successMsg }, { quoted: m, edit: statusMsg.key });

                    try {
                        fs.unlinkSync(downloadResult.filePath);
                    } catch (e) {}

                } catch (err) {
                    console.error('Download error:', err);
                    const errorMsg = `⚠️ දෝෂය: ${err.message}\n${botFooter}`;
                    await nimesha.sendMessage(m.chat, { text: errorMsg }, { quoted: m });
                }
                break;
            }
        }

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
                                console.log('AutoStatus error:', e.message);
                            }
                        }
                    }
                }
            } catch (e) {
                console.log('AutoStatus handler error:', e.message);
            }
        }

        if (m.message && m.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
            try {
                await storeMessage(m);
            } catch (e) {
                console.error('Message store error:', e);
            }
        }

        if (Math.random() < 0.1) {
            musicDownloader.cleanTemp();
        }

    } catch (e) {
        console.error('ප්‍රධාන දෝෂය:', e);
    }
};
