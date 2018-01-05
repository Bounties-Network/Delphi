pragma solidity ^0.4.18;

contract DelphiStake {

    //TODO
    // Add events
    // add support for any erc20 token

    struct Claim {
      address claimant;
      uint amount;
      uint fee;
      string data;
      bool ruled;
      bool accepted;
      bool paid;
    }

    uint public stake;
    address public tokenAddress;

    string public data;

    address public staker;
    address public arbiter;

    uint public lockupPeriod;
    uint public lockupEnding;
    uint public lockupRemaining;


    Claim[] public claims;
    uint public openClaims;

    modifier onlyStaker(){
        require(msg.sender == staker);
        _;
    }
    modifier notStakerOrArbiter(){
        require(msg.sender!= staker && msg.sender!= arbiter);
        _;
    }
    modifier onlyArbiter(){
        require(msg.sender == arbiter);
        _;
    }

    modifier onlyClaimant(uint _claimId){
        require(msg.sender == claims[_claimId].claimant);
        _;
    }

    modifier claimAccepted(uint _claimId){
        require(claims[_claimId].accepted);
        _;
    }
    modifier claimNotRuled(uint _claimId){
        require(!claims[_claimId].ruled);
        _;
    }
    modifier claimUnpaid(uint _claimId){
        require(!claims[_claimId].paid);
        _;
    }

    modifier transferredAmountEqualsValue(uint _value){
        require(msg.value == _value);
        _;
    }
    modifier lockupElapsed(){
        require(now >= lockupEnding && lockupEnding != 0);
        // if lockupEnding is 0, it means either the lockup is paused due to outstanding claims, or that a withdrawal has not yet been initiated
        _;
    }
    modifier stakerCanPay(uint _amount, uint _fee){
        require(stake >= (_amount + _fee));
        _;
    }



    function DelphiStake(uint _value, address _tokenAddress, string _data, uint _lockupPeriod, address _arbiter)
    public
    payable
    transferredAmountEqualsValue(_value)
    {
        stake = _value;
        tokenAddress = _tokenAddress;
        data = _data;
        lockupPeriod = _lockupPeriod;
        lockupRemaining = _lockupPeriod;
        arbiter = _arbiter;
        staker = msg.sender;

    }

    function openClaim(uint _amount, uint _fee, string _data)
    public
    payable
    notStakerOrArbiter
    transferredAmountEqualsValue(_fee)
    stakerCanPay(_amount, _fee)
    {
        claims.push(Claim(msg.sender, _amount, _fee, _data, false, false, false));
        openClaims ++;
        stake -= (_amount + _fee);
        // the claim amount and claim fee are locked up in this contract until the arbiter rules

        pauseLockup();
    }

    function ruleOnClaim(uint _claimId, bool _accepted)
    public
    onlyArbiter
    claimNotRuled(_claimId)
    {
        claims[_claimId].accepted = _accepted;
        if (!_accepted){
            stake += (claims[_claimId].amount + claims[_claimId].fee);
        }
        arbiter.transfer(claims[_claimId].fee);

        openClaims--;
        if (openClaims == 0){
            lockupEnding = now + lockupRemaining;
        }
    }

    function withdrawClaimAmount(uint _claimId)
    public
    onlyClaimant(_claimId)
    claimAccepted(_claimId)
    claimUnpaid(_claimId)
    {
        claims[_claimId].paid = true;
        claims[_claimId].claimant.transfer(claims[_claimId].amount + claims[_claimId].fee);
    }

    function increaseStake(uint _value)
    public
    payable
    onlyStaker
    transferredAmountEqualsValue(_value)
    {
        stake += _value;
    }

    function initiateWithdrawStake()
    public
    onlyStaker
    {
       lockupEnding = now + lockupPeriod;
       lockupRemaining = lockupPeriod;
    }

    function finalizeWithdrawStake()
    public
    onlyStaker
    lockupElapsed
    {
       uint oldStake = stake;
       stake = 0;
       staker.transfer(oldStake);

    }

    function pauseLockup()
    internal
    {
        lockupRemaining = lockupEnding - now;
        lockupEnding = 0;
    }

}
