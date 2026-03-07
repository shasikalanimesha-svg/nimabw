const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

async function bytesToSize(bytes) {
	const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
	if (bytes === 0) return "n/a";
	const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)), 10);
	if (i === 0) return `${bytes} ${sizes[i]}`;
	return `${(bytes / 1024 ** i).toFixed(1)} ${sizes[i]}`;
}

const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));

function getVideoId(url) {
	return url.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([^&\n?#]+)/)?.[1] || null;
}

function run(cmd) {
	return new Promise((res, rej) => {
		exec(cmd, { maxBuffer: 1024 * 1024 * 200 }, (err, stdout, stderr) => {
			if (err) return rej(new Error(stderr || err.message));
			res(stdout.trim());
		});
	});
}

// ───────────────────────────────────────────
// API 1: Invidious (open source YT frontend - no bot check)
// ───────────────────────────────────────────
async function api_invidious(url, type = 'audio') {
	const videoId = getVideoId(url);
	if (!videoId) throw new Error('invidious: invalid url');

	const instances = [
		'https://invidious.nerdvpn.de',
		'https://inv.nadeko.net',
		'https://invidious.privacyredirect.com',
		'https://yt.artemislena.eu',
	];

	for (const instance of instances) {
		try {
			const res = await fetch(`${instance}/api/v1/videos/${videoId}`, {
				headers: { 'User-Agent': 'Mozilla/5.0' },
				signal: AbortSignal.timeout(8000)
			});
			if (!res.ok) continue;
			const data = await res.json();

			if (type === 'audio') {
				const audioFormats = (data.adaptiveFormats || [])
					.filter(f => f.type?.includes('audio'))
					.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
				if (audioFormats.length > 0 && audioFormats[0].url) {
					return audioFormats[0].url.replace(/^https:\/\/[^/]+/, instance);
				}
			} else {
				const videoFormats = (data.formatStreams || [])
					.filter(f => f.type?.includes('video/mp4'))
					.sort((a, b) => parseInt(b.resolution) - parseInt(a.resolution));
				if (videoFormats.length > 0 && videoFormats[0].url) {
					return videoFormats[0].url.replace(/^https:\/\/[^/]+/, instance);
				}
			}
		} catch (e) {
			continue;
		}
	}
	throw new Error('invidious: all instances failed');
}

// ───────────────────────────────────────────
// API 2: RapidAPI YouTube MP3 Downloader
// ───────────────────────────────────────────
async function api_rapidapi_mp3(videoId) {
	const res = await fetch(`https://youtube-mp3-download1.p.rapidapi.com/dl?id=${videoId}`, {
		headers: {
			'x-rapidapi-host': 'youtube-mp3-download1.p.rapidapi.com',
			'x-rapidapi-key': '3bde5a3ca1msh6a3c2e0e02d1fdap142e7bjsn8f5a2e0e3c4a'
		},
		signal: AbortSignal.timeout(30000)
	});
	const data = await res.json();
	if (data?.status === 'processing') {
		for (let i = 0; i < 10; i++) {
			await new Promise(r => setTimeout(r, 3000));
			const r2 = await fetch(`https://youtube-mp3-download1.p.rapidapi.com/dl?id=${videoId}`, {
				headers: {
					'x-rapidapi-host': 'youtube-mp3-download1.p.rapidapi.com',
					'x-rapidapi-key': '3bde5a3ca1msh6a3c2e0e02d1fdap142e7bjsn8f5a2e0e3c4a'
				}
			});
			const d2 = await r2.json();
			if (d2?.link) return d2.link;
		}
	}
	if (!data?.link) throw new Error(`rapidapi_mp3: ${JSON.stringify(data)}`);
	return data.link;
}

// ───────────────────────────────────────────
// API 3: yt-dlp with android client (best bot bypass 2025)
// ───────────────────────────────────────────
async function api_ytdlp_android(url, type = 'audio') {
	const flags = `--no-playlist --extractor-args "youtube:player_client=android,tv_embedded" --no-warnings`;
	const format = type === 'audio'
		? `-f "bestaudio[ext=m4a]/bestaudio" --get-url`
		: `-f "best[height<=480][ext=mp4]/best[height<=480]" --get-url`;

	const result = await run(`yt-dlp ${flags} ${format} "${url}"`);
	if (!result) throw new Error('yt-dlp android: no URL');
	return result.split('\n')[0];
}

// ───────────────────────────────────────────
// API 4: yt-dlp with ios client
// ───────────────────────────────────────────
async function api_ytdlp_ios(url, type = 'audio') {
	const flags = `--no-playlist --extractor-args "youtube:player_client=ios" --no-warnings`;
	const format = type === 'audio'
		? `-f "bestaudio" --get-url`
		: `-f "best[height<=360]" --get-url`;

	const result = await run(`yt-dlp ${flags} ${format} "${url}"`);
	if (!result) throw new Error('yt-dlp ios: no URL');
	return result.split('\n')[0];
}

// ───────────────────────────────────────────
// API 5: cnvmp3.com
// ───────────────────────────────────────────
async function api_cnvmp3(url) {
	const videoId = getVideoId(url);
	if (!videoId) throw new Error('cnvmp3: invalid url');

	const res = await fetch(`https://cnvmp3.com/api.php?url=https://www.youtube.com/watch?v=${videoId}&format=mp3&quality=128`, {
		headers: {
			'User-Agent': 'Mozilla/5.0',
			'Referer': 'https://cnvmp3.com/'
		},
		signal: AbortSignal.timeout(20000)
	});
	const data = await res.json();
	if (!data?.url) throw new Error('cnvmp3: no link');
	return data.url;
}

// ───────────────────────────────────────────
// API 6: ddownr.com
// ───────────────────────────────────────────
async function api_ddownr(url, type = 'mp3') {
	const videoId = getVideoId(url);
	if (!videoId) throw new Error('ddownr: invalid url');

	const res = await fetch(`https://ddownr.com/api/json?url=https://youtu.be/${videoId}&format=${type}`, {
		headers: {
			'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
			'Accept': 'application/json',
			'Referer': 'https://ddownr.com/'
		},
		signal: AbortSignal.timeout(15000)
	});
	const data = await res.json();
	const link = data?.url || data?.link || data?.download;
	if (!link) throw new Error(`ddownr: no link`);
	return link;
}

// ───────────────────────────────────────────
// YouTube info
// ───────────────────────────────────────────
async function getYtInfo(url) {
	try {
		const videoId = getVideoId(url);
		if (!videoId) return {};
		const res = await fetch(`https://www.youtube.com/oembed?url=https://youtu.be/${videoId}&format=json`);
		const data = await res.json();
		return {
			title: data.title || 'YouTube',
			channel: data.author_name || '',
			thumb: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
			uploadDate: ''
		};
	} catch {
		return { title: 'YouTube', channel: '', thumb: '', uploadDate: '' };
	}
}

// ───────────────────────────────────────────
// MAIN: ytMp3
// ───────────────────────────────────────────
async function ytMp3(url) {
	const videoId = getVideoId(url);
	if (!videoId) throw new Error('Invalid YouTube URL');

	const info = await getYtInfo(url);
	let dlUrl = null;

	const methods = [
		{ name: 'invidious', fn: () => api_invidious(url, 'audio') },
		{ name: 'rapidapi-mp3', fn: () => api_rapidapi_mp3(videoId) },
		{ name: 'yt-dlp (android)', fn: () => api_ytdlp_android(url, 'audio') },
		{ name: 'yt-dlp (ios)', fn: () => api_ytdlp_ios(url, 'audio') },
		{ name: 'cnvmp3', fn: () => api_cnvmp3(url) },
		{ name: 'ddownr', fn: () => api_ddownr(url, 'mp3') },
	];

	for (const method of methods) {
		try {
			console.log(`[ytMp3] Trying: ${method.name}`);
			dlUrl = await method.fn();
			if (dlUrl) { console.log(`[ytMp3] ✅ Success: ${method.name}`); break; }
		} catch (e) {
			console.log(`[ytMp3] ❌ ${method.name}: ${e.message}`);
		}
	}

	if (!dlUrl) throw new Error('සියලු download methods fail වුණා!');

	return {
		title: info.title || 'YouTube Audio',
		result: { url: dlUrl },
		size: 'Unknown',
		thumb: info.thumb || `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
		views: 0, likes: 0, dislike: 0,
		channel: info.channel || '',
		uploadDate: info.uploadDate || '',
		desc: ''
	};
}

// ───────────────────────────────────────────
// MAIN: ytMp4
// ───────────────────────────────────────────
async function ytMp4(url) {
	const videoId = getVideoId(url);
	if (!videoId) throw new Error('Invalid YouTube URL');

	const info = await getYtInfo(url);
	let dlUrl = null;

	const methods = [
		{ name: 'invidious', fn: () => api_invidious(url, 'video') },
		{ name: 'yt-dlp (android)', fn: () => api_ytdlp_android(url, 'video') },
		{ name: 'yt-dlp (ios)', fn: () => api_ytdlp_ios(url, 'video') },
		{ name: 'ddownr', fn: () => api_ddownr(url, 'mp4') },
	];

	for (const method of methods) {
		try {
			console.log(`[ytMp4] Trying: ${method.name}`);
			dlUrl = await method.fn();
			if (dlUrl) { console.log(`[ytMp4] ✅ Success: ${method.name}`); break; }
		} catch (e) {
			console.log(`[ytMp4] ❌ ${method.name}: ${e.message}`);
		}
	}

	if (!dlUrl) throw new Error('සියලු download methods fail වුණා!');

	return {
		title: info.title || 'YouTube Video',
		result: { url: dlUrl },
		size: 'Unknown',
		thumb: info.thumb || `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
		views: 0, likes: 0, dislike: 0,
		channel: info.channel || '',
		uploadDate: info.uploadDate || '',
		desc: ''
	};
}

module.exports = { ytMp4, ytMp3 };
