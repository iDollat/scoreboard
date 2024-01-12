// Funkcja do inicjalizacji stanu na podstawie danych w localStorage
function initializeState() {
    // Pobierz zapisane dane z localStorage
    var team1Score = localStorage.getItem('team1Score') || '0';
    var team2Score = localStorage.getItem('team2Score') || '0';

    // Ustaw początkowy stan wyników
    document.getElementById('team1-score').textContent = team1Score;
    document.getElementById('team2-score').textContent = team2Score;

    // Pobierz zapisane dane o zawodnikach z localStorage
    initializePlayers('team1', 'player1', 'team1-list');
    initializePlayers('team2', 'player2', 'team2-list');
}

// Funkcja do inicjalizacji listy zawodników na podstawie danych w localStorage
function initializePlayers(team, inputId, listId) {
    var playersList = document.getElementById(listId);
    playersList.innerHTML = ''; // Wyczyść listę przed dodaniem zawodników

    // Pobierz zapisane dane o zawodnikach z localStorage
    var playersData = JSON.parse(localStorage.getItem(team + 'Players')) || [];

    // Dodaj zawodników do listy
    playersData.forEach(function (player) {
        var listItem = document.createElement('li');
        listItem.textContent = player;
        playersList.appendChild(listItem);
    });
}

// Funkcja do zapisywania danych o zawodnikach do localStorage
function savePlayers(team, playerName) {
    // Pobierz istniejące dane o zawodnikach z localStorage
    var playersData = JSON.parse(localStorage.getItem(team + 'Players')) || [];

    // Dodaj nowego zawodnika do listy
    playersData.push(playerName);

    // Zapisz zaktualizowane dane do localStorage
    localStorage.setItem(team + 'Players', JSON.stringify(playersData));
}

// Funkcja do zapisywania danych o wynikach do localStorage
function saveScores(team1Score, team2Score) {
    // Zapisz aktualne wyniki do localStorage
    localStorage.setItem('team1Score', team1Score);
    localStorage.setItem('team2Score', team2Score);
}

// Funkcja do dodawania zawodnika
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
            listItem.textContent = playerName;
            playersList.appendChild(listItem);

            // Zapisz zawodnika do localStorage
            savePlayers(team, playerName);
        }

        updateScore(team);

        playerNameInput.value = '';
    } else {
        alert('Proszę wpisać imię zawodnika.');
    }
}

// Funkcja do aktualizacji wyniku
function updateScore(team) {
    var teamScore = document.getElementById(team + '-score');
    var currentScore = parseInt(teamScore.textContent);
    teamScore.textContent = currentScore + 1;

    // Zapisz aktualne wyniki do localStorage
    saveScores(document.getElementById('team1-score').textContent, document.getElementById('team2-score').textContent);
}

// Funkcja do resetowania danych
function resetData() {
    // Wyczyść dane w localStorage
    localStorage.removeItem('team1Score');
    localStorage.removeItem('team2Score');
    localStorage.removeItem('team1Players');
    localStorage.removeItem('team2Players');

    // Przeładuj stronę
    location.reload();
}

// Wywołaj funkcję inicjalizacji stanu przy ładowaniu strony
initializeState();
