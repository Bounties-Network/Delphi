pragma solidity ^0.4.18;

import "tokens/eip20/EIP20.sol";


contract DelphiStake {

    //TODO
    // change functions to support using a proxy contract
    // - add the masterCopy address to storage
    // - create an init function instead of constructor

    event ClaimantWhitelisted(address _claimant);
    event ClaimOpened(address _claimant, uint _claimId);
    event FeeIncreased(address _increasedBy, uint _claimId, uint _amount);
    event SettlementProposed(address _proposedBy, uint _claimId, uint _settlementId);
    event SettlementAccepted(address _acceptedBy, uint _claimId, uint _settlementId);
    event SettlementFailed(address _failedBy, uint _claimId);
    event ClaimRuled(uint _claimId);
    event WithdrawInitiated();
    event WithdrawPaused();
    event WithdrawFinalized();


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

    address public masterCopy;

    uint public claimableStake;
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

    mapping(address => bool) public allowedClaimants;

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

    modifier lockupElapsed(){
        require(now >= lockupEnding && lockupEnding != 0);
        // if lockupEnding is 0, it means either the lockup is paused due to outstanding claims, or that a withdrawal has not yet been initiated
        _;
    }
    modifier stakerCanPay(uint _amount, uint _fee){
        require(claimableStake >= (_amount + _fee));
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

    modifier isWhitelisted(){
      require(allowedClaimants[msg.sender]);
      _;
    }

    function initDelphiStake(uint _value, EIP20 _token, string _data, uint _lockupPeriod, address _arbiter)
    public
    {
        require(token == address(0)); // only possible if init hasn't been called before
        require(_token.transferFrom(msg.sender, this, _value));
        claimableStake = _value;
        token = _token;
        data = _data;
        lockupPeriod = _lockupPeriod;
        lockupRemaining = _lockupPeriod;
        arbiter = _arbiter;
        staker = msg.sender;

    }

    function whitelistClaimant(address _claimant)
    public
    onlyStaker
    {
      allowedClaimants[_claimant] = true;
      ClaimantWhitelisted(_claimant);
    }

    function openClaim(address _claimant, uint _amount, uint _fee, string _data)
    public
    notStakerOrArbiter
    stakerCanPay(_amount, _fee)
    isWhitelisted
    {
        require(token.transferFrom(_claimant, this, _fee));
        claims.push(Claim(_claimant, _amount, _fee, 0, _data, 0, false, false, false));
        openClaims ++;
        claimableStake -= (_amount + _fee);
        // the claim amount and claim fee are locked up in this contract until the arbiter rules

        pauseLockup();
        ClaimOpened(msg.sender, claims.length - 1);
    }

    function increaseClaimFee(uint _claimId, uint _amount)
    public
    validClaimID(_claimId)
    claimNotRuled(_claimId)
    {
      require(token.transferFrom(msg.sender, this, _amount));
      claims[_claimId].surplusFee += _amount;
      FeeIncreased(msg.sender, _claimId, _amount);
    }

    function proposeSettlement(uint _claimId, uint _amount)
    public
    validClaimID(_claimId)
    onlyStakerOrClaimant(_claimId)
    {
      require((claims[_claimId].amount + claims[_claimId].fee) >= _amount);
      // only allows settlements for up to the amount that's already been staked by the staker as pertaining to this case

      if (msg.sender == staker){
        settlements[_claimId].push(Settlement(_amount, true, false));
      } else {
        settlements[_claimId].push(Settlement(_amount, false, true));
      }
      SettlementProposed(msg.sender, _claimId, settlements[_claimId].length - 1);
    }

    function acceptSettlement(uint _claimId, uint _settlementId)
    public
    validClaimID(_claimId)
    validSettlementId(_claimId, _settlementId)
    onlyStakerOrClaimant(_claimId)
    {
      Settlement storage settlement = settlements[_claimId][_settlementId];
      Claim storage claim = claims[_claimId];
      if (msg.sender == staker){
        settlement.stakerAgrees = true;
      } else {
        settlement.claimantAgrees = true;
      }

      if (settlement.claimantAgrees &&
          settlement.stakerAgrees &&
          !claim.settlementFailed &&
          !claim.ruled){
        claim.ruled = true;
        require(token.transfer(claim.claimant, (settlement.amount + claim.fee)));
        claimableStake += (claim.amount + claim.fee - settlement.amount);

      }

      SettlementAccepted(msg.sender, _claimId, _settlementId);
    }

    function settlementFailed(uint _claimId)
    public
    validClaimID(_claimId)
    onlyStakerOrClaimant(_claimId)
    {
      claims[_claimId].settlementFailed = true;
      SettlementFailed(msg.sender, _claimId);
    }

    function ruleOnClaim(uint _claimId, uint _ruling)
    public
    onlyArbiter
    validClaimID(_claimId)
    claimNotRuled(_claimId)
    settlementDidFail(_claimId)
    {
        Claim storage claim = claims[_claimId];
        claim.ruled = true;
        claim.ruling = _ruling;
        if (_ruling == 0){
          require(token.transfer(arbiter, (claim.fee + claim.surplusFee)));
        } else if (_ruling == 1){
          claimableStake += (claim.amount + claim.fee);
          require(token.transfer(arbiter, (claim.fee + claim.surplusFee)));
        } else if (_ruling == 2){
          require(token.transfer(arbiter, (claim.fee + claim.fee + claim.surplusFee)));
          require(token.transfer(address(0), claim.amount));
          // burns the claim amount in the event of collusion
        } else if (_ruling == 3){
          claimableStake += (claim.amount + claim.fee);
          // TODO: send fsurplus to arbiters
        }

        openClaims--;
        if (openClaims == 0){
            lockupEnding = now + lockupRemaining;
        }
        ClaimRuled(_claimId);
    }

    function withdrawClaimAmount(uint _claimId)
    public
    validClaimID(_claimId)
    onlyClaimant(_claimId)
    claimUnpaid(_claimId)
    {
        Claim storage claim = claims[_claimId];
        if (claim.ruling == 0 || claim.ruling == 3){
            claim.paid = true;
            require(token.transfer(claim.claimant, (claim.amount + claim.fee)));
        }
    }

    function increaseStake(uint _value)
    public
    onlyStaker
    {
        require(token.transferFrom(msg.sender, this, _value));
        claimableStake += _value;
    }

    function initiateWithdrawStake()
    public
    onlyStaker
    withdrawalNotInitiated
    {
       lockupEnding = now + lockupPeriod;
       lockupRemaining = lockupPeriod;
       withdrawInitiated = true;
       WithdrawInitiated();
    }

    function finalizeWithdrawStake()
    public
    onlyStaker
    lockupElapsed
    {
       uint oldStake = claimableStake;
       claimableStake = 0;
       require(token.transfer(staker, oldStake));
       withdrawInitiated = false;
       lockupEnding = 0;
       lockupRemaining = lockupPeriod;
       WithdrawFinalized();
    }

    function pauseLockup()
    internal
    {
        if (lockupEnding != 0){
          lockupRemaining = lockupEnding - now;
          lockupEnding = 0;
        }
        WithdrawPaused();
    }

    function getNumClaims()
    public
    view
    returns (uint)
    {
      return claims.length;
    }

    function getTotalFeeForClaim(uint _claimId)
    public
    view
    returns (uint)
    {
      Claim storage claim = claims[_claimId];
      require(claim.ruled);

      return claim.fee + claim.surplusFee;
    }

}
