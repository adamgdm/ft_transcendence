#!/bin/bash

# Get the latest block number in decimal
latest_block=$(curl -s -X POST --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' http://localhost:8545 | jq -r '.result' | printf "%d\n" "$(cat -)")

echo "Latest block: $latest_block"
echo "Fetching all transactions..."

# Loop through all blocks
for ((i=0; i<=latest_block; i++)); do
    # Convert block number to hex
    block_hex="0x$(printf '%x' $i)"
    
    # Get block with transactions
    curl -s -X POST --data "{
        \"jsonrpc\":\"2.0\",
        \"method\":\"eth_getBlockByNumber\",
        \"params\":[\"$block_hex\", true],
        \"id\":1
    }" http://localhost:8545 | jq '.result.transactions[]'
    
    echo "----------------------------------------"
done
