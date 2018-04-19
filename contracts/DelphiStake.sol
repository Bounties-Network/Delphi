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
    event StakeWithdrawn();


    struct Claim {
      address claimant;
      uint amount;
      uint fee;
      uint surplusFee;
      string data;
      uint ruling;
      bool ruled;
      bool settlementFailed;
    }

    struct Settlement {
      uint amount;
      bool stakerAgrees;
      bool claimantAgrees;
    }

    address public masterCopy;

    uint public minimumFee;

    uint public claimableStake;
    EIP20 public token;

    string public data;

    address public staker;
    address public arbiter;

    uint public claimDeadline;

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

    modifier largeEnoughFee(uint _newFee){
        require(_newFee >= minimumFee);
        _;
    }

    modifier claimNotRuled(uint _claimId){
        require(!claims[_claimId].ruled);
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

    modifier settlementDidNotFail(uint _claimId){
        require(!claims[_claimId].settlementFailed);
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

    modifier isWhitelisted(address _claimant){
      require(allowedClaimants[_claimant]);
      _;
    }

    modifier noOpenClaims(){
      require(openClaims == 0);
      _;
    }

    modifier isPastClaimDeadline(){
      require (now > claimDeadline);
      _;
    }

    function initDelphiStake(uint _value, EIP20 _token, uint _minimumFee, string _data, uint _caimDeadline, address _arbiter)
    public
    {
        require(token == address(0)); // only possible if init hasn't been called before
        require(_claimDeadline > now);
        require(_arbiter != address(0));
        require(_token.transferFrom(msg.sender, this, _value));
        claimableStake = _value;
        token = _token;
        minimumFee = _minimumFee;
        data = _data;
        claimDeadline = _claimDeadline;
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
    isWhitelisted(_claimant)
    largeEnoughFee(_fee)
    {
        require(token.transferFrom(_claimant, this, _fee));
        claims.push(Claim(_claimant, _amount, _fee, 0, _data, 0, false, false));
        openClaims ++;
        claimableStake -= (_amount + _fee);
        // the claim amount and claim fee are locked up in this contract until the arbiter rules

        ClaimOpened(msg.sender, claims.length - 1);
    }

    function openClaimWithoutSettlement(address _claimant, uint _amount, uint _fee, string _data)
    public
    notStakerOrArbiter
    stakerCanPay(_amount, _fee)
    isWhitelisted(_claimant)
    largeEnoughFee(_fee)
    {
        require(token.transferFrom(_claimant, this, _fee));
        claims.push(Claim(_claimant, _amount, _fee, 0, _data, 0, false, true));
        openClaims ++;
        claimableStake -= (_amount + _fee);
        // the claim amount and claim fee are locked up in this contract until the arbiter rules

        ClaimOpened(msg.sender, claims.length - 1);
    }

    function increaseClaimFee(uint _claimId, uint _amount)
    public
    validClaimID(_claimId)
    claimNotRuled(_claimId)
    settlementDidFail(_claimId)
    {
      require(token.transferFrom(msg.sender, this, _amount));
      claims[_claimId].surplusFee += _amount;
      FeeIncreased(msg.sender, _claimId, _amount);
    }

    function proposeSettlement(uint _claimId, uint _amount)
    public
    validClaimID(_claimId)
    onlyStakerOrClaimant(_claimId)
    settlementDidNotFail(_claimId)
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
    settlementDidNotFail(_claimId)
    {
      Settlement storage settlement = settlements[_claimId][_settlementId];
      Claim storage claim = claims[_claimId];
      if (msg.sender == staker){
        settlement.stakerAgrees = true;
      } else {
        settlement.claimantAgrees = true;
      }

      require (settlement.claimantAgrees &&
              settlement.stakerAgrees &&
              !claim.settlementFailed &&
              !claim.ruled);

      claim.ruled = true;
      claim.paid = true;
      require(token.transfer(claim.claimant, (settlement.amount + claim.fee)));
      claimableStake += (claim.amount + claim.fee - settlement.amount);
      openClaims--;

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
          require(token.transfer(claim.claimant, (claim.amount + claim.fee)));
        } else if (_ruling == 1){
          claimableStake += (claim.amount + claim.fee);
          require(token.transfer(arbiter, (claim.fee + claim.surplusFee)));
        } else if (_ruling == 2){
          require(token.transfer(arbiter, (claim.fee + claim.fee + claim.surplusFee)));
          require(token.transfer(address(0), claim.amount));
          // burns the claim amount in the event of collusion
        } else if (_ruling == 3){
          claimableStake += (claim.amount + claim.fee);
          require(token.transfer(claim.claimant, (claim.amount + claim.fee)));
          // TODO: send fsurplus to arbiters
        } else {
          revert();
        }
        openClaims--;

        ClaimRuled(_claimId);
    }

    function increaseStake(uint _value)
    public
    onlyStaker
    {
        require(token.transferFrom(msg.sender, this, _value));
        claimableStake += _value;
    }

    function increaseClaimDeadline(uint _newClaimDeadline)
    public
    onlyStaker
    {
        require(_newClaimDeadline > claimDeadline);
        claimDeadline = _newClaimDeadline;
    }

    function withdrawStake()
    public
    onlyStaker
    isPastClaimDeadline
    noOpenClaims
    {
        uint oldStake = claimableStake;
        claimableStake = 0;
        require(token.transfer(staker, oldStake));
        StakeWithdrawn();
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
