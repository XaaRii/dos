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
var sockLobby = [];
// lobbySystem.lobbyList = []

io.on('connection', (socket) => {
	if (debug) console.log('A user connected at ' + socket.handshake.address + " | " + socket.id);
	if (debug) r.context.sock[socket.id] = socket; /// REPL
	socket.emit('clientLobbyList', lobbySystem.getLobbyList());

	socket.on('serverGameStart', async () => {
		if (debug) console.log("serverGameStart");
		const lobby = await sockLobby[socket.id];
		if (!lobby) {
			await socket.emit('clientEdit', 'isInLobby', false);
			return socket.emit('clientLeaveLobby');
		}

		try {
			let lobbyList = lobbySystem.getLobbyList();
			let realLobby = await lobbyList.find(l => l._id === lobby._id);
			if (!realLobby) return console.error("realLobby wasn't found on game start request");
			if (realLobby.started) return socket.emit('clientPopup', {
				title: 'Game is already running.',
				icon: 'info',
				confirmButtonText: 'OK'
			});
			if (socket.id !== realLobby.players[0].sid) return socket.emit('clientPopup', {
				title: 'You are not a lobby owner',
				icon: 'error',
				text: 'so stop acting like one',
				confirmButtonText: 'OK'
			});

			await lobbySystem.startGame(lobby._id);
					io.emit('clientLobbyList', lobbySystem.getLobbyList());
					io.to(lobby._id).emit('clientUpdateLobby', { started: true });
		} catch (err) {
			console.error(err);
		}

	})

	socket.on('serverRefreshLobby', async () => {
		if (debug) console.log("serverRefreshLobby");
		if (debug) console.log(lobbySystem.getLobbyList());
		socket.emit('clientLobbyList', lobbySystem.getLobbyList());
	})

	socket.on('serverCreateLobby', async (lobbyName, username) => {
		if (debug) console.log("createLobby", lobbyName, username);
		if (sockLobby[socket.id]) {
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
		if (sockLobby[socket.id]) {
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
			sockLobby[socket.id] = result;
			if (debug) console.log("sockLobby[socket.id]", result);
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

	socket.on('serverLeaveLobby', async (who) => {
		if (debug) console.log("serverLeaveLobby", who);
		const lobby = await sockLobby[socket.id];
		if (!lobby) {
			await socket.emit('clientEdit', 'isInLobby', false);
			return socket.emit('clientLeaveLobby');
		}
		const uname = who === undefined ? socket.username : who;
		try {
			if (who !== undefined) {
				let lobbyList = lobbySystem.getLobbyList();
				let realLobby = await lobbyList.find(l => l._id === lobby._id);
				if (!realLobby) return console.error("realLobby wasn't found on player kick");
				if (socket.id !== realLobby.players[0].sid) {
					return socket.emit('clientPopup', {
						title: 'You are not a lobby owner',
						icon: 'error',
						text: 'so stop acting like one',
						confirmButtonText: 'OK'
					});
				}
				let player = await realLobby.players.find(p => p.username === uname);
				if (player) {
					const result = await lobbySystem.removeUser(lobby._id, uname, player.sid);
					io.emit('clientLobbyList', lobbySystem.getLobbyList());
					await io.sockets.sockets.get(player.sid).leave(lobby._id);
					await io.to(player.sid).emit('clientLeaveLobby');
					await io.to(player.sid).emit('clientEdit', 'isInLobby', false);
					io.to(player.sid).emit('clientPopup', {
						title: 'You were kicked from the lobby',
						icon: 'info',
						confirmButtonText: 'OK'
					});
					io.to(lobby._id).emit('clientUpdateLobby', result);
					delete sockLobby[player.sid];
				}
				return;
			}
			const result = await lobbySystem.removeUser(lobby._id, uname, socket.id);
			// if (debug) console.log("getLobbyList()", lobbySystem.getLobbyList());
			io.emit('clientLobbyList', lobbySystem.getLobbyList());
			await socket.leave(lobby._id);
			await socket.emit('clientLeaveLobby');
			await socket.emit('clientEdit', 'isInLobby', false);
			io.to(lobby._id).emit('clientUpdateLobby', result);
			delete sockLobby[socket.id];
			return;
		} catch (err) {
			console.error(err);
		}
	});

	socket.on('disconnect', async () => {
		if (debug) console.log('A user disconnected at ' + socket.handshake.address + " | " + socket.id);
		if (sockLobby[socket.id]) {
			const lobby = sockLobby[socket.id];
			const result = await lobbySystem.removeUser(lobby._id, socket.username, socket.id);
			console.log(lobbySystem.getLobbyList());
			io.emit('clientLobbyList', lobbySystem.getLobbyList());
			await io.to(lobby._id).emit('clientUpdateLobby', result);
			delete sockLobby[socket.id];
		}
	});
});

app.use(express.static('public'));

server.listen(port, () => {
	console.log(`Server is running on port ${port}`);
});
