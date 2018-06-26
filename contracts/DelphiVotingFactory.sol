pragma solidity ^0.4.20;

import "democratic-parameterizer/DemocraticParameterizerFactory.sol";
import "./DelphiVoting.sol";
import "plcr-revival/ProxyFactory.sol";

contract DelphiVotingFactory {

  event newDelphiVoting(address creator, address delphiVoting, address arbiterSet,
                        address parameterizer);

  ProxyFactory public proxyFactory;
  DemocraticParameterizerFactory public parameterizerFactory;
  DelphiVoting public canonizedDelphiVoting;

  /// @dev constructor sets the parameterizerFactory address, deploys a new canonical
  /// DelphiVoting contract and a proxyFactory.
  constructor(address _parameterizerFactory) {
    parameterizerFactory = DemocraticParameterizerFactory(_parameterizerFactory);
    canonizedDelphiVoting = new DelphiVoting();
    proxyFactory = new ProxyFactory();
  }

  /*
  @dev deploys and initializes a new PLCRVoting contract that consumes a token at an address
  supplied by the user.
  @param _token an EIP20 token to be consumed by the new PLCR contract
  */
  function makeDelphiVoting(address _arbiterSet, uint _feeDecayValue, bytes32[] _paramKeys,
                            uint[] _paramValues)
  public returns (DelphiVoting dv) {
    address parameterizer = parameterizerFactory.createDemocraticParameterizer(
      _arbiterSet, _paramKeys, _paramValues
    );

    dv = DelphiVoting(proxyFactory.createProxy(canonizedDelphiVoting, ""));
    dv.init(_arbiterSet, parameterizer, _feeDecayValue);

    emit newDelphiVoting(msg.sender, dv, _arbiterSet, parameterizer);
  }
}

