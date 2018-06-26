pragma solidity ^0.4.18;

import "tcr/Registry.sol";
import "tcr/Parameterizer.sol";
import "./DelphiStake.sol";
import "dll/DLL.sol";
import "./LookupTable.sol";

contract DelphiVoting {

  event VoteCommitted(address voter, bytes32 claimId, bytes32 secret);
  event VoteRevealed(address voter, bytes32 claimId, uint faction);

  enum VoteOptions { Justified, NotJustified, Collusive, Fault }

  using AttributeStore for AttributeStore.Data;
  using DLL for DLL.Data;

  struct Commit {
    bytes32 commit;
    uint timestamp;
  }

  struct Claim {
    uint commitEndTime;
    uint revealEndTime;
    VoteOptions result;
    mapping(uint => DLL.Data) factions;
    mapping(uint => uint) tallies;
    mapping(address => Commit) commits;
    mapping(address => bool) hasRevealed;
    mapping(address => bool) claimedReward;
  }

  Registry public arbiterSet;
  Parameterizer public parameterizer;
  LookupTable public lt;

  mapping(bytes32 => Claim) public claims;

  modifier onlyArbiters(address _arbiter) {
    require(arbiterSet.isWhitelisted(keccak256(_arbiter)));
    _;
  }

  function init(address _arbiterSet, address _parameterizer, uint _feeDecayValue) public {
    require(_arbiterSet != 0 && arbiterSet == address(0));
    require(_parameterizer != 0 && parameterizer == address(0));

    arbiterSet = Registry(_arbiterSet);
    parameterizer = Parameterizer(_parameterizer);
    lt = new LookupTable(_feeDecayValue);
  }

  /*
  @dev Commits a vote for the specified claim. Can be overwritten while commitPeriod is active
  @param _stake the address of a DelphiStake contract
  @param _claimNumber an initialized claim in the provided DelphiStake
  @param _secretHash keccak256 of a vote and a salt
  */
  function commitVote(address _stake, uint _claimNumber, bytes32 _secretHash)
  public onlyArbiters(msg.sender) {
    bytes32 claimId = keccak256(_stake, _claimNumber);
    DelphiStake ds = DelphiStake(_stake);

    // Do not allow secretHash to be zero
    require(_secretHash != 0);
    // Check if the claim has been instantiated in the DelphiStake.
    // Do not allow voting on claims which are uninitialized in the DS.
    require(_claimNumber < ds.getNumClaims());

    // Check if anybody has ever committed a vote for this claim before. If not, initialize a new
    // claim by setting commit and reveal end times for this claim in the claims mapping
    if(!claimExists(claimId)) {
      initializeClaim(claimId);
    }

    // Do not allow votes to be committed after the commit period has ended
    require(commitPeriodActive(claimId));

    // Set this voter's commit for this claim to their provided secretHash.
    claims[claimId].commits[msg.sender] = Commit({commit: _secretHash, timestamp: block.number});

    // Fire an event saying the message sender voted for this claimID.
    // TODO: Make this event fire the stake and claim number instead of the claimID.
    emit VoteCommitted(msg.sender, claimId, _secretHash);
  }

  /*
  @dev Reveals a vote for the specified claim.
  @param _claimId the keccak256 of a DelphiStake address and a claim number for which the message
  sender has previously committed a vote
  @param _vote the option voted for in the original secret hash.
  @param _salt the salt concatenated to the vote option when originally hashed to its secret form
  @param _previousCommitter the node in the faction's DLL for this claim which should come before
  the one we will insert here. Can be computed using getInsertPoint.
  */
  function revealVote(bytes32 _claimId, uint _vote, uint _salt, address _previousCommitter)
  public onlyArbiters(msg.sender) {
    Claim storage claim = claims[_claimId];

    // Do not allow revealing while the reveal period is not active
    require(revealPeriodActive(_claimId));
    // Do not allow a voter to reveal more than once
    require(!claim.hasRevealed[msg.sender]);
    // Require the provided vote is consistent with the original commit
    require(keccak256(_vote, _salt) == claims[_claimId].commits[msg.sender].commit);

    // We need the nodes on either side of the node we are proposing to insert, so grab the
    // next node of the provided previous node. Once we have these, check if the insertion point
    // is valid with the validPosition function.
    address nextCommitter =
      address(claim.factions[_vote].getNext(uint(_previousCommitter)));
    require(validPosition(_previousCommitter, nextCommitter, _claimId, _vote));

    // Insert the voter into their faction's list, and increment the tally for that vote option
    claim.factions[_vote].insert(uint(_previousCommitter),
                                uint(msg.sender),
                                uint(nextCommitter));
    claim.tallies[_vote]++;

    // Set hasRevealed to true so this voter cannot reveal again
    claim.hasRevealed[msg.sender] = true;


    emit VoteRevealed(msg.sender, _claimId, _vote);
  }

  /*
  @dev prevents a user from inserting themselves ahead of other arbiters improperly by checking
  when they committed their faction vote, and then making sure the arbiter they propose to come
  after committed earlier, and the arbiter they propose to come before committed later.
  @param _previousCommitter an arbiter in the same faction who committed before the msg.sender
  @param _nextCommitter an arbiter in the same faction who committed after the msg.sender
  @param _claimId the claim whose factions are being inspected.
  @param _faction the faction in this claim where we make the insertion
  @return bool asserting whether the proposed insert point is valid or not
  */
  function validPosition(address _previousCommitter, address _nextCommitter, bytes32 _claimId,
                         uint _faction)
  public view returns (bool) {
    Claim storage claim = claims[_claimId];

    // Assert the provided arbiters are all in the same faction (or that we are inserting into the
    // beginning, end of, or into an empty, list.
    require((claim.factions[_faction].contains(uint(_previousCommitter)) ||
             uint(_previousCommitter) == 0) &&
             (claim.factions[_faction].contains(uint(_nextCommitter)) ||
             uint(_nextCommitter) == 0));

    // Assert that the proposed insertion point is between two adjacent nodes
    require(claim.factions[_faction].getNext(uint(_previousCommitter)) == uint(_nextCommitter));

    // Get timestamps for when all of the involved arbiters made their commits
    uint timestamp = claim.commits[msg.sender].timestamp;
    uint prevTimestamp = claim.commits[_previousCommitter].timestamp;
    uint nextTimestamp = claim.commits[_nextCommitter].timestamp;

    // If the committer committed later than the specified previous committer and earlier than
    // the specified next committer, return true. Else false.
    if((prevTimestamp <= timestamp) && ((timestamp <= nextTimestamp) || _nextCommitter == 0)) {
      return true;
    } else {
      return false;
    }
  }

  /*
  @dev computes the _previousCommitter argument required by the revealVote function
  @param _claimId the claim a vote is being revealed for
  @param _committer a committer in the claim being revealed for
  @param _faction the faction of a committer in the claim being revealed for
  @return address the committer (or insert point) the provided committer should insert after
  */
  function getInsertPoint(bytes32 _claimId, address _committer, uint _faction)
  public view returns (address) {
    Claim storage claim = claims[_claimId];

    uint timestamp = claim.commits[_committer].timestamp;
    DLL.Data storage faction = claim.factions[_faction];

    // In this loop, we will iterate over the list until we find an insertion point for our node.
    // When the currentNode is zero, we have reached the end of the list (or the list was empty
    // to start).
    uint currentNode = faction.getStart();
    while(currentNode != 0) {
      uint nextNode = faction.getNext(currentNode);
      // Check whether the committer's timestamp is >= the current committer's && <= the next
      // committer's (or we are inserting at the end of the list)
      if((claim.commits[address(currentNode)].timestamp <= timestamp) &&
        ((timestamp <= claim.commits[address(nextNode)].timestamp) ||
        nextNode == 0)) {
        return address(currentNode);
      }
      currentNode = nextNode;
    }

    // If we reach the end of the list, either the list was empty or our insertion point is at
    // the very beginning.
    return address(0);
  }

  /*
  @dev Submits a ruling to a DelphiStake contract
  @param _stake address of a DelphiStake contract
  @param _claimNumber nonce of a unique claim for the provided stake
  */
  function submitRuling(address _stake, uint _claimNumber) public {
    bytes32 claimId = keccak256(_stake, _claimNumber);
    DelphiStake ds = DelphiStake(_stake);
    Claim storage claim = claims[claimId]; // Grabbing a pointer

    // Do not allow submissions for claims which nobody has voted in
    require(claimExists(claimId));
    // Do not allow submissions where either the commit or reveal periods have not ended
    require(!commitPeriodActive(claimId) && !revealPeriodActive(claimId));

    // Tally the votes and set the result
    tallyVotes(claim);

    // Call the DS contract with the result of the arbitration
    ds.ruleOnClaim(_claimNumber, uint256(claim.result));
  }

  /*
  @dev allow an arbiter who participated in the plurality voting bloc to claim their share of the
  fee
  @param _stake address of a DelphiStake contract
  @param _claimNumber nonce of a unique claim for the provided stake
  @param _vote the option voted for in the original secret hash.
  @param _salt the salt concatenated to the vote option when originally hashed to its secret form
  */
  function claimFee(address _stake, uint _claimNumber, uint _vote, uint _salt)
  public onlyArbiters(msg.sender) {
    DelphiStake ds = DelphiStake(_stake);
    Claim storage claim = claims[keccak256(_stake, _claimNumber)]; // Grabbing a pointer

    // The ruling needs to have been submitted before an arbiter can claim their reward
    require(claimIsRuled(_stake, _claimNumber));
    // Do not allow arbiters to claim rewards for a claim more than once
    require(!claim.claimedReward[msg.sender]);
    // Check that the arbiter actually committed the vote they say they did
    require(keccak256(_vote, _salt) == claim.commits[msg.sender].commit);
    // Require the vote cast was in the plurality
    require(VoteOptions(_vote) == claim.result);

    // Compute the rank of the arbiter in the list
    // TODO: Make this plausibly-live by storing ranks lazily when they're computed
    uint arbiterFactionIndex = 0;
    address indexedArbiter = address(claim.factions[_vote].getStart());
    while(indexedArbiter != msg.sender) {
      indexedArbiter = address(claim.factions[_vote].getNext(uint(indexedArbiter)));
      arbiterFactionIndex++;
    }

    uint arbiterOwedPercentage = lt.getGuaranteedPercentageForIndex(arbiterFactionIndex);
    // pay_i = arbiterOwedPercentage * (fee / 100) + ((100 - LT[n - 1]) / n) * (fee / 100)
    uint arbiterFee =
      arbiterOwedPercentage * (ds.getTotalFeeForClaim(_claimNumber) / 100) +
      ((100 - lt.lt(claim.tallies[_vote] - 1)) / claim.tallies[_vote]) *
      (ds.getTotalFeeForClaim(_claimNumber) / 100);
                                                                  
    require(ds.token().transfer(msg.sender, arbiterFee));

    // Set claimedReward to true so the arbiter cannot claim again
    claim.claimedReward[msg.sender] = true;
  }

  /*
  @dev Checks if the commit period is still active for the specified claim
  @param _claimId Integer identifier associated with target claim
  @return bool indicating whetherh the commit period is active for this claim
  */
  function commitPeriodActive(bytes32 _claimId) view public returns (bool) {
      require(claimExists(_claimId));

      return (block.timestamp < claims[_claimId].commitEndTime);
  }

  /*
  @dev Checks if the reveal period is still active for the specified claim
  @param _claimId the keccak256 of a DelphiStake address and a claim number
  @return bool indicating whetherh the reveal period is active for this claim
  */
  function revealPeriodActive(bytes32 _claimId) view public returns (bool) {
      require(claimExists(_claimId));

      return
        ((!commitPeriodActive(_claimId)) && (block.timestamp < claims[_claimId].revealEndTime));
  }

  /*
  @dev Checks if a claim exists, throws if the provided claim is in an impossible state
  @param _claimId the keccak256 of a DelphiStake address and a claim number
  @return Boolean Indicates whether a claim exists for the provided claimId
  */
  function claimExists(bytes32 _claimId) view public returns (bool) {
    uint commitEndTime = claims[_claimId].commitEndTime;
    uint revealEndTime = claims[_claimId].revealEndTime;

    // It should not be possible that one of these is zero while the other is not.
    assert(!(commitEndTime == 0 && revealEndTime != 0));
    assert(!(commitEndTime != 0 && revealEndTime == 0));

    // If either is zero, this claim does not exist.
    if(commitEndTime == 0 || revealEndTime == 0) { return false; }
    return true;
  }

  /*
  @dev returns the commit hash of the provided arbiter for some claim
  @param _claimId the keccak256 of a DelphiStake address and a claim number
  @return bytes32 the arbiter's commit hash for this claim
  */
  function getArbiterCommitForClaim(bytes32 _claimId, address _arbiter)
  view public returns (bytes32) {
    return claims[_claimId].commits[_arbiter].commit;
  }

  /*
  @dev Returns the number of revealed votes for the provided vote option in a given claim
  @param _claimId the keccak256 of a DelphiStake address and a claim number
  @param _option The vote option to return a total for
  @return uint Tally of revealed votes for the provided option in the given claimId
  */
  function revealedVotesForOption(bytes32 _claimId, uint _option) public view returns (uint) {
    return claims[_claimId].tallies[_option];
  }

  /*
  @dev utility function for determining whether a claim has been ruled. Used by claimFee to 
  determine whether fees should be disbured.
  @param _stake the DelphiStake whose storage is to be inspected.
  @param _claimNumber the unique claim number we are determining if a ruling has been submitted
  for
  @return bool True if a ruling has been submitted for the claim, false otherwise
  */
  function claimIsRuled(address _stake, uint _claimNumber) public view returns (bool) {
    DelphiStake ds = DelphiStake(_stake);
    bool ruled;
    bool settlementFailed;

    // Tuple destructuring. settlementFailed is a throwaway value, but is needed by the compiler.
    (, ruled, settlementFailed) = ds.claims(_claimNumber);

    return ruled;
  }

  /*
  @dev Initialize a claim struct by setting its commit and reveal end times
  @param _claimId the keccak256 of a DelphiStake address and a claim number
  */
  function initializeClaim(bytes32 _claimId) private {
    claims[_claimId].commitEndTime = now + parameterizer.get('commitStageLen');
    claims[_claimId].revealEndTime =
      claims[_claimId].commitEndTime + parameterizer.get('revealStageLen');
  }

  /*
  @dev Updates the winning option in the claim to that with the greatest number of votes
  @param _claim storage pointer to a Claim struct
  */
  function tallyVotes(Claim storage _claim) private {
    uint greatest = _claim.tallies[uint(VoteOptions.Justified)];
    _claim.result = VoteOptions.Justified;

    // get greatest and set result
    if(greatest < _claim.tallies[uint(VoteOptions.NotJustified)]) {
      greatest = _claim.tallies[uint(VoteOptions.NotJustified)];
      _claim.result = VoteOptions.NotJustified;
    }
    if(greatest < _claim.tallies[uint(VoteOptions.Collusive)]) {
      greatest = _claim.tallies[uint(VoteOptions.Collusive)];
      _claim.result = VoteOptions.Collusive;
    }
    if(greatest < _claim.tallies[uint(VoteOptions.Fault)]) {
      greatest = _claim.tallies[uint(VoteOptions.Fault)];
      _claim.result = VoteOptions.Fault;
    }

    // see if greatest is tied with anything else and set fault if so
    if(_claim.result == VoteOptions.Justified) {
      if(greatest == _claim.tallies[uint(VoteOptions.NotJustified)] ||
         greatest == _claim.tallies[uint(VoteOptions.Collusive)] ||
         greatest == _claim.tallies[uint(VoteOptions.Fault)]) {
        _claim.result = VoteOptions.Fault;
      }
    }
    if(_claim.result == VoteOptions.NotJustified) {
      if(greatest == _claim.tallies[uint(VoteOptions.Justified)] ||
         greatest == _claim.tallies[uint(VoteOptions.Collusive)] ||
         greatest == _claim.tallies[uint(VoteOptions.Fault)]) {
        _claim.result = VoteOptions.Fault;
      }
    }
    if(_claim.result == VoteOptions.Collusive) {
      if(greatest == _claim.tallies[uint(VoteOptions.Justified)] ||
         greatest == _claim.tallies[uint(VoteOptions.NotJustified)] ||
         greatest == _claim.tallies[uint(VoteOptions.Fault)]) {
        _claim.result = VoteOptions.Fault;
      }
    }
    // if(_claim.result = VoteOptions.Fault), the result is already fault, so don't bother checking
  }
}
