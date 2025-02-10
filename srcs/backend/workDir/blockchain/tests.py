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

    

