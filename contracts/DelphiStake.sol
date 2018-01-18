pragma solidity ^0.4.18;

import "tokens/eip20/EIP20.sol";


contract DelphiStake {

    //TODO
    // Add events
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
    }

    struct Settlement {
      uint amount;
      bool stakerAgrees;
      bool claimantAgrees;
    }

    uint public stake;
    EIP20 public token;

    string public data;

    address public staker;
    address public arbiter;

    uint public lockupPeriod;
    uint public lockupEnding;
    uint public lockupRemaining;
    bool public withdrawInitiated;


    Claim[] public claims;
    uint public openClaims;
    mapping(uint => Settlement[]) public settlements;

    modifier onlyStaker(){
        require(msg.sender == staker);
        _;
    }

    modifier validClaimID(uint _claimId){
        require(_claimId < claims.length);
        _;
    }

    modifier validSettlementId(uint _claimId, uint _settlementId){
        require(_settlementId < settlements[_claimId].length);
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
        require(token.transferFrom(msg.sender, this, _value));
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

    modifier settlementDidFail(uint _claimId){
        require(claims[_claimId].settlementFailed);
        _;
    }

    modifier onlyStakerOrClaimant(uint _claimId){
        require(msg.sender == staker || msg.sender == claims[_claimId].claimant);
        _;
    }

    modifier withdrawalNotInitiated(){
        require(!withdrawInitiated);
        _;
    }

    function DelphiStake(uint _value, EIP20 _token, string _data, uint _lockupPeriod, address _arbiter)
    public
    payable
    {
        require(_token.transferFrom(msg.sender, this, _value));
        stake = _value;
        token = _token;
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
        settlements[_claimId].push(Settlement(_amount, true, false));
      } else {
        settlements[_claimId].push(Settlement(_amount, false, true));
      }
    }

    function acceptSettlement(uint _claimId, uint _settlementId)
    public
    validClaimID(_claimId)
    validSettlementId(_claimId, _settlementId)
    onlyStakerOrClaimant(_claimId)
    {
      if (msg.sender == staker){
        settlements[_claimId][_settlementId].stakerAgrees = true;
      } else {
        settlements[_claimId][_settlementId].claimantAgrees = true;
      }

      if (settlements[_claimId][_settlementId].claimantAgrees &&
          settlements[_claimId][_settlementId].stakerAgrees &&
          !claims[_claimId].settlementFailed &&
          !claims[_claimId].ruled){
        claims[_claimId].ruled = true;
        require(token.transfer(claims[_claimId].claimant, (settlements[_claimId][_settlementId].amount + claims[_claimId].fee)));
        stake += (claims[_claimId].amount + claims[_claimId].fee - settlements[_claimId][_settlementId].amount);

      }

      // TODO: doesn't cover the case where the settlement amount is greater than the sum of the fees
    }

    function settlementFailed(uint _claimId)
    public
    payable
    validClaimID(_claimId)
    onlyStakerOrClaimant(_claimId)
    {
      claims[_claimId].settlementFailed = true;
    }

    function ruleOnClaim(uint _claimId, uint _ruling)
    public
    onlyArbiter
    validClaimID(_claimId)
    claimNotRuled(_claimId)
    settlementDidFail(_claimId)
    {
        claims[_claimId].ruled = true;
        claims[_claimId].ruling = _ruling;
        if (_ruling == 0){
          require(token.transfer(arbiter, (claims[_claimId].fee + claims[_claimId].surplusFee)));
        } else if (_ruling == 1){
          stake += (claims[_claimId].amount + claims[_claimId].fee);
          require(token.transfer(arbiter, (claims[_claimId].fee + claims[_claimId].surplusFee)));
        } else if (_ruling == 2){
          require(token.transfer(arbiter, (claims[_claimId].fee + claims[_claimId].fee + claims[_claimId].surplusFee)));
          require(token.transfer(address(0), claims[_claimId].amount));
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
        if (claims[_claimId].ruling == 0 || claims[_claimId].ruling == 3){
            claims[_claimId].paid = true;
            require(token.transfer(claims[_claimId].claimant, (claims[_claimId].amount + claims[_claimId].fee)));
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
    withdrawalNotInitiated
    {
       lockupEnding = now + lockupPeriod;
       lockupRemaining = lockupPeriod;
       withdrawInitiated = true;
    }

    function finalizeWithdrawStake()
    public
    onlyStaker
    lockupElapsed
    {
       uint oldStake = stake;
       stake = 0;
       require(token.transfer(staker, oldStake));
    }

    function pauseLockup()
    internal
    {
        if (lockupEnding!= 0){
          lockupRemaining = lockupEnding - now;
          lockupEnding = 0;
        }
    }

    function getNumClaims()
    public
    constant
    returns (uint)
    {
      return claims.length;
    }

}
