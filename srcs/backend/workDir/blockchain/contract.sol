// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract TournamentScoring {

    event TournamentCreated(uint256 _tournamentId);
    event MatchCreated(uint256 _tournamentId, uint256 _matchId, address _player1, address _player2);
    event MatchScoreUpdated(uint256 _tournamentId, uint256 _matchId, uint256 _player1Score, uint256 _player2Score);

    struct Match {
        uint256 tournamentId;
        address player1;
        address player2;
        uint256 player1Score;
        uint256 player2Score;
        bool isCompleted; 
    }

    
    mapping(uint256 => Match[]) tournamentMatches;
    uint256 tournamentCount;
    address public owner;

    constructor() {
        owner = msg.sender;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Only the owner can perform this action");
        _;
    }

    function createTournament() onlyOwner public {
        tournamentCount++;

        emit TournamentCreated(tournamentCount);
    } 

    function createMatch(uint256 _tournamentId, address _player1, address _player2) onlyOwner public {
        require(_tournamentId <= tournamentCount && _tournamentId > 0, "Invalid tournament ID");
        
        Match memory newMatch = Match({
            tournamentId: _tournamentId,
            player1: _player1,
            player2: _player2,
            player1Score: 0,
            player2Score: 0,
            isCompleted: false
        });

        tournamentMatches[_tournamentId].push(newMatch);

        emit MatchCreated(_tournamentId, tournamentMatches[_tournamentId].length - 1, _player1, _player2);
    }

    function updateMatchScore(uint256 _tournamentId, uint256 _matchId, uint256 _player1Score, uint256 _player2Score)  onlyOwner public {
        require(_tournamentId <= tournamentCount && _tournamentId > 0, "Invalid tournament ID");
        require(_matchId <  tournamentMatches[_tournamentId].length, "Invalid match ID");
        require(_player1Score >= 0, "Player 1 score cannot be negative");
        require(_player2Score >= 0, "Player 2 score cannot be negative");
        require(!tournamentMatches[_tournamentId][_matchId].isCompleted, "Match already completed");

        tournamentMatches[_tournamentId][_matchId].player1Score = _player1Score;
        tournamentMatches[_tournamentId][_matchId].player2Score = _player2Score;
        tournamentMatches[_tournamentId][_matchId].isCompleted = true;

        emit MatchScoreUpdated(_tournamentId, _matchId, _player1Score, _player2Score);
    }

    function getMatchDetails(uint256 _tournamentId, uint256 _matchId) public view returns (Match memory) {
        require(_tournamentId <= tournamentCount && _tournamentId > 0, "Invalid tournament ID");
        require(_matchId <  tournamentMatches[_tournamentId].length, "Invalid match ID");

        return tournamentMatches[_tournamentId][_matchId];
    }

    function getTotalMatches(uint256 _tournamentId) public view returns (uint256) {
        require(_tournamentId <= tournamentCount && _tournamentId > 0, "Invalid tournament ID");
        return  tournamentMatches[_tournamentId].length;
    }

    function getTotalTournaments() public view returns (uint256) {
        return tournamentCount;
    }
}