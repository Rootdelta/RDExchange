pragma solidity ^0.4.18;


import 'zeppelin-solidity/contracts/ownership/Ownable.sol';
import 'zeppelin-solidity/contracts/lifecycle/Pausable.sol';
import 'zeppelin-solidity/contracts/token/ERC20/ERC20.sol';
import 'zeppelin-solidity/contracts/token/ERC20/ERC20Basic.sol';
import 'zeppelin-solidity/contracts/token/ERC20/BasicToken.sol';
import 'zeppelin-solidity/contracts/token/ERC20/StandardToken.sol';
import 'zeppelin-solidity/contracts/token/ERC20/MintableToken.sol';
import 'zeppelin-solidity/contracts/math/SafeMath.sol';


contract RDToken is MintableToken {

  function destroy(address account, uint amount) public onlyOwner {
    require (balances[account] >= amount);
    balances[account] = balances[account].sub(amount);
    totalSupply_ = totalSupply_.sub(amount);
  }
  
}


contract  AccountLevels is Ownable{
  mapping (address => uint) public accountLevels;

  function setAccountLevel(address user, uint level) public onlyOwner {
    accountLevels[user] = level;
  }

  function accountLevel(address user) public view returns(uint) {
    return accountLevels[user];
  }
}

contract RDToken is MintableToken {

  function destroy(address account, uint amount) public onlyOwner {
    require (balances[account] >= amount);
    balances[account] = balances[account].sub(amount);
    totalSupply_ = totalSupply_.sub(amount);
  }
  
}


contract  AccountLevels is Ownable{
  mapping (address => uint) public accountLevels;

  function setAccountLevel(address user, uint level) public onlyOwner {
    accountLevels[user] = level;
  }

  function accountLevel(address user) public view returns(uint) {
    return accountLevels[user];
  }
}

contract RootDeltaExchange is Pausable{
  using SafeMath for uint256;
  address public feeAccount; //the account that will receive fees
  address public accountLevelsAddr; //the address of the AccountLevels contract
  uint public feeMake; //percentage times (1 ether)
  uint public feeTake; //percentage times (1 ether)
  uint public feeRebate; //percentage times (1 ether)
  mapping (address => mapping (address => uint)) public tokens; //mapping of token addresses to mapping of account balances (token=0 means Ether)
  mapping (address => mapping (bytes32 => bool)) public orders; //mapping of user accounts to mapping of order hashes to booleans (true = submitted by user, equivalent to offchain signature)
  mapping (address => mapping (bytes32 => uint)) public orderFills; //mapping of user accounts to mapping of order hashes to uints (amount of order that has been filled)

  event Order(address tokenGet, uint amountGet, address tokenGive, uint amountGive, uint expires, uint nonce, address user);
  event Cancel(address tokenGet, uint amountGet, address tokenGive, uint amountGive, uint expires, uint nonce, address user, uint8 v, bytes32 r, bytes32 s);
  event Trade(address tokenGet, uint amountGet, address tokenGive, uint amountGive, address get, address give,bytes32 orderHash);
  event Deposit(address token, address user, uint amount, uint balance);
  event Withdraw(address token, address user, uint amount, uint balance);

  function RootDeltaExchange(address _feeAccount, address _accountLevelsAddr, uint _feeMake, uint _feeTake, uint _feeRebate) public {
    feeAccount = _feeAccount;
    accountLevelsAddr = _accountLevelsAddr;
    feeMake = _feeMake;
    feeTake = _feeTake;
    feeRebate = _feeRebate;
  }


  function changeAccountLevelsAddr(address _accountLevelsAddr) public onlyOwner {
    accountLevelsAddr = _accountLevelsAddr;
  }

  function changeFeeAccount(address _feeAccount) public onlyOwner {
    feeAccount = _feeAccount;
  }

  function changeFeeMake(uint _feeMake) public onlyOwner {
    require(_feeMake <= feeMake);
    feeMake = _feeMake;
  }

  function changeFeeTake(uint _feeTake)  public onlyOwner {
    require((_feeTake < feeTake) && (_feeTake >= feeRebate));
    feeTake = _feeTake;
  }

  function changeFeeRebate(uint _feeRebate)  public onlyOwner {
     require((_feeRebate >= feeRebate) && (_feeRebate <= feeTake));
    feeRebate = _feeRebate;
  }

  function deposit() public payable whenNotPaused()  {
    tokens[0][msg.sender] = tokens[0][msg.sender].add( msg.value);
    Deposit(0, msg.sender, msg.value, tokens[0][msg.sender]);
  }

  function withdraw(uint _amount) public whenNotPaused()  {
    require(tokens[0][msg.sender] >= _amount);
    tokens[0][msg.sender] = tokens[0][msg.sender].sub(_amount);
    msg.sender.transfer(_amount);

    Withdraw(0, msg.sender, _amount, tokens[0][msg.sender]);
  }

  function depositToken(address _token, uint _amount) public whenNotPaused()  {
    //remember to call Token(address).approve(this, amount) or this contract will not be able to do the transfer on your behalf.
    require(_token!=address(0));
    if (!ERC20(_token).transferFrom(msg.sender, this, _amount)) revert();
    tokens[_token][msg.sender] = tokens[_token][msg.sender].add(_amount);
    Deposit(_token, msg.sender, _amount, tokens[_token][msg.sender]);
  }

  function withdrawToken(address _token, uint _amount) public whenNotPaused() {
    require(_token!=address(0));
    require(tokens[_token][msg.sender] >= _amount);

    tokens[_token][msg.sender] = tokens[_token][msg.sender].sub(_amount);
    if (!ERC20(_token).transfer(msg.sender, _amount)) revert();

    Withdraw(_token, msg.sender, _amount, tokens[_token][msg.sender]);
  }

  function balanceOf(address _token, address _user) public view  returns (uint) {
    return tokens[_token][_user];
  }

  function order(address _tokenGet, uint _amountGet, address _tokenGive, uint _amountGive, uint _expires, uint _nonce) public whenNotPaused()  {
    bytes32 hash = verifyHash(_tokenGet, _amountGet, _tokenGive, _amountGive, _expires, _nonce);
    orders[msg.sender][hash] = true;
    Order(_tokenGet, _amountGet, _tokenGive, _amountGive, _expires, _nonce, msg.sender);
  }

  function trade(address _tokenGet, uint _amountGet, address _tokenGive, uint _amountGive, uint _expires, uint _nonce, address _user, uint8 _v, bytes32 _r, bytes32 _s, uint _amount) public whenNotPaused()  {
    //amount is in amountGet terms
    bytes32 hash =verifyHash(_tokenGet, _amountGet, _tokenGive, _amountGive, _expires, _nonce);
    if (!(
      (orders[_user][hash] || ecrecover(keccak256("\x19Ethereum Signed Message:\n32", hash),_v,_r,_s) == _user) &&
      block.number <= _expires &&
      orderFills[_user][hash].add(_amount) <= _amountGet
    )) revert();
    tradeBalances(_tokenGet, _amountGet, _tokenGive, _amountGive, _user, _amount);
    orderFills[_user][hash] = orderFills[_user][hash].add(_amount);
    Trade(_tokenGet, _amount, _tokenGive, _amountGive * _amount / _amountGet, _user, msg.sender,hash);
  }

  function tradeBalances(address _tokenGet, uint _amountGet, address _tokenGive, uint _amountGive, address _user, uint _amount) private {
    uint feeMakeXfer = _amount.mul(feeMake) / (1 ether);
    uint feeTakeXfer = _amount.mul(feeTake) / (1 ether);
    uint feeRebateXfer = 0;
    if (accountLevelsAddr != 0x0) {
      uint accountLevel = AccountLevels(accountLevelsAddr).accountLevel(_user);
      if (accountLevel==1) feeRebateXfer =_amount.mul(feeRebate) / (1 ether);
      if (accountLevel==2) feeRebateXfer = feeTakeXfer;
    }
    tokens[_tokenGet][msg.sender] = tokens[_tokenGet][msg.sender].sub(_amount.add(feeTakeXfer));
    tokens[_tokenGet][_user] = tokens[_tokenGet][_user].add(_amount.add(feeRebateXfer).sub(feeMakeXfer));
    tokens[_tokenGet][feeAccount] = tokens[_tokenGet][feeAccount].add(feeMakeXfer.add(feeTakeXfer).sub(feeRebateXfer));
    tokens[_tokenGive][_user] = tokens[_tokenGive][_user].sub(_amountGive.mul(_amount) / _amountGet);
    tokens[_tokenGive][msg.sender] = tokens[_tokenGive][msg.sender].add( _amountGive.mul( _amount) / _amountGet);
  }

  function testTrade(address _tokenGet, uint _amountGet, address _tokenGive, uint _amountGive, uint _expires, uint _nonce, address _user, uint8 _v, bytes32 _r, bytes32 _s, uint _amount, address _sender) public view returns(bool) {
    if (!(
      tokens[_tokenGet][_sender] >= _amount &&
      availableVolume(_tokenGet, _amountGet, _tokenGive, _amountGive, _expires, _nonce, _user, _v, _r, _s) >= _amount
    )) return false;
    return true;
  }

  function availableVolume(address _tokenGet, uint _amountGet, address _tokenGive, uint _amountGive, uint _expires, uint _nonce, address _user, uint8 _v, bytes32 _r, bytes32 _s) public view returns(uint) {
    bytes32 hash = verifyHash(_tokenGet, _amountGet, _tokenGive, _amountGive, _expires, _nonce);
    if (!(
      (orders[_user][hash] || ecrecover(keccak256("\x19Ethereum Signed Message:\n32", hash),_v,_r,_s) == _user) &&
      block.number <= _expires
    )) return 0;
    uint available1 = _amountGet.sub(orderFills[_user][hash]);
    uint available2 = tokens[_tokenGive][_user] * _amountGet / _amountGive;
    if (available1<available2) return available1;
    return available2;
  }

  function amountFilled(address _tokenGet, uint _amountGet, address _tokenGive, uint _amountGive, uint _expires, uint _nonce, address _user) public view returns(uint) {
    bytes32 hash = verifyHash(_tokenGet, _amountGet, _tokenGive, _amountGive, _expires, _nonce);
    return orderFills[_user][hash];
  }

  function cancelOrder(address _tokenGet, uint _amountGet, address _tokenGive, uint _amountGive, uint _expires, uint _nonce, uint8 _v, bytes32 _r, bytes32 _s) public whenNotPaused()  {
    bytes32 hash = keccak256(this, _tokenGet, _amountGet, _tokenGive, _amountGive, _expires, _nonce);
    if (!(orders[msg.sender][hash] || ecrecover(keccak256("\x19Ethereum Signed Message:\n32", hash),_v,_r,_s) == msg.sender)) revert();
    orderFills[msg.sender][hash] = _amountGet;
    Cancel(_tokenGet, _amountGet, _tokenGive, _amountGive, _expires, _nonce, msg.sender, _v, _r, _s);
  }
  
  function getStatus() public  view returns(bool _paused,address _owner,address _feeAccount,address _accountLevelsAddr,uint _feeMake,uint _feeTake,uint _feeRebate){
      return (paused,owner,feeAccount,accountLevelsAddr,feeMake,feeTake,feeRebate);
  }

  function userAddress( bytes32 _msg, uint8 _v, bytes32 _r, bytes32 _s) public pure returns (address) {

  address user = ecrecover(keccak256("\x19Ethereum Signed Message:\n32", _msg),_v,_r,_s);

  return (user);

  }

  function verifyHash(address _tokenGet, uint _amountGet, address _tokenGive, uint _amountGive, uint _expires, uint _nonce) public view returns (bytes32){

    return keccak256(this, _tokenGet, _amountGet, _tokenGive, _amountGive, _expires, _nonce);


  }


}

