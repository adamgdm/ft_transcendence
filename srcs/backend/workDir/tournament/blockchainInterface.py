from web3 import Web3
from dotenv import load_dotenv
from eth_account.account import Account
from eth_account.hdaccount import generate_mnemonic
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
    def __init__(self):
        # Connect to local blockchain (Ganache)
        self.w3 = Web3(Web3.HTTPProvider('http://ganache:8545'))

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

    def create_match(self, player1_address, player2_address):
        try:
            if not Web3.is_address(player1_address):
                raise InvalidAddress(f"Invalid Ethereum address provided: {player1_address}")
            
            if not Web3.is_address(player2_address):
                raise InvalidAddress(f"Invalid Ethereum address provided: {player2_address}")
            """Create a new match between two players."""
            transaction = self.contract.functions.createMatch(
                player1_address,
                player2_address
            ).build_transaction({
                'from': self.admin_address,
                'gas': 200000,  # Consider estimating gas dynamically
                'gasPrice': self.w3.eth.gas_price,
                'nonce': self.w3.eth.get_transaction_count(self.admin_address),
            })

            # Sign the transaction
            signed_tx = self.w3.eth.account.sign_transaction(transaction, self.admin_private_key);

            # Send the transaction
            tx_hash = self.w3.eth.send_raw_transaction(signed_tx.rawTransaction)

            # Wait for transaction receipt
            receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash)
            print(f"==== Transaction Receipt: {receipt}")

            # Get the matchId from the Event
            match_created_event = self.contract.events.MatchCreated().process_receipt(receipt);
            matchId = match_created_event[0]['args']['_matchId']

            logger.info(f"Created match {matchId} between {player1_address} and {player2_address}")
            return matchId;


        except InvalidAddress as e:
            logger.error(f"Error: {e}")
        except Exception as e:
            logger.error(f"Failed to create match: {str(e)}")
            raise


    def update_match_score(self, match_id, player1_score, player2_score):
        try:

            if not isinstance(player1_score, int) or not isinstance(player2_score, int):
                raise ValueError("Player scores must be integers")
            
            if player1_score < 0 or player2_score < 0:
                raise ValueError("Player scores cannot be negative")
                
            """Update the score for a specific match."""
            transaction = self.contract.functions.updateMatchScore(
                match_id,
                player1_score,
                player2_score
            ).build_transaction({
                'from': self.admin_address,
                'gas': 200000,  # Consider estimating gas dynamically
                'gasPrice': self.w3.eth.gas_price,
                'nonce': self.w3.eth.get_transaction_count(self.admin_address),
            })

            #Sign the transaction
            signed_tx = self.w3.eth.account.sign_transaction(transaction, self.admin_private_key)

            # Send the transaction
            tx_hash = self.w3.eth.send_raw_transaction(signed_tx.rawTransaction)

            # Wait for transaction receipt
            tx_receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash)
            
            # Check if the transaction was successful
            if (tx_receipt.status == 0):
                raise ValueError(f"Transaction failed: match_id {match_id} may be invalid")

            logger.info(f"Updated match {match_id} score to {player1_score}-{player2_score}")
            return tx_receipt
        
        except ValueError as e:
            logger.error(f"ValueError: {e}")
        except Exception as e:
            logger.error(f"Failed to update match score: {str(e)}")
            raise

    def get_match_details(self, match_id):
        """Get details of a specific match"""
        return self.contract.functions.getMatchDetails(match_id).call()

    def get_total_matches(self):
        """Get the number of total matches"""
        return self.contract.functions.getTotalMatches().call()
    


blockchain = TournamentBlockchain()

player1 = blockchain.w3.eth.accounts[1]
player2 = blockchain.w3.eth.accounts[2]

receipt = blockchain.create_match(player1, player2)

        
