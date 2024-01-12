function initializeState() {
    var team1Score = localStorage.getItem('team1Score') || '0';
    var team2Score = localStorage.getItem('team2Score') || '0';

    document.getElementById('team1-score').textContent = team1Score;
    document.getElementById('team2-score').textContent = team2Score;

    initializePlayers('team1', 'player1', 'team1-list');
    initializePlayers('team2', 'player2', 'team2-list');
}

function initializePlayers(team, inputId, listId) {
    var playersList = document.getElementById(listId);
    playersList.innerHTML = '';

    var playersData = JSON.parse(localStorage.getItem(team + 'Players')) || [];

    playersData.forEach(function (player) {
        var listItem = document.createElement('li');
        listItem.textContent = player;
        listItem.onclick = function () {
            removePlayer(team, player);
        };
        playersList.appendChild(listItem);
    });
}

function savePlayers(team, playerName) {
    var playersData = JSON.parse(localStorage.getItem(team + 'Players')) || [];
    playersData.push(playerName);
    localStorage.setItem(team + 'Players', JSON.stringify(playersData));
}

function saveScores(team1Score, team2Score) {
    localStorage.setItem('team1Score', team1Score);
    localStorage.setItem('team2Score', team2Score);
}

function addPlayer(team) {
    var playerNameInput = document.getElementById('player' + team.charAt(team.length - 1));
    var playerName = playerNameInput.value;

    if (playerName) {
        var playersList = document.getElementById(team + '-list');
        var existingPlayer = Array.from(playersList.children).find(function (player) {
            return player.textContent.split(' ')[0] === playerName;
        });

        if (existingPlayer) {
            var count = parseInt(existingPlayer.textContent.match(/\((\d+)\)/)?.[1]) || 1;
            existingPlayer.textContent = playerName + ' (' + (count + 1) + ')';
        } else {
            var listItem = document.createElement('li');
            listItem.textContent = playerName + ' (1)';
            listItem.onclick = function () {
                removePlayer(team, playerName);
            };
            playersList.appendChild(listItem);
            savePlayers(team, playerName);
        }

        updateScore(team);

        playerNameInput.value = '';
    } else {
        alert('Proszę wpisać imię zawodnika.');
    }
}

function removePlayer(team, playerName) {
    var playersList = document.getElementById(team + '-list');
    var players = Array.from(playersList.children);

    var playerToRemove = players.find(function (player) {
        return player.textContent.includes(playerName);
    });

    if (playerToRemove) {
        var count = parseInt(playerToRemove.textContent.match(/\((\d+)\)/)?.[1]) || 1;

        if (count > 1) {
            // Jeśli zawodnik ma więcej niż jedno powtórzenie, zmniejsz tylko liczbę w nawiasie
            playerToRemove.textContent = playerName + ' (' + (count - 1) + ')';
        } else {
            // Jeśli zawodnik ma tylko jedno powtórzenie, usuń go z listy
            playersList.removeChild(playerToRemove);
        }

        updateScore(team, -1);
        updateLocalStorage(team, playerName, -1);
    }
}

function updateScore(team, scoreChange = 1) {
    var teamScore = document.getElementById(team + '-score');
    var currentScore = parseInt(teamScore.textContent);
    teamScore.textContent = currentScore + scoreChange;
    saveScores(document.getElementById('team1-score').textContent, document.getElementById('team2-score').textContent);
}

function updateLocalStorage(team, playerName, scoreChange) {
    var playersData = JSON.parse(localStorage.getItem(team + 'Players')) || [];
    var updatedPlayersData = playersData.filter(function (player) {
        return player !== playerName;
    });
    localStorage.setItem(team + 'Players', JSON.stringify(updatedPlayersData));

    var currentScore = parseInt(localStorage.getItem(team + 'Score')) || 0;
    var updatedScore = currentScore + scoreChange;
    localStorage.setItem(team + 'Score', updatedScore.toString());
}

function resetData() {
    localStorage.removeItem('team1Score');
    localStorage.removeItem('team2Score');
    localStorage.removeItem('team1Players');
    localStorage.removeItem('team2Players');
    location.reload();
}

initializeState();
