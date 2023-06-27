const socket = io();

const lobbyInfo = document.getElementById('lobby-info');
const currentLobby = document.getElementById('current-lobby');
const userList = document.getElementById('user-list');
const leaveLobbyButton = document.getElementById('leave-lobby');
const createLobbyForm = document.getElementById('create-lobby-form');
const usernameInput = document.getElementById('username');
const lobbyNameInput = document.getElementById('lobby-name');
let isInLobby = false;

createLobbyForm.addEventListener('submit', (e) => {
	e.preventDefault();
	if (isInLobby) {
		alert('You are already in a lobby');
		return;
	}
	const username = usernameInput.value, lobbyName = lobbyNameInput.value;
	socket.emit('createLobby', username, lobbyName);
	usernameInput.disabled = true; // temporary
	lobbyNameInput.value = '';
});

leaveLobbyButton.addEventListener('click', () => {
	socket.emit('leaveLobby');
});

socket.on('lobbyList', (lobbies) => {
	const lobbyList = document.getElementById('lobby-list');
	lobbyList.innerHTML = '';
	for (const lobby of lobbies) {
		const element = document.createElement('div');
		element.textContent = lobby.players.length + "/" + lobby.maxPlayers + " | " + lobby.name;
		if (lobby.players.length >= lobby.maxPlayers) element.className = "full";
		else element.className = "";
		// element.id = lobby._id;
		lobbyList.appendChild(element);
		element.addEventListener('click', () => {
			if (element.className === "full") return;
			if (isInLobby) {
				alert('You are already in a lobby');
				return;
			}
			socket.emit('joinLobby', lobby._id, usernameInput.value);
			isInLobby = true; // to remove later
			usernameInput.disabled = true; // temporary
		});
	}
});

socket.on('editClient', (thing, value) => {
	switch (thing) {
		case isInLobby:
			return isInLobby = value;
	}
})

socket.on('updateLobby', ({ lobby }) => {
	currentLobby.textContent = `Current Lobby: ${lobby.name}`;
	userList.innerHTML = '';
	for (const player of lobby.players) {
		const playerElement = document.createElement('div');
		playerElement.textContent = player.username;
		playerList.appendChild(playerElement);
	}
});

socket.on('leaveLobby', () => {
	currentLobby.textContent = '';
	userList.innerHTML = '';
	leaveLobbyButton.disabled = true;
	usernameInput.disabled = false;
});

socket.on('errorMessage', (message) => {
	alert(message);
});


socket.on('joinedLobby', () => {
	leaveLobbyButton.disabled = false;
});
