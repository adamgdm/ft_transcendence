from web3 import Web3
from dotenv import load_dotenv
import os
import json
import logging
from web3.exceptions import InvalidAddress

# Load .env file 
load_dotenv()

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler('blockchain.log')
    ]
)

logger = logging.getLogger(__name__)

class TournamentBlockchain:

    # We keep a max_tournament_id to prevent invalid tournament ID
    #max_tournament_id = 0

    def __init__(self):
        # Connect to local blockchain (Ganache)
        self.w3 = Web3(Web3.HTTPProvider('http://ganache:8545'))

        if (self.w3.is_connected()):
            print("-" * 50)
            print("Connection successful")
            print("-" * 50)
        else:
            print("Connection failed")

        # Load contract ABI and address
        with open('/app/blockchain/compiled_sol.json', 'r') as f:
            contract_json = json.load(f)
            self.contract_abi = contract_json['contracts']['contract.sol']['TournamentScoring']['abi']

        # Contract address
        self.contract_address = os.getenv('CONTRACT_ADDRESS')
        print(f"CONTRACT_ADDRESS FROM THE OBJECT: {self.contract_address}")

        # Set up admin account (tournament operator)
        self.admin_address = self.w3.eth.accounts[0] # First Ganache account

        # Store private key securely 
        self.admin_private_key = '0x4f3edf983ac636a65a842ce7c78d9aa706d3b113bce9c46f30d7d21715b23b1d'

        # Create contract instance
        self.contract = self.w3.eth.contract(
            address=self.contract_address,
            abi=self.contract_abi
        )


    def createTournament(self) -> int:
        try:
            # Build the transaction
            transaction = self.contract.functions.createTournament().build_transaction(
                {
                    'nonce': self.w3.eth.get_transaction_count(self.admin_address),
                    'from': self.admin_address,
                    'gas': 2000000,
                    'gasPrice': self.w3.eth.gas_price
                })
            
            # Sign the transaction using the private key
            signed_tx = self.w3.eth.account.sign_transaction(transaction, self.admin_private_key)

            # Send the signed transaction
            tx_hash = self.w3.eth.send_raw_transaction(signed_tx.rawTransaction)

            # Wait for the transaction to be included in a block, and get its receipt
            tx_receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash)

            # Check if the transaction was successful
            if tx_receipt.status == 0:
                raise ValueError("Transaction failed!")

            # Extract the _tournamentId emitted by TournamentCreated event in the smart contract
            TournamentEventCreated = self.contract.events.TournamentCreated().process_receipt(tx_receipt)
            tournament_id = TournamentEventCreated[0]['args']['_tournamentId']
            print(f"Created Tournament ID: {tournament_id}")
            
            # We read the previous max tournament ID
            try:
                with open('max_tournament_id.txt', 'r') as file:
                    max_tournament_id = int(file.read())
            except FileNotFoundError:
                max_tournament_id = 0
            
            # We update our max_tournament_id if it's the case
            if tournament_id > max_tournament_id:
                max_tournament_id = tournament_id

                with open('max_tournament_id.txt', 'w') as file:
                    file.write(str(max_tournament_id))
                
            
            print(f"After updating New max id: {max_tournament_id}")

            logger.info(f"Created tournament: {tournament_id}")
            return tournament_id
        
        except ValueError as e:
            logger.error(f"Error: {e}")
        except Exception as e:
            logger.error(f"Failed to create tournament: {str(e)}")
            raise

    def createMatch(self, tournament_id, _player1, _player2) -> int:
        try:
            # We check if both ethereum addresses are valid or not
            if not self.w3.is_address(_player1):
                raise InvalidAddress(f"Invalid Ethereum address: {_player1}")
            
            if not self.w3.is_address(_player2):
                raise InvalidAddress(f"Invalid Ethereum address: {_player2}")

            # We check if Tournament ID is valid or not
            if not isinstance(tournament_id, int):
                raise ValueError("Tournament ID must be an integer!")

            # We extract the current max_tournament_ID
            max_tournament_id = self.contract.functions.getTotalTournaments().call()
            print(f"MAX TOURNAMENT ID FROM SMART CONTRACT: {max_tournament_id}")

            if tournament_id > max_tournament_id or tournament_id <= 0:
                print(f"Error ID: {tournament_id}, maxID: {max_tournament_id}")
                raise ValueError(f"Invalid tournament ID: {tournament_id}")
            
            # Build the transaction
            transaction = self.contract.functions.createMatch(
                tournament_id,
                _player1,
                _player2
            ).build_transaction({
                'nonce': self.w3.eth.get_transaction_count(self.admin_address),
                'from': self.admin_address,
                'gas': 2000000,
                'gasPrice': self.w3.eth.gas_price
            })

            # Sign the transaction using the private key
            signed_tx = self.w3.eth.account.sign_transaction(transaction, self.admin_private_key)

            # Send the signed transaction
            tx_hash= self.w3.eth.send_raw_transaction(signed_tx.rawTransaction)

            # Wait for the transaction to be included in a block, and get its receipt
            tx_receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash)

            # Check if the transaction was successful
            if tx_receipt.status == 0:
                raise ValueError("Transaction Failed!")

            # Extract the match ID from event
            MatchCreatedEvent = self.contract.events.MatchCreated().process_receipt(tx_receipt)
            match_id = MatchCreatedEvent[0]['args']['_matchId']

            logger.info(f"Match {match_id} of tournament {tournament_id} created between {_player1} and {_player2}")
            return match_id

        except InvalidAddress as e:
            logger.error(f"Error: {e}")
        except ValueError as e:
            logger.error(f"Error: {e}")
        except Exception as e:
            logger.error(f"Failed To create match: {str(e)}")
            raise
            
    def updateMatchScore(self, tournament_id, match_id, _player1Score, _player2Score):
        try:

            # We check if Tournament ID is valid or not
            if not isinstance(tournament_id, int):
                raise ValueError("Tournament ID must be an integer!")

            # We extract the current max_tournament_ID
            max_tournament_id = self.contract.functions.getTotalTournaments().call()
            print(f"MAX TOURNAMENT ID FROM SMART CONTRACT: {max_tournament_id}")

            if tournament_id > max_tournament_id or tournament_id <= 0:
                print(f"Error ID: {tournament_id}, maxID: {max_tournament_id}")
                raise ValueError(f"Invalid tournament ID: {tournament_id}")
            

            # We check if Match ID is valid or not
            if not isinstance(tournament_id, int):
                raise ValueError("Match ID must be an integer!")

            # We extract the current max_match_ID
            max_match_ID = self.contract.functions.getTotalMatches(tournament_id).call()
            print(f"MAX MATCH ID FROM SMART CONTRACT: {max_match_ID}")

            if match_id >= max_match_ID or match_id < 0:
                raise ValueError(f"Invalid match ID: {match_id}")

            # We verify if the scores provided are valid or not
            if not isinstance(_player1Score, int) or _player1Score < 0:
                raise ValueError(f"Invalid score provided: {_player1Score}")

            if not isinstance(_player2Score, int) or _player2Score < 0:
                raise ValueError(f"Invalid score provided: {_player2Score}")

            # We build the transaction
            transaction = self.contract.functions.updateMatchScore(
                tournament_id,
                match_id,
                _player1Score,
                _player2Score
            ).build_transaction({
                'nonce': self.w3.eth.get_transaction_count(self.admin_address),
                'from': self.admin_address,
                'gas': 2000000,
                'gasPrice': self.w3.eth.gas_price
            })

            # We sign the transaction
            signed_tx = self.w3.eth.account.sign_transaction(transaction, self.admin_private_key)

            # We send the transaction
            tx_hash = self.w3.eth.send_raw_transaction(signed_tx.rawTransaction)

            # We wait for our transaction to be mined
            tx_receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash)

            # We check if our transaction has failed
            if tx_receipt.status == 0:
                raise ValueError('Transaction has failed!')
            
            # We call getMatchDetails method from our smart contract to check if our data has been stored
            match_struct = self.contract.functions.getMatchDetails(tournament_id, match_id).call()
            print(f"Match struct:  {match_struct}")

            logger.info(f"Match {match_id} of tournament {tournament_id} score updated: {_player1Score} - {_player2Score}")
            return match_struct
            
        except ValueError as e:
            logger.error(f"Error: {e}")
        except Exception as e:
            logger.error(f"Failed to update match score: {str(e)}")
            raise
        
    def getMatchDetails(self, tournament_id, match_id):
        try:
            # We check if Tournament ID is valid or not
            if not isinstance(tournament_id, int):
                raise ValueError("Tournament ID must be an integer!")

            # We extract the current max_tournament_ID
            max_tournament_id = self.contract.functions.getTotalTournaments().call()
            print(f"MAX TOURNAMENT ID FROM SMART CONTRACT: {max_tournament_id}")

            if tournament_id > max_tournament_id or tournament_id <= 0:
                print(f"Error ID: {tournament_id}, maxID: {max_tournament_id}")
                raise ValueError(f"Invalid tournament ID: {tournament_id}")
            

            # We check if Match ID is valid or not
            if not isinstance(tournament_id, int):
                raise ValueError("Match ID must be an integer!")

            # We extract the current max_match_ID
            max_match_ID = self.contract.functions.getTotalMatches(tournament_id).call()
            print(f"MAX MATCH ID FROM SMART CONTRACT: {max_match_ID}")

            if match_id >= max_match_ID or match_id < 0:
                raise ValueError(f"Invalid match ID: {match_id}")

            match_struct = self.contract.functions.getMatchDetails(tournament_id, match_id).call()

            logger.info(f"Match {match_id} of tournament {tournament_id} details: {match_struct}")
            return match_struc
        
        except Exception as e:
            logger.error(f"Failed to get match details: {str(e)}")
            raise

    def getTotalMatches(self, tournament_id):
        try:
            # We check if Tournament ID is valid or not
            if not isinstance(tournament_id, int):
                raise ValueError("Tournament ID must be an integer!")

            # We extract the current max_tournament_ID
            max_tournament_id = self.contract.functions.getTotalTournaments().call()
            print(f"MAX TOURNAMENT ID FROM SMART CONTRACT: {max_tournament_id}")

            if tournament_id > max_tournament_id or tournament_id <= 0:
                print(f"Error ID: {tournament_id}, maxID: {max_tournament_id}")
                raise ValueError(f"Invalid tournament ID: {tournament_id}")
            
            totalMatches = self.contract.functions.getTotalMatches(tournament_id).call()

            logger.info(f"Total matches in tournament {tournament_id}: {totalMatches}")
            return totalMatches
        
        except Exception as e:
            logger.error(f"Failed to get total matches for tournamentID: {tournament_id}: {str(e)}")
            raise

    def getTotalTournaments(self):
        try:
            totalTournaments = self.contract.functions.getTotalTournaments().call()

            logger.info(f"Total tournaments: {totalTournaments}")
            return totalTournaments
        
        except Exception as e:
            logger.error(f"Failed to get total tournaments: {str(e)}")
            raise



blockchain = TournamentBlockchain()

player1 = "0xFFcf8FDEE72ac11b5c542428B35EEF5769C409f0"
player2 = "0x22d491Bde2303f2f43325b2108D26f1eAbA1e32b"

id = blockchain.createTournament()
match_id = blockchain.createMatch(id, player1, player2)

blockchain.updateMatchScore(id, match_id, 109, 10)






