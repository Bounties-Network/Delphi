pragma solidity ^0.4.18;

contract LookupTable {
  // lt is the lookup table. The value at index i is the total percentage of the fee which will
  // have been allocated for all arbiters 0..i. As a user, you probably do not want to call this
  // directly. getGuaranteedPercentageForIndex is probably what you want.
  uint[] public lt;
  // computed is the number of values computed for the lookup table so far.
  uint public computed;
  // decayValue is a magic number used to compute values in the lookup table.
  uint public decayValue;

  constructor(uint _decayValue) public {
    decayValue = _decayValue;
    lt.push(100 / decayValue);
    computed = 0;
  }

  /*
  @dev computes the percentage of a fee an arbiter is owed
  @param _index the zero-indexed order in which an arbiter committed a vote to the plurality set
  @return the percentage of a fee the arbiter at the given index is owed
  */
  function getGuaranteedPercentageForIndex(uint _index) public returns (uint) {
    // If the value at this index is not available, compute it.
    uint lti = computeLookupTableValues(_index);

    if(_index == 0) {
      return lti;
    } else {
      return lti - lt[_index - 1];
    }
  }

  /*
  @dev recursive function computes lookup table values. Does nothing if a value is already stored
  at the provided index.
  @param _index the lookup table index to compute a value for
  @return the total percentage of a fee which will have been allocated for all arbiter 0..i.
  */
  function computeLookupTableValues(uint _index) internal returns (uint) {
    // If we have not computed a value for this index yet, compute it.
    if(_index > computed) {
      // Computing i always requires the value of i - 1.
      uint previousLTValue = computeLookupTableValues(_index - 1);

      // Compute i and append it to the end of the lookupTable
      lt.push(((100 - previousLTValue) / decayValue) + previousLTValue);
      computed++;
    }

    // Return the value in the lookup table at the provided index.
    return lt[_index];
  }
}

