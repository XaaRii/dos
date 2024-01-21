const Datastore = require('nedb');
const dbLobby = new Datastore({ inMemoryOnly: true /*filename: 'lobbies.db', autoload: true*/ });

var debug = false;
var lobbyList = [];

/**
 * Create a new game lobby
 * @param {num} maxPlayers
 * @returns lobby
 */
function createLobby(lobbyName, username, maxPlayers) {
	const newLobby = {
		name: lobbyName ?? username + "'s Lobby",
		maxPlayers: maxPlayers,
		players: [],
		modifiers: {
			startingCardCount: 7,
			fullGame: true
		},
		started: false
	};

	return new Promise((resolve, reject) => {
		dbLobby.insert(newLobby, (err, lobby) => {
			if (err) reject(err);
			if (debug) console.log('New lobby created:', lobby);
			resolve(lobby);
		});
	});
}

/**
 * List all game lobbies
 * @returns {Promise} 
 */
function fetchLobbies() {
	return new Promise((resolve, reject) => {
		dbLobby.find({}, (err, lobbies) => {
			if (err) {
				console.log('Error listing lobbies:', err);
				reject(err);
			}
			lobbyList = lobbies;
			if (debug) console.log('fetchLobbies():', lobbies);
			return resolve();
		});
	});
}

/**
 * Delete specified game lobby
 */
function deleteLobby(lobbyId) {
	return new Promise((resolve, reject) => {
		dbLobby.remove({ _id: lobbyId }, {}, (err, numRemoved) => {
			if (err) {
				console.error('Error deleting lobby:', err);
				reject(err);
			}
			if (debug) console.log('Lobby deleted:', numRemoved, 'lobby(s) removed');
			fetchLobbies();
			return resolve();
		});
	});
}

/**
 * Start the game in the lobby
 */
function startGame(lobbyId) {
	return new Promise((resolve, reject) => {
		dbLobby.update({ _id: lobbyId }, { $set: { started: true } }, {}, (err, numReplaced) => {
			if (err) {
				console.error('Error starting the game:', err);
				reject(err);
			}
			if (debug) console.log('Game started in lobby:', numReplaced, 'lobby(s) updated');
			fetchLobbies();
			return resolve();
		});
	});
}

/**
 * Start the game in the lobby
 */
function stopGame(lobbyId) {
	return new Promise((resolve, reject) => {
		dbLobby.update({ _id: lobbyId }, { $set: { started: false } }, {}, (err, numReplaced) => {
			if (err) {
				console.error('Error stopping the game:', err);
				reject(err);
			}
			if (debug) console.log('Game stopped in lobby:', numReplaced, 'lobby(s) updated');
			fetchLobbies();
			return resolve();
		});
	});
}

/**
 * Add a user to the game lobby
 * @returns {Promise} resolved with { lobby object }, rejected with error
 */
async function addUser(lobbyId, username, socketId) {
	return new Promise((resolve, reject) => {
		dbLobby.findOne({ _id: lobbyId }, async (err, lobby) => {
			if (err) {
				console.error('Error adding user to lobby:', err);
				return reject("error");
			}
			if (!lobby) return reject("errorLobbyNotFound");
			if (lobby.players.length >= lobby.maxPlayers) {
				console.error('Lobby is full');
				return reject("errorLobbyFull");
			}
			dbLobby.findOne({ _id: lobbyId, "players.username": username }, async (e, d) => {
				if (d) {
					console.error('Username already exists');
					return reject("errorUsernameExists");
				}
				dbLobby.update({ _id: lobbyId }, { $push: { players: { username: username, sid: socketId } } }, { returnUpdatedDocs: true, multi: false }, async (err, numReplaced, document) => {
					if (err) {
						console.error('Error adding user to lobby:', err);
						return reject(err);
					}
					if (debug) console.log('User added to lobby:', numReplaced, 'lobby(s) updated');
					try {
						await fetchLobbies();
					} catch (err) {
						console.error(err);
					} finally {
						resolve(document);
					}
				});
			});
		});
	});
}

/**
 * Remove a user from the game lobby
 */
function removeUser(lobbyId, username, socketId) {
	return new Promise((resolve, reject) => {
		dbLobby.update({ _id: lobbyId }, { $pull: { players: { username: username, sid: socketId } } }, { returnUpdatedDocs: true, multi: false }, async (err, numReplaced, document) => {
			if (err) {
				console.error('Error removing user from lobby:', err);
				return reject(err);
			} else {
				if (debug) console.log('User removed from lobby:', numReplaced, 'lobby(s) updated');
				if (err) return console.error('Error removeUser cleanup check:', err);
				if (document?.players?.length < 1) await dbLobby.remove({ _id: lobbyId }, {}, (e, n) => {
					if (debug) console.log("Empty lobby deleted.");
				});
				await fetchLobbies();
				return resolve(document);
			}
		});
	});
}


module.exports = {
	createLobby,
	fetchLobbies,
	deleteLobby,
	startGame,
	stopGame,
	addUser,
	removeUser,
	getLobbyList: function () { return lobbyList; },
	setDebug: function (value) { debug = value; return; }
};
