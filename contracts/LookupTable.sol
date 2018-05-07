pragma solidity ^0.4.18;

import "tcr/Registry.sol";
import "tcr/Parameterizer.sol";
import "./DelphiStake.sol";

contract LookupTable {

  uint[] public lt;

  function LookupTable(uint _decayValue) public {
    lt.push(100 / _decayValue);
  }
}

