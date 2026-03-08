const fs = require('fs');

const statusEmojis = ['😍', '🤩', '😘', '🥰', '🤭'];

const getRandomEmoji = () => statusEmojis[Math.floor(Math.random() * statusEmojis.length)];

module.exports = shasikala = async (nimesha, m, msg, store) => {
	try {
		const botNumber = nimesha.decodeJid(nimesha.user.id);
		const isOwner = [botNumber.split('@')[0], ...global.owner].map(v => v.replace(/[^0-9]/g) + '@s.whatsapp.net').includes(m.sender);
		
		const set = global.db?.set[botNumber] || {};
		
		if (m.type === 'statusUpdate' && set.autostatus) {
			try {
				const jid = Object.keys(m.messages)[0];
				const message = m.messages[jid];
				
				if (message.message?.imageMessage || message.message?.videoMessage || message.message?.audioMessage || message.message?.conversation) {
					await nimesha.readMessages([message.key]);
					const emoji = getRandomEmoji();
					
					await nimesha.sendMessage(jid, {
						react: { text: emoji, key: message.key }
					}).catch(() => {});
					
					await nimesha.sendMessage(botNumber, {
						text: `${emoji} ස්ටේටස් ස්වයංක්‍රීයවම like කරන ලදී\n\nයෝ: @${jid.split('@')[0]}\nEmoji: ${emoji}\n\n${global.mess.footer || '> 🌸 *Miss Shasikala* ✨'}`
					}).catch(() => {});
				}
			} catch (e) {
				console.log(e);
				await nimesha.sendMessage(botNumber, {
					text: `❌ ස්ටේටස් auto-like වල දෝෂයි: ${e.message}\n\n${global.mess.footer || '> 🌸 *Miss Shasikala* ✨'}`
				}).catch(() => {});
			}
		}
		
		if (m.message?.protocolMessage?.type === 0 || m.message?.protocolMessage?.type === 1) {
			try {
				if (set.antidelete) {
					const deletedMessage = m.message.protocolMessage;
					const originalJid = deletedMessage.key?.remoteJid || m.chat;
					const originalSender = deletedMessage.key?.fromMe ? botNumber : deletedMessage.key?.participant;
					const senderName = (await nimesha.getName(originalSender)) || originalSender.split('@')[0];
					
					if (originalSender && originalSender !== botNumber) {
						await nimesha.sendMessage(botNumber, {
							text: `🗑️ *පණිවිඩ මැකිණි*\n\n👤 පරිශීලක: @${originalSender.split('@')[0]}\n💬 තත්ත්වය: [මැකූ පණිවිඩ]\n⏰ වේලාව: ${new Date().toLocaleTimeString('si-LK')}\n📍 චැට්: ${originalJid}\n\n${global.mess.footer || '> 🌸 *Miss Shasikala* ✨'}`
						}).catch(() => {});
					}
				}
			} catch (e) {
				console.log(e);
			}
		}
		
	} catch (e) {
		console.log(e);
	}
};
