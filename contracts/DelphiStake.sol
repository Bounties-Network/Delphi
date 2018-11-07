pragma solidity ^0.4.18;

import "openzeppelin-solidity/contracts/token/ERC20/ERC20.sol";


contract DelphiStake {

    event ClaimantWhitelisted(address _claimant, uint _whitelistId, uint _deadline, string _data);
    event WhitelistDeadlineExtended(uint _whitelistId, uint _newDeadline);
    event ClaimOpened(address _claimant, uint _whitelistId, uint _claimId);
    event ClaimOpenedWithoutSettlement(address _claimant, uint _whitelistId, uint _claimId);
    event FeeIncreased(address _increasedBy, uint _claimId, uint _amount);
    event ClaimAccepted(uint _claimId);
    event SettlementProposed(address _proposedBy, uint _claimId, uint _settlementId);
    event SettlementAccepted(address _acceptedBy, uint _claimId, uint _settlementId);
    event SettlementFailed(address _failedBy, uint _claimId, string _data);
    event ClaimRuled(uint _claimId, uint _ruling);
    event ReleaseTimeIncreased(uint _releaseTime);
    event StakeWithdrawn(uint _amount);
    event StakeIncreased(address _increasedBy, uint _value);


    struct Claim {
      uint whitelistId;
      address claimant;
      uint amount;
      uint fee;
      uint surplusFee;
      string data;
      uint ruling; // 1=justified, 2=not justified, 3=collusive, 4=settled
      bool settlementFailed;
    }

    struct Settlement {
      uint amount;
      bool stakerAgrees;
      bool claimantAgrees;
    }

    struct Whitelist {
      address claimant;
      address arbiter;
      uint minimumFee;
      uint deadline;
      string data;
    }

    address public masterCopy; // THIS MUST ALWAYS BE IN THE FIRST STORAGE SLOT
    address public staker;

    uint public claimableStake;
    uint public openClaims;
    uint public releaseTime;

    string public data;

    ERC20 public token;
    Claim[] public claims;
    Whitelist[] public whitelist;

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

    modifier validWhitelistId(uint _whitelistId){
        require(_whitelistId < whitelist.length);
        _;
    }

    modifier onlyArbiter(uint _claimId){
        require(msg.sender == whitelist[claims[_claimId].whitelistId].arbiter);
        _;
    }

    modifier isBeforeDeadline(uint _whitelistId){
        require(now <= whitelist[_whitelistId].deadline);
        _;
    }

    modifier largeEnoughFee(uint _whitelistId, uint _newFee){
        require(_newFee >= whitelist[_whitelistId].minimumFee);
        _;
    }

    modifier claimNotRuled(uint _claimId){
        require(claims[_claimId].ruling == 0);
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

    modifier onlyWhitelistedClaimant(uint _whitelistId){
      require(msg.sender == whitelist[_whitelistId].claimant);
      _;
    }

    modifier noOpenClaims(){
      require(openClaims == 0);
      _;
    }

    modifier stakeIsReleased(){
      require (now > releaseTime);
      _;
    }

    /*
    @dev when creating a new Delphi Stake using a proxy contract architecture, a user must
    initialialize their stake, depositing their tokens
    @param _staker the address which is creating the stake through the proxy contract
    @param _value the value of the stake in token units
    @param _token the address of the token being deposited
    @param _data a content hash of the relevant associated data describing the stake
    @param _releaseTime the earliest moment that a stake can be withdrawn by the staker
    */
    function initializeStake(address _staker, uint _value, ERC20 _token, string _data, uint _releaseTime)
    public
    {
        require(_releaseTime > now);

        // This function can only be called if it hasn't been called before, or if the token was
        // set to 0 when it was called previously.
        require(token == address(0));

        claimableStake = _value;
        token = _token;
        data = _data;
        releaseTime = _releaseTime;
        staker = _staker;

        require(_token.transferFrom(msg.sender, this, _value));
    }

    /*
    @dev before going into business with a staker, the staker's counterparty should expect to be
    "whitelisted for claims" such that a clear path exists for the adjudication of disputes should
    one arise in the course of events.
    @param _claimant an address which, once whitelisted, can make claims against this stake
    @param _arbiter an address which will rule on any claims this whitelisted claimant will open
    @param _minimumFee the minum fee the new claimant must deposit when opening a claim
    @param _deadline the deadline for which any claims should be opened
    @param _data an IPFS hash representing the scope and terms of the whitelisting
    */
    function whitelistClaimant(address _claimant, address _arbiter, uint _minimumFee, uint _deadline, string _data)
    public
    onlyStaker
    {
      require(
        _claimant != staker &&
        _claimant != _arbiter
      );

      whitelist.push(Whitelist(_claimant, _arbiter, _minimumFee, _deadline, _data));
      emit ClaimantWhitelisted(_claimant, whitelist.length - 1, _deadline, _data);
    }

    /*
    @dev if a staker desires, they may extend the deadline before which a particular claimant may open a claim
    @param _whitelistId the index of the whitelisting whose deadline is being extended
    @param _newDeadline the new deadline for opening claims
    */
    function extendDeadline(uint _whitelistId, uint _newDeadline)
    public
    onlyStaker
    {
      require(_newDeadline > whitelist[_whitelistId].deadline);

      whitelist[_whitelistId].deadline = _newDeadline;
      emit WhitelistDeadlineExtended(_whitelistId, _newDeadline);
    }

    /*
    @dev a whitelisted claimant can use this function to make a claim for remuneration. Once
    opened, an opportunity for pre-arbitration settlement will commence, but claims cannot be
    unilaterally cancelled.
    @param _whitelistId the index of the whitelisting corresponding to the claim
    @param _amount the size of the claim being made, denominated in the stake's token. Must be less
    than or equal to the current amount of stake not locked up in other disputes, minus the fee deposited.
    @param _fee the size of the fee, denominated in the stake's token, to be offered to the arbiter
    as compensation for their service in adjudicating the dispute. If the claimant loses the claim,
    they lose this fee.
    @param _data an arbitrary string, perhaps an IPFS hash, containing data substantiating the
    basis for the claim.
    */
    function openClaim(uint _whitelistId, uint _amount, uint _fee, string _data)
    public
    validWhitelistId(_whitelistId)
    stakerCanPay(_amount, _fee)
    onlyWhitelistedClaimant(_whitelistId)
    isBeforeDeadline(_whitelistId)
    largeEnoughFee(_whitelistId, _fee)
    {
        claims.push(Claim(_whitelistId, msg.sender, _amount, _fee, 0, _data, 0, false));
        openClaims ++;

        // The claim amount and claim fee are reserved for this particular claim until the arbiter rules
        claimableStake -= (_amount + _fee);

        require(token.transferFrom(msg.sender, this, _fee));

        emit ClaimOpened(msg.sender, _whitelistId, claims.length - 1);
    }

    /*
    @dev increase the arbiter fee being offered for this claim. Regardless of how the claim is
    ruled, this fee is not returned. The fee cannot be increased while still in the settlement
    phase, or after a ruling has been submitted.
    @param _claimId the ID of the claim to boost the fee for
    @param _amount the amount, denominated in the stake's token, to increase the fee by
    */
    function addSurplusFee(uint _claimId, uint _amount)
    public
    validClaimID(_claimId)
    claimNotRuled(_claimId)
    settlementDidFail(_claimId)
    {
      require(token.transferFrom(msg.sender, this, _amount));

      claims[_claimId].surplusFee += _amount;
      emit FeeIncreased(msg.sender, _claimId, _amount);
    }

    /*
    @dev once a claim has been opened, the staker may simply accept their claim at face value
    @param _claimId the claim to be accepted
    */
    function acceptClaim(uint _claimId)
    public
    onlyStaker
    validClaimID(_claimId)
    settlementDidNotFail(_claimId)
    {
      Claim storage claim = claims[_claimId];

      require(token.transfer(claim.claimant, (claim.amount + claim.fee)));

      // set the ruling status to "settled"
      claim.ruling = 4;
      claimableStake += claim.fee;
      emit ClaimAccepted(_claimId);
    }

    /*
    @dev once a claim has been opened, either party can propose settlements to resolve the matter
    without getting the arbiter involved. If a settlement is accepted, both parties recover the fee
    they would otherwise forfeit in the arbitration process.
    @param _claimId the claim to propose a settlement amount for
    @param _amount the size of the proposed settlement, denominated in the stake's token
    */
    function proposeSettlement(uint _claimId, uint _amount)
    public
    validClaimID(_claimId)
    settlementDidNotFail(_claimId)
    {
      // Only allow settlements for up to the amount that has been reserved (locked) for this claim
      require((claims[_claimId].amount + claims[_claimId].fee) >= _amount);

      if (msg.sender == staker){
        settlements[_claimId].push(Settlement(_amount, true, false));
      } else if (msg.sender == claims[_claimId].claimant){
        settlements[_claimId].push(Settlement(_amount, false, true));
      } else {
        revert();
      }

      emit SettlementProposed(msg.sender, _claimId, settlements[_claimId].length - 1);
    }

    /*
    @dev once either party in a claim has proposed a settlement, the opposite party can choose to
    accept the settlement. The settlement proposer implicitly accepts, so only the counterparty
    needs to invoke this function.
    @param _claimId the ID of the claim to accept a settlement for
    @param _settlementId the ID of the specific settlement to accept for the specified claim
    */
    function acceptSettlement(uint _claimId, uint _settlementId)
    public
    validClaimID(_claimId)
    validSettlementId(_claimId, _settlementId)
    {
      Settlement storage settlement = settlements[_claimId][_settlementId];
      Claim storage claim = claims[_claimId];

      if (msg.sender == staker){
        settlement.stakerAgrees = true;
      } else if (msg.sender == claims[_claimId].claimant){
        settlement.claimantAgrees = true;
      } else {
        revert();
      }

      // Check if all conditions are met for the settlement to be agreed, and revert otherwise.
      // For a settlement to be agreed, both the staker and claimaint must accept the settlement,
      // settlement must not have been rejected previously by either party, and the claim must not
      // be ruled. Claims are ruled for which settlements have been accepted, so this prevents
      // multiple settlements from being accepted for a single claim.
      require (
        settlement.claimantAgrees &&
        settlement.stakerAgrees &&
        !claim.settlementFailed &&
        claim.ruling == 0
      );

      // Set this claim's ruling to "settled"
      claim.ruling = 4;

      // Increase the stake's claimable stake by the claim amount and fee, minus the agreed settlement amount.
      claimableStake += (claim.amount + claim.fee - settlement.amount);
      openClaims --;

      require(token.transfer(claim.claimant, (settlement.amount + claim.fee)));

      emit SettlementAccepted(msg.sender, _claimId, _settlementId);
    }

    /*
    @dev Either party in a claim can call settlementFailed at any time to move the claim from
    settlement to arbitration.
    @param _claimId the ID of the claim to reject settlement for
    @param _data the IPFS hash of a json object detailing the reason for rejecting settlements
    */
    function settlementFailed(uint _claimId, string _data)
    public
    validClaimID(_claimId)
    settlementDidNotFail(_claimId)
    {
      require(msg.sender == staker || msg.sender == claims[_claimId].claimant);

      claims[_claimId].settlementFailed = true;
      emit SettlementFailed(msg.sender, _claimId, _data);
    }

    /*
    @dev This function can only be invoked by the stake's arbiter, and is used to resolve the
    claim. Invoking this function will rule the claim and pay out the appropriate parties.
    @param _claimId The ID of the claim to submit the ruling for
    @param _ruling The ruling. 0 if the claim is justified, 1 if the claim is not justified, 2 if
    the claim is collusive (the claimant is the staker or an ally of the staker), or 3 if the claim
    cannot be ruled for any reason.
    */
    function ruleOnClaim(uint _claimId, uint _ruling)
    public
    validClaimID(_claimId)
    onlyArbiter(_claimId)
    claimNotRuled(_claimId)
    settlementDidFail(_claimId)
    {
        Claim storage claim = claims[_claimId];
        address arbiter = msg.sender;

        if (_ruling == 1){
          claim.ruling = 1;
          // Claim is justified. Transfer to the arbiter the staker's fee.
          require(token.transfer(arbiter, (claim.fee + claim.surplusFee)));
          require(token.transfer(claim.claimant, (claim.amount + claim.fee)));
        } else if (_ruling == 2){
          claim.ruling = 2;

          // Claim is not justified. Restore claimable state, send claimant fees to arbiter.
          claimableStake += (claim.amount + claim.fee);
          require(token.transfer(arbiter, (claim.fee + claim.surplusFee)));
        } else if (_ruling == 3){
          claim.ruling = 3;

          // Claim is collusive. Arbiter gets all fees, claim is burned.
          require(token.transfer(arbiter, (claim.fee + claim.fee + claim.surplusFee)));
          require(token.transfer(address(0), claim.amount));
        } else {
          // Claim cannot be ruled. Free up the claim amount and fee.
          claimableStake += (claim.amount + claim.fee);
          require(token.transfer(claim.claimant, (claim.fee)));

          // Transfers of 0 tokens will throw automatically
          if (claim.surplusFee > 0){
            require(token.transfer(arbiter, (claim.surplusFee)));
          }
        }

        openClaims--;
        emit ClaimRuled(_claimId, _ruling);
    }

    /*
    @dev Increases the stake in this DelphiStake
    @param _value the number of tokens to transfer into this stake
    */
    function increaseStake(uint _value)
    public
    onlyStaker
    {
        claimableStake += _value;
        require(token.transferFrom(msg.sender, this, _value));
        emit StakeIncreased(msg.sender, _value);
    }

    /*
    @dev Increases the stake release time
    @param _releaseTime the new stake release time
    */
    function extendReleaseTime(uint _releaseTime)
    public
    onlyStaker
    {
        require(_releaseTime > releaseTime);
        releaseTime = _releaseTime;
        emit ReleaseTimeIncreased(_releaseTime);
    }

    /*
    @dev Returns the stake to the staker, if the claim deadline has elapsed and no open claims remain
    @param _amount the number of tokens that the staker wishes to withdraw
    */
    function withdrawStake(uint _amount)
    public
    onlyStaker
    stakeIsReleased
    noOpenClaims
    {
        claimableStake -= _amount;
        require(token.transfer(staker, _amount));
        emit StakeWithdrawn(_amount);
    }

    /*
    @dev Getter function to return the total number of claims which have ever been made against
    this stake.
    */
    function getClaimsLength()
    public
    view
    returns (uint)
    {
      return claims.length;
    }

    /*
    @dev Getter function to return the total number of whitelists which have ever been made against
    this stake.
    */
    function getWhitelistLength()
    public
    view
    returns (uint)
    {
      return whitelist.length;
    }

    /*
    @dev Getter function to return the total number of settlements which have ever been made for
    this claim.
    @param _claimId the index of the claim
    */
    function getSettlementsLength(uint _claimId)
    public
    view
    returns (uint)
    {
      return settlements[_claimId].length;
    }

    /*
    @dev Getter function to return the total available fee for any historical claim
    */
    function getTotalFeeForClaim(uint _claimId)
    public
    view
    returns (uint)
    {
      Claim storage claim = claims[_claimId];
      return claim.fee + claim.surplusFee;
    }

}
