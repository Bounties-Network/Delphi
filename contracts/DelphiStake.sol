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
    event WithdrawInitiated();
    event WithdrawalPaused();
    event WithdrawalResumed();
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

    address public masterCopy; // THIS MUST ALWAYS BE IN THE FIRST STORAGE SLOT

    uint public minimumFee;

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

    modifier largeEnoughFee(uint _newFee){
        require(_newFee >= minimumFee);
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
        // if lockupEnding is 0, it means the lockup is paused due to outstanding claims
        require(now >= lockupEnding && lockupEnding != 0);
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

    /*
    @dev initializes the DelphiStake contract's storage. Must be invoked before anything else can 
    be done.
    @param _value the number of tokens to stake
    @param _token the token which this stake is denominated in
    @param _minimumFee
    @param _data an arbitrary string, perhaps an IPFS hash, containing any data the staker likes
    @param _lockupPeriod the duration the staker will have to wait between initializing a
    withdrawal and finalizing it, during which claims can be made against them
    @param _arbiter the entity which can adjudicate in claims made against this stake
    */
    function initDelphiStake(uint _value, EIP20 _token, uint _minimumFee, string _data, uint _lockupPeriod, address _arbiter)
    public
    {
        // This function can only be called if it hasn't been called before, or if the token was
        // set to 0 when it was called previously.
        require(token == address(0));

        // Require reasonable inputs
        require(_lockupPeriod > 0);
        require(_arbiter != address(0));

        // Revert if the specified value to stake cannot be transferred in
        require(_token.transferFrom(msg.sender, this, _value));

        // Initialize contract storage.
        claimableStake = _value;
        token = _token;
        minimumFee = _minimumFee;
        data = _data;
        lockupPeriod = _lockupPeriod;
        lockupRemaining = _lockupPeriod;
        arbiter = _arbiter;
        staker = msg.sender;
    }

    /*
    @dev before going into business with a staker, the staker's counterparty should expect to be
    "whitelisted for claims" such that a clear path exists for the adjudication of disputes should
    one arise in the course of events.
    @param _claimant an address which, once whitelisted, can make claims against this stake
    */
    function whitelistClaimant(address _claimant)
    public
    onlyStaker
    {
      // Whitelist the claimant by setting their entry in the allowedClaimants mapping to true
      allowedClaimants[_claimant] = true;

      // Emit an event noting that this claimant was whitelisted
      ClaimantWhitelisted(_claimant);
    }

    /*
    @dev a whitelisted claimant can use this function to make a claim for remuneration. Once
    opened, an opportunity for pre-arbitration settlement will commence, but claims cannot be
    unilaterally cancelled. Only whitelisted claimants can open claims, but in doing so they can
    specify any address to then act as the claimant for the course of the adjudication. Practically,
    this means that whitelisted claimants can open claims on behalf of others.
    @param _claimant the entity which will act as the claimant in the course of the adjudication.
    Does not need to be whitelisted.
    @param _amount the size of the claim being made, denominated in the stake's token. Must be less
    than or equal to the current amount of stake not locked up in other disputes.
    @param _fee the size of the fee, denominated in the stake's token, to be offered to the arbiter
    as compensation for their service in adjudicating the dispute. If the claimant loses the claim,
    they lose this fee.
    @param _data an arbitrary string, perhaps an IPFS hash, containing data substantiating the
    basis for the claim.
    */
    function openClaim(address _claimant, uint _amount, uint _fee, string _data)
    public
    notStakerOrArbiter
    stakerCanPay(_amount, _fee)
    isWhitelisted(_claimant)
    largeEnoughFee(_fee)
    {
        // Transfer the fee into the DelphiStake
        require(token.transferFrom(_claimant, this, _fee));

        // Add a new claim to the claims array and increment the openClaims counter. Because there
        // is necessarily at least one open claim now, pause any active withdrawal (lockup)
        // countdown.
        claims.push(Claim(_claimant, _amount, _fee, 0, _data, 0, false, false, false));
        openClaims ++;
        pauseLockup();

        // The claim amount and claim fee are reserved for this particular claim until the arbiter
        // rules
        claimableStake -= (_amount + _fee);

        // Emit an event that a claim was opened by the message sender (not the claimant), and
        // include the claim's ID.
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
        claims.push(Claim(_claimant, _amount, _fee, 0, _data, 0, false, false, true));
        openClaims ++;
        claimableStake -= (_amount + _fee);
        // the claim amount and claim fee are locked up in this contract until the arbiter rules

        pauseLockup();
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

      // Set this claim's ruled and paid flags to true to prevent further actions (settlements or
      // arbitration) being taken against this claim.
      claim.ruled = true;
      claim.paid = true;

      // Increase the stake's claimable stake by the claim amount and fee, minus the agreed
      // settlement amount. Then decrement the openClaims counter, since this claim is resolved.
      claimableStake += (claim.amount + claim.fee - settlement.amount);
      decrementOpenClaims();

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
          // TODO: send fsurplus to arbiters
          // TODO: send claim.fee to claimant
        }

        // The claim is ruled. Decrement the total number of open claims.
        decrementOpenClaims();

        // Emit an event stating which claim was ruled.
        ClaimRuled(_claimId);
    }

    /*
    @dev Victorious claimants can invoke withdrawClaimAmount to claim what they are owed.
    @param _claimId the ID of the claim to take a remuneration for.
    */
    function withdrawClaimAmount(uint _claimId)
    public
    validClaimID(_claimId)
    onlyClaimant(_claimId)
    claimUnpaid(_claimId)
    {
        Claim storage claim = claims[_claimId];

        if (claim.ruling == 0 || claim.ruling == 3){
            // If the claim was justified, or a fault, set the paid flag for this claim to true
            // and transfer the claim amount and fee to the claimant.
            claim.paid = true;
            require(token.transfer(claim.claimant, (claim.amount + claim.fee)));
        }
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
    }

    /*
    @dev This is step one of a two-step withdrawal process for a stake owner getting their stake
    out of the stake contract. Once initiateWithdrawStake is invoked, a countdown begins. When the
    countdown complete, the stake becomes withdrawable using finalizeWithdrawStake. The countdown
    becomes paused if a claim is opened during the countdown, and resumes when the claimCounter
    resets to zero.
    */
    function initiateWithdrawStake()
    public
    onlyStaker
    withdrawalNotInitiated
    noOpenClaims
    {
       // The lockup period ends lockupPediod seconds in the future.
       lockupEnding = now + lockupPeriod;

       // Right now, there are lockupPeriod seconds remaining in the countdown.
       lockupRemaining = lockupPeriod;

       // Set the withdraw initiated flag to true, and emit a WithdrawInitiated event.
       withdrawInitiated = true;
       WithdrawInitiated();
    }

    /*
    @dev Step two of the two-step withdrawal process. If the lockupEnding time is in the past, but
    not zero, the stake can be withdrawn.
    */
    function finalizeWithdrawStake()
    public
    onlyStaker
    lockupElapsed
    {
       // Capture the claimable stake amount when the withdraw is initiated, then set claimable
       // stake to zero.
       uint oldStake = claimableStake;
       claimableStake = 0;

       // Transfer the stake to the staker.
       require(token.transfer(staker, oldStake));

       // Now that the withdrawal is complete, reset all withdrawal/lockup related values to their
       // default values.
       withdrawInitiated = false;
       lockupEnding = 0;
       lockupRemaining = lockupPeriod;

       // Emit a withdrawFinalized event.
       WithdrawFinalized();
    }

    /*
    @dev Internal function called in openClaim to pause the withdrawal countdown when a new claim
    is opened.
    */
    function pauseLockup()
    internal
    {
        if (lockupEnding != 0){
          // Capture the remaining lockup time (for when the countdown resumes) as the current
          // lockup ending time minus the current time. So if there are 15 minutes left when you
          // get paused, we can later resume the countdown with 15 minutes to go.
          lockupRemaining = lockupEnding - now;
          
          // Pause the active withdrawal by setting lockupEnding to zero.
          lockupEnding = 0;
        }

        // Emit a WithdrawalPaused event
        // TODO: Move this inside the if clause, since otherwise no lockup was actually paused.
        WithdrawalPaused();
    }

    /*
    @dev Internal function called in acceptSettlement and ruleOnClaim. It decrements the openClaims
    counter and, if the openClaims counter is zero after doing that, resumes and paused withdrawals
    */
    function decrementOpenClaims()
    internal
    {
      // Decrement openClaims
      openClaims--;

      if (openClaims == 0){
          // If there are now no open claims, set the lockupEnding time now plus the previously
          // computed lockupRemaining (see pauseLockup) and fire a withdrawalResumed event.
          lockupEnding = now + lockupRemaining;
          WithdrawalResumed();
      }
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
    @dev Getter function to return the total available fee for any historical claim which has
    been ruled.
    */
    function getTotalFeeForClaim(uint _claimId)
    public
    view
    returns (uint)
    {
      Claim storage claim = claims[_claimId];
      require(claim.ruled); // Only return results for ruled claims

      // THe total available fee is the claim fee, plus any surplus fee provided by either party
      return claim.fee + claim.surplusFee;
    }

}
