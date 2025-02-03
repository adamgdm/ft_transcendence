// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract TournamentScoring {

    event MatchCreated(uint256 _matchId, address _player1, address _player2);

    struct Match {
        address player1;
        address player2;
        uint256 player1Score;
        uint256 player2Score;
        bool isCompleted; 
    }

    Match[] public matches;

    function createMatch(address _player1, address _player2) public returns (uint256) {
        Match memory newMatch = Match({
            player1: _player1,
            player2: _player2,
            player1Score: 0,
            player2Score: 0,
            isCompleted: false
        });

        matches.push(newMatch);
        emit MatchCreated(matches.length - 1, _player1, _player2);
    }

    function updateMatchScore(uint256 _matchId, uint256 _player1Score, uint256 _player2Score) public {
        require(_matchId < matches.length, "Invalid match ID");
        require(_player1Score >= 0, "Player 1 score cannot be negative");
        require(_player2Score >= 0, "Player 2 score cannot be negative");
        require(!matches[_matchId].isCompleted, "Match already completed");

        matches[_matchId].player1Score = _player1Score;
        matches[_matchId].player2Score = _player2Score;
        matches[_matchId].isCompleted = true;
    }

    function getMatchDetails(uint256 _matchId) public view returns (Match memory) {
        require(_matchId < matches.length, "Invalid match ID");

        return matches[_matchId];
    }

    function getTotalMatches() public view returns (uint256) {
        return matches.length;
    }
}