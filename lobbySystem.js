const Datastore = require('nedb');
const dbLobby = new Datastore({ inMemoryOnly: true /*filename: 'lobbies.db', autoload: true*/ });

/**
 * Create a new game lobby
 * @param {*} lobbyName
 * @param {num} maxPlayers
 * @returns lobby
 */
function createLobby(username, lobbyName, maxPlayers) {
	const newLobby = {
		name: lobbyName ?? username + "'s Lobby",
		maxPlayers: maxPlayers,
		players: [],
		started: false
	};

	return new Promise((resolve, reject) => {
		dbLobby.insert(newLobby, (err, lobby) => {
			if (err) reject(err);
			console.log('New lobby created:', lobby);
			resolve(lobby);
		});
	});
}

/**
 * List all game lobbies
 * @returns lobbies
 */
function listLobbies() {
	dbLobby.find({}, (err, lobbies) => {
		if (err) {
			console.error('Error listing lobbies:', err);
			return;
		}
		console.log('Available lobbies:', lobbies);
		return lobbies;
	});
}

/**
 * Delete specified game lobby
 * @param lobbyId
 */
function deleteLobby(lobbyId) {
	dbLobby.remove({ _id: lobbyId }, {}, (err, numRemoved) => {
		if (err) {
			console.error('Error deleting lobby:', err);
			return;
		}
		console.log('Lobby deleted:', numRemoved, 'lobby(s) removed');
		lobbyList = listLobbies();
		return;
	});
}

/**
 * Start the game in the lobby
 * @param {*} lobbyId
 */
function startGame(lobbyId) {
	dbLobby.update({ _id: lobbyId }, { $set: { started: true } }, {}, (err, numReplaced) => {
		if (err) console.error('Error starting the game:', err);
		else console.log('Game started in lobby:', numReplaced, 'lobby(s) updated');
		lobbyList = listLobbies();
	});
}

/**
 * Start the game in the lobby
 * @param {*} lobbyId
 */
function stopGame(lobbyId) {
	dbLobby.update({ _id: lobbyId }, { $set: { started: false } }, {}, (err, numReplaced) => {
		if (err) console.error('Error stopping the game:', err);
		else console.log('Game stopped in lobby:', numReplaced, 'lobby(s) updated');
		lobbyList = listLobbies();
	});
}

/**
 * Add a user to the game lobby
 * @param {*} lobbyId
 * @param {*} username
 * @returns "error..." / { lobby object }
 */
function addUser(lobbyId, username, socketId) {
	dbLobby.findOne({ _id: lobbyId }, (err, lobby) => {
		if (err) {
			console.error('Error adding user to lobby:', err);
			return "error", err
		}
		if (!lobby) return "errorLobbyNotFound";
		if (lobby.players.length >= lobby.maxPlayers) {
			console.error('Lobby is full');
			return "errorLobbyFull";
		}
		dbLobby.findOne({ _id: lobbyId, "players.username": username }, (e, d) => {
			if (d.length > 0) {
				console.error('Username already exists');
				return "errorUsernameExists";
			}
			dbLobby.update({ _id: lobbyId }, { $push: { players: { username: username, sid: socketId } } }, {}, (err, numReplaced) => {
				if (err) {
					return console.error('Error adding user to lobby:', err);
				}
				console.log('User added to lobby:', numReplaced, 'lobby(s) updated');
				lobbyList = listLobbies();
				return lobby
			});
		});

	});
}

/**
 * Remove a user from the game lobby
 * @param {*} lobbyId
 * @param {*} username
 */
function removeUser(lobbyId, username) {
	dbLobby.update({ _id: lobbyId }, { $pull: { players: username } }, {}, (err, numReplaced) => {
		if (err) return console.error('Error removing user from lobby:', err);
		console.log('User removed from lobby:', numReplaced, 'lobby(s) updated');
		dbLobby.findOne({ _id: lobbyId }, (err, doc) => {
			if (err) return console.error('Error removeUser cleanup check:', err);
			if (doc.players.length < 1) dbLobby.remove({ _id: lobbyId }, {}, (e, n) => {
				console.log("Empty lobby deleted.");
			}) 
		})
		lobbyList = listLobbies();
	});
}

var lobbyList = listLobbies();

module.exports = {
	createLobby,
	listLobbies,
	deleteLobby,
	startGame,
	stopGame,
	addUser,
	removeUser,
	lobbyList
};
