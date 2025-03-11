import pytest
from web3 import Web3
from web3.exceptions import InvalidAddress
from blockchain.blockchainInterface import TournamentBlockchain


class TestTournamentBlockchain:
    @pytest.fixture
    def setup(self):
        # Set up web3 and contract instances
        self.w3 = Web3(Web3.HTTPProvider('http://ganache:8545'))
        self.contract_instance = TournamentBlockchain()
        self.admin = self.w3.eth.accounts[0]
        self.player1 = self.w3.eth.accounts[1]
        self.player2 = self.w3.eth.accounts[2]

    def test_tournament_creation(self, setup):
        # Test basic tournament creation
        tournament_id = self.contract_instance.createTournament()
        assert tournament_id > 0
        assert self.contract_instance.getTotalTournaments() == tournament_id

    def test_tournament_creation_unauthorized(self, setup):
        # Switch to non-admin account
        original_admin = self.contract_instance.admin_address
        self.contract_instance.admin_address = self.w3.eth.accounts[1]

        with pytest.raises(Exception):
            self.contract_instance.createTournament()
        
        # Switch back to admin account
        self.contract_instance.admin_address = original_admin

    def test_match_creation(self, setup):
        # Create a tournament
        tournament_id = self.contract_instance.createTournament()

        # Create a match
        match_id = self.contract_instance.createMatch(
            tournament_id,
            self.player1,
            self.player2
        )

        assert match_id >= 0

        # Verify match details
        matchDetails = self.contract_instance.getMatchDetails(tournament_id, match_id)

        assert matchDetails[0] == tournament_id # Tournament ID
        assert matchDetails[1] == self.player1 # Player_1 address
        assert matchDetails[2] == self.player2 # Player_2 address
        assert matchDetails[3] == 0 # Player_1 score
        assert matchDetails[4] == 0 # Player_2 score
        assert not matchDetails[5] # isCompleted
    
    @pytest.mark.parametrize("invalid_tournamentID", [100, 0, -1, "invalid"])
    def test_match_creation_invalid_tournament(self, setup, invalid_tournamentID):
        with pytest.raises(ValueError):
            self.contract_instance.createMatch(
                invalid_tournamentID, # Invalid Tournament ID
                self.player1,
                self.player2
            )
        
    def test_match_creation_invalid_player(self, setup):
        tournament_id = self.contract_instance.createTournament()

        with pytest.raises(InvalidAddress):
            self.contract_instance.createMatch(
                tournament_id,
                "0xinvalid",
                self.player2
            )

    def test_match_creation_unauthorized(self, setup):
        tournament_id = self.contract_instance.createTournament()

        # Switch to non-admin account
        original_admin = self.contract_instance.admin_address
        self.contract_instance.admin_address = self.w3.eth.accounts[1]

       
        with pytest.raises(Exception):
            self.contract_instance.createMatch(
                tournament_id,
                self.player1,
                self.player2
            )
        
        self.contract_instance.admin_address = original_admin

        
    def test_match_score_update(self, setup):
        # We create a tournament and a match IDs
        tournament_id = self.contract_instance.createTournament()
        match_id = self.contract_instance.createMatch(
            tournament_id,
            self.player1,
            self.player2
        )

        # We update the match score between player1 and player2
        self.contract_instance.updateMatchScore(
            tournament_id,
            match_id,
            44, # Player1 new score
            66 # Player2 new score
            )

        # We get this match details and check if the score is updated
        matchDetails = self.contract_instance.getMatchDetails(tournament_id, match_id)

        assert matchDetails[0] == tournament_id # Tournament ID
        assert matchDetails[1] == self.player1 # Player1 address
        assert matchDetails[2] == self.player2 # Player2 address
        assert matchDetails[3] == 44 # Player1 new score
        assert matchDetails[4] == 66 # Player2 new score
        assert matchDetails[5] # isCompleted should be true now

    def test_match_score_update_after_match_completed(self, setup):
        # We create a tournament and a match IDs
        tournament_id = self.contract_instance.createTournament()
        match_id = self.contract_instance.createMatch(
            tournament_id,
            self.player1,
            self.player2
        )

        # We update the match score
        self.contract_instance.updateMatchScore(
            tournament_id,
            match_id,
            4,
            5
        )

        # We try to update the match score of a completed match
        with pytest.raises(Exception):
            self.contract_instance.updateMatchScore(
                tournament_id,
                match_id,
                10,
                0
            )
        
    def test_match_score_update_unauthorized(self, setup):
        # We create a tournament and a match IDs
        tournament_id = self.contract_instance.createTournament()
        match_id = self.contract_instance.createMatch(
            tournament_id,
            self.player1,
            self.player2
        )

        # We switch to non-admin account
        original_admin = self.contract_instance.admin_address
        self.contract_instance.admin_address = self.w3.eth.accounts[1]

        # We try to update the match score now with an unauthorized account
        with pytest.raises(Exception):
            self.contract_instance.updateMatchScore(
                tournament_id,
                match_id,
                99,
                100
            )

    @pytest.mark.parametrize("invalid_score", [-1, "invalid", None])
    def test_match_score_update_invalid_score(self, setup, invalid_score):
        # We create a tournament and match IDs
        tournament_id = self.contract_instance.createTournament()
        match_id = self.contract_instance.createMatch(
            tournament_id,
            self.player1,
            self.player2
        )

        # We try to update the match score
        with pytest.raises(ValueError):
            self.contract_instance.updateMatchScore(
                tournament_id,
                match_id,
                invalid_score,
                4
            )

    @pytest.mark.parametrize("invalid_tournamentID", [100, -1, "invalid", 0])
    def test_match_score_update_invalid_tournament_id(self, setup, invalid_tournamentID):
        with pytest.raises(ValueError):
            self.contract_instance.updateMatchScore(
                invalid_tournamentID,
                0,
                10,
                10
            )
    
    @pytest.mark.parametrize("invalid_matchID", [100, -1, "invalid", 0])
    def test_match_score_update_invalid_match_id(self, setup, invalid_matchID):
        # We create a tournament
        tournament_id = self.contract_instance.createTournament()

        with pytest.raises(ValueError):
            self.contract_instance.updateMatchScore(
                tournament_id,
                invalid_matchID,
                10,
                10
            )

    
    def test_match_queries(self, setup):
        # We create a tournament
        tournament_id = self.contract_instance.createTournament()

        # We check for empty tournaments
        assert self.contract_instance.getTotalMatches(tournament_id) == 0

        # We create a match
        match_id = self.contract_instance.createMatch(
            tournament_id,
            self.player1,
            self.player2
        )

        # We check the total matches within this tournament
        assert self.contract_instance.getTotalMatches(tournament_id) == match_id + 1

        # We check the match details 
        matchDetails = self.contract_instance.getMatchDetails(tournament_id, match_id)

        assert matchDetails[1] == self.player1
        assert matchDetails[2] == self.player2

    def test_tournament_queries(self, setup):
        initial_count = self.contract_instance.getTotalTournaments()

        # We add two new tournaments
        tournament_id1 = self.contract_instance.createTournament()
        tournament_id2 = self.contract_instance.createTournament()

        assert self.contract_instance.getTotalTournaments() == initial_count + 2

        # We check if both IDs are consecutive
        assert tournament_id2 == tournament_id1 + 1
    

    @pytest.mark.parametrize("invalid_tournamentID", [100, -1, "invalid", 0])
    def test_get_match_details_invalid_tournament_id(self, setup, invalid_tournamentID):
        with pytest.raises(ValueError):
            self.contract_instance.getMatchDetails(
                invalid_tournamentID,
                0
            )
    
    @pytest.mark.parametrize("invalid_matchID", [100, -1, "invalid", 0])
    def test_get_match_details_invalid_match_id(self, setup, invalid_matchID):
        # We create a tournament
        tournament_id = self.contract_instance.createTournament()

        with pytest.raises(ValueError):
            self.contract_instance.getMatchDetails(tournament_id, invalid_matchID)

    @pytest.mark.parametrize("invalid_tournamentID", [100, -1, "invalid", 0])
    def test_get_total_matches_invalid_tournament_id(self, setup, invalid_tournamentID):
        with pytest.raises(ValueError):
            self.contract_instance.getTotalMatches(invalid_tournamentID)

   # 37 tests 



    

