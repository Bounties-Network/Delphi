pragma solidity ^0.4.18;

import "tokens/eip20/EIP20.sol";


contract DelphiStake {

    event ClaimantWhitelisted(address _claimant);
    event ClaimOpened(address _claimant, uint _claimId);
    event FeeIncreased(address _increasedBy, uint _claimId, uint _amount);
    event SettlementProposed(address _proposedBy, uint _claimId, uint _settlementId);
    event SettlementAccepted(address _acceptedBy, uint _claimId, uint _settlementId);
    event SettlementFailed(address _failedBy, uint _claimId);
    event ClaimRuled(uint _claimId);
    event ReleaseTimeIncreased(uint _stakeReleaseTime);
    event StakeWithdrawn();
    event StakeIncreased(address _increasedBy, uint _value);


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

    address public masterCopy; // THIS MUST ALWAYS BE IN THE FIRST STORAGE SLOT

    uint public minimumFee;

    uint public claimableStake;
    EIP20 public token;

    string public data;

    address public staker;
    address public arbiter;

    uint public stakeReleaseTime;

    Claim[] public claims;
    uint public openClaims;
    mapping(uint => Settlement[]) public settlements;

    mapping(address => uint) public whitelistedDeadlines;

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
        require(msg.sender != staker && msg.sender != arbiter);
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

    modifier onlyWhitelistedClaimant(){
      require(whitelistedDeadlines[msg.sender] >= now);
      _;
    }

    modifier noOpenClaims(){
      require(openClaims == 0);
      _;
    }

    modifier stakeIsReleased(){
      require (now > stakeReleaseTime);
      _;
    }

    /*
    @dev when creating a new Delphi Stake using a proxy contract architecture, a user must
    initialialize their stake, depositing their tokens
    @param _value the value of the stake in token units
    @param _token the address of the token being deposited
    @param _minimumFee the minimum fee which must be deposited by both parties for each claim
    @param _data a content hash of the relevant associated data describing the stake
    @param _claimDeadline the deadline for opening new cliams; the earliest moment that
    a stake can be withdrawn by the staker
    @param _arbiter the address which is able to rule on open claims
    */
    function initDelphiStake(uint _value, EIP20 _token, uint _minimumFee, string _data, uint _stakeReleaseTime, address _arbiter)
    public
    {
        require(_stakeReleaseTime > now);

        // This function can only be called if it hasn't been called before, or if the token was
        // set to 0 when it was called previously.
        require(token == address(0));

        // Require reasonable inputs
        require(_arbiter != address(0));

        // Revert if the specified value to stake cannot be transferred in
        require(_token.transferFrom(msg.sender, this, _value));

        // Initialize contract storage.
        claimableStake = _value;
        token = _token;
        minimumFee = _minimumFee;
        data = _data;
        stakeReleaseTime = _stakeReleaseTime;
        arbiter = _arbiter;
        staker = msg.sender;
    }

    /*
    @dev before going into business with a staker, the staker's counterparty should expect to be
    "whitelisted for claims" such that a clear path exists for the adjudication of disputes should
    one arise in the course of events.
    @param _claimant an address which, once whitelisted, can make claims against this stake
    @param _deadline the timestamp before which the whitelisted individual may open a claim
    */
    function whitelistClaimant(address _claimant, uint _deadline)
    public
    onlyStaker
    {
      // the new deadline should be greater than the existing one
      require(_deadline >= whitelistedDeadlines[_claimant]);

      // Whitelist the claimant by setting their entry in the whitelistedDeadlines mapping to their deadline
      whitelistedDeadlines[_claimant] = _deadline;

      // Emit an event noting that this claimant was whitelisted
      ClaimantWhitelisted(_claimant);
    }

    /*
    @dev a whitelisted claimant can use this function to make a claim for remuneration. Once
    opened, an opportunity for pre-arbitration settlement will commence, but claims cannot be
    unilaterally cancelled.
    @param _amount the size of the claim being made, denominated in the stake's token. Must be less
    than or equal to the current amount of stake not locked up in other disputes, minus the fee deposited.
    @param _fee the size of the fee, denominated in the stake's token, to be offered to the arbiter
    as compensation for their service in adjudicating the dispute. If the claimant loses the claim,
    they lose this fee.
    @param _data an arbitrary string, perhaps an IPFS hash, containing data substantiating the
    basis for the claim.
    */
    function openClaim(uint _amount, uint _fee, string _data)
    public
    notStakerOrArbiter
    stakerCanPay(_amount, _fee)
    onlyWhitelistedClaimant
    largeEnoughFee(_fee)
    {
        // Transfer the fee into the DelphiStake
        require(token.transferFrom(msg.sender, this, _fee));

        // Add a new claim to the claims array and increment the openClaims counter. Because there
        // is necessarily at least one open claim now, pause any active withdrawal (lockup)
        // countdown.
        claims.push(Claim(msg.sender, _amount, _fee, 0, _data, 0, false, false));
        openClaims ++;

        // The claim amount and claim fee are reserved for this particular claim until the arbiter
        // rules
        claimableStake -= (_amount + _fee);

        // Emit an event that a claim was opened by the message sender (not the claimant), and
        // include the claim's ID.
        ClaimOpened(msg.sender, claims.length - 1);
    }

    /*
    @dev a whitelisted claimant can use this function to make a claim for remuneration. Opened claims
    will proceed directly to full arbitration, when their claims can be ruled upon.
    @param _claimant the entity which will act as the claimant in the course of the adjudication.
    @param _amount the size of the claim being made, denominated in the stake's token. Must be less
    than or equal to the current amount of stake not locked up in other disputes, minus the fee deposited.
    @param _fee the size of the fee, denominated in the stake's token, to be offered to the arbiter
    as compensation for their service in adjudicating the dispute. If the claimant loses the claim,
    they lose this fee.
    @param _data an arbitrary string, perhaps an IPFS hash, containing data substantiating the
    basis for the claim.
    */
    function openClaimWithoutSettlement(uint _amount, uint _fee, string _data)
    public
    notStakerOrArbiter
    stakerCanPay(_amount, _fee)
    onlyWhitelistedClaimant
    largeEnoughFee(_fee)
    {
        require(token.transferFrom(msg.sender, this, _fee));
        claims.push(Claim(msg.sender, _amount, _fee, 0, _data, 0, false, true));
        openClaims ++;

        // The claim amount and claim fee are reserved for this particular claim until the arbiter
        // rules
        claimableStake -= (_amount + _fee);
        // the claim amount and claim fee are locked up in this contract until the arbiter rules

        ClaimOpened(msg.sender, claims.length - 1);
    }

    /*
    @dev increase the arbiter fee being offered for this claim. Regardless of how the claim is
    ruled, this fee is not returned. The fee cannot be increased while still in the settlement
    phase, or after a ruling has been submitted.
    @param _claimId the ID of the claim to boost the fee for
    @param _amount the amount, denominated in the stake's token, to increase the fee by
    */
    function increaseClaimFee(uint _claimId, uint _amount)
    public
    validClaimID(_claimId)
    claimNotRuled(_claimId)
    settlementDidFail(_claimId)
    {
      // Transfer tokens from the message sender to this contract and increment the surplusFee
      // record for this claim by the amount transferred.
      require(token.transferFrom(msg.sender, this, _amount));
      claims[_claimId].surplusFee += _amount;

      // Emit a FeeIncreased event including data on who increased the fee, which claim the fee was
      // increased for, and by what amount.
      FeeIncreased(msg.sender, _claimId, _amount);
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
    onlyStakerOrClaimant(_claimId)
    settlementDidNotFail(_claimId)
    {
      // Only allow settlements for up to the amount that has been reserved (locked) for this claim
      require((claims[_claimId].amount + claims[_claimId].fee) >= _amount);

      // Add a new settlement to this claim's settlement array. Depending on who proposed the
      // settlement, set their "agrees" flag to true upon proposal.
      if (msg.sender == staker){
        settlements[_claimId].push(Settlement(_amount, true, false));
      } else {
        settlements[_claimId].push(Settlement(_amount, false, true));
      }

      // Emit an event including the settlement proposed, the claimID the settlement is proposed
      // for, and the settlement ID.
      SettlementProposed(msg.sender, _claimId, settlements[_claimId].length - 1);
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
    onlyStakerOrClaimant(_claimId)
    settlementDidNotFail(_claimId)
    {
      Settlement storage settlement = settlements[_claimId][_settlementId];
      Claim storage claim = claims[_claimId];

      // Depending on who sent this message, set their agreement flag in the settlement to true
      if (msg.sender == staker){
        settlement.stakerAgrees = true;
      } else {
        settlement.claimantAgrees = true;
      }

      // Check if all conditions are met for the settlement to be agreed, and revert otherwise.
      // For a settlement to be agreed, both the staker and claimaint must accept the settlement,
      // settlement must not have been rejected previously by either party, and the claim must not
      // be ruled. Claims are ruled for which settlements have been accepted, so this prevents
      // multiple settlements from being accepted for a single claim.
      require (settlement.claimantAgrees &&
              settlement.stakerAgrees &&
              !claim.settlementFailed &&
              !claim.ruled);

      // Set this claim's ruled flag to true to prevent further actions (settlements or
      // arbitration) being taken against this claim.
      claim.ruled = true;

      // Increase the stake's claimable stake by the claim amount and fee, minus the agreed
      // settlement amount. Then decrement the openClaims counter, since this claim is resolved.
      claimableStake += (claim.amount + claim.fee - settlement.amount);
      openClaims --;

      // Transfer to the claimant the settlement amount, plus the fee they deposited.
      require(token.transfer(claim.claimant, (settlement.amount + claim.fee)));

      // Emit an event including who accepted the settlement, the claimId and the settlementId
      SettlementAccepted(msg.sender, _claimId, _settlementId);
    }

    /*
    @dev Either party in a claim can call settlementFailed at any time to move the claim from
    settlement to arbitration.
    @param _claimId the ID of the claim to reject settlement for
    */
    function settlementFailed(uint _claimId)
    public
    validClaimID(_claimId)
    onlyStakerOrClaimant(_claimId)
    settlementDidNotFail(_claimId)
    {
      // Set the claim's settlementFailed flag to true, preventing further settlement proposals
      // and settlement agreements.
      claims[_claimId].settlementFailed = true;

      // Emit an event stating who rejected the settlement, and for which claim settlement was
      // rejected.
      SettlementFailed(msg.sender, _claimId);
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
    onlyArbiter
    validClaimID(_claimId)
    claimNotRuled(_claimId)
    settlementDidFail(_claimId)
    {
        Claim storage claim = claims[_claimId];

        // Set the claim's ruled flag to true, and record the ruling.
        claim.ruled = true;
        claim.ruling = _ruling;

        if (_ruling == 0){
          // The claim is justified. Transfer to the arbiter their fee.
          require(token.transfer(arbiter, (claim.fee + claim.surplusFee)));
          require(token.transfer(claim.claimant, (claim.amount + claim.fee)));
        } else if (_ruling == 1){
          // The claim is not justified. Free up the claim amount and fee for future claims, and
          // transfer to the arbiter their fee.
          claimableStake += (claim.amount + claim.fee);
          require(token.transfer(arbiter, (claim.fee + claim.surplusFee)));
        } else if (_ruling == 2){
          // The claim is collusive. Transfer to the arbiter both the staker and claimant fees, and
          // burn the claim amount.
          require(token.transfer(arbiter, (claim.fee + claim.fee + claim.surplusFee)));
          require(token.transfer(address(0), claim.amount));
          // burns the claim amount in the event of collusion
        } else if (_ruling == 3){
          // The claim cannot be ruled. Free up the claim amount and fee.
          claimableStake += (claim.amount + claim.fee);
          require(token.transfer(claim.claimant, (claim.amount + claim.fee)));
          // TODO: send fsurplus to arbiters
        } else {
          revert();
        }

        // The claim is ruled. Decrement the total number of open claims.
        openClaims--;

        // Emit an event stating which claim was ruled.
        ClaimRuled(_claimId);
    }

    /*
    @dev Increases the stake in this DelphiStake
    @param _value the number of tokens to transfer into this stake
    */
    function increaseStake(uint _value)
    public
    onlyStaker
    {
        // Transfer _value tokens from the message sender into this contract, and increment the
        // claimableStake by _value.
        require(token.transferFrom(msg.sender, this, _value));
        claimableStake += _value;
        StakeIncreased(msg.sender, _value);
    }

    /*
    @dev Increases the deadline for opening claims
    @param _newClaimDeadline the unix time stamp (in seconds) before which claims may be opened
    */
    function extendStakeReleaseTime(uint _stakeReleaseTime)
    public
    onlyStaker
    {
        require(_stakeReleaseTime > stakeReleaseTime);
        stakeReleaseTime = _stakeReleaseTime;
        ReleaseTimeIncreased(_stakeReleaseTime);
    }

    /*
    @dev Returns the stake to the staker, if the claim deadline has elapsed and no open claims remain
    @param _newClaimDeadline the unix time stamp (in seconds) before which claims may be opened
    */
    function withdrawStake()
    public
    onlyStaker
    stakeIsReleased
    noOpenClaims
    {
        uint oldStake = claimableStake;
        claimableStake = 0;
        require(token.transfer(staker, oldStake));
        StakeWithdrawn();
    }

    /*
    @dev Getter function to return the total number of claims which have ever been made against
    this stake.
    */
    function getNumClaims()
    public
    view
    returns (uint)
    {
      // Return the length of the claims array. Claims are never removed from this array, no matter
      // if or how they are resolved.
      return claims.length;
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

      // The total available fee is the claim fee, plus any surplus fee provided by either party
      return claim.fee + claim.surplusFee;
    }

}
