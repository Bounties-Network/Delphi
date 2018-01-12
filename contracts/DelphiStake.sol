pragma solidity ^0.4.18;

contract DelphiStake {

    //TODO
    // Add events
    // add support for any erc20 token
    // change functions to support using a proxy contract
    // - add the masterCopy address to storage
    // - create an init function instead of constructor

    struct Claim {
      address claimant;
      uint amount;
      uint fee;
      uint surplusFee;
      string data;
      uint ruling;
      bool ruled;
      bool paid;
      bool settlementFailed;
      Settlement[] settlements;
    }

    struct Settlement {
      uint amount;
      bool stakerAgrees;
      bool claimantAgrees;
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

    modifier validClaimID(uint _claimId){
        require(_claimId < claims.length);
        _;
    }

    modifier validSettlementId(uint _claimId, uint _settlementId){
        require(_settlementId < claims[_claimId].settlements.length);
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

    modifier settlementFailed(uint _claimId){
        require(claims[_claimId].settlementFailed);
        _;
    }

    modifier onlyStakerOrClaimant(uint _claimId){
        require(msg.sender == staker || msg.sender == claims[_claimId].claimant);
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
        claims.push(Claim(msg.sender, _amount, _fee, 0, _data, 0, false, false, false));
        openClaims ++;
        stake -= (_amount + _fee);
        // the claim amount and claim fee are locked up in this contract until the arbiter rules

        pauseLockup();
    }

    function increaseClaimFee(uint _claimId, uint _amount)
    public
    payable
    validClaimID(_claimId)
    transferredAmountEqualsValue(_amount)
    {
      claims[_claimId].surplusFee += _amount;
    }

    function proposeSettlement(uint _claimId, uint _amount)
    public
    validClaimID(_claimId)
    onlyStakerOrClaimant(_claimId)
    {
      require(claims[_claimId].amount + claims[_claimId].fee >= _amount);
      // only allows settlements for up to the amount that's already been staked by the staker as pertaining to this case

      if (msg.sender == staker){
        claims[_claimId].settlements.push(Settlement(_amount, true, false));
      } else {
        claims[_claimId].settlements.push(Settlement(_amount, false, true));
      }
    }

    function acceptSettlement(uint _claimId, uint _settlementId)
    validClaimID(_claimId)
    validSettlementId(_claimId, _settlementId)
    onlyStakerOrClaimant(_claimId)
    {
      if (msg.sender == staker){
        claims[_claimId].settlements[_settlementId].stakerAgrees = true;
      } else {
        claims[_claimId].settlements[_settlementId].claimantAgrees = true;
      }

      if (claims[_claimId].settlements[_settlementId].claimantAgrees &&
          claims[_claimId].settlements[_settlementId].stakerAgrees &&
          !claims[_claimId].settlementFailed
          !claims[_claimId].ruled){
        claims[_claimId].ruled = true;
        claims[_claimId].claimant.transfer(claims[_claimId].settlements[_settlementId].amount + claims[_claimId].fee);
        stake += (claims[_claimId].amount + claims[_claimId].fee - claims[_claimId].settlements[_settlementId].amount);

      }

      // TODO: doesn't cover the case where the settlement amount is greater than the sum of the fees
    }

    function settlementFailed(uint _claimId)
    public
    payable
    validClaimID(_claimId)
    transferredAmountEqualsValue(_amount)
    onlyStakerOrClaimant(_claimId)
    {
      claims[_claimId].settlementFailed = true;
    }

    function ruleOnClaim(uint _claimId, uint _ruling)
    public
    onlyArbiter
    validClaimID(_claimId)
    claimNotRuled(_claimId)
    settlementFailed(_claimId)
    {
        claims[_claimId].ruled = true;
        claims[_claimId].ruling = _ruling;
        if (_ruling == 0){
          arbiter.transfer(claims[_claimId].fee + claims[_claimId].surplusFee);
        } else if (_ruling == 1){
          stake += (claims[_claimId].amount + claims[_claimId].fee);
          arbiter.transfer(claims[_claimId].fee + claims[_claimId].surplusFee);
        } else if (_ruling == 2){
          arbiter.transfer(claims[_claimId].fee + claims[_claimId].fee + claims[_claimId].surplusFee);
          address(0).transfer(claims[_claimId].amount);
          // burns the claim amount in the event of collusion
        } else if (_ruling == 3){
          stake += (claims[_claimId].amount + claims[_claimId].fee);
          //TODO: what happens to Fsurplus here?
        }

        openClaims--;
        if (openClaims == 0){
            lockupEnding = now + lockupRemaining;
        }
    }

    function withdrawClaimAmount(uint _claimId)
    public
    validClaimID(_claimId)
    onlyClaimant(_claimId)
    claimUnpaid(_claimId)
    {
        claims[_claimId].paid = true;
        if (claims[_claimId].ruling == 0 || claims[_claimId].ruling == 3){
            claims[_claimId].claimant.transfer(claims[_claimId].amount + claims[_claimId].fee);
        }

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
