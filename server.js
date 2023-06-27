const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
var lobbySystem = require('./lobbySystem');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

const port = 3000;
// lobbySystem.lobbyList = []

io.on('connection', (socket) => {
	console.log('A user connected at ' + socket.handshake.address + " | " + socket.id)
	
	socket.emit('lobbyList', lobbySystem.lobbyList);

	socket.on('createLobby', async (username, lobbyName) => {
		console.log("createLobby");
		if (socket.lobby) {
			socket.emit('errorMessage', 'You are already in a lobby');
			socket.emit('editClient', 'isInLobby', true);
			return;
		}
		try {
			// Wait for lobbySystem.createLobby to return before proceeding
			const newLobby = await lobbySystem.createLobby(username, lobbyName, 4);
			console.log("to the socket now")
			socket.emit("joinLobby", newLobby._id);
		} catch (err) {
			console.error('Error creating lobby:', err);
		}
		// socket.username = username.length > 0 ? username : socket.id; // to be changed
		// socket.lobby = newLobby;
		// lobbySystem.addUser(newLobby._id, username, socket.id);
		// io.emit('lobbyList', lobbySystem.lobbyList);
		// socket.join(newLobby._id);
		// socket.emit('updateLobby', newLobby);
		// socket.emit('joinedLobby');

		// socket.emit("joinLobby", newLobby._id);
	});

	socket.on('joinLobby', (lobbyId) => {
		console.log("joinLobby");
		socket.username = username.length > 0 ? username : socket.id; // to be changed
		if (socket.lobby) {
			socket.emit('errorMessage', 'You are already in a lobby');
			socket.emit('editClient', 'isInLobby', true);
			return;
		}

		const result = lobbySystem.addUser(lobbyId, username, socket.id);
		if (result.startsWith("error")) {
			switch (result) {
				case "errorLobbyNotFound":
					return socket.emit('errorMessage', "This lobby doesn't seem to exist anymore, sorry.");
				case "errorLobbyFull":
					return socket.emit('errorMessage', "This lobby is full already.");
				case "errorUsernameExists":
					return socket.emit('errorMessage', "Someone with the same username is already in the lobby.");
				default:
					return socket.emit('errorMessage', "Error happened. Report this to website administrator.");
			}
		} else {
			socket.lobby = result;
			io.emit('lobbyList', lobbySystem.lobbyList);
			socket.join(lobbyId);
			io.to(lobbyId).emit('updateLobby', result);
			socket.emit('joinedLobby');
		}
	});

	socket.on('leaveLobby', () => {
		console.log("leaveLobby");
		if (!socket.lobby) return;
		const lobby = socket.lobby;
		lobbySystem.removeUser(lobby._id, socket.username);

		io.emit('lobbyList', lobbySystem.lobbyList);
		socket.leave(lobby._id);
		socket.emit('leaveLobby');
		io.to(lobby._id).emit('updateLobby', lobby);
		delete socket.lobby;
	});

	socket.on('disconnect', () => {
		console.log('A user disconnected');
		if (socket.lobby) {
			const lobby = socket.lobby;
			lobbySystem.removeUser(lobby._id, socket.username);
			io.emit('lobbyList', lobbySystem.lobbyList);
			io.to(lobby._id).emit('updateLobby', lobby);
		}
	});
});

app.use(express.static('public'));

server.listen(port, () => {
	console.log(`Server is running on port ${port}`);
});
