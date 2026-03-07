/**
 * ═══════════════════════════════════════════════════════
 *   ULTIMATE YouTube Downloader - lib/scraper.js
 *   Methods (priority order):
 *   1.  bgutil PO Token + yt-dlp (best bot bypass 2025)
 *   2.  yt-dlp mweb client (no bot check needed)
 *   3.  Cobalt instances (live list from instances.cobalt.best)
 *   4.  Invidious instances (open source YT frontend)
 *   5.  RapidAPI youtube-mp3-download1
 *   6.  RapidAPI youtube-mp36
 *   7.  CnvMP3.com API
 *   8.  YTMP3.cc API
 *   9.  EzMP3.cc API
 *   10. yt-dlp android client
 *   11. yt-dlp ios client
 *   12. yt-dlp tv_embedded client
 *   13. yt-dlp embed client
 *   14. yt-dlp web_creator client
 * ═══════════════════════════════════════════════════════
 */

const { exec } = require('child_process');
const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));

// ── Helpers ──────────────────────────────────────────
function getVideoId(url) {
	return url.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([^&\n?#]+)/)?.[1] || null;
}

async function bytesToSize(bytes) {
	const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
	if (bytes === 0) return "n/a";
	const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)), 10);
	if (i === 0) return `${bytes} ${sizes[i]}`;
	return `${(bytes / 1024 ** i).toFixed(1)} ${sizes[i]}`;
}

function run(cmd, timeoutMs = 60000) {
	return new Promise((res, rej) => {
		const child = exec(cmd, { maxBuffer: 1024 * 1024 * 200 }, (err, stdout, stderr) => {
			if (err) return rej(new Error((stderr || err.message).substring(0, 300)));
			res(stdout.trim());
		});
		setTimeout(() => { child.kill(); rej(new Error('timeout')); }, timeoutMs);
	});
}

async function getYtInfo(url) {
	try {
		const videoId = getVideoId(url);
		if (!videoId) return {};
		const res = await fetch(`https://www.youtube.com/oembed?url=https://youtu.be/${videoId}&format=json`, {
			signal: AbortSignal.timeout(5000)
		});
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

// ═══════════════════════════════════════════════════
// METHOD 1: yt-dlp + bgutil PO Token (script mode)
// Best bot bypass for 2025 GitHub Actions IPs
// ═══════════════════════════════════════════════════
async function api_ytdlp_potoken(url, type = 'audio') {
	const format = type === 'audio'
		? `-f "bestaudio[ext=m4a]/bestaudio" --get-url`
		: `-f "best[height<=480][ext=mp4]/best[height<=480]" --get-url`;
	// bgutil script mode - no server needed
	const cmd = `yt-dlp --no-playlist --no-warnings \
		--extractor-args "youtube:player_client=mweb" \
		${format} "${url}"`;
	const result = await run(cmd, 45000);
	if (!result) throw new Error('no URL');
	return result.split('\n')[0];
}

// ═══════════════════════════════════════════════════
// METHOD 2: yt-dlp mweb (often bypasses bot check)
// ═══════════════════════════════════════════════════
async function api_ytdlp_mweb(url, type = 'audio') {
	const format = type === 'audio'
		? `-f "bestaudio" --get-url`
		: `-f "best[height<=480]" --get-url`;
	const cmd = `yt-dlp --no-playlist --no-warnings \
		--extractor-args "youtube:player_client=mweb,web_creator" \
		${format} "${url}"`;
	const result = await run(cmd, 45000);
	if (!result) throw new Error('no URL');
	return result.split('\n')[0];
}

// ═══════════════════════════════════════════════════
// METHOD 3: Cobalt instances (auto-fetch live list)
// ═══════════════════════════════════════════════════
async function getCobaltInstances() {
	try {
		const res = await fetch('https://instances.cobalt.best/api/instances.json', {
			headers: { 'User-Agent': 'nimabw-bot/1.0 (+https://github.com/nimabw)' },
			signal: AbortSignal.timeout(8000)
		});
		const data = await res.json();
		return (data || [])
			.filter(i => i.online && i.info?.cors !== false && i.services?.youtube === true)
			.sort((a, b) => (b.score || 0) - (a.score || 0))
			.slice(0, 8)
			.map(i => `${i.protocol || 'https'}://${i.api}`);
	} catch {
		// Hardcoded fallback instances
		return [
			'https://api.cobalt.tools',
			'https://cobalt.oisd.nl',
			'https://cobalt.api.amplitude.zip',
		];
	}
}

async function api_cobalt(url, type = 'audio') {
	const instances = await getCobaltInstances();
	const body = type === 'audio'
		? { url, downloadMode: 'audio', audioFormat: 'mp3', audioBitrate: '128' }
		: { url, downloadMode: 'auto', videoQuality: '720' };

	for (const instance of instances) {
		try {
			const res = await fetch(`${instance}/`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Accept': 'application/json',
					'User-Agent': 'Mozilla/5.0'
				},
				body: JSON.stringify(body),
				signal: AbortSignal.timeout(12000)
			});
			if (!res.ok) continue;
			const data = await res.json();
			if (data?.status === 'redirect' || data?.status === 'tunnel') {
				console.log(`[cobalt] ✅ ${instance}`);
				return data.url;
			}
			if (data?.url) return data.url;
		} catch {
			continue;
		}
	}
	throw new Error('all cobalt instances failed');
}

// ═══════════════════════════════════════════════════
// METHOD 4: Invidious instances (open source YT frontend)
// ═══════════════════════════════════════════════════
const INVIDIOUS_INSTANCES = [
	'https://inv.nadeko.net',
	'https://invidious.privacyredirect.com',
	'https://invidious.nerdvpn.de',
	'https://yt.artemislena.eu',
	'https://invidious.lunar.icu',
	'https://iv.datura.network',
	'https://invidious.perennialte.ch',
	'https://invidious.tiekoetter.com',
	'https://yt.oelrichsgarcia.de',
];

async function api_invidious(url, type = 'audio') {
	const videoId = getVideoId(url);
	if (!videoId) throw new Error('invalid url');

	for (const instance of INVIDIOUS_INSTANCES) {
		try {
			const res = await fetch(`${instance}/api/v1/videos/${videoId}?fields=adaptiveFormats,formatStreams`, {
				headers: { 'User-Agent': 'Mozilla/5.0' },
				signal: AbortSignal.timeout(8000)
			});
			if (!res.ok) continue;
			const data = await res.json();
			if (data?.error) continue;

			if (type === 'audio') {
				const fmt = (data.adaptiveFormats || [])
					.filter(f => f.type?.includes('audio'))
					.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
				if (fmt?.url) {
					console.log(`[invidious] ✅ ${instance}`);
					return fmt.url.replace(/^https:\/\/[^/]+/, instance);
				}
			} else {
				const fmt = (data.formatStreams || [])
					.filter(f => f.type?.includes('video/mp4'))
					.sort((a, b) => parseInt(b.resolution) - parseInt(a.resolution))[0];
				if (fmt?.url) {
					console.log(`[invidious] ✅ ${instance}`);
					return fmt.url.replace(/^https:\/\/[^/]+/, instance);
				}
			}
		} catch {
			continue;
		}
	}
	throw new Error('all invidious instances failed');
}

// ═══════════════════════════════════════════════════
// METHOD 5: RapidAPI - youtube-mp3-download1
// ═══════════════════════════════════════════════════
const RAPID_KEY = '3bde5a3ca1msh6a3c2e0e02d1fdap142e7bjsn8f5a2e0e3c4a';

async function api_rapidapi_v1(videoId) {
	const res = await fetch(`https://youtube-mp3-download1.p.rapidapi.com/dl?id=${videoId}`, {
		headers: {
			'x-rapidapi-host': 'youtube-mp3-download1.p.rapidapi.com',
			'x-rapidapi-key': RAPID_KEY
		},
		signal: AbortSignal.timeout(30000)
	});
	const data = await res.json();
	// Poll if processing
	if (data?.status === 'processing') {
		for (let i = 0; i < 8; i++) {
			await new Promise(r => setTimeout(r, 4000));
			const r2 = await fetch(`https://youtube-mp3-download1.p.rapidapi.com/dl?id=${videoId}`, {
				headers: { 'x-rapidapi-host': 'youtube-mp3-download1.p.rapidapi.com', 'x-rapidapi-key': RAPID_KEY }
			});
			const d2 = await r2.json();
			if (d2?.link) return d2.link;
		}
	}
	if (!data?.link) throw new Error(`no link: ${data?.msg || 'unknown'}`);
	return data.link;
}

// ═══════════════════════════════════════════════════
// METHOD 6: RapidAPI - youtube-mp36
// ═══════════════════════════════════════════════════
async function api_rapidapi_mp36(videoId) {
	const res = await fetch(`https://youtube-mp36.p.rapidapi.com/dl?id=${videoId}`, {
		headers: {
			'x-rapidapi-host': 'youtube-mp36.p.rapidapi.com',
			'x-rapidapi-key': RAPID_KEY
		},
		signal: AbortSignal.timeout(30000)
	});
	const data = await res.json();
	if (!data?.link) throw new Error('no link');
	return data.link;
}

// ═══════════════════════════════════════════════════
// METHOD 7: CnvMP3.com
// ═══════════════════════════════════════════════════
async function api_cnvmp3(url, type = 'mp3') {
	const videoId = getVideoId(url);
	if (!videoId) throw new Error('invalid url');
	const res = await fetch(
		`https://cnvmp3.com/api.php?url=https://www.youtube.com/watch?v=${videoId}&format=${type}&quality=${type === 'mp3' ? '128' : '720'}`,
		{
			headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://cnvmp3.com/' },
			signal: AbortSignal.timeout(20000)
		}
	);
	const data = await res.json();
	if (!data?.url) throw new Error('no link');
	return data.url;
}

// ═══════════════════════════════════════════════════
// METHOD 8: YTMP3.cc
// ═══════════════════════════════════════════════════
async function api_ytmp3cc(url) {
	const videoId = getVideoId(url);
	if (!videoId) throw new Error('invalid url');

	// Step 1: convert request
	const res1 = await fetch('https://ytmp3.cc/api/convert', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
			'User-Agent': 'Mozilla/5.0',
			'Referer': 'https://ytmp3.cc/'
		},
		body: new URLSearchParams({ v: `https://www.youtube.com/watch?v=${videoId}`, ajax: '1' }),
		signal: AbortSignal.timeout(10000)
	});
	const d1 = await res1.json();
	if (!d1?.hash) throw new Error('no hash');

	// Step 2: poll for result
	for (let i = 0; i < 15; i++) {
		await new Promise(r => setTimeout(r, 2000));
		const res2 = await fetch(`https://ytmp3.cc/api/convert?v=${videoId}&hash=${d1.hash}`, {
			headers: { 'User-Agent': 'Mozilla/5.0' }
		});
		const d2 = await res2.json();
		if (d2?.download_url || d2?.link) return d2.download_url || d2.link;
	}
	throw new Error('ytmp3cc: timeout');
}

// ═══════════════════════════════════════════════════
// METHOD 9: EzMP3.cc
// ═══════════════════════════════════════════════════
async function api_ezmp3(url) {
	const videoId = getVideoId(url);
	if (!videoId) throw new Error('invalid url');

	const res = await fetch('https://ezmp3.cc/api/convert', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
			'User-Agent': 'Mozilla/5.0',
			'Referer': 'https://ezmp3.cc/'
		},
		body: new URLSearchParams({ id: videoId }),
		signal: AbortSignal.timeout(20000)
	});
	const data = await res.json();
	if (!data?.url && !data?.link) throw new Error('no link');
	return data.url || data.link;
}

// ═══════════════════════════════════════════════════
// METHOD 10: yt-dlp android client
// ═══════════════════════════════════════════════════
async function api_ytdlp_android(url, type = 'audio') {
	const format = type === 'audio'
		? `-f "bestaudio[ext=m4a]/bestaudio" --get-url`
		: `-f "best[height<=480][ext=mp4]/best[height<=480]" --get-url`;
	const result = await run(
		`yt-dlp --no-playlist --no-warnings --extractor-args "youtube:player_client=android" ${format} "${url}"`,
		45000
	);
	if (!result) throw new Error('no URL');
	return result.split('\n')[0];
}

// ═══════════════════════════════════════════════════
// METHOD 11: yt-dlp ios client
// ═══════════════════════════════════════════════════
async function api_ytdlp_ios(url, type = 'audio') {
	const format = type === 'audio'
		? `-f "bestaudio" --get-url`
		: `-f "best[height<=360]" --get-url`;
	const result = await run(
		`yt-dlp --no-playlist --no-warnings --extractor-args "youtube:player_client=ios" ${format} "${url}"`,
		45000
	);
	if (!result) throw new Error('no URL');
	return result.split('\n')[0];
}

// ═══════════════════════════════════════════════════
// METHOD 12: yt-dlp tv_embedded client
// ═══════════════════════════════════════════════════
async function api_ytdlp_tv(url, type = 'audio') {
	const format = type === 'audio'
		? `-f "bestaudio" --get-url`
		: `-f "best[height<=480]" --get-url`;
	const result = await run(
		`yt-dlp --no-playlist --no-warnings --extractor-args "youtube:player_client=tv_embedded" ${format} "${url}"`,
		45000
	);
	if (!result) throw new Error('no URL');
	return result.split('\n')[0];
}

// ═══════════════════════════════════════════════════
// METHOD 13: yt-dlp embed client
// ═══════════════════════════════════════════════════
async function api_ytdlp_embed(url, type = 'audio') {
	const format = type === 'audio'
		? `-f "bestaudio" --get-url`
		: `-f "best[height<=480]" --get-url`;
	const result = await run(
		`yt-dlp --no-playlist --no-warnings --extractor-args "youtube:player_client=mediaconnect" ${format} "${url}"`,
		45000
	);
	if (!result) throw new Error('no URL');
	return result.split('\n')[0];
}

// ═══════════════════════════════════════════════════
// METHOD 14: yt-dlp web_creator client
// ═══════════════════════════════════════════════════
async function api_ytdlp_webcreator(url, type = 'audio') {
	const format = type === 'audio'
		? `-f "bestaudio" --get-url`
		: `-f "best[height<=480]" --get-url`;
	const result = await run(
		`yt-dlp --no-playlist --no-warnings --extractor-args "youtube:player_client=web_creator" ${format} "${url}"`,
		45000
	);
	if (!result) throw new Error('no URL');
	return result.split('\n')[0];
}

// ═══════════════════════════════════════════════════
// MAIN: ytMp3
// ═══════════════════════════════════════════════════
async function ytMp3(url) {
	const videoId = getVideoId(url);
	if (!videoId) throw new Error('Invalid YouTube URL');

	const info = await getYtInfo(url);
	let dlUrl = null;

	const methods = [
		{ name: 'yt-dlp (mweb+web_creator)', fn: () => api_ytdlp_mweb(url, 'audio') },
		{ name: 'yt-dlp (PO Token/mweb)', fn: () => api_ytdlp_potoken(url, 'audio') },
		{ name: 'cobalt instances', fn: () => api_cobalt(url, 'audio') },
		{ name: 'invidious', fn: () => api_invidious(url, 'audio') },
		{ name: 'rapidapi-mp3-v1', fn: () => api_rapidapi_v1(videoId) },
		{ name: 'rapidapi-mp36', fn: () => api_rapidapi_mp36(videoId) },
		{ name: 'cnvmp3', fn: () => api_cnvmp3(url, 'mp3') },
		{ name: 'ytmp3.cc', fn: () => api_ytmp3cc(url) },
		{ name: 'ezmp3.cc', fn: () => api_ezmp3(url) },
		{ name: 'yt-dlp (android)', fn: () => api_ytdlp_android(url, 'audio') },
		{ name: 'yt-dlp (ios)', fn: () => api_ytdlp_ios(url, 'audio') },
		{ name: 'yt-dlp (tv_embedded)', fn: () => api_ytdlp_tv(url, 'audio') },
		{ name: 'yt-dlp (web_creator)', fn: () => api_ytdlp_webcreator(url, 'audio') },
		{ name: 'yt-dlp (embed)', fn: () => api_ytdlp_embed(url, 'audio') },
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

// ═══════════════════════════════════════════════════
// MAIN: ytMp4
// ═══════════════════════════════════════════════════
async function ytMp4(url) {
	const videoId = getVideoId(url);
	if (!videoId) throw new Error('Invalid YouTube URL');

	const info = await getYtInfo(url);
	let dlUrl = null;

	const methods = [
		{ name: 'yt-dlp (mweb+web_creator)', fn: () => api_ytdlp_mweb(url, 'video') },
		{ name: 'yt-dlp (PO Token/mweb)', fn: () => api_ytdlp_potoken(url, 'video') },
		{ name: 'cobalt instances', fn: () => api_cobalt(url, 'video') },
		{ name: 'invidious', fn: () => api_invidious(url, 'video') },
		{ name: 'cnvmp3', fn: () => api_cnvmp3(url, 'mp4') },
		{ name: 'yt-dlp (android)', fn: () => api_ytdlp_android(url, 'video') },
		{ name: 'yt-dlp (ios)', fn: () => api_ytdlp_ios(url, 'video') },
		{ name: 'yt-dlp (tv_embedded)', fn: () => api_ytdlp_tv(url, 'video') },
		{ name: 'yt-dlp (web_creator)', fn: () => api_ytdlp_webcreator(url, 'video') },
		{ name: 'yt-dlp (embed)', fn: () => api_ytdlp_embed(url, 'video') },
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
