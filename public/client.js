const debug = true;
var log = console.log;
console.log = function () {
    var first_parameter = arguments[0];
    var other_parameters = Array.prototype.slice.call(arguments, 1);
    function formatConsoleDate (date) {
        var hour = date.getHours();
        var minutes = date.getMinutes();
        var seconds = date.getSeconds();
        var milliseconds = date.getMilliseconds();
        return '[' +
               ((hour < 10) ? '0' + hour: hour) +
               ':' +
               ((minutes < 10) ? '0' + minutes: minutes) +
               ':' +
               ((seconds < 10) ? '0' + seconds: seconds) +
               '.' +
               ('00' + milliseconds).slice(-3) +
               '] ';
    }
    log.apply(console, [formatConsoleDate(new Date()) + first_parameter].concat(other_parameters));
};

const socket = io();

const lobbyInfo = document.getElementById('lobby-info');
const currentLobby = document.getElementById('current-lobby');
const userList = document.getElementById('user-list');
const leaveLobbyButton = document.getElementById('leave-lobby');
const createLobbyForm = document.getElementById('create-lobby-form');
const usernameInput = document.getElementById('username');
const lobbyNameInput = document.getElementById('lobby-name');
var isInLobby = false;

createLobbyForm.addEventListener('submit', (e) => {
	e.preventDefault();
	if (isInLobby) {
		Swal.fire({
			title: 'You are already in a lobby',
			icon: 'error',
			text: 'you can\'t join another :/',
			timer: 3000,
			timerProgressBar: true,
			confirmButtonText: 'Alright'
		});
		return;
	}
	const username = usernameInput.value;
	const lobbyName = lobbyNameInput.value;
	socket.emit('serverCreateLobby', lobbyName, username);
	lobbyNameInput.value = '';
});

leaveLobbyButton.addEventListener('click', () => {
	socket.emit('serverLeaveLobby');
});

socket.on('clientLobbyList', (lobbies) => {
	if (debug) console.log("clientLobbyList", lobbies);
	const lobbyList = document.getElementById('lobby-list');
	lobbyList.innerHTML = '';
	if (lobbies.length < 1) return lobbyList.textContent = "No public lobbies... create one!";
	for (const lobby of lobbies) {
		const element = document.createElement('div');
		element.textContent = lobby.players.length + "/" + lobby.maxPlayers + " | " + lobby.name;
		if (lobby.players.length >= lobby.maxPlayers) element.className = "full";
		else element.className = "";
		// element.id = lobby._id;
		lobbyList.appendChild(element);
		element.addEventListener('click', () => {
			// if (element.className === "full") return;
			if (isInLobby) {
				Swal.fire({
					title: 'You are already in a lobby',
					icon: 'error',
					text: 'you can\'t join another :/',
					timer: 3000,
					timerProgressBar: true,
					confirmButtonText: 'Alright'
				});
				return;
			}
			const username = usernameInput.value
			socket.emit('serverJoinLobby', lobby._id, username);
			isInLobby = true;
		});
	}
});

socket.on('clientEdit', (thing, value) => {
	if (debug) console.log('clientEdit', thing, value);
	switch (thing) {
		case "isInLobby":
			isInLobby = value; 
			return;
		// case "usernameLock":
		// 	return usernameLock = value;
	}
})
 
 socket.on('clientUpdateLobby', (lobby) => {
	if (debug) console.log("clientUpdateLobby", lobby);
	currentLobby.textContent = `Current Lobby: ${lobby.name}`;
	userList.innerHTML = '';
	for (let i = 0; i < lobby.players.length; i++) {
		const player = lobby.players[i];
		const playerElement = document.createElement('div');
		const playerText = document.createElement('span');
		playerText.className = 'player-name';
		if (!i) playerText.textContent = "👑 ";
		playerText.textContent += player.username;
		playerElement.appendChild(playerText);

		if (socket.id === lobby.players[0].sid && i) {
			const kickButton = document.createElement('button');
			kickButton.className = 'player-control';
			kickButton.textContent = 'Kick';
			kickButton.addEventListener('click', () => {
				socket.emit('serverLeaveLobby', player.username);
			});
			playerElement.appendChild(kickButton);
			/*
			const makeLeaderButton = document.createElement('button');
			makeLeaderButton.className = 'player-control';
			makeLeaderButton.textContent = 'Make Leader';
			makeLeaderButton.addEventListener('click', () => {
				// logic // useless atm
			});
			playerElement.appendChild(makeLeaderButton);
			*/
		}

		userList.appendChild(playerElement);
	}
});


socket.on('clientLeaveLobby', () => {
	if (debug) console.log("clientLeaveLobby");
	currentLobby.textContent = '';
	userList.innerHTML = '';
	lobbyInfo.classList.add("hidden");
	leaveLobbyButton.disabled = true;
	usernameInput.disabled = false; // temp
});

socket.on('clientPopup', async (object) => {
	if (debug) console.log("clientPopup", object);
	Swal.fire(object);
});


socket.on('clientJoinedLobby', () => {
	if (debug) console.log("clientJoinedLobby");
	lobbyInfo.classList.remove("hidden");
	leaveLobbyButton.disabled = false;
	usernameInput.disabled = true; // temp
});
