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

function run(cmd) {
	return new Promise((res, rej) => {
		exec(cmd, { maxBuffer: 1024 * 1024 * 200 }, (err, stdout, stderr) => {
			if (err) return rej(new Error(stderr || err.message));
			res(stdout.trim());
		});
	});
}

// yt-dlp තියෙනවාද බලන්න
async function ytdlpAvailable() {
	try {
		await run('yt-dlp --version');
		return true;
	} catch {
		return false;
	}
}

// Cobalt API (free, no key needed)
async function cobaltDownload(url, type = 'audio') {
	const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));
	const res = await fetch('https://api.cobalt.tools/api/json', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
		body: JSON.stringify({
			url,
			vCodec: 'h264',
			vQuality: '480',
			aFormat: 'mp3',
			isAudioOnly: type === 'audio',
			disableMetadata: false
		})
	});
	const data = await res.json();
	if (data.status === 'stream' || data.status === 'redirect') return data.url;
	if (data.status === 'picker') return data.picker?.[0]?.url;
	throw new Error('Cobalt: ' + (data.text || 'failed'));
}

// YouTube info via yt-dlp
async function getYtInfo(url) {
	try {
		const YT_FLAGS = `--no-playlist --extractor-args "youtube:player_client=tv_embedded"`;
		const infoRaw = await run(`yt-dlp --dump-json ${YT_FLAGS} "${url}"`);
		return JSON.parse(infoRaw);
	} catch {
		return { title: 'YouTube Audio', uploader: '', thumbnail: '' };
	}
}

const YT_FLAGS = `--no-playlist --extractor-args "youtube:player_client=tv_embedded"`;

async function ytMp3(url) {
	return new Promise(async (resolve, reject) => {
		// Method 1: yt-dlp (fastest, best quality)
		if (await ytdlpAvailable()) {
			try {
				const tempDir = './database/temp';
				if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
				const outBase = path.join(tempDir, `audio_${Date.now()}`);

				const infoRaw = await run(`yt-dlp --dump-json ${YT_FLAGS} "${url}"`);
				const info = JSON.parse(infoRaw);

				await run(`yt-dlp -x --audio-format mp3 --audio-quality 0 ${YT_FLAGS} -o "${outBase}.%(ext)s" "${url}"`);

				const files = fs.readdirSync(tempDir).filter(f => f.startsWith(path.basename(outBase)));
				if (!files.length) throw new Error('File not found after download');

				const filePath = path.join(tempDir, files[0]);
				const result = fs.readFileSync(filePath);
				const size = await bytesToSize(result.length);
				fs.unlinkSync(filePath);

				return resolve({
					title: info.title || 'Unknown',
					result, size,
					thumb: info.thumbnail || '',
					views: info.view_count || 0,
					likes: info.like_count || 0,
					dislike: 0,
					channel: info.uploader || info.channel || 'Unknown',
					uploadDate: info.upload_date || '',
					desc: info.description || ''
				});
			} catch (e) {
				console.log('[ytMp3] yt-dlp failed:', e.message, '- trying fallback...');
			}
		}

		// Method 2: Cobalt API
		try {
			const dlUrl = await cobaltDownload(url, 'audio');
			const info = await getYtInfo(url);
			return resolve({
				title: info.title || 'YouTube Audio',
				result: { url: dlUrl },
				size: 'Unknown',
				thumb: info.thumbnail || '',
				views: info.view_count || 0,
				likes: info.like_count || 0,
				dislike: 0,
				channel: info.uploader || info.channel || '',
				uploadDate: info.upload_date || '',
				desc: ''
			});
		} catch (e) {
			console.log('[ytMp3] Cobalt failed:', e.message);
		}

		// Method 3: y2api
		try {
			const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));
			const videoId = url.match(/(?:v=|youtu\.be\/)([^&\n?#]+)/)?.[1];
			if (!videoId) throw new Error('Cannot parse video ID');
			const res = await fetch(`https://yt-api.p.rapidapi.com/dl?id=${videoId}`, {
				headers: {
					'X-RapidAPI-Key': 'SIGN-UP-FOR-KEY',
					'X-RapidAPI-Host': 'yt-api.p.rapidapi.com'
				}
			});
			const data = await res.json();
			const audioFormat = data.formats?.find(f => f.mimeType?.includes('audio'));
			if (!audioFormat?.url) throw new Error('No audio format found');
			return resolve({
				title: data.title || 'YouTube Audio',
				result: { url: audioFormat.url },
				size: 'Unknown',
				thumb: data.thumbnail?.[0]?.url || '',
				views: 0, likes: 0, dislike: 0,
				channel: data.channelTitle || '',
				uploadDate: '', desc: ''
			});
		} catch (e) {
			console.log('[ytMp3] y2api failed:', e.message);
		}

		reject(new Error('සියලු download methods fail වුණා!'));
	});
}

async function ytMp4(url) {
	return new Promise(async (resolve, reject) => {
		// Method 1: yt-dlp
		if (await ytdlpAvailable()) {
			try {
				const tempDir = './database/temp';
				if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
				const outBase = path.join(tempDir, `video_${Date.now()}`);

				const infoRaw = await run(`yt-dlp --dump-json ${YT_FLAGS} "${url}"`);
				const info = JSON.parse(infoRaw);

				await run(`yt-dlp -f "best[height<=480]/best" ${YT_FLAGS} -o "${outBase}.%(ext)s" "${url}"`);

				const files = fs.readdirSync(tempDir).filter(f => f.startsWith(path.basename(outBase)));
				if (!files.length) throw new Error('File not found after download');

				const filePath = path.join(tempDir, files[0]);
				const result = fs.readFileSync(filePath);
				const size = await bytesToSize(result.length);
				fs.unlinkSync(filePath);

				return resolve({
					title: info.title || 'Unknown',
					result, size,
					thumb: info.thumbnail || '',
					views: info.view_count || 0,
					likes: info.like_count || 0,
					dislike: 0,
					channel: info.uploader || info.channel || 'Unknown',
					uploadDate: info.upload_date || '',
					desc: info.description || ''
				});
			} catch (e) {
				console.log('[ytMp4] yt-dlp failed:', e.message, '- trying fallback...');
			}
		}

		// Method 2: Cobalt API
		try {
			const dlUrl = await cobaltDownload(url, 'video');
			const info = await getYtInfo(url);
			return resolve({
				title: info.title || 'YouTube Video',
				result: { url: dlUrl },
				size: 'Unknown',
				thumb: info.thumbnail || '',
				views: info.view_count || 0,
				likes: info.like_count || 0,
				dislike: 0,
				channel: info.uploader || info.channel || '',
				uploadDate: info.upload_date || '',
				desc: ''
			});
		} catch (e) {
			console.log('[ytMp4] Cobalt failed:', e.message);
		}

		reject(new Error('සියලු download methods fail වුණා!'));
	});
}

module.exports = { ytMp4, ytMp3 };

// TEST
if (require.main === module) {
	console.log('Testing ytMp3...');
	ytMp3('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
		.then(r => console.log('SUCCESS:', r.title, '|', r.size))
		.catch(e => console.error('ERROR:', e.message));
}
