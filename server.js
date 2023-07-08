const debug = true;
require('console-stamp')(console);
const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
var lobbySystem = require('./lobbySystem');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

/// REPL
const repl = require('repl');
const r = repl.start({ prompt: '', useColors: true });
r.context.debug = debug;
r.context.server = server;
r.context.io = io;
r.context.lobbySystem = lobbySystem;
r.context.sock = [];
///

const port = 3000;
// lobbySystem.lobbyList = []

io.on('connection', (socket) => {
	if (debug) console.log('A user connected at ' + socket.handshake.address + " | " + socket.id);
	if (debug) r.context.sock[socket.id] = socket; /// REPL
	socket.emit('clientLobbyList', lobbySystem.getLobbyList());

	socket.on('serverRefreshLobby', async () => {
		if (debug) console.log("serverRefreshLobby");
		console.log(lobbySystem.getLobbyList());
		lobbySystem.fetchLobbies().then(updatedLobbies => {
			console.log(updatedLobbies);
			socket.emit('clientLobbyList', updatedLobbies);
		}).catch(e => reject(e));
		// io.emit('clientLobbyList', lobbySystem.getLobbyList());
	})
	socket.on('serverCreateLobby', async (lobbyName, username) => {
		if (debug) console.log("createLobby", lobbyName, username);
		if (socket.lobby) {
			socket.emit('clientPopup', {
				title: 'You are already in a lobby',
				icon: 'error',
				text: 'you can\'t join another :/',
				timer: 3000,
				timerProgressBar: true,
				confirmButtonText: 'Alright'
			});
			socket.emit('clientEdit', 'isInLobby', true);
			return;
		}
		try {
			const newLobby = await lobbySystem.createLobby(lobbyName, username, 4);
			joinLobby(newLobby._id, username);
		} catch (err) {
			console.error('Error creating lobby:', err);
		}
	});

	socket.on('serverJoinLobby', async (lobbyId, username) => {
		if (debug) console.log("serverJoinLobby");
		joinLobby(lobbyId, username);
	});
	async function joinLobby(lobbyId, username) {
		if (debug) console.log("server joinLobby function");
		socket.username = username.length > 0 ? username : socket.id; // to be changed
		if (socket.lobby) {
			socket.emit('clientPopup', {
				title: 'You are already in a lobby',
				icon: 'error',
				text: 'you can\'t join another :/',
				timer: 3000,
				timerProgressBar: true,
				confirmButtonText: 'Alright'
			});
			socket.emit('clientEdit', 'isInLobby', true);
			return;
		}
		try {
			const result = await lobbySystem.addUser(lobbyId, username, socket.id);
			socket.lobby = result;
			if (debug) console.log("socket.lobby", result);
			// if (debug) console.log("getLobbyList()", lobbySystem.getLobbyList());
			io.emit('clientLobbyList', lobbySystem.getLobbyList());
			socket.join(lobbyId);
			io.to(lobbyId).emit('clientUpdateLobby', result);
			socket.emit('clientJoinedLobby');
		} catch (err) {
			if (debug) console.log("joinLobbyError:", err);
			switch (err) {
				case "errorLobbyNotFound":
					return socket.emit('clientPopup', {
						title: 'Something\'s wrong...',
						icon: 'error',
						text: 'this lobby doesn\'t seem to exist anymore, sorry',
						confirmButtonText: 'OK'
					});
				case "errorLobbyFull":
					return socket.emit('clientPopup', {
						title: 'This lobby is full already.',
						icon: 'info',
						confirmButtonText: 'OK',
						timer: 3000,
						timerProgressBar: true
					});
				case "errorUsernameExists":
					socket.emit('clientEdit', 'isInLobby', false);
					return socket.emit('clientPopup', {
						title: 'Doopleganger?',
						icon: 'question',
						text: 'someone with the same username is already in the lobby...',
						confirmButtonText: 'OK'
					});
				default:
					return socket.emit('clientPopup', {
						title: 'Something unexpected happened.',
						icon: 'error',
						text: 'Report this to website administrator',
						confirmButtonText: 'OK'
					});
			}
		}
	}

	socket.on('serverLeaveLobby', async () => {
		if (debug) console.log("serverLeaveLobby");
		const lobby = await socket.lobby;
		if (!lobby) {
			await socket.emit('clientEdit', 'isInLobby', false);
			return socket.emit('clientLeaveLobby');
		}
		try {
			const result = await lobbySystem.removeUser(lobby._id, socket.username, socket.id);
			// if (debug) console.log("getLobbyList()", lobbySystem.getLobbyList());
			io.emit('clientLobbyList', lobbySystem.getLobbyList());
			await socket.leave(lobby._id);
			await socket.emit('clientLeaveLobby');
			await socket.emit('clientEdit', 'isInLobby', false);
			io.to(lobby._id).emit('clientUpdateLobby', result);
			delete socket.lobby;
		} catch (err) {
			console.error(err);
		}
	});

	socket.on('disconnect', () => {
		if (debug) console.log('A user disconnected at ' + socket.handshake.address + " | " + socket.id);
		if (socket.lobby) {
			const lobby = socket.lobby;
			lobbySystem.removeUser(lobby._id, socket.username, socket.id);
			console.log(lobbySystem.getLobbyList());
			io.emit('clientLobbyList', lobbySystem.getLobbyList());
			io.to(lobby._id).emit('clientUpdateLobby', lobby);
		}
	});
});

app.use(express.static('public'));

server.listen(port, () => {
	console.log(`Server is running on port ${port}`);
});
