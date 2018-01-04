pragma solidity ^0.4.19;

contract DelphiStake {

    //TODO
    // Add events
    // add support for any erc20 token
    // finish lockup mechanics

    struct Claim {
      address claimant;
      uint amount;
      string data;
      bool ruled;
      bool accepted;
      bool paid;
    }

    uint stake;
    address tokenAddress;

    string data;

    address staker;
    address arbiter;

    uint lockupPeriod;
    uint lockupEnding;
    uint lockupRemaining;


    Claim[] claims;

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

    function openClaim(uint _amount, string _data)
    public
    notStakerOrArbiter
    {
        claims.push(Claim(msg.sender, _amount, _data, false, false, false));
        pauseLockup();
    }

    function ruleOnClaim(uint _claimId, bool _accepted)
    public
    onlyArbiter
    claimNotRuled(_claimId)
    {
        claims[_claimId].accepted = _accepted;
        if (_accepted){
            stake -= claims[_claimId].amount;
        }
        // TO DO: resume lockup countdown
    }

    function withdrawClaimAmount(uint _claimId)
    public
    onlyClaimant(_claimId)
    claimAccepted(_claimId)
    claimUnpaid(_claimId)
    {
        claims[_claimId].paid = true;
        stake -= claims[_claimId].amount;
        claims[_claimId].claimant.transfer(claims[_claimId].amount);
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
