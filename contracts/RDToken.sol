pragma solidity ^0.4.18;

import 'zeppelin-solidity/contracts/ownership/Ownable.sol';
import 'zeppelin-solidity/contracts/token/ERC20/DetailedERC20.sol';
import 'zeppelin-solidity/contracts/token/ERC20/MintableToken.sol';

contract RDToken is MintableToken,DetailedERC20 ("RDXToken","RDX",8) {

 function destroy(address account, uint amount) public onlyOwner {
    require (balances[account] >= amount);
   balances[account] = balances[account].sub(amount);
   totalSupply_ = totalSupply_.sub(amount);
   }
}
