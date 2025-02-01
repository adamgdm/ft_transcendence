import logging
import json
from solcx import compile_standard, install_solc, set_solc_version

logging.basicConfig(level=logging.DEBUG)

# Install specific solc version
_solc_version = '0.8.0'
install_solc(_solc_version)


def compile_contract():
    with open('/app/blockchain/contract.sol', 'r') as file:
        contract_source = file.read()

    compiled_sol = compile_standard(
        {
            "language": "Solidity",
            "sources": {
                "contract.sol": {
                    "content": contract_source
                }
            },
            "settings": {
                "outputSelection": {
                    "*": {
                        "*": [
                            "abi",  # Application Binary Interface
                            "metadata", # Metadata of the contract
                            "evm.bytecode", # Bytecode
                            "evm.sourceMap", # Source Map
                        ]
                    }
                }
            }
        }
    )

    with open('/app/blockchain/compiled_sol.json', 'w') as file:
        json.dump(compiled_sol, file)

    


    # Get contract interface
    abi = compiled_sol['contracts']['contract.sol']['TournamentScoring']['abi']
    bytecode = compiled_sol['contracts']['contract.sol']['TournamentScoring']['evm']['bytecode']['object']

    return abi, bytecode