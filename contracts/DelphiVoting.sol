pragma solidity ^0.4.18;

import "./deps/Registry.sol";
import "./deps/Parameterizer.sol";
import "./DelphiStake.sol";

contract DelphiVoting {

  event VoteCommitted(address voter, bytes32 _claimId);

  enum VoteOptions { Justified, NotJustified, Collusive, Fault }

  struct Claim {
    uint commitEndTime;
    uint revealEndTime; 
    VoteOptions result;
    mapping(uint => uint) tallies;
    mapping(address => bytes32) commits;
    mapping(address => bool) hasRevealed;
    mapping(address => bool) claimedReward;
  }

  Registry public arbiterSet;
  Parameterizer public parameterizer;

  mapping(bytes32 => Claim) public claims;

  modifier onlyArbiters(address _arbiter) {
    require(arbiterSet.isWhitelisted(keccak256(_arbiter)));
    _;
  }

  function DelphiVoting(address _arbiterSet, address _parameterizer) public {
    arbiterSet = Registry(_arbiterSet); 
    parameterizer = Parameterizer(_parameterizer);
  }

  /**
  @dev Commits a vote for the specified claim. Can be overwritten while commitPeriod is active
  @param _claimId The keccak256 of the stake address claim number being voted for
  @param _secretHash keccak256 of a vote and a salt
  @return Boolean indication of isCommitPeriodActive for target claim
  */
  function commitVote(
    bytes32 _claimId,
    bytes32 _secretHash
    ) 
    public onlyArbiters(msg.sender) {

    if(!claimExists(_claimId)) {
      initializeClaim(_claimId);
    }

    require(commitPeriodActive(_claimId));

    claims[_claimId].commits[msg.sender] = _secretHash;

    VoteCommitted(msg.sender, _claimId);
  }

  /**
  @dev Reveals a vote for the specified claim.
  @param _claimId The keccak256 of the stake address claim number being revealed for
  @param _vote the option voted for
  @param _salt the salt concatenated to the vote option when originally hashed to its secret form
  */
  function revealVote(bytes32 _claimId, uint _vote, uint _salt) public onlyArbiters(msg.sender) {
    VoteOptions vote = VoteOptions(_vote);
    Claim storage claim = claims[_claimId];

    require(revealPeriodActive(_claimId)); 
    require(!claim.hasRevealed[msg.sender]);
    require(keccak256(_vote, _salt) == claims[_claimId].commits[msg.sender]);

    if(vote == VoteOptions.Justified) {
      claim.tallies[uint(VoteOptions.Justified)] += 1;
    }

    else if(vote == VoteOptions.NotJustified) {
      claim.tallies[uint(VoteOptions.NotJustified)] += 1;
    }

    else if(vote == VoteOptions.Collusive) { 
      claim.tallies[uint(VoteOptions.Collusive)] += 1;
    }

    else if(vote == VoteOptions.Fault) {
      claim.tallies[uint(VoteOptions.Fault)] += 1;
    }

    claim.hasRevealed[msg.sender] = true;
  }

  /**
  @dev Submits a ruling to a DelphiStake contract
  @param _stake address of a DelphiStake contract
  @param _claimNumber nonce of a unique claim for the provided stake
  */
  function submitRuling(address _stake, uint _claimNumber) public {
    bytes32 claimId = keccak256(_stake, _claimNumber);
    DelphiStake ds = DelphiStake(_stake);
    Claim storage claim = claims[claimId];

    require(claimExists(claimId));
    require(!commitPeriodActive(claimId) && !revealPeriodActive(claimId)); 

    updateResult(claim);

    ds.ruleOnClaim(_claimNumber, uint256(claim.result));
  }

  function claimFee(address _stake, uint _claimNumber, uint _vote, uint _salt)
  public onlyArbiters(msg.sender) {
    DelphiStake ds = DelphiStake(_stake);
    EIP20 token = ds.token();
    Claim storage claim = claims[keccak256(_stake, _claimNumber)];

    require(!claim.claimedReward[msg.sender]);
    require(keccak256(_vote, _salt) == claim.commits[msg.sender]);
    require(VoteOptions(_vote) == claim.result);
    
    uint totalFee = ds.getTotalFeeForClaim(_claimNumber);
    uint arbiterFee = totalFee/claim.tallies[uint(claim.result)]; 
    token.transfer(msg.sender, arbiterFee);

    claim.claimedReward[msg.sender] = true;
  }

  /**
  @dev Checks if the commit period is still active for the specified claim
  @param _claimId Integer identifier associated with target claim
  @return Boolean indication of isCommitPeriodActive for target claim
  */
  function commitPeriodActive(bytes32 _claimId) view public returns (bool active) {
      require(claimExists(_claimId));

      return (block.timestamp < claims[_claimId].commitEndTime);
  }

  /**
  @dev Checks if the reveal period is still active for the specified claim
  @param _claimId Integer identifier associated with target claim
  @return Boolean indication of isCommitPeriodActive for target claim
  */
  function revealPeriodActive(bytes32 _claimId) view public returns (bool active) {
      require(claimExists(_claimId));

      return
        ((!commitPeriodActive(_claimId)) && (block.timestamp < claims[_claimId].revealEndTime));
  }

  /**
  @dev Checks if a claim exists, throws if the provided claim is in an impossible state
  @param _claimId The claimId whose existance is to be evaluated.
  @return Boolean Indicates whether a claim exists for the provided claimId
  */
  function claimExists(bytes32 _claimId) view public returns (bool exists) {
    uint commitEndTime = claims[_claimId].commitEndTime;
    uint revealEndTime = claims[_claimId].revealEndTime;

    assert(!(commitEndTime == 0 && revealEndTime != 0));
    assert(!(commitEndTime != 0 && revealEndTime == 0));

    if(commitEndTime == 0 || revealEndTime == 0) { return false; }
    return true;
  }

  /**
  @dev Checks if a claim exists, throws if the provided claim is in an impossible state
  @param _claimId The claimId whose existance is to be evaluated.
  @return Boolean Indicates whether a claim exists for the provided claimId
  */
  function getArbiterCommitForClaim(bytes32 _claimId, address _arbiter)
  view public returns (bytes32) {
    return claims[_claimId].commits[_arbiter];
  }

  /**
  @dev Initialize a claim struct by setting its commit and reveal end times
  @param _claimId The claimId to be initialized
  */
  function initializeClaim(bytes32 _claimId) private {
    claims[_claimId].commitEndTime = now + parameterizer.get('commitStageLen');
    claims[_claimId].revealEndTime =
      claims[_claimId].commitEndTime + parameterizer.get('revealStageLen');
  }

  /**
  @dev Updates the winning option in the claim to that with the greatest number of votes
  @param _claim storage pointer to a Claim struct
  */
  function updateResult(Claim storage _claim) private {
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

