const express = require('express');
const { createServer } = require('http');

const app = express();
const server = createServer(app);
const PORT = process.env.PORT || process.env.SERVER_PORT || 3000;
const packageInfo = require('../package.json');

app.all('/', (req, res) => {
	if (process.send) {
		process.send('uptime');
		process.once('message', (uptime) => {
			res.json({
				bot_name: packageInfo.name,
				version: packageInfo.version,
				author: packageInfo.author,
				description: packageInfo.description,
				uptime: `${Math.floor(uptime)} තත්පර`
			});
		});
	} else res.json({ error: 'ක්‍රියාවලිය (Process) IPC සමඟ ධාවනය නොවේ' });
});

app.all('/process', (req, res) => {
	const { send } = req.query;
	if (!send) return res.status(400).json({ error: 'යොමු කිරීමට අවශ්‍ය විමසුම (query) ඇතුළත් කර නැත' });
	if (process.send) {
		process.send(send)
		res.json({ status: 'යවන ලදී (Sent)', data: send });
	} else res.json({ error: 'ක්‍රියාවලිය (Process) IPC සමඟ ධාවනය නොවේ' });
});

app.all('/chat', (req, res) => {
	const { message, to } = req.query;
	if (!message || !to) return res.status(400).json({ error: 'පණිවිඩය හෝ යොමු කළ යුතු ලිපිනය ඇතුළත් කර නැත' });
	res.json({ status: 200, mess: 'තවමත් ආරම්භ වී නොමැත' })
});

module.exports = { app, server, PORT };
