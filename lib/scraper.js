const fs = require('fs');
const path = require('path');
const ytdl = require('ytdl-core');

async function bytesToSize(bytes) {
	const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
	if (bytes === 0) return "n/a";
	const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)), 10);
	if (i === 0) return `${bytes} ${sizes[i]}`;
	return `${(bytes / 1024 ** i).toFixed(1)} ${sizes[i]}`;
}

// ytdl agent - bypass YouTube bot detection
const agent = ytdl.createAgent();

async function ytMp4(url) {
	return new Promise(async (resolve, reject) => {
		try {
			const outputPath = path.join('./database/temp', `output_${Date.now()}.mp4`);

			const info = await ytdl.getInfo(url, { agent });
			const title = info.videoDetails.title || 'Unknown';
			const thumb = info.videoDetails.thumbnails?.slice(-1)[0]?.url || '';
			const channel = info.videoDetails.author?.name || 'Unknown';
			const views = info.videoDetails.viewCount || 0;
			const uploadDate = info.videoDetails.uploadDate || '';
			const desc = info.videoDetails.description || '';

			// Best video+audio format under 480p
			let format;
			try {
				format = ytdl.chooseFormat(info.formats, {
					quality: 'highestvideo',
					filter: f => f.hasVideo && f.hasAudio && f.height <= 480
				});
			} catch {
				format = ytdl.chooseFormat(info.formats, { quality: 'lowest', filter: 'videoandaudio' });
			}

			const writeStream = fs.createWriteStream(outputPath);
			ytdl.downloadFromInfo(info, { format, agent }).pipe(writeStream);

			writeStream.on('finish', async () => {
				const result = fs.readFileSync(outputPath);
				const size = await bytesToSize(result.length);
				await fs.promises.unlink(outputPath).catch(() => {});
				resolve({ title, result, size, thumb, views, likes: 0, dislike: 0, channel, uploadDate, desc });
			});
			writeStream.on('error', reject);
		} catch (e) {
			reject(e);
		}
	});
}

async function ytMp3(url) {
	return new Promise(async (resolve, reject) => {
		try {
			const info = await ytdl.getInfo(url, { agent });
			const title = info.videoDetails.title || 'Unknown';
			const thumb = info.videoDetails.thumbnails?.slice(-1)[0]?.url || '';
			const channel = info.videoDetails.author?.name || 'Unknown';
			const views = info.videoDetails.viewCount || 0;
			const uploadDate = info.videoDetails.uploadDate || '';
			const desc = info.videoDetails.description || '';

			// Best audio-only format
			const format = ytdl.chooseFormat(info.formats, { quality: 'highestaudio', filter: 'audioonly' });

			const chunks = [];
			const stream = ytdl.downloadFromInfo(info, { format, agent });
			stream.on('data', chunk => chunks.push(chunk));
			stream.on('end', async () => {
				const result = Buffer.concat(chunks);
				const size = await bytesToSize(result.length);
				resolve({ title, result, size, thumb, views, likes: 0, dislike: 0, channel, uploadDate, desc });
			});
			stream.on('error', reject);
		} catch (e) {
			reject(e);
		}
	});
}

module.exports = { ytMp4, ytMp3 }
