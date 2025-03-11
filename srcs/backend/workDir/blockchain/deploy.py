from web3 import Web3
import json
import os
import time
from compileContract import compile_contract


def deploy_contract():

    # Wait for Ganache to be ready
    max_attempts = 30
    attempt = 0

    while (attempt < max_attempts):
        try:
            # Connect to Ganache
            w3 = Web3(Web3.HTTPProvider('http://ganache:8545'))

            if (w3.is_connected()):
                break;
        except Exception:
            time.sleep(1)
            attempt += 1

    if (attempt == max_attempts):
        raise('Could not connect to Ganache')

    # Get the first account (has test ETH by default)
    account = w3.eth.accounts[0]

    # Get the bin and bytecode from compiled solidity code
    abi, bytecode = compile_contract()
    print(f"==== abi : {abi}")

    Contract = w3.eth.contract(abi=abi, bytecode=bytecode)

    # Deploy the contract
    tx_hash = Contract.constructor().transact({'from': account})
    tx_receipt = w3.eth.wait_for_transaction_receipt(tx_hash)

    # Get the contract address and add it to .env
    contract_address = tx_receipt['contractAddress']

    with open ('.env', 'w') as f:
        f.write(f'CONTRACT_ADDRESS={contract_address}\n')

    print(f'============== CONTRACT_ADDRESS:  {contract_address}', flush=True)

    return contract_address


if __name__ == '__main__':
    deploy_contract()