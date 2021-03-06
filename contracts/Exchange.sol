pragma solidity ^0.4.18;

import 'zeppelin-solidity/contracts/ownership/Ownable.sol';
import 'zeppelin-solidity/contracts/lifecycle/Pausable.sol';
import 'zeppelin-solidity/contracts/token/ERC20/ERC20.sol';
import 'zeppelin-solidity/contracts/math/SafeMath.sol';



contract RootDeltaExchange is Pausable{
  using SafeMath for uint256;
  address public feeAccount; //the account that will receive fees
  address public RDXToken;
  uint public feeMake; //percentage times (1 ether)
  uint public feeMakeThreshold;
  uint public feeTake; //percentage times (1 ether)
  uint public feeTakeThreshold;
  uint public maxTakeDiscount;
  uint public maxMakeDiscount;
  uint constant public scalingFactor = 1000;
  uint constant public scaledOneHundredPercent = scalingFactor*100;
  // The minimum discount percentage is 0.01% i.e. scaled it is 10
  uint constant public minimumScaledDiscount = 10;

  mapping (address => mapping (address => uint)) public tokens; //mapping of token addresses to mapping of account balances (token=0 means Ether)
  mapping (address => mapping (bytes32 => bool)) public orders; //mapping of user accounts to mapping of order hashes to booleans (true = submitted by user, equivalent to offchain signature)
  mapping (address => mapping (bytes32 => uint)) public orderFills; //mapping of user accounts to mapping of order hashes to uints (amount of order that has been filled)

  event Order(address tokenGet, uint amountGet, address tokenGive, uint amountGive, uint expires, uint nonce, address user);
  event Cancel(address tokenGet, uint amountGet, address tokenGive, uint amountGive, uint expires, uint nonce, address user, uint8 v, bytes32 r, bytes32 s);
  event Trade(address tokenGet, uint amountGet, address tokenGive, uint amountGive, address get, address give,bytes32 orderHash);
  event Deposit(address token, address user, uint amount, uint balance);
  event Withdraw(address token, address user, uint amount, uint balance);



  modifier onlyWhenDiscountIsValid(uint _maxDiscount, uint _maxFee) {
    require(_maxDiscount <= scaledOneHundredPercent);
    _;
  }

  function RootDeltaExchange(address _feeAccount, address _RDXToken, uint _feeMake,uint _feeTake, uint _feeMakeThreshold, uint _feeTakeThreshold, uint _maxTakeDiscount, uint _maxMakeDiscount ) public onlyWhenDiscountIsValid(_maxMakeDiscount, _feeMake) onlyWhenDiscountIsValid(_maxTakeDiscount, _feeTake) {
    feeAccount = _feeAccount;
    feeMake = _feeMake;
    feeTake = _feeTake;
    feeMakeThreshold = _feeMakeThreshold;
    feeTakeThreshold = _feeTakeThreshold;
    maxTakeDiscount = _maxTakeDiscount;
    maxMakeDiscount = _maxMakeDiscount;
    RDXToken = _RDXToken;

  }

  function changeFeeAccount(address _feeAccount) public onlyOwner {
    feeAccount = _feeAccount;
  }

  function changeFeeMake(uint _feeMake) public onlyOwner {
    require(_feeMake <= scaledOneHundredPercent);
    feeMake = _feeMake;
  }

  function changeFeeTake(uint _feeTake)  public onlyOwner {
    require(_feeTake <= scaledOneHundredPercent);
    feeTake = _feeTake;
  }

  function changeFeeMakeThreshold(uint _feeMakeThreshold) public onlyOwner {
    feeMakeThreshold = _feeMakeThreshold;
  }

  function changeFeeTakeThreshold(uint _feeTakeThreshold)  public onlyOwner {
    feeTakeThreshold = _feeTakeThreshold;
  }

  function changeMaxTakeDiscount(uint _maxTakeDiscount) public onlyOwner onlyWhenDiscountIsValid(_maxTakeDiscount, feeTake) {
    maxTakeDiscount = _maxTakeDiscount;
  }

  function changeMaxMakeDiscount(uint _maxMakeDiscount) public onlyOwner onlyWhenDiscountIsValid(_maxMakeDiscount, feeMake) {
    maxMakeDiscount = _maxMakeDiscount;
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
    // Allow for partial fills by reducing the size of the _amount requested if it is too large
    if (orderFills[_user][hash].add(_amount) > _amountGet) {
      _amount = _amountGet.sub(orderFills[_user][hash]);
    }
    uint tradeAmount = _amountGive.mul( _amount ).div( _amountGet);
    if (!(
    (orders[_user][hash] || ecrecover(keccak256("\x19Ethereum Signed Message:\n32", hash),_v,_r,_s) == _user) &&
    block.number <= _expires &&
    orderFills[_user][hash].add(_amount) <= _amountGet
    )) revert();
    tradeBalances(_tokenGet, _tokenGive, _user, _amount,tradeAmount);
    orderFills[_user][hash] = orderFills[_user][hash].add(_amount);
    Trade(_tokenGet, _amount, _tokenGive, tradeAmount, _user, msg.sender,hash);
  }

  function tradeBalances(address _tokenGet,  address _tokenGive, address _user, uint _getAmount, uint _giveAmount) public {
    uint feeMakeUser = feeMake.sub(calculateMakerDiscount(_user));
    uint feeTakeUser = feeTake.sub(calculateTakerDiscount());

    uint feeMakeXfer = calculateScaledPercentageOfScaledValue(_getAmount, feeMakeUser);
    uint feeTakeXfer = calculateScaledPercentageOfScaledValue(_giveAmount, feeTakeUser);
   if((_getAmount >tokens[_tokenGet][msg.sender])||(_getAmount < feeMakeXfer) ){
        revert();
    }
     tokens[_tokenGet][msg.sender] = tokens[_tokenGet][msg.sender].sub(_getAmount);
    tokens[_tokenGet][_user] = tokens[_tokenGet][_user].add(_getAmount.sub(feeMakeXfer));
     tokens[_tokenGet][feeAccount] = tokens[_tokenGet][feeAccount].add(feeMakeXfer);
     tokens[_tokenGive][_user] = tokens[_tokenGive][_user].sub(_giveAmount);
    tokens[_tokenGive][msg.sender] = tokens[_tokenGive][msg.sender].add(_giveAmount.sub(feeTakeXfer));
    tokens[_tokenGive][feeAccount] = tokens[_tokenGive][feeAccount].add(feeTakeXfer);
  }

  function calculateTakerDiscount() public returns (uint) {
    uint userRDXBalance = tokens[RDXToken][msg.sender];
    // There won't be a discount if the user does not own any RDX tokens.
    if (userRDXBalance == 0) {
      return 0;
    }
    uint takerDiscount = userRDXBalance.mul(scalingFactor).div(feeTakeThreshold);
    if (takerDiscount >= maxTakeDiscount) {
      takerDiscount =  maxTakeDiscount;
    } else if (takerDiscount <= 0) {
      return 0;
    }
    takerDiscount = calculateScaledPercentageOfScaledPercentage(feeTake, takerDiscount);
    if (takerDiscount < minimumScaledDiscount) {
      return 0;
    }
    return takerDiscount;
  }

  function calculateMakerDiscount(address makerAddress) public returns (uint) {
    uint userRDXBalance = tokens[RDXToken][makerAddress];
    // There won't be a discount if the user does not own any RDX tokens.
    if (userRDXBalance == 0) {
      return 0;
    }
    uint makerDiscount = userRDXBalance.mul(scalingFactor).div(feeMakeThreshold);
    if (makerDiscount >= maxMakeDiscount) {
      makerDiscount =  maxMakeDiscount;
    } else if (makerDiscount <= 0) {
      return 0;
    }
     makerDiscount =  calculateScaledPercentageOfScaledPercentage(feeMake, makerDiscount);
    if (makerDiscount < minimumScaledDiscount) {
      return 0;
    }
    return makerDiscount;
  }

  function calculateScaledPercentageOfScaledPercentage(uint scaledPercentageOf, uint scaledPercentage) private returns (uint) {
    return scaledPercentageOf.mul(scaledPercentage).div(scaledOneHundredPercent);
  }

  function calculateScaledPercentageOfScaledValue(uint scaledValue, uint scaledPercentage) private returns (uint) {
    return scaledValue.mul(scaledPercentage).div(scaledOneHundredPercent);
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

  function getStatus() public  view returns(bool _paused,address _owner,address _feeAccount,uint _feeMake,uint _feeTake,uint _feeMakeThreshold, uint _feeTakeThreshold, uint _maxTakeDiscount, uint _maxMakeDiscount){
    return (paused,owner,feeAccount,feeMake,feeTake, feeMakeThreshold, feeTakeThreshold, maxTakeDiscount, maxMakeDiscount);
  }

  function userAddress( bytes32 _msg, uint8 _v, bytes32 _r, bytes32 _s) public pure returns (address) {
    address user = ecrecover(keccak256("\x19Ethereum Signed Message:\n32", _msg),_v,_r,_s);
    return (user);
  }

  function verifyHash(address _tokenGet, uint _amountGet, address _tokenGive, uint _amountGive, uint _expires, uint _nonce) public view returns (bytes32){
    return keccak256(this, _tokenGet, _amountGet, _tokenGive, _amountGive, _expires, _nonce);
  }

}
